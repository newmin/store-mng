// Run only after applying the migration. Credentials come from .env.local.
import { createClient } from "@supabase/supabase-js";
const emails = process.argv.slice(2);
if (
  emails.length !== 2 ||
  new Set(emails.map((e) => e.toLowerCase())).size !== 2
)
  throw new Error("서로 다른 사용자 이메일 두 개를 지정하세요.");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};
let shop = check(
  await db.from("shops").select("id").eq("slug", "tteokdam").maybeSingle(),
);
if (!shop)
  shop = check(
    await db
      .from("shops")
      .insert({ name: "말랑콩떡", slug: "tteokdam" })
      .select("id")
      .single(),
  );
const state = check(
  await db
    .from("shop_state")
    .select("shop_id")
    .eq("shop_id", shop.id)
    .maybeSingle(),
);
if (!state)
  check(
    await db.from("shop_state").insert({
      shop_id: shop.id,
      document: {
        revision: 0,
        products: [],
        materials: [],
        orders: [],
        plans: [],
        lots: [],
        closings: [],
        movements: [],
        audit: [],
        settings: {
          initialized: false,
          extraCount: 1,
          extraBatches: 1,
          avoidDays: 7,
          excluded: [],
        },
      },
    }),
  );
const users = [];
for (let page = 1; ; page++) {
  const data = check(await db.auth.admin.listUsers({ page, perPage: 100 }));
  users.push(...data.users);
  if (data.users.length < 100) break;
}
for (const email of emails) {
  let user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    const options = process.env.APP_URL
      ? { redirectTo: process.env.APP_URL }
      : undefined;
    user = check(await db.auth.admin.inviteUserByEmail(email, options)).user;
  }
  const exists = check(
    await db
      .from("shop_members")
      .select("shop_id,user_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  );
  if (exists && exists.shop_id !== shop.id)
    throw new Error("다른 매장에 등록된 사용자입니다.");
  if (!exists)
    check(
      await db
        .from("shop_members")
        .insert({ shop_id: shop.id, user_id: user.id }),
    );
}
console.log(
  "매장과 두 사용자 연결을 완료했습니다. 기존 업무 데이터는 유지됩니다.",
);
