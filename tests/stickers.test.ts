import { describe, expect, it } from "vitest";
import { applyCommand, demoState } from "../src/lib/state";
import {
  newStickerDesign,
  stickerAssetSchema,
  stickerBox,
  stickerDesignSchema,
  stickerMatches,
} from "../src/lib/stickers";

const asset = {
  id: "clover",
  name: "행운 클로버",
  tags: ["응원", "개업"],
  image: "demo-menu:11111111-1111-4111-8111-111111111111",
};
describe("sticker library and drafts", () => {
  it("adds optional collections to legacy state without changing production or orders", () => {
    const initial = demoState();
    const state = applyCommand(
      initial,
      { type: "saveStickerAsset", asset },
      "test",
    );
    expect(state.stickerAssets).toEqual([asset]);
    expect(initial.stickerAssets).toBeUndefined();
    expect(state.revision).toBe(initial.revision);
    expect(state.orders).toEqual(initial.orders);
    expect(state.plans).toEqual(initial.plans);
  });
  it("updates chips, intersects filters, and hides archived images", () => {
    expect(
      stickerAssetSchema.parse({ ...asset, tags: [" 응원 ", "응원"] }).tags,
    ).toEqual(["응원"]);
    expect(stickerMatches(asset, ["응원", "개업"], "클로버")).toBe(true);
    expect(stickerMatches(asset, ["생일"], "")).toBe(false);
    expect(stickerMatches({ ...asset, archived: true }, [], "")).toBe(false);
    const initial = applyCommand(
      demoState(),
      { type: "saveStickerAsset", asset },
      "test",
    );
    const edited = applyCommand(
      initial,
      { type: "saveStickerAsset", asset: { ...asset, tags: ["감사"] } },
      "test",
    );
    expect(edited.stickerAssets).toHaveLength(1);
    expect(edited.stickerAssets![0].tags).toEqual(["감사"]);
  });
  it("preserves design image, text and placement after the source is edited or archived", () => {
    const initial = applyCommand(
      demoState(),
      { type: "saveStickerAsset", asset },
      "test",
    );
    const design = {
      ...newStickerDesign("draft"),
      assetId: asset.id,
      image: asset.image,
      text: "함께해 주셔서 감사합니다\n♥",
      orderId: initial.orders[0].id,
    };
    let saved = applyCommand(
      initial,
      { type: "saveStickerDesign", design },
      "test",
    );
    saved = applyCommand(
      saved,
      {
        type: "saveStickerAsset",
        asset: {
          ...asset,
          archived: true,
          image: "demo-menu:22222222-2222-4222-8222-222222222222",
        },
      },
      "test",
    );
    expect(saved.stickerDesigns![0]).toEqual(design);
    saved = applyCommand(
      saved,
      { type: "saveStickerDesign", design: { ...design, fontSize: 55 } },
      "test",
    );
    expect(saved.stickerDesigns).toHaveLength(1);
    expect(saved.stickerDesigns![0].fontSize).toBe(55);
    expect(() =>
      applyCommand(
        initial,
        {
          type: "saveStickerDesign",
          design: { ...design, assetId: "missing" },
        },
        "test",
      ),
    ).toThrow();
  });
  it("rejects external images and invalid layouts, and clamps drag/resize values", () => {
    expect(
      stickerAssetSchema.safeParse({ ...asset, image: "javascript:alert(1)" })
        .success,
    ).toBe(false);
    expect(
      stickerAssetSchema.safeParse({ ...asset, tags: ["x".repeat(25)] })
        .success,
    ).toBe(false);
    expect(
      stickerDesignSchema.safeParse({
        ...newStickerDesign("x"),
        textBox: { x: 95, y: 0, width: 50, height: 50 },
      }).success,
    ).toBe(false);
    expect(stickerBox({ x: 95, y: -10, width: 40, height: 30 })).toEqual({
      x: 60,
      y: 0,
      width: 40,
      height: 30,
    });
  });
});
