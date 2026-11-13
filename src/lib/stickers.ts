import { z } from "zod";
import { isUploadedMenuImage } from "./menu-image";
import type { StoreState } from "./types";

const key = z.string().min(1).max(100);
export const MAX_STICKER_DAYS = 30;
export const MAX_STICKER_IMAGES = 12;
const DAY_MS = 86_400_000;
export function isStickerSampleImage(path: string) {
  return path === "/stickers/flowers.png" || path === "/stickers/brush.png";
}
export function collectStickerTags(
  existing: string[],
  input: string,
  complete = false,
) {
  const parts = input.split(/[\s,]+/);
  const remaining = complete ? "" : parts.pop() || "";
  const tags = [...new Set([...existing, ...parts.filter(Boolean)])];
  if (
    tags.length > 20 ||
    tags.some((tag) => tag.length > 24) ||
    remaining.length > 24
  )
    throw new Error("태그는 24자 이내, 그림당 20개까지 등록할 수 있습니다.");
  return { tags, remaining };
}
export const stickerAssetSchema = z.object({
  id: key,
  name: z.string().trim().max(80).default(""),
  image: z
    .string()
    .max(200)
    .refine(isUploadedMenuImage, "올바른 그림을 선택하세요."),
  tags: z
    .array(z.string().trim().min(1).max(24))
    .max(20)
    .transform((tags) => [...new Set(tags)]),
  archived: z.boolean().optional(),
});
const position = z
  .object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    width: z.number().min(5).max(100),
    height: z.number().min(5).max(100),
  })
  .refine(
    (b) => b.x + b.width <= 100 && b.y + b.height <= 100,
    "배치 영역이 스티커를 벗어났습니다.",
  );
const stickerImagePath = z
  .string()
  .max(200)
  .refine((path) => isUploadedMenuImage(path) || isStickerSampleImage(path));
