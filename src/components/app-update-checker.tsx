"use client";

import { useEffect } from "react";
import { confirmAction } from "@/lib/app-dialog";

export function AppUpdateChecker() {
  useEffect(() => {
    const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION;
    if (process.env.NODE_ENV !== "production" || !currentVersion) return;

    let disposed = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);

    const check = async () => {
      try {
        const response = await fetch("/api/version", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data: unknown = await response.json();
        const version =
          data && typeof data === "object" && "version" in data
            ? data.version
            : undefined;
        if (
          disposed ||
          typeof version !== "string" ||
          !version ||
          version === currentVersion
        )
          return;

        if (
          (await confirmAction({
            title: "새 버전이 준비됐어요",
            message:
              "새로고침하면 최신 버전을 사용할 수 있습니다.\n저장하지 않은 내용은 사라질 수 있습니다.",
            confirmLabel: "새로고침",
            cancelLabel: "나중에",
          })) &&
          !disposed
        )
          window.location.reload();
      } catch {
        // Offline or failed deployments must not interrupt ongoing work.
      } finally {
        window.clearTimeout(timeout);
      }
    };

    void check();
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  return null;
}
