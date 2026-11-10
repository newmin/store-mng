import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeDemoState } from "../src/lib/demo-data";
import { recommendationContext } from "../src/lib/recommendation-context";
import { fallbackCandidates } from "../src/lib/calculations";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  context: vi.fn(),
  readDocument: vi.fn(),
  allow: vi.fn(),
}));
vi.mock("openai", () => {
  class OpenAI {
    static APIError = class extends Error {};
    responses = { create: mocks.create };
  }
  return { default: OpenAI };
});
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
    readDocument: mocks.readDocument,
    HttpError,
    errorResponse: (e: Error) =>
      Response.json(
        { error: e.message },
        { status: e instanceof HttpError ? e.status : 400 },
      ),
  };
});
import { POST } from "../src/app/api/recommend/route";
const date = "2026-11-11";
const state = initializeDemoState(undefined, date);
const lines = fallbackCandidates(state, date)
  .slice(0, 2)
  .map((p) => ({
    productId: p.id,
    batches: 1,
    reason: "재료 여유와 최근 생산 이력 고려",
  }));
const input = {
  date,
  version: state.revision,
  snapshot: recommendationContext(state, date),
};
function request(body: unknown = input, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/recommend", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  mocks.context.mockReset().mockResolvedValue({ user: { id: "member" } });
  mocks.readDocument
    .mockReset()
    .mockResolvedValue({ version: state.revision, document: state });
  mocks.allow.mockReset().mockReturnValue(true);
  mocks.create
    .mockReset()
    .mockResolvedValueOnce({
      output: [
        {
          type: "function_call",
          name: "get_production_context",
          call_id: "ctx",
          arguments: "{}",
        },
      ],
    })
    .mockResolvedValueOnce({
      output: [
        {
          type: "function_call",
          name: "simulate_production",
          call_id: "sim",
          arguments: JSON.stringify({ lines }),
        },
      ],
    })
    .mockResolvedValueOnce({
      output: [],
      output_text: JSON.stringify({ lines, questions: [] }),
    });
});
afterEach(() => vi.unstubAllEnvs());
describe("체험 생산 추천 API", () => {
  it("로그인 없이 실제 도구 조회와 검증을 거쳐 추천을 반환한다", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      lines,
      questions: [],
      version: state.revision,
    });
    expect(mocks.context).not.toHaveBeenCalled();
    const calls = JSON.stringify(mocks.create.mock.calls);
    expect(calls).not.toContain("010-0000");
    expect(calls).not.toContain("paymentAccount");
    expect(calls).toContain("function_call_output");
  });
  it("공유 모드에서는 브라우저 데이터 대신 로그인한 매장 데이터를 사용한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon");
    expect(
      (await POST(request({ date, version: state.revision, snapshot: {} })))
        .status,
    ).toBe(200);
    expect(mocks.context).toHaveBeenCalledOnce();
    expect(mocks.readDocument).toHaveBeenCalledOnce();
  });
  it("다른 출처·변경된 버전·잘못된 데이터는 AI 호출 전에 거절한다", async () => {
    expect((await POST(request(input, "https://other.example"))).status).toBe(
      403,
    );
    expect((await POST(request({ ...input, version: 999 }))).status).toBe(409);
    expect((await POST(request({ ...input, snapshot: {} }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("키 미설정과 호출 제한을 명확히 반환한다", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect((await POST(request())).status).toBe(503);
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mocks.allow.mockReturnValue(false);
    expect((await POST(request())).status).toBe(429);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("필수 도구 검증을 생략한 답변은 적용하지 않는다", async () => {
    mocks.create
      .mockReset()
      .mockResolvedValue({
        output: [],
        output_text: JSON.stringify({ lines, questions: [] }),
      });
    expect((await POST(request())).status).toBe(502);
  });
});
