import { z } from "zod";
import {
  daySchema,
  materialSchema,
  orderSchema,
  productSchema,
  settingsSchema,
  type StoreState,
} from "./types";
import { emptyState } from "./state";

// Only operational quantities cross the wire. Customer and sticker data stay local.
export const recommendationContextSchema = z.object({
  revision: z.number().int().nonnegative(),
  products: z.array(productSchema).max(500),
  materials: z.array(materialSchema).max(500),
  settings: settingsSchema,
  orders: z
    .array(
      orderSchema.pick({
        id: true,
        date: true,
        kind: true,
        boxes: true,
        lines: true,
        status: true,
      }),
    )
    .max(5000),
  plans: z
    .array(
      z.object({
        id: z.string().max(100),
        date: daySchema,
        status: z.enum(["draft", "confirmed", "completed"]),
        sourceRevision: z.number().int().nonnegative(),
        lines: z
          .array(
            z.object({
              productId: z.string().max(100),
              batches: z.number().int().positive().max(100000),
              actualPieces: z
                .number()
                .int()
                .nonnegative()
                .max(1000000)
                .optional(),
            }),
          )
          .max(100),
      }),
    )
    .max(1000),
  lots: z
    .array(
      z.object({
        id: z.string().max(100),
        productId: z.string().max(100),
        date: daySchema,
        expires: daySchema,
        remaining: z.number().int().nonnegative().max(1000000),
        produced: z.number().int().nonnegative().max(1000000),
        planId: z.string().max(100),
      }),
    )
    .max(5000),
});

export function recommendationContext(state: StoreState, date: string) {
  return recommendationContextSchema.parse({
    ...state,
    orders: state.orders
      .filter((o) => o.date >= date)
      .map(({ id, date, kind, boxes, lines, status }) => ({
        id,
        date,
        kind,
        boxes,
        lines,
        status,
      })),
  });
}

export function recommendationState(raw: unknown): StoreState {
  const input = recommendationContextSchema.parse(raw);
  return {
    ...emptyState(),
    ...input,
    orders: input.orders.map((o) => ({
      ...o,
      customer: "체험",
      phone: "",
      time: "00:00",
      sticker: "",
      updatedAt: "",
    })),
  };
}
