import { z } from "zod";
import { isUploadedMenuImage } from "./menu-image";

const key = z.string().min(1).max(100);
export const stickerAssetSchema = z.object({
  id: key,
  name: z.string().trim().min(1).max(80),
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
export const stickerDesignSchema = z.object({
  id: key,
  name: z.string().trim().min(1).max(80),
  orderId: key.optional(),
  assetId: key.optional(),
  image: z.string().max(200).refine(isUploadedMenuImage).optional(),
  text: z.string().max(2000),
  shape: z.enum(["wide", "square"]),
  imageBox: position,
  textBox: position,
  font: z.enum(["sans", "serif", "mono"]),
  fontSize: z.number().int().min(12).max(100),
  bold: z.boolean(),
  align: z.enum(["left", "center", "right"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type StickerAsset = z.infer<typeof stickerAssetSchema>;
export type StickerDesign = z.infer<typeof stickerDesignSchema>;
export type StickerBox = StickerDesign["imageBox"];
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

// Preview and PNG use the same renderer; no physical label dimensions are assumed.
export function drawSticker(
  canvas: HTMLCanvasElement,
  design: StickerDesign,
  image: HTMLImageElement | null,
  selected?: "imageBox" | "textBox",
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
  if (image) {
    const b = box(design.imageBox);
    const ratio = Math.min(
      b.width / image.naturalWidth,
      b.height / image.naturalHeight,
    );
    const iw = image.naturalWidth * ratio,
      ih = image.naturalHeight * ratio;
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
    const r = box(design[selected]);
    ctx.strokeStyle = "#aa804d";
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(r.x, r.y, r.width, r.height);
  }
  return overflow;
}
