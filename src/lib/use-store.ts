"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch, sharedMode, supabase } from "./client";
import { applyCommand } from "./state";
import { uid } from "./dates";
import { initializeDemoState } from "./demo-data";
import type { Command, StoreState } from "./types";
const LOCAL_KEY = "tteokdam-demo-v1";
export function useStore() {
  const [state, setState] = useState<StoreState | null>(null),
    [version, setVersion] = useState(0),
    [user, setUser] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const lock = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const refresh = useCallback(async () => {
    if (!sharedMode) return;
    try {
      const result = await authFetch("/api/store");
      setState(result.document);
      setVersion(result.version);
      setUser(result.user || "");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (!supabase) {
      try {
        const cached = localStorage.getItem(LOCAL_KEY);
        const next = initializeDemoState(
          cached ? JSON.parse(cached) : undefined,
        );
        localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
        setState(next);
        setUser("체험 사용자");
      } catch {
        setState(initializeDemoState());
      }
      setReady(true);
      return;
    }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) {
        if (data.session) void refresh();
        setReady(true);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      if (session) {
        setTimeout(() => void refresh(), 0);
      } else {
        setState(null);
        setUser("");
      }
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [refresh]);
  const run = useCallback(
    async (command: Command) => {
      if (lock.current) throw new Error("저장 중입니다. 잠시 기다려 주세요.");
      if (!stateRef.current) throw new Error("매장 정보를 불러오세요.");
      lock.current = true;
      setBusy(true);
      setError("");
      try {
        if (!sharedMode) {
          const next = applyCommand(stateRef.current, command, "체험 사용자");
          localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
          setState(next);
        } else {
          const data = await authFetch("/api/store", {
            method: "POST",
            body: JSON.stringify({ version, requestId: uid(), command }),
          });
          setState(data.document);
          setVersion(data.version);
        }
      } catch (e) {
        setError((e as Error).message);
        throw e;
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [version],
  );
  return {
    state,
    user,
    version,
    error,
    setError,
    busy,
    ready,
    run,
    refresh,
    shared: sharedMode,
  };
}
