"use client";

import { authFetch } from "./client";
import {
  applyVoiceOrder,
  type VoiceMenu,
  type VoiceOrderDraft,
} from "./order-voice";

type Phase = "connecting" | "listening" | "processing";
type Result = ReturnType<typeof applyVoiceOrder>;
type Options = {
  draft: VoiceOrderDraft;
  products: VoiceMenu[];
  onPhase: (phase: Phase) => void;
  onTranscript: (text: string) => void;
  onResult: (result: Result) => void;
  onError: (message: string) => void;
};

export class OrderVoiceSession {
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private stream?: MediaStream;
  private abort = new AbortController();
  private closed = false;
  private phase: Phase = "connecting";
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private connectTimer?: ReturnType<typeof setTimeout>;
  private speechActive = false;
  private heardSpeech = false;
  private committed = false;
  private extracting = false;
  private finishReady = false;
  private result?: Result;
  private transcripts = new Map<string, string>();
  private handledCalls = new Set<string>();

  constructor(private options: Options) {}

  private later(fn: () => void, ms: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.closed) fn();
    }, ms);
    this.timers.add(timer);
    return timer;
  }
  private send(event: object) {
    if (this.channel?.readyState !== "open")
      throw new Error("음성 연결이 끊겼어요. 다시 시작해 주세요.");
    this.channel.send(JSON.stringify(event));
  }
  private fail(message: string) {
    if (this.closed) return;
    this.cancel();
    this.options.onError(message);
  }
  private releaseMicrophone() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
  }
  cancel() {
    if (this.closed) return;
    this.closed = true;
    this.abort.abort();
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.releaseMicrophone();
    this.channel?.close();
    this.peer?.close();
  }

  async start() {
    if (this.closed) return;
    this.options.onPhase("connecting");
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof RTCPeerConnection === "undefined"
    ) {
      this.fail(
        "이 브라우저에서는 음성 입력을 사용할 수 없어요. HTTPS 주소에서 Safari 또는 Chrome으로 열어 주세요.",
      );
      return;
    }
    this.connectTimer = this.later(
      () =>
        this.fail(
          "마이크 연결 시간이 초과됐어요. 권한과 인터넷 연결을 확인해 주세요.",
        ),
      30000,
    );
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (this.closed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const peer = (this.peer = new RTCPeerConnection());
      for (const track of stream.getAudioTracks()) {
        // Audio only leaves the browser once the configured session is ready.
        track.enabled = false;
        track.onended = () =>
          this.fail("마이크 연결이 종료됐어요. 다시 시작해 주세요.");
        peer.addTrack(track, stream);
      }
      const channel = (this.channel = peer.createDataChannel("oai-events"));
      channel.onmessage = (event) => this.receive(event.data);
      channel.onopen = () => {
        if (this.closed) return;
        clearTimeout(this.connectTimer);
        this.phase = "listening";
        stream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        this.options.onPhase("listening");
        this.later(() => this.finish(), 120000);
      };
      channel.onerror = () =>
        this.fail("음성 연결에 문제가 생겼어요. 다시 시도해 주세요.");
      channel.onclose = () =>
        this.fail("음성 연결이 끊겼어요. 다시 시작해 주세요.");
      peer.onconnectionstatechange = () => {
        if (
          peer.connectionState === "failed" ||
          peer.connectionState === "closed"
        )
          this.fail("음성 연결이 끊겼어요. 인터넷 연결을 확인해 주세요.");
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (this.closed) return;
      const answer = await authFetch("/api/order-voice", {
        method: "POST",
        signal: this.abort.signal,
        body: JSON.stringify({
          sdp: offer.sdp,
          draft: this.options.draft,
          products: this.options.products,
        }),
      });
      if (this.closed) return;
      if (typeof answer.sdp !== "string" || !answer.sdp.startsWith("v=0"))
        throw new Error(
          "음성 연결 응답을 확인하지 못했어요. 다시 시도해 주세요.",
        );
      await peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      this.fail(
        name === "NotAllowedError" || name === "SecurityError"
          ? "마이크 권한이 필요해요. 브라우저의 사이트 설정에서 마이크를 허용해 주세요."
          : name === "NotFoundError" || name === "NotReadableError"
            ? "마이크를 사용할 수 없어요. 연결 상태나 다른 앱의 사용 여부를 확인해 주세요."
            : e instanceof Error
              ? e.message
              : "음성 입력을 시작하지 못했어요.",
      );
    }
  }

  finish() {
    if (this.closed || this.phase !== "listening") return;
    this.phase = "processing";
    this.options.onPhase("processing");
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    this.later(
      () =>
        this.fail(
          "주문 내용을 정리하는 데 시간이 걸리고 있어요. 다시 시도해 주세요.",
        ),
      25000,
    );
    // Let the final WebRTC audio packets reach VAD before requesting extraction.
    this.later(() => {
      this.finishReady = true;
      try {
        if (!this.heardSpeech) {
          this.fail(
            "말한 내용을 듣지 못했어요. 마이크를 확인하고 다시 말해 주세요.",
          );
        } else if (!this.speechActive && this.committed) {
          this.extract();
        }
      } catch (e) {
        this.fail((e as Error).message);
      }
    }, 1000);
  }

  private extract() {
    if (this.extracting || this.closed) return;
    this.extracting = true;
    this.releaseMicrophone();
    this.send({
      type: "response.create",
      response: { tool_choice: { type: "function", name: "fill_order_form" } },
    });
  }

  private receive(data: string) {
    if (this.closed) return;
    try {
      const event = JSON.parse(data);
      switch (event.type) {
        case "input_audio_buffer.speech_started":
          this.heardSpeech = true;
          this.speechActive = true;
          this.committed = false;
          this.transcripts.set(event.item_id, "");
          break;
        case "input_audio_buffer.speech_stopped":
          this.speechActive = false;
          break;
        case "input_audio_buffer.committed":
          this.committed = true;
          this.speechActive = false;
          if (this.phase === "processing" && this.finishReady) this.extract();
          break;
        case "conversation.item.input_audio_transcription.delta":
        case "conversation.item.input_audio_transcription.completed": {
          const previous = this.transcripts.get(event.item_id) || "";
          this.transcripts.set(
            event.item_id,
            event.type.endsWith(".completed")
              ? event.transcript
              : previous + event.delta,
          );
          this.options.onTranscript(
            [...this.transcripts.values()].join("\n").slice(-4000),
          );
          break;
        }
        case "response.function_call_arguments.done": {
          if (
            !this.extracting ||
            event.name !== "fill_order_form" ||
            this.handledCalls.has(event.call_id)
          )
            break;
          this.handledCalls.add(event.call_id);
          this.result = applyVoiceOrder(
            JSON.parse(event.arguments),
            this.options.draft,
            this.options.products,
          );
          this.send({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: event.call_id,
              output: JSON.stringify({ ok: true }),
            },
          });
          break;
        }
        case "response.done":
          if (!this.extracting) break;
          if (event.response?.status !== "completed" || !this.result) {
            this.fail(
              "주문 내용을 끝까지 정리하지 못했어요. 내용을 짧게 나누어 다시 말해 주세요.",
            );
            break;
          }
          this.cancel();
          this.options.onResult(this.result);
          break;
        case "error":
          this.fail(
            event.error?.code === "rate_limit_exceeded"
              ? "음성 입력 한도에 도달했어요. 잠시 후 다시 시도해 주세요."
              : "음성 입력을 처리하지 못했어요. 다시 시작해 주세요.",
          );
          break;
      }
    } catch (e) {
      this.fail(
        e instanceof SyntaxError
          ? "음성 입력 결과를 확인하지 못했어요. 다시 말해 주세요."
          : (e as Error).message,
      );
    }
  }
}
