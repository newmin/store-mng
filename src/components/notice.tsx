"use client";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Check, TriangleAlert, X } from "lucide-react";

export function Notice({
  message,
  kind = "error",
  onDismiss,
  autoDismissMs,
}: {
  message: string;
  kind?: "error" | "success" | "warning";
  onDismiss?: () => void;
  autoDismissMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dismissTimer = useRef<number | null>(null);
  const autoDismissTimer = useRef<number | null>(null);
  const drag = useRef({ pointerId: -1, startX: 0, lastX: 0, startedAt: 0 });
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setDismissed(false);
  }, [message]);
  useEffect(
    () => () => {
      if (dismissTimer.current !== null)
        window.clearTimeout(dismissTimer.current);
      if (autoDismissTimer.current !== null)
        window.clearTimeout(autoDismissTimer.current);
    },
    [],
  );
  useEffect(() => {
    const el = ref.current;
    if (!el || dismissed) return;
    el.showPopover();
    return () => el.hidePopover();
  }, [message, dismissed]);
  useEffect(() => {
    if (!autoDismissMs || dismissed) return;
    autoDismissTimer.current = window.setTimeout(
      () => completeDismiss(1),
      autoDismissMs,
    );
    return () => {
      if (autoDismissTimer.current !== null)
        window.clearTimeout(autoDismissTimer.current);
    };
  }, [message, dismissed, autoDismissMs]);

  function completeDismiss(direction: -1 | 1) {
    const el = ref.current;
    if (!el || el.classList.contains("is-leaving")) return;
    if (autoDismissTimer.current !== null)
      window.clearTimeout(autoDismissTimer.current);
    el.classList.remove("is-dragging");
    el.classList.add("is-leaving");
    el.style.setProperty(
      "--notice-x",
      `${direction * (window.innerWidth + el.offsetWidth)}px`,
    );
    el.style.opacity = "0";
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 220;
    dismissTimer.current = window.setTimeout(() => {
      setDismissed(true);
      onDismiss?.();
    }, delay);
  }

  function resetPosition() {
    const el = ref.current;
    if (!el) return;
    el.classList.remove("is-dragging");
    el.style.setProperty("--notice-x", "0px");
    el.style.opacity = "1";
    drag.current.pointerId = -1;
  }

  function startDrag(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      lastX: e.clientX,
      startedAt: performance.now(),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add("is-dragging");
  }

  function moveDrag(e: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current.pointerId !== e.pointerId) return;
    drag.current.lastX = e.clientX;
    const distance = e.clientX - drag.current.startX;
    e.currentTarget.style.setProperty("--notice-x", `${distance}px`);
    e.currentTarget.style.opacity = String(
      Math.max(0.25, 1 - Math.abs(distance) / 240),
    );
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current.pointerId !== e.pointerId) return;
    const distance = drag.current.lastX - drag.current.startX;
    const elapsed = Math.max(1, performance.now() - drag.current.startedAt);
    const fastSwipe =
      Math.abs(distance) > 24 && Math.abs(distance) / elapsed > 0.5;
    if (Math.abs(distance) >= 72 || fastSwipe)
      completeDismiss(distance < 0 ? -1 : 1);
    else resetPosition();
  }

  if (!message || dismissed) return null;
  return (
    <div
      ref={ref}
      popover="manual"
      className={`notice notice-${kind}`}
      role={kind === "success" ? "status" : "alert"}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={resetPosition}
    >
      {kind === "success" ? <Check size={20} /> : <TriangleAlert size={20} />}
      <span>{message}</span>
      <button
        type="button"
        className="icon-button"
        aria-label="알림 닫기"
        onClick={() => completeDismiss(1)}
      >
        <X size={18} />
      </button>
    </div>
  );
}
