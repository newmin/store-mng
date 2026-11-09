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
  expiredStickerIds,
  pruneStickerWork,
  orderFromTemplate,
  stickerExpiresAt,
  stickerTemplates,
  newStickerTemplate,
} from "../src/lib/stickers";

const asset = {
  id: "clover",
  name: "행운 클로버",
  tags: ["응원", "개업"],
  image: "demo-menu:11111111-1111-4111-8111-111111111111",
};
describe("sticker library and drafts", () => {
  it("edits each sample in place and creates independent stickers from it", () => {
    let s = demoState();
    const templates = stickerTemplates(s);
    expect(templates).toHaveLength(2);
    const sample = {
      ...templates[0],
      name: "수정한 꽃 템플릿",
      tags: ["답례"],
      text: "수정한\n예시 문구",
    };
    s = applyCommand(s, { type: "saveStickerDesign", design: sample }, "test");
    expect(stickerTemplates(s)).toHaveLength(2);
    expect(stickerTemplates(s).find((t) => t.id === sample.id)?.name).toBe(
      sample.name,
    );
    const sticker = {
      ...orderFromTemplate(sample, "sticker"),
      text: "고객 문구",
    };
    s = applyCommand(s, { type: "saveStickerDesign", design: sticker }, "test");
    expect(stickerTemplates(s).find((t) => t.id === sample.id)?.text).toBe(
      sample.text,
    );
    expect(newStickerTemplate("new").text.split("\n")).toHaveLength(2);
    expect(
      stickerDesignSchema.safeParse({ ...sample, image: "/private/file.png" })
        .success,
    ).toBe(false);
  });
  it("keeps the template independent and anchors adjustable retention to the first save", () => {
    const start = "2026-11-01T12:00:00.000Z";
    const edit = "2026-11-03T12:00:00.000Z";
    const template = { ...newStickerDesign("template"), text: "감사합니다" };
    let s = applyCommand(
      demoState(),
      { type: "saveStickerDesign", design: template },
      "test",
      start,
    );
    const draft = orderFromTemplate(s.stickerDesigns![0], "customer");
    draft.text = "첫돌을 축하합니다";
    draft.retentionDays = 7;
    const save = (design: typeof draft, at: string) =>
      applyCommand(s, { type: "saveStickerDesign", design }, "test", at);
    s = save(draft, start);
    expect(s.stickerDesigns![0].text).toBe(template.text);
    expect(s.stickerDesigns![1].createdAt).toBe(start);
    expect(expiredStickerIds(s, "2026-11-08T12:00:00.000Z")).toEqual([
      "customer",
    ]);
    s = save({ ...draft, retentionDays: 30, createdAt: edit }, edit);
    const order = s.stickerDesigns![1];
    expect(stickerExpiresAt(order, s)).toBe(
      Date.parse("2026-12-01T12:00:00.000Z"),
    );
    expect(() => save({ ...order, retentionDays: 2 }, edit)).toThrow();
    for (const days of [0, 31, 1.5])
      expect(() => save({ ...order, retentionDays: days }, edit)).toThrow();
    const deadline = "2026-12-01T12:00:00.000Z";
    expect(() => save(order, deadline)).toThrow();
    s = pruneStickerWork(s, deadline);
    expect(() => save(order, deadline)).toThrow();
    expect(s.stickerDesigns!.map((d) => d.id)).toEqual(["template"]);
  });
  it("deletes a library component while preserving images in both current and legacy templates", () => {
    let s = applyCommand(
      demoState(),
      { type: "saveStickerAsset", asset },
      "test",
    );
    const originalOrders = structuredClone(s.orders);
    s.stickerDesigns = [
      { ...newStickerDesign("legacy"), assetId: asset.id },
      {
        ...newStickerDesign("snapshot"),
        assetId: asset.id,
        image: asset.image,
      },
    ];
    s = applyCommand(s, { type: "deleteStickerAsset", id: asset.id }, "test");
    expect(s.stickerAssets).toEqual([]);
    expect(s.stickerDesigns).toHaveLength(2);
    for (const d of s.stickerDesigns!) {
      expect(d.assetId).toBeUndefined();
      expect(d.image).toBe(asset.image);
    }
    expect(s.orders).toEqual(originalOrders);
    expect(() =>
      applyCommand(
        s,
        { type: "saveStickerDesign", design: s.stickerDesigns![0] },
        "test",
      ),
    ).not.toThrow();
    expect(() =>
      applyCommand(s, { type: "deleteStickerAsset", id: asset.id }, "test"),
    ).toThrow();
    expect(
      stickerAssetSchema.parse({ id: asset.id, image: asset.image, tags: [] })
        .name,
    ).toBe("");
  });
  it("expires only order work after 30 days and takes save timestamps from the server", () => {
    const now = "2026-12-01T12:00:00.000Z";
    let s = demoState();
    s.stickerDesigns = [
      {
        ...newStickerDesign("template"),
        kind: "template",
        orderId: s.orders[0].id,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        ...newStickerDesign("expired"),
        kind: "order",
        updatedAt: "2026-11-01T12:00:00.000Z",
      },
      {
        ...newStickerDesign("recent"),
        kind: "order",
        updatedAt: "2026-11-01T12:00:00.001Z",
      },
      { ...newStickerDesign("legacy"), orderId: s.orders[0].id },
    ];
    s.orders[0].updatedAt = "2026-10-01T00:00:00.000Z";
    expect(expiredStickerIds(s, now)).toEqual(["expired", "legacy"]);
    expect(pruneStickerWork(s, now).stickerDesigns!.map((d) => d.id)).toEqual([
      "template",
      "recent",
    ]);
    const cleaned = applyCommand(
      s,
      { type: "cleanupStickerWork" },
      "test",
      now,
    );
    expect(cleaned.stickerDesigns!.map((d) => d.id)).toEqual([
      "template",
      "recent",
    ]);
    expect(cleaned.orders).toEqual(s.orders);
    expect(cleaned.revision).toBe(s.revision);
    const refreshed = applyCommand(
      cleaned,
      {
        type: "saveStickerDesign",
        design: {
          ...cleaned.stickerDesigns![1],
          updatedAt: "2020-01-01T00:00:00.000Z",
        },
      },
      "test",
      now,
    );
    expect(refreshed.stickerDesigns![1].updatedAt).toBe(now);
  });
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
    expect(saved.stickerDesigns![0]).toMatchObject(design);
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
    expect(saved.stickerDesigns![0]).toMatchObject(design);
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
