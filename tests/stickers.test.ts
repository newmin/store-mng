import { describe, expect, it } from "vitest";
import { applyCommand, demoState } from "../src/lib/state";
import {
  newStickerDesign,
  stickerAssetSchema,
  stickerBox,
  stickerDesignSchema,
  stickerMatches,
  collectStickerTags,
  resizeStickerBox,
  fitStickerImageBox,
} from "../src/lib/stickers";

const asset = {
  id: "clover",
  name: "행운 클로버",
  tags: ["응원", "개업"],
  image: "demo-menu:11111111-1111-4111-8111-111111111111",
};
describe("sticker library and drafts", () => {
  it("preserves old aspect settings and persists free image distortion", () => {
    const initial = applyCommand(
      demoState(),
      { type: "saveStickerAsset", asset },
      "test",
    );
    const legacy = newStickerDesign("legacy");
    expect(stickerDesignSchema.parse(legacy).imageAspectLocked).toBeUndefined();
    const fit = fitStickerImageBox(legacy.imageBox, 100, 100, "wide");
    expect(fit.width * 9).toBeCloseTo(fit.height * 5);
    const design = {
      ...legacy,
      assetId: asset.id,
      image: asset.image,
      imageAspectLocked: false,
      imageStretch: true,
      imageBox: resizeStickerBox(fit, 10, 0, false),
    };
    const saved = applyCommand(
      initial,
      { type: "saveStickerDesign", design },
      "test",
    );
    expect(saved.stickerDesigns![0]).toEqual(design);
    expect(
      stickerDesignSchema.safeParse({
        ...design,
        imageBox: fitStickerImageBox(legacy.imageBox, 2000, 10, "wide"),
      }).success,
    ).toBe(true);
  });
  it("resizes artwork proportionally within the page while text boxes resize independently", () => {
    const box = { x: 10, y: 20, width: 20, height: 40 };
    const resized = resizeStickerBox(box, 10, 20, true);
    expect(resized).toEqual({ x: 10, y: 20, width: 30, height: 60 });
    expect(resizeStickerBox(box, 500, 500, true)).toEqual({
      x: 10,
      y: 20,
      width: 40,
      height: 80,
    });
    const small = resizeStickerBox(box, -500, -500, true);
    expect(small.width).toBe(5);
    expect(small.height).toBe(10);
    expect(resizeStickerBox(box, 10, 0, false)).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    });
  });
  it("turns separators and pasted lists into chips while preserving unfinished input", () => {
    expect(collectStickerTags([], "개업,응원 생일")).toEqual({
      tags: ["개업", "응원"],
      remaining: "생일",
    });
    expect(collectStickerTags(["개업"], "개업, 감사 ")).toEqual({
      tags: ["개업", "감사"],
      remaining: "",
    });
    expect(collectStickerTags([], "백일,\n돌잔치\t감사", true)).toEqual({
      tags: ["백일", "돌잔치", "감사"],
      remaining: "",
    });
    const full = Array.from({ length: 20 }, (_, i) => `태그${i}`);
    expect(collectStickerTags(full, "태그0,", true).tags).toHaveLength(20);
    expect(() => collectStickerTags(full, "추가,", true)).toThrow();
    expect(() => collectStickerTags([], "가".repeat(25), true)).toThrow();
  });
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
