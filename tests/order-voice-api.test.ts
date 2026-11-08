import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  document: vi.fn(),
  allow: vi.fn(),
}));
vi.mock("@/lib/voice-request-limit", () => ({
  createVoiceRequestLimit: () => mocks.allow,
}));
vi.mock("@/lib/server", () => {
  class HttpError extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  }
  return {
    context: mocks.context,
    readDocument: mocks.document,
    HttpError,
    errorResponse: (e: Error) =>
      Response.json(
        { error: e.message },
        { status: e instanceof HttpError ? e.status : 400 },
      ),
  };
});
import { POST } from "../src/app/api/order-voice/route";
const draft = {
  customer: "테스트고객",
  phone: "",
  date: "2026-11-12",
  time: "10:00",
  fulfillment: null,
  deliveryAddress: "",
  kind: "single",
  boxes: 0,
  lines: [],
  sticker: "",
};
const input = {
  sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111",
  draft,
  products: [
    { id: "fake", name: "클라이언트의 가짜 메뉴", boxSize: 20, active: true },
  ],
};
const fetchMock = vi.fn();
function request(body: unknown = input, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/order-voice", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  fetchMock.mockReset().mockResolvedValue(new Response("v=0\r\nanswer"));
  mocks.context
    .mockReset()
    .mockResolvedValue({ shopId: "shop", user: { id: "member" } });
  mocks.allow.mockReset().mockReturnValue(true);
  mocks.document.mockReset().mockResolvedValue({
    document: {
      products: [{ id: "white", name: "백설기", boxSize: 20, active: true }],
    },
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("음성 주문 연결 API", () => {
  it("개발 서버의 내부 바인드 주소와 브라우저 주소가 달라도 동일 출처를 인식한다", async () => {
    const req = new Request("http://0.0.0.0:3000/api/order-voice", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });
    expect((await POST(req)).status).toBe(200);
  });
  it("로그인 없는 운영 앱에서도 브라우저의 메뉴판으로 음성 세션을 연결한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await POST(request())).status).toBe(200);
    expect(mocks.context).not.toHaveBeenCalled();
    const session = JSON.parse(fetchMock.mock.calls[0][1].body.get("session"));
    expect(session.instructions).toContain("클라이언트의 가짜 메뉴");
  });
  it("다른 출처 요청과 출처가 없는 요청은 외부 호출 전에 거절한다", async () => {
    expect((await POST(request(input, "https://other.example"))).status).toBe(
      403,
    );
    const withoutOrigin = request();
    withoutOrigin.headers.delete("origin");
    expect((await POST(withoutOrigin)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("짧은 시간에 반복된 연결은 외부 호출 전에 제한한다", async () => {
    mocks.allow.mockReturnValue(false);
    expect((await POST(request())).status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("공유 모드의 인증 실패 시 세션을 발급하지 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://shop.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    const { HttpError } = await import("@/lib/server");
    mocks.context.mockRejectedValueOnce(
      new HttpError("로그인이 필요합니다.", 401),
    );
    expect((await POST(request())).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("공유 모드는 서버 메뉴판을 사용하며 비밀키를 브라우저에 반환하지 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://shop.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ sdp: "v=0\r\nanswer" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/realtime/calls");
    const session = JSON.parse(init.body.get("session"));
    expect(session.instructions).toContain("백설기");
    expect(session.instructions).not.toContain("가짜 메뉴");
    expect(session.output_modalities).toEqual(["text"]);
    expect(session.audio.input.turn_detection.create_response).toBe(false);
    expect(session.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "fill_order_form",
    ]);
  });
  it("누락된 키와 잘못된 연결 정보는 외부 호출 전에 안내한다", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect((await POST(request())).status).toBe(503);
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    expect((await POST(request({ ...input, sdp: "invalid" }))).status).toBe(
      400,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("호출 한도와 연결 시간 초과를 한국어 오류로 전달한다", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("private upstream details", { status: 429 }),
    );
    const limited = await POST(request());
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toContain("한도");
    fetchMock.mockRejectedValueOnce(
      new DOMException("timeout", "TimeoutError"),
    );
    expect((await POST(request())).status).toBe(504);
  });
});
