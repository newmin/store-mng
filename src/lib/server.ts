import "server-only";
import { createClient } from "@supabase/supabase-js";
import { upgradeMenuCatalog } from "./catalog-upgrade";
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function context(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !service)
    throw new HttpError("공유 모드의 Supabase 서버 설정이 필요합니다.", 503);
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new HttpError("로그인이 필요합니다.", 401);
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);
  if (error || !user)
    throw new HttpError("로그인이 만료됐습니다. 다시 로그인하세요.", 401);
  const { data: membership } = await client
    .from("shop_members")
    .select("shop_id")
    .eq("user_id", user.id)
    .single();
  if (!membership)
    throw new HttpError("초대된 매장 계정만 사용할 수 있습니다.", 403);
  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { client, admin, user, shopId: membership.shop_id as string };
}
export function errorResponse(e: unknown) {
  console.error(e instanceof Error ? e.message : "Request failed");
  return Response.json(
    { error: e instanceof Error ? e.message : "요청을 처리하지 못했습니다." },
    {
      status: e instanceof HttpError ? e.status : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
export async function readDocument(ctx: Awaited<ReturnType<typeof context>>) {
  const { data, error } = await ctx.client
    .from("shop_state")
    .select("version,document")
    .eq("shop_id", ctx.shopId)
    .single();
  if (error || !data) throw new HttpError("매장 초기 설정을 완료하세요.", 503);
  return {
    version: data.version as number,
    document: upgradeMenuCatalog(data.document as import("./types").StoreState),
  };
}
