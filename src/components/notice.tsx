"use client";
import { useEffect, useRef, useState } from "react";
import { Check, TriangleAlert, X } from "lucide-react";

export function Notice({
  message,
  kind = "error",
  onDismiss,
}: {
  message: string;
  kind?: "error" | "success" | "warning";
  onDismiss?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setDismissed(false);
  }, [message]);
  useEffect(() => {
    const el = ref.current;
    if (!el || dismissed) return;
    el.showPopover();
    return () => el.hidePopover();
  }, [message, dismissed]);
  if (!message || dismissed) return null;
  return (
    <div
      ref={ref}
      popover="manual"
      className={`notice notice-${kind}`}
      role={kind === "success" ? "status" : "alert"}
    >
      {kind === "success" ? <Check size={20} /> : <TriangleAlert size={20} />}
      <span>{message}</span>
      <button
        type="button"
        className="icon-button"
        aria-label="알림 닫기"
        onClick={() => {
          setDismissed(true);
          onDismiss?.();
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
}
