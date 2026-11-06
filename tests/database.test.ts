import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { emptyState } from "../src/lib/state";
const shop = "00000000-0000-4000-8000-000000000001",
  a = "00000000-0000-4000-8000-000000000011",
  b = "00000000-0000-4000-8000-000000000012",
  outsider = "00000000-0000-4000-8000-000000000013";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security; create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$; grant usage on schema public,auth,storage to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`,
  );
  await db.exec(
    readFileSync("supabase/migrations/202611050001_store.sql", "utf8"),
  );
  await db.exec(
    `grant select on all tables in schema public to authenticated,anon; grant select,insert on storage.objects to authenticated; insert into auth.users values('${a}'),('${b}'),('${outsider}'); insert into public.shops(id,name,slug) values('${shop}','테스트 매장','test'); insert into public.shop_members(shop_id,user_id) values('${shop}','${a}'),('${shop}','${b}');`,
  );
  await db.query("insert into shop_state(shop_id,document) values($1,$2)", [
    shop,
    emptyState(),
  ]);
});
afterAll(async () => {
  await db?.close();
});
async function asUser(id: string, sql: string) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}';`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub;");
  }
}
describe("실제 PostgreSQL 권한 · 트랜잭션", () => {
  it("두 멤버는 같은 매장 데이터를 읽을 수 있다", async () => {
    expect((await asUser(a, "select * from shop_state")).rows).toHaveLength(1);
    expect((await asUser(b, "select * from shop_state")).rows).toHaveLength(1);
  });
  it("외부 계정과 익명 계정은 매장 문서를 읽지 못한다", async () => {
    expect(
      (await asUser(outsider, "select * from shop_state")).rows,
    ).toHaveLength(0);
    await db.exec("set role anon;");
    try {
      expect((await db.query("select * from shop_state")).rows).toHaveLength(0);
    } finally {
      await db.exec("reset role;");
    }
  });
  it("브라우저 계정은 트랜잭션 RPC를 직접 호출할 수 없다", async () => {
    await expect(
      asUser(
        a,
        `select commit_store('${shop}','${a}',0,'{}','00000000-0000-4000-8000-000000000021')`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });
  it("세 번째 사용자를 같은 매장에 등록할 수 없다", async () => {
    await expect(
      db.exec(
        `insert into shop_members(shop_id,user_id) values('${shop}','${outsider}')`,
      ),
    ).rejects.toThrow("두 계정");
  });
  it("참고 이미지는 멤버의 매장 폴더 안에서만 읽고 쓸 수 있다", async () => {
    await asUser(
      a,
      `insert into storage.objects(bucket_id,name) values('stickers','${shop}/sample.png')`,
    );
    expect(
      (await asUser(b, "select * from storage.objects")).rows,
    ).toHaveLength(1);
    expect(
      (await asUser(outsider, "select * from storage.objects")).rows,
    ).toHaveLength(0);
    await expect(
      asUser(
        a,
        `insert into storage.objects(bucket_id,name) values('stickers','other-shop/sample.png')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });
  it("버전 검사와 멱등성으로 중복 차감·동시 덮어쓰기를 막는다", async () => {
    const request = "00000000-0000-4000-8000-000000000031";
    const state = emptyState();
    state.revision = 1;
    await db.query("select commit_store($1,$2,$3,$4,$5)", [
      shop,
      a,
      0,
      state,
      request,
    ]);
    const row = await db.query<{ version: number }>(
      "select version from shop_state",
    );
    expect(Number(row.rows[0].version)).toBe(1);
    await db.query("select commit_store($1,$2,$3,$4,$5)", [
      shop,
      a,
      0,
      state,
      request,
    ]);
    expect(
      Number(
        (await db.query<{ version: number }>("select version from shop_state"))
          .rows[0].version,
      ),
    ).toBe(1);
    await expect(
      db.query("select commit_store($1,$2,$3,$4,$5)", [
        shop,
        b,
        0,
        state,
        "00000000-0000-4000-8000-000000000032",
      ]),
    ).rejects.toThrow("VERSION_CONFLICT");
    expect((await db.query("select * from command_log")).rows).toHaveLength(1);
  });
  it("서버에서도 비멤버의 저장은 거절한다", async () => {
    await expect(
      db.query("select commit_store($1,$2,$3,$4,$5)", [
        shop,
        outsider,
        1,
        emptyState(),
        "00000000-0000-4000-8000-000000000033",
      ]),
    ).rejects.toThrow("FORBIDDEN");
  });
});
