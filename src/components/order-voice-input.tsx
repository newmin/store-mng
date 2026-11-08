"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, Square, X } from "lucide-react";
import { OrderVoiceSession } from "@/lib/order-voice-client";
import { voiceMenus, type VoiceOrderDraft } from "@/lib/order-voice";
import type { Product } from "@/lib/types";

export function OrderVoiceInput({
  draft,
  products,
  disabled,
  onDraft,
  onBusyChange,
}: {
  draft: VoiceOrderDraft;
  products: Product[];
  disabled: boolean;
  onDraft: (draft: VoiceOrderDraft) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const session = useRef<OrderVoiceSession | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "connecting" | "listening" | "processing"
  >("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [applied, setApplied] = useState(false);
  useEffect(() => () => session.current?.cancel(), []);
  function cancel() {
    session.current?.cancel();
    session.current = null;
    setPhase("idle");
    onBusyChange(false);
  }
  function start() {
    if (session.current || disabled) return;
    setError("");
    setNotes([]);
    setTranscript("");
    setApplied(false);
    onBusyChange(true);
    const next = new OrderVoiceSession({
      draft,
      products: voiceMenus(products),
      onPhase: setPhase,
      onTranscript: setTranscript,
      onResult: (result) => {
        session.current = null;
        onDraft(result.draft);
        setNotes(result.notes);
        setApplied(true);
        setPhase("idle");
        onBusyChange(false);
      },
      onError: (message) => {
        session.current = null;
        setError(message);
        setPhase("idle");
        onBusyChange(false);
      },
    });
    session.current = next;
    void next.start();
  }
  const active = phase !== "idle";
  return (
    <section
      className={`order-voice ${active ? "active" : ""}`}
      aria-label="음성 주문 입력"
    >
      <div className="order-voice-controls">
        {active ? (
          <>
            <span className="order-voice-status" role="status">
              {phase === "listening" ? (
                <Mic size={18} aria-hidden="true" />
              ) : (
                <LoaderCircle size={18} aria-hidden="true" />
              )}
              {phase === "connecting"
                ? "마이크 연결 중…"
                : phase === "listening"
                  ? "듣고 있어요"
                  : "주문 내용 정리 중…"}
            </span>
            {phase === "listening" && (
              <button
                type="button"
                className="button primary"
                onClick={() => session.current?.finish()}
              >
                <Square size={14} aria-hidden="true" /> 입력 마침
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              aria-label="음성 입력 취소"
              onClick={cancel}
            >
              <X size={19} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="button secondary"
              onClick={start}
              disabled={disabled}
            >
              <Mic size={18} aria-hidden="true" /> 말로 입력
            </button>
            <p>음성으로 채운 내용은 저장 전에 확인해 주세요.</p>
          </>
        )}
      </div>
      {transcript && (
        <p className="order-voice-transcript" aria-label="인식한 음성">
          {transcript}
        </p>
      )}
      {error && (
        <p className="order-voice-error" role="alert">
          {error}
        </p>
      )}
      {applied && (
        <p className="order-voice-result" role="status">
          말한 내용을 주문에 반영했어요.
        </p>
      )}
      {notes.length > 0 && (
        <div className="order-voice-review">
          <b>확인이 필요해요</b>
          <ul>
            {notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
