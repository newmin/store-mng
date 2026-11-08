import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderVoiceSession } from "../src/lib/order-voice-client";
import type { VoiceMenu, VoiceOrderDraft } from "../src/lib/order-voice";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../src/lib/client", () => ({ authFetch: request }));
const draft: VoiceOrderDraft = {
  customer: "",
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
const products: VoiceMenu[] = [
  { id: "white", name: "백설기", boxSize: 20, active: true },
];
class Channel {
  readyState = "open";
  onmessage?: (e: { data: string }) => void;
  onopen?: () => void;
  onclose?: () => void;
  onerror?: () => void;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = "closed";
    this.onclose?.();
  });
  emit(event: object) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}
let peer: Peer;
class Peer {
  channel = new Channel();
  connectionState = "new";
  onconnectionstatechange?: () => void;
  constructor() {
    peer = this;
  }
  addTrack = vi.fn();
  createDataChannel() {
    return this.channel;
  }
  async createOffer() {
    return { type: "offer", sdp: "v=0\r\nm=audio" };
  }
  async setLocalDescription() {}
  async setRemoteDescription() {
    this.channel.onopen?.();
  }
  close = vi.fn();
}
let track: { enabled: boolean; stop: ReturnType<typeof vi.fn> };
let getUserMedia: ReturnType<typeof vi.fn>;
const stream = () => ({
  getTracks: () => [track],
  getAudioTracks: () => [track],
});
function setup() {
  const callbacks = {
    onPhase: vi.fn(),
    onTranscript: vi.fn(),
    onResult: vi.fn(),
    onError: vi.fn(),
  };
  const session = new OrderVoiceSession({ draft, products, ...callbacks });
  return { session, ...callbacks };
}
function spoken() {
  peer.channel.emit({
    type: "input_audio_buffer.speech_started",
    item_id: "speech1",
  });
  peer.channel.emit({ type: "input_audio_buffer.speech_stopped" });
  peer.channel.emit({
    type: "input_audio_buffer.committed",
    item_id: "speech1",
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  request.mockReset().mockResolvedValue({ sdp: "v=0\r\nanswer" });
  track = { enabled: true, stop: vi.fn() };
  getUserMedia = vi.fn().mockImplementation(async () => stream());
  vi.stubGlobal("window", { isSecureContext: true });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("RTCPeerConnection", Peer);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("음성 입력 세션과 정리", () => {
  it("마침 후 한 번만 정리하고 완료된 유효한 초안만 반영하며 마이크를 해제한다", async () => {
    const c = setup();
    await c.session.start();
    expect(c.onPhase).toHaveBeenLastCalledWith("listening");
    spoken();
    c.session.finish();
    c.session.finish();
    expect(track.enabled).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    const args = {
      type: "response.function_call_arguments.done",
      name: "fill_order_form",
      call_id: "call1",
      arguments: JSON.stringify({
        customer: "테스트",
        fulfillment: "pickup",
        lines: [{ productId: "white", quantity: 2, unit: "box" }],
      }),
    };
    peer.channel.emit(args);
    peer.channel.emit(args);
    expect(c.onResult).not.toHaveBeenCalled();
    peer.channel.emit({
      type: "response.done",
      response: { status: "completed" },
    });
    expect(c.onResult).toHaveBeenCalledTimes(1);
    expect(c.onResult.mock.calls[0][0].draft.lines[0].piecesPerUnit).toBe(20);
    expect(
      peer.channel.send.mock.calls.map(([raw]) => JSON.parse(raw).type),
    ).toEqual(["response.create", "conversation.item.create"]);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(c.onError).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(
      "/api/order-voice",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
  it("끝 음성이 아직 커밋되지 않으면 커밋 확인 뒤 정리한다", async () => {
    const c = setup();
    await c.session.start();
    peer.channel.emit({
      type: "input_audio_buffer.speech_started",
      item_id: "last",
    });
    c.session.finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(peer.channel.send).not.toHaveBeenCalled();
    peer.channel.emit({
      type: "input_audio_buffer.committed",
      item_id: "last",
    });
    expect(JSON.parse(peer.channel.send.mock.calls[0][0]).type).toBe(
      "response.create",
    );
    c.session.cancel();
  });
  it("전사 완료 이벤트가 뒤바뀌어도 발화 순서와 한글 줄바꿈을 보존한다", async () => {
    const c = setup();
    await c.session.start();
    peer.channel.emit({
      type: "input_audio_buffer.speech_started",
      item_id: "first",
    });
    peer.channel.emit({
      type: "input_audio_buffer.speech_started",
      item_id: "second",
    });
    peer.channel.emit({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "second",
      transcript: "꿀떡 다섯 개",
    });
    peer.channel.emit({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "first",
      transcript: "백설기 두 박스",
    });
    expect(c.onTranscript).toHaveBeenLastCalledWith(
      "백설기 두 박스\n꿀떡 다섯 개",
    );
    c.session.cancel();
  });
  it("권한 거절 시 연결 요청이나 초안 변경 없이 한국어 오류를 보여준다", async () => {
    getUserMedia.mockRejectedValue(
      new DOMException("Denied", "NotAllowedError"),
    );
    const c = setup();
    await c.session.start();
    expect(c.onError).toHaveBeenCalledWith(
      expect.stringContaining("마이크 권한"),
    );
    expect(request).not.toHaveBeenCalled();
    expect(c.onResult).not.toHaveBeenCalled();
  });
  it("권한 요청 도중 취소하고 나중에 허용되어도 마이크를 즉시 해제한다", async () => {
    let allow!: (value: unknown) => void;
    getUserMedia.mockImplementation(
      () =>
        new Promise((resolve) => {
          allow = resolve;
        }),
    );
    const c = setup();
    const starting = c.session.start();
    c.session.cancel();
    allow(stream());
    await starting;
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
    expect(c.onError).not.toHaveBeenCalled();
  });
  it("연결 실패나 응답 시간 초과 시 마이크를 해제하고 기존 초안을 유지한다", async () => {
    request.mockRejectedValueOnce(new Error("연결 설정이 필요해요."));
    const c = setup();
    await c.session.start();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(c.onError).toHaveBeenCalledWith("연결 설정이 필요해요.");
    expect(c.onResult).not.toHaveBeenCalled();
    const next = setup();
    await next.session.start();
    spoken();
    next.session.finish();
    await vi.advanceTimersByTimeAsync(25000);
    expect(next.onError).toHaveBeenCalledWith(
      expect.stringContaining("시간이 걸리고"),
    );
    expect(next.onResult).not.toHaveBeenCalled();
  });
  it("불완전한 모델 응답은 적용하지 않고 취소 후 도착한 결과도 무시한다", async () => {
    const c = setup();
    await c.session.start();
    spoken();
    c.session.finish();
    await vi.advanceTimersByTimeAsync(1000);
    peer.channel.emit({
      type: "response.function_call_arguments.done",
      name: "fill_order_form",
      call_id: "c",
      arguments: '{"customer":"테스트"}',
    });
    peer.channel.emit({
      type: "response.done",
      response: { status: "incomplete" },
    });
    expect(c.onResult).not.toHaveBeenCalled();
    expect(c.onError).toHaveBeenCalledTimes(1);
    peer.channel.emit({
      type: "response.done",
      response: { status: "completed" },
    });
    expect(c.onResult).not.toHaveBeenCalled();
  });
  it("무음이면 빈 주문을 만들지 않고 마이크를 해제한다", async () => {
    const c = setup();
    await c.session.start();
    c.session.finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.onError).toHaveBeenCalledWith(
      expect.stringContaining("듣지 못했어요"),
    );
    expect(c.onResult).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalledTimes(1);
  });
});
