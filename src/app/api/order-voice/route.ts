import { z } from "zod";
import { context, errorResponse, HttpError, readDocument } from "@/lib/server";
import { today } from "@/lib/dates";
import {
  voiceDraftSchema,
  voiceMenuSchema,
  voiceMenus,
  voiceOrderInstructions,
  voiceOrderTool,
} from "@/lib/order-voice";
import type { RealtimeSessionCreateRequest } from "openai/resources/realtime/realtime";
import { createVoiceRequestLimit } from "@/lib/voice-request-limit";

export const maxDuration = 30;
const allowVoiceRequest = createVoiceRequestLimit();
const requestSchema = z.object({
  sdp: z
    .string()
    .min(1)
    .max(30000)
    .refine((s) => /^v=0\r?\n/.test(s) && s.includes("m=audio")),
  draft: voiceDraftSchema,
  products: z.array(voiceMenuSchema).max(500),
});

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    // Next dev may construct req.url with its bind address (0.0.0.0).
    // The browser's Host header identifies the origin it actually opened.
    const requestHost = req.headers.get("host") || url.host;
    const origin = req.headers.get("origin");
    if (!origin || new URL(origin).host !== requestHost)
      throw new HttpError("매장 화면에서 음성 입력을 시작해 주세요.", 403);
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new HttpError("음성 입력 요청 형식을 확인해 주세요.", 415);

    let products;
    let client =
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "local";
    const shared = !!(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    if (shared) {
      const ctx = await context(req);
      products = voiceMenus((await readDocument(ctx)).document.products);
      client = ctx.user.id;
    }
    if (!process.env.OPENAI_API_KEY)
      throw new HttpError(
        "음성 입력을 사용하려면 서버의 OpenAI 연결 설정이 필요해요.",
        503,
      );
    const raw = await req.text();
    if (raw.length > 150000)
      throw new HttpError("주문 내용이 너무 길어요.", 413);
    const parsed = requestSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      throw new HttpError("주문 초안이나 마이크 연결 정보를 확인해 주세요.");
    const input = parsed.data;
    products ??= input.products;
    if (!allowVoiceRequest(client))
      throw new HttpError(
        "음성 입력을 너무 자주 시작했어요. 잠시 후 다시 시도해 주세요.",
        429,
      );
    const session: RealtimeSessionCreateRequest = {
      type: "realtime",
      model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1",
      output_modalities: ["text"],
      instructions: voiceOrderInstructions(input.draft, products, today()),
      tools: [voiceOrderTool],
      max_output_tokens: 2500,
      audio: {
        input: {
          noise_reduction: { type: "near_field" },
          transcription: {
            model: "gpt-4o-mini-transcribe",
            language: "ko",
            prompt: products
              .filter((p) => p.active && !p.archived)
              .map((p) => p.name)
              .join(", ")
              .slice(0, 2000),
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
            create_response: false,
            interrupt_response: false,
          },
        },
      },
    };
    const form = new FormData();
    form.set("sdp", input.sdp);
    form.set("session", JSON.stringify(session));
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(20000)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new HttpError(
        response.status === 429
          ? "음성 입력 한도에 도달했어요. 잠시 후 다시 시도해 주세요."
          : "음성 입력에 연결하지 못했어요. OpenAI 키와 Realtime 모델 설정을 확인해 주세요.",
        response.status === 429 ? 429 : 502,
      );
    }
    return Response.json(
      { sdp: await response.text() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof SyntaxError)
      return errorResponse(new HttpError("음성 입력 요청을 확인해 주세요."));
    if (e instanceof Error && ["TimeoutError", "AbortError"].includes(e.name))
      return errorResponse(
        new HttpError("음성 연결 시간이 초과됐어요. 다시 시도해 주세요.", 504),
      );
    return errorResponse(e);
  }
}