const stickerImageSchema = z.object({
  id: key,
  image: stickerImagePath,
  box: position,
  aspectLocked: z.boolean().optional(),
  stretch: z.boolean().optional(),
});
export const stickerDesignSchema = z.object({
  id: key,
  name: z.string().trim().min(1).max(80),
  tags: z.array(z.string().trim().min(1).max(24)).max(20).optional(),
  orderId: key.optional(),
  kind: z.enum(["template", "order"]).optional(),
  updatedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
  retentionDays: z.number().int().min(1).max(MAX_STICKER_DAYS).optional(),
  assetId: key.optional(),
  image: z
    .string()
    .max(200)
    .refine((path) => isUploadedMenuImage(path) || isStickerSampleImage(path))
    .optional(),
  text: z.string().max(2000),
  shape: z.enum(["wide", "square"]),
  imageBox: position,
  imageAspectLocked: z.boolean().optional(),
  imageStretch: z.boolean().optional(),
  images: z
    .array(stickerImageSchema)
    .max(MAX_STICKER_IMAGES)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      "사진 ID가 중복되었습니다.",
    )
    .optional(),
  textBox: position,
  font: z.enum(["sans", "serif", "mono"]),
  fontSize: z.number().int().min(12).max(100),
  bold: z.boolean(),
  align: z.enum(["left", "center", "right"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type StickerAsset = z.infer<typeof stickerAssetSchema>;
export type StickerDesign = z.infer<typeof stickerDesignSchema>;
export type StickerImage = z.infer<typeof stickerImageSchema>;
export function stickerImages(
  design: StickerDesign,
  fallbackImage?: string,
): StickerImage[] {
  if (design.images) return design.images;
  const image = design.image || fallbackImage;
  return image
    ? [
        {
          id: "legacy",
          image,
          box: design.imageBox,
          aspectLocked: design.imageAspectLocked,
          stretch: design.imageStretch,
        },
      ]
    : [];
}
export type StickerBox = StickerDesign["imageBox"];
export function isOrderSticker(design: StickerDesign) {
  return design.kind === "order" || (!design.kind && !!design.orderId);
}
function stickerCreatedAt(design: StickerDesign, state: StoreState) {
  return (
    design.createdAt ||
    design.updatedAt ||
    state.orders.find((order) => order.id === design.orderId)?.updatedAt
  );
}
export function stickerExpiresAt(design: StickerDesign, state: StoreState) {
  const start = stickerCreatedAt(design, state);
  return start
    ? Date.parse(start) + (design.retentionDays ?? MAX_STICKER_DAYS) * DAY_MS
    : 0;
}
export function orderFromTemplate(
  template: StickerDesign,
  id: string,
): StickerDesign {
  return {
    ...structuredClone(template),
    id,
    kind: "order",
    name: `${template.name.slice(0, 74)} · 주문`,
    orderId: undefined,
    updatedAt: undefined,
    createdAt: undefined,
    retentionDays: MAX_STICKER_DAYS,
  };
}
export function expiredStickerIds(
  state: StoreState,
  now = new Date().toISOString(),
) {
  return (state.stickerDesigns || [])
    .filter((d) => {
      const expires = isOrderSticker(d) && stickerExpiresAt(d, state);
      return expires && expires <= Date.parse(now);
    })
    .map((d) => d.id);
}
export function pruneStickerWork(
  state: StoreState,
  now = new Date().toISOString(),
): StoreState {
  const expired = new Set(expiredStickerIds(state, now));
  const designs = state.stickerDesigns;
  if (
    !designs ||
    (!expired.size && !designs.some((d) => isOrderSticker(d) && !d.createdAt))
  )
    return state;
  return {
    ...state,
    stickerDesigns: designs
      .filter((d) => !expired.has(d.id))
      .map((d) =>
        isOrderSticker(d) && !d.createdAt
          ? { ...d, createdAt: stickerCreatedAt(d, state) || now }
          : d,
      ),
  };
}
export const stickerFonts = {
  sans: '"Noto Sans KR", "Malgun Gothic", sans-serif',
  serif: '"Batang", "Noto Serif KR", serif',
  mono: '"D2Coding", "Courier New", monospace',
};
export function stickerMatches(
  asset: StickerAsset,
  tags: string[],
  query: string,
) {
  return (
    !asset.archived &&
    tags.every((tag) => asset.tags.includes(tag)) &&
    `${asset.name} ${asset.tags.join(" ")}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())
  );
}
export function stickerBox(box: StickerBox): StickerBox {
  const width = Math.max(5, Math.min(100, box.width));
  const height = Math.max(5, Math.min(100, box.height));
  return {
    width,
    height,
    x: Math.max(0, Math.min(100 - width, box.x)),
    y: Math.max(0, Math.min(100 - height, box.y)),
  };
}
export function resizeStickerBox(
  box: StickerBox,
  dx: number,
  dy: number,
  proportional: boolean,
): StickerBox {
  if (!proportional)
    return {
      ...box,
      width: Math.max(5, Math.min(100 - box.x, box.width + dx)),
      height: Math.max(5, Math.min(100 - box.y, box.height + dy)),
    };
  const wanted =
    1 + (dx * box.width + dy * box.height) / (box.width ** 2 + box.height ** 2);
  const minimum = Math.max(5 / box.width, 5 / box.height);
  const maximum = Math.min(
    (100 - box.x) / box.width,
    (100 - box.y) / box.height,
  );
  const scale = Math.max(minimum, Math.min(maximum, wanted));
  return { ...box, width: box.width * scale, height: box.height * scale };
}
export function fitStickerImageBox(
  box: StickerBox,
  naturalWidth: number,
  naturalHeight: number,
  shape: StickerDesign["shape"],
): StickerBox {
  const height = shape === "square" ? 900 : 500;
  const ratio = Math.min(
    (box.width * 9) / naturalWidth,
    (box.height * height) / 100 / naturalHeight,
  );
  const width = (naturalWidth * ratio) / 9,
    fittedHeight = ((naturalHeight * ratio) / height) * 100;
  return stickerBox({
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - fittedHeight) / 2,
    width,
    height: fittedHeight,
  });
}
export function newStickerDesign(id: string): StickerDesign {
  return {
    id,
    name: "새 스티커",
    text: "",
    shape: "wide",
    imageBox: { x: 3, y: 15, width: 28, height: 70 },
    textBox: { x: 34, y: 10, width: 62, height: 80 },
    font: "sans",
    fontSize: 40,
    bold: false,
    align: "center",
    color: "#293e35",
  };
}

export function newStickerTemplate(id: string): StickerDesign {
  return {
    ...newStickerDesign(id),
    name: "새 템플릿",
    kind: "template",
    tags: [],
    text: "함께해 주셔서\n감사합니다",
    textBox: { x: 8, y: 12, width: 84, height: 76 },
  };
}
const sampleTemplates: StickerDesign[] = [
  {
    ...newStickerTemplate("sample-flowers"),
    name: "꽃 감사 인사",
    tags: ["감사", "답례"],
    image: "/stickers/flowers.png",
    imageBox: { x: 3, y: 8, width: 36, height: 84 },
    textBox: { x: 41, y: 12, width: 55, height: 76 },
    fontSize: 48,
  },
  {
    ...newStickerTemplate("sample-brush"),
    name: "분홍 축하",
    tags: ["축하", "생일"],
    image: "/stickers/brush.png",
    imageBox: { x: 5, y: 15, width: 90, height: 70 },
    text: "소중한 날을\n축하합니다",
    fontSize: 48,
  },
];
export function stickerTemplates(state: StoreState) {
  const saved = (state.stickerDesigns || []).filter((d) => !isOrderSticker(d));
  return [
    ...sampleTemplates.filter((d) => !saved.some((s) => s.id === d.id)),
    ...saved,
  ];
}

// Preview and PNG use the same renderer; no physical label dimensions are assumed.
export function drawSticker(
  canvas: HTMLCanvasElement,
  design: StickerDesign,
  images: Record<string, HTMLImageElement>,
  selected?: "imageBox" | "textBox",
  selectedImageId?: string,
) {
  canvas.width = 900;
  canvas.height = design.shape === "square" ? 900 : 500;
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width,
    h = canvas.height;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  const box = (b: StickerBox) => ({
    x: (b.x * w) / 100,
    y: (b.y * h) / 100,
    width: (b.width * w) / 100,
    height: (b.height * h) / 100,
  });
  for (const layer of stickerImages(design)) {
    const image = images[layer.image];
    if (!image) continue;
    const b = box(layer.box);
    const ratio = Math.min(
      b.width / image.naturalWidth,
      b.height / image.naturalHeight,
    );
    const iw = image.naturalWidth * ratio,
      ih = image.naturalHeight * ratio;
    if (layer.stretch) ctx.drawImage(image, b.x, b.y, b.width, b.height);
    else
      ctx.drawImage(
        image,
        b.x + (b.width - iw) / 2,
        b.y + (b.height - ih) / 2,
        iw,
        ih,
      );
  }
  const b = box(design.textBox);
  ctx.font = `${design.bold ? "bold " : ""}${design.fontSize}px ${stickerFonts[design.font]}`;
  ctx.textAlign = design.align;
  ctx.textBaseline = "top";
  ctx.fillStyle = design.color;
  const lines: string[] = [];
  for (const paragraph of design.text.split("\n")) {
    let line = "";
    for (const char of Array.from(paragraph)) {
      if (line && ctx.measureText(line + char).width > b.width) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
    lines.push(line);
  }
  const lineHeight = design.fontSize * 1.45;
  const overflow =
    lines.length * lineHeight > b.height ||
    lines.some((line) => ctx.measureText(line).width > b.width);
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.x, b.y, b.width, b.height);
  ctx.clip();
  const start = b.y + Math.max(0, (b.height - lines.length * lineHeight) / 2);
  const x =
    b.x +
    (design.align === "center"
      ? b.width / 2
      : design.align === "right"
        ? b.width
        : 0);
  lines.forEach((line, i) => ctx.fillText(line, x, start + i * lineHeight));
  ctx.restore();
  if (selected) {
    const r = box(
      selected === "imageBox"
        ? stickerImages(design).find((layer) => layer.id === selectedImageId)
            ?.box || design.imageBox
        : design.textBox,
    );
    ctx.strokeStyle = getComputedStyle(canvas)
      .getPropertyValue("--color-primary")
      .trim();
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(r.x, r.y, r.width, r.height);
  }
  return overflow;
}
