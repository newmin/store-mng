"use client";
import { createClient } from "@supabase/supabase-js";
export const sharedMode = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
export const supabase = sharedMode
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  : null;
export async function authFetch(path: string, init: RequestInit = {}) {
  const session = await supabase?.auth.getSession();
  const headers = new Headers(init.headers);
  if (session?.data.session)
    headers.set("Authorization", `Bearer ${session.data.session.access_token}`);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "요청에 실패했습니다.");
  return body;
}
