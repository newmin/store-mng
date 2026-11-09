import { z } from "zod";
import { context, errorResponse, HttpError, readDocument } from "@/lib/server";
import { commandSchema } from "@/lib/types";
import { applyCommand } from "@/lib/state";
import { findMenuPhoto } from "@/lib/menu-catalog";
import { menuImageBelongsToShop } from "@/lib/menu-image";
import { pruneStickerWork, isStickerSampleImage } from "@/lib/stickers";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const ctx = await context(req);
    const current = await readDocument(ctx);
    return Response.json(
      {
        ...current,
        document: pruneStickerWork(current.document),
        shopId: ctx.shopId,
        user: ctx.user.email,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const ctx = await context(req);
    const body = z
      .object({
        version: z.number().int().nonnegative(),
        requestId: z.string().uuid(),
        command: commandSchema,
      })
      .parse(await req.json());
    const { data: prior } = await ctx.admin
      .from("command_log")
      .select("request_id")
      .eq("shop_id", ctx.shopId)
      .eq("actor", ctx.user.id)
      .eq("request_id", body.requestId)
      .maybeSingle();
    if (prior) {
      const current = await readDocument(ctx);
      return Response.json({
        ...current,
        document: pruneStickerWork(current.document),
      });
    }
    const current = await readDocument(ctx);
    if (current.version !== body.version)
      throw new HttpError(
        "다른 기기에서 변경했습니다. 새로고침 후 다시 확인하세요.",
        409,
      );
    const document = applyCommand(
      current.document,
      body.command,
      ctx.user.email || ctx.user.id,
    );
    if (
      body.command.type === "saveStickerAsset" &&
      !menuImageBelongsToShop(body.command.asset.image, ctx.shopId)
    )
      throw new HttpError("해당 매장의 스티커 그림이 아닙니다.", 403);
    if (
      body.command.type === "saveStickerDesign" &&
      body.command.design.image &&
      !isStickerSampleImage(body.command.design.image) &&
      !menuImageBelongsToShop(body.command.design.image, ctx.shopId)
    )
      throw new HttpError("해당 매장의 스티커 그림이 아닙니다.", 403);
    const productImage =
      body.command.type === "saveProduct"
        ? body.command.product.image
        : undefined;
    if (
      productImage &&
      !findMenuPhoto(productImage) &&
      !menuImageBelongsToShop(productImage, ctx.shopId)
    )
      throw new HttpError("해당 매장의 메뉴 사진이 아닙니다.", 403);
    if (
      body.command.type === "saveOrder" &&
      body.command.order.imagePath &&
      !body.command.order.imagePath.startsWith(`${ctx.shopId}/`)
    )
      throw new HttpError("해당 매장의 이미지가 아닙니다.", 403);
    const { data, error } = await ctx.admin.rpc("commit_store", {
      p_shop: ctx.shopId,
      p_actor: ctx.user.id,
      p_version: body.version,
      p_document: document,
      p_request: body.requestId,
    });
    if (error) {
      if (error.message.includes("VERSION_CONFLICT"))
        throw new HttpError(
          "다른 기기에서 변경했습니다. 새로고침 후 다시 확인하세요.",
          409,
        );
      throw new HttpError("저장하지 못했습니다. 다시 시도하세요.", 500);
    }
    return Response.json(
      { ...data, document: pruneStickerWork(data.document) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
