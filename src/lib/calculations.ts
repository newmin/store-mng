import { addDays, dateRange } from "./dates";
import type { Order, Plan, Product, StoreState } from "./types";
export function orderPieces(order: Order) {
  return order.lines.map((l) => ({
    productId: l.productId,
    pieces:
      l.quantity * l.piecesPerUnit * (order.kind === "gift" ? order.boxes : 1),
  }));
}
export function demand(state: StoreState, date: string, pendingOnly = false) {
  const totals: Record<string, number> = {};
  for (const o of state.orders.filter(
    (o) =>
      o.date === date &&
      (pendingOnly ? o.status === "reserved" : o.status !== "cancelled"),
  ))
    for (const l of orderPieces(o))
      totals[l.productId] = (totals[l.productId] || 0) + l.pieces;
  return totals;
}
export function recipeIssue(p: Product, state: StoreState) {
  if (!p.batchYield) return "기본 생산량 미등록";
  if (!p.recipe.length) return "재료 사용량 미등록";
  if (
    p.recipe.some(
      (r) =>
        !state.materials.some(
          (m) => m.id === r.materialId && m.kind === "ingredient",
        ),
    )
  )
    return "재료 기준 확인 필요";
  return null;
}
export function requirements(
  state: StoreState,
  date: string,
  includeDisplay = true,
) {
  const wanted = demand(state, date),
    outstanding = demand(state, date, true);
  return state.products
    .filter((p) => p.active || wanted[p.id])
    .map((p) => {
      const reserved = wanted[p.id] || 0,
        pending = outstanding[p.id] || 0;
      const carry = state.lots
        .filter(
          (l) => l.productId === p.id && l.date <= date && l.expires >= date,
        )
        .reduce((s, l) => s + l.remaining, 0);
      const completed = state.plans
        .filter((x) => x.date === date && x.status === "completed")
        .flatMap((x) => x.lines)
        .filter((l) => l.productId === p.id)
        .reduce((s, l) => s + (l.actualPieces || 0), 0);
      // Completed lots include the pieces allocated to same-day reservations until closing.
      const reservationNeed = Math.max(0, pending - carry);
      const rb = p.batchYield ? Math.ceil(reservationNeed / p.batchYield) : 0;
      const availableAfterReservations = Math.max(
        0,
        carry + rb * (p.batchYield || 0) - pending,
      );
      const displayNeed = includeDisplay
        ? Math.max(0, p.displayTarget - availableAfterReservations)
        : 0;
      const db = p.batchYield ? Math.ceil(displayNeed / p.batchYield) : 0;
      return {
        product: p,
        reserved,
        pending,
        carry,
        completed,
        reservationBatches: rb,
        displayBatches: db,
        batches: rb + db,
        issue: recipeIssue(p, state),
      };
    });
}
export function materialUsage(state: StoreState, lines: Plan["lines"]) {
  const usage: Record<string, number> = {};
  const issues: string[] = [];
  for (const l of lines) {
    const p = state.products.find((p) => p.id === l.productId);
    if (!p) {
      issues.push("알 수 없는 메뉴");
      continue;
    }
    const issue = recipeIssue(p, state);
    if (issue) issues.push(`${p.name}: ${issue}`);
    for (const r of p.recipe)
      usage[r.materialId] = (usage[r.materialId] || 0) + r.quantity * l.batches;
  }
  return { usage, issues };
}
export function simulate(state: StoreState, lines: Plan["lines"]) {
  const result = materialUsage(state, lines);
  return {
    ...result,
    shortages: state.materials
      .filter((m) => (result.usage[m.id] || 0) > m.stock)
      .map((m) => ({
        id: m.id,
        name: m.name,
        shortage: (result.usage[m.id] || 0) - m.stock,
      })),
  };
}
export function forecast(state: StoreState, start: string, end: string) {
  const rows = state.materials
    .filter((m) => m.kind === "ingredient")
    .map((m) => ({
      ...m,
      reservedNeed: 0,
      displayNeed: 0,
      shortage: 0,
      firstShortage: "",
    }));
  const virtual = structuredClone(state);
  for (const day of dateRange(start, end)) {
    const req = requirements(virtual, day);
    const reserved = materialUsage(
      virtual,
      req
        .filter((r) => r.reservationBatches)
        .map((r) => ({
          productId: r.product.id,
          batches: r.reservationBatches,
        })),
    ).usage;
    const confirmed = state.plans.filter(
      (p) => p.date === day && p.status === "confirmed",
    );
    const plannedBatches = (id: string) =>
      confirmed
        .flatMap((p) => p.lines)
        .filter((l) => l.productId === id)
        .reduce((n, l) => n + l.batches, 0);
    const combinedUsage = materialUsage(
      virtual,
      req
        .map((r) => ({
          productId: r.product.id,
          batches: Math.max(r.batches, plannedBatches(r.product.id)),
        }))
        .filter((l) => l.batches > 0),
    ).usage;
    for (const r of rows) {
      const rn = reserved[r.id] || 0;
      const total = combinedUsage[r.id] || 0;
      r.reservedNeed += rn;
      r.displayNeed += Math.max(0, total - rn);
      r.shortage = Math.max(0, r.reservedNeed + r.displayNeed - r.stock);
      if (r.shortage && !r.firstShortage) r.firstShortage = day;
    }
    // Project leftover output through the horizon; consume reservations once per day.
    for (const r of req) {
      const planned = confirmed
        .flatMap((p) => p.lines)
        .filter((l) => l.productId === r.product.id)
        .reduce((s, l) => s + l.batches, 0);
      const made = Math.max(r.batches, planned) * (r.product.batchYield || 0);
      let consume = r.pending;
      for (const l of virtual.lots
        .filter(
          (l) =>
            l.productId === r.product.id && l.date <= day && l.expires >= day,
        )
        .sort((a, b) => a.expires.localeCompare(b.expires))) {
        const used = Math.min(consume, l.remaining);
        l.remaining -= used;
        consume -= used;
      }
      const leftover = Math.max(0, made - consume);
      if (leftover)
        virtual.lots.push({
          id: `forecast-${day}-${r.product.id}`,
          productId: r.product.id,
          date: day,
          expires: addDays(day, r.product.shelfDays - 1),
          remaining: leftover,
          produced: made,
          planId: "forecast",
        });
    }
  }
  return rows;
}
export function fallbackCandidates(state: StoreState, date: string) {
  const existing = new Set(
    requirements(state, date)
      .filter((r) => r.batches || r.product.displayTarget)
      .map((r) => r.product.id),
  );
  return state.products
    .filter(
      (p) =>
        p.active &&
        !existing.has(p.id) &&
        !state.settings.excluded.includes(p.id) &&
        !recipeIssue(p, state),
    )
    .filter(
      (p) =>
        !state.lots.some(
          (l) =>
            l.productId === p.id &&
            l.date >= addDays(date, -state.settings.avoidDays) &&
            l.date <= date,
        ),
    )
    .sort((a, b) => {
      const last = (id: string) =>
        state.lots
          .filter((l) => l.productId === id && l.date < date)
          .map((l) => l.date)
          .sort()
          .at(-1) || "";
      return last(a.id).localeCompare(last(b.id));
    });
}
