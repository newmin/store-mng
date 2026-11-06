import { context, errorResponse, HttpError } from "@/lib/server";
export async function POST(req: Request) {
  try {
    const ctx = await context(req);
    const file = (await req.formData()).get("file");
    if (
      !(file instanceof File) ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    )
      throw new HttpError("PNG·JPG·WebP 이미지(최대 5MB)를 선택하세요.");
    const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const path = `${ctx.shopId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await ctx.client.storage
      .from("stickers")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new HttpError("이미지를 저장하지 못했습니다.");
    return Response.json({ path });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function GET(req: Request) {
  try {
    const ctx = await context(req);
    const path = new URL(req.url).searchParams.get("path") || "";
    if (!path.startsWith(`${ctx.shopId}/`))
      throw new HttpError("접근할 수 없는 이미지입니다.", 403);
    const { data, error } = await ctx.client.storage
      .from("stickers")
      .createSignedUrl(path, 300);
    if (error || !data)
      throw new HttpError("이미지를 불러오지 못했습니다.", 404);
    return Response.json(
      { url: data.signedUrl },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
