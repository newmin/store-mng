import { z } from "zod";
import { findMenuPhoto } from "./menu-catalog";

export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "올바른 날짜를 입력하세요.",
  );
const id = z.string().min(1).max(100);
const positive = z.number().positive().max(1e9);
const count = z.number().int().positive().max(1000000);
const nonnegative = z.number().nonnegative().max(1e9);
export const materialSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  unit: z.enum(["g", "ml", "개"]),
  kind: z.enum(["ingredient", "supply"]),
  stock: nonnegative,
  threshold: nonnegative,
});
export const productSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  image: z
    .string()
    .refine((v) => !!findMenuPhoto(v), "메뉴판에서 등록한 사진을 선택하세요.")
    .optional(),
  category: z.enum(["general", "seolgi", "oven"]).optional(),
  boxPrice: z.number().int().positive().max(100000000).optional(),
  boxSize: count,
  batchYield: count.nullable(),
  batchLabel: z.string().min(1).max(40),
  shelfDays: z.number().int().min(1).max(365),
  displayTarget: z.number().int().min(0).max(100000),
  active: z.boolean(),
  archived: z.boolean().optional(),
  recipe: z.array(z.object({ materialId: id, quantity: positive })).max(100),
});
export const orderLineSchema = z.object({
  productId: id,
  quantity: count,
  unit: z.enum(["piece", "box"]),
  piecesPerUnit: count,
});
export const orderSchema = z.object({
  id,
  customer: z.string().trim().min(1).max(80),
  phone: z.string().max(50),
  channel: z.string().min(1).max(50).optional(),
  fulfillment: z.enum(["pickup", "quick", "delivery"]).optional(),
  deliveryAddress: z.string().trim().max(500).optional(),
  date: daySchema,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  kind: z.enum(["single", "gift"]),
  boxes: count,
  lines: z.array(orderLineSchema).min(1).max(100),
  sticker: z.string().max(2000),
  imagePath: z.string().max(500).optional(),
  status: z.enum(["reserved", "picked", "cancelled"]),
  pickedAt: z.string().optional(),
  pickedBy: z.string().optional(),
  pickupAllocations: z.array(z.object({ lotId: id, pieces: count })).optional(),
  updatedAt: z.string(),
});
export const settingsSchema = z.object({
  extraCount: z.number().int().min(0).max(10),
  extraBatches: z.number().int().min(1).max(100),
  avoidDays: z.number().int().min(0).max(365),
  excluded: z.array(id).max(1000),
  initialized: z.boolean(),
});
export type Material = z.infer<typeof materialSchema>;
export type Product = z.infer<typeof productSchema>;
export type Order = z.infer<typeof orderSchema>;
export type OrderLine = z.infer<typeof orderLineSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type ProductionLine = {
  productId: string;
  batches: number;
  actualPieces?: number;
  reason?: string;
};
export type Plan = {
  id: string;
  date: string;
  status: "draft" | "confirmed" | "completed";
  lines: ProductionLine[];
  sourceRevision: number;
  completedAt?: string;
  completedBy?: string;
  recipeSnapshot?: Product[];
};
export type Lot = {
  id: string;
  productId: string;
  date: string;
  expires: string;
  remaining: number;
  produced: number;
  planId: string;
};
export type Closing = {
  id: string;
  date: string;
  lotId: string;
  remaining: number;
  waste: number;
  other: number;
  soldEstimate: number;
  actor: string;
  at: string;
};
export type Movement = {
  id: string;
  materialId: string;
  delta: number;
  reason: string;
  actor: string;
  at: string;
  planId?: string;
};
export type Audit = { at: string; actor: string; message: string };
export type StoreState = {
  paymentAccount?: string;
  catalogVersion?: number;
  revision: number;
  products: Product[];
  materials: Material[];
  orders: Order[];
  plans: Plan[];
  lots: Lot[];
  closings: Closing[];
  movements: Movement[];
  settings: Settings;
  audit: Audit[];
};
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("saveOrder"), order: orderSchema }),
  z.object({
    type: z.literal("orderStatus"),
    id,
    status: z.enum(["reserved", "picked", "cancelled"]),
  }),
  z.object({ type: z.literal("saveProduct"), product: productSchema }),
  z.object({ type: z.literal("saveMaterial"), material: materialSchema }),
  z.object({
    type: z.literal("adjustStock"),
    materialId: id,
    mode: z.enum(["receive", "waste", "use", "count"]),
    quantity: nonnegative,
    note: z.string().trim().min(1).max(300),
  }),
  z.object({ type: z.literal("saveSettings"), settings: settingsSchema }),
  z.object({
    type: z.literal("savePaymentAccount"),
    account: z.string().trim().max(200),
  }),
  z.object({
    type: z.literal("savePlan"),
    id,
    date: daySchema,
    status: z.enum(["draft", "confirmed"]),
    lines: z
      .array(
        z.object({
          productId: id,
          batches: z.number().int().min(1).max(100000),
          reason: z.string().max(1000).optional(),
        }),
      )
      .min(1)
      .max(100),
  }),
  z.object({
    type: z.literal("completePlan"),
    id,
    actual: z
      .array(
        z.object({
          productId: id,
          pieces: z.number().int().min(0).max(1000000),
        }),
      )
      .max(100),
    usage: z
      .array(z.object({ materialId: id, quantity: nonnegative }))
      .max(100),
  }),
  z.object({
    type: z.literal("closeLot"),
    lotId: id,
    date: daySchema,
    remaining: z.number().int().min(0).max(1000000),
    waste: z.number().int().min(0).max(1000000),
    other: z.number().int().min(0).max(1000000),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
