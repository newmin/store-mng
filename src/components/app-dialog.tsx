"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, CircleHelp, Info, TriangleAlert, X } from "lucide-react";
import {
  getDialog,
  resolveDialog,
  subscribeDialog,
  type DialogRequest,
} from "@/lib/app-dialog";

export function AppDialog() {
  const request = useSyncExternalStore(subscribeDialog, getDialog, () => null);
  return request ? <Dialog key={request.id} request={request} /> : null;
}
function Dialog({ request }: { request: DialogRequest }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(request.defaultValue || "");
  const prompt = request.kind === "prompt";
  const alert = request.kind === "alert";
  const title =
    request.title ||
    (request.destructive
      ? "변경사항을 버릴까요?"
      : prompt
        ? "정보 입력"
        : alert
          ? "안내"
          : "확인해 주세요");
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-dialog-initial]")?.focus();
    return () => {
      dialog.close();
    };
  }, []);
  function finish(accepted: boolean) {
    ref.current?.close();
    resolveDialog(
      request.id,
      accepted ? (prompt ? value.trim() : true) : prompt ? null : false,
    );
  }
  return (
    <dialog
      ref={ref}
      className={`app-dialog${request.destructive ? " destructive" : ""}`}
      aria-labelledby="app-dialog-title"
      aria-describedby="app-dialog-message"
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          finish(true);
        }}
      >
        <div className="app-dialog-heading">
          <span className="app-dialog-symbol" aria-hidden="true">
            {request.destructive ? (
              <TriangleAlert size={24} />
            ) : alert ? (
              <Info size={24} />
            ) : (
              <CircleHelp size={24} />
            )}
          </span>
          <button
            className="icon-button"
            type="button"
            onClick={() => finish(false)}
            aria-label="닫기"
          >
            <X size={19} />
          </button>
        </div>
        <h2 id="app-dialog-title">{title}</h2>
        <p id="app-dialog-message">{request.message}</p>
        {prompt && (
          <label className="app-dialog-input">
            {request.inputLabel || "입력값"}
            <input
              autoFocus
              data-dialog-initial
              required
              type={request.inputType || "text"}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
        )}
        <div className="app-dialog-actions">
          {!alert && (
            <button
              autoFocus={!prompt}
              data-dialog-initial={!prompt || undefined}
              type="button"
              className="button secondary"
              onClick={() => finish(false)}
            >
              <X size={16} /> {request.cancelLabel || "취소"}
            </button>
          )}
          <button
            autoFocus={alert}
            data-dialog-initial={alert || undefined}
            type="submit"
            className={`button ${request.destructive ? "app-dialog-danger" : "primary"}`}
          >
            <Check size={16} /> {request.confirmLabel || "확인"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
