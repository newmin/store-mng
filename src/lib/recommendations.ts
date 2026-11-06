import type { ProductionLine, StoreState } from "./types";
import {
  fallbackCandidates,
  forecast,
  materialUsage,
  requirements,
  simulate,
} from "./calculations";
import { addDays } from "./dates";

export function validateRecommendations(
  state: StoreState,
  date: string,
  lines: ProductionLine[],
) {
  const allowed = new Set(fallbackCandidates(state, date).map((p) => p.id));
  const req = requirements(state, date);
  const baseline = req
    .filter((r) => r.batches)
    .map((r) => ({ productId: r.product.id, batches: r.batches }));
  const currentReserved = materialUsage(
    state,
    req
      .filter((r) => r.reservationBatches)
      .map((r) => ({ productId: r.product.id, batches: r.reservationBatches })),
  ).usage;
  const errors: string[] = [];
  if (lines.length > state.settings.extraCount)
    errors.push("추가 메뉴 수 초과");
  if (new Set(lines.map((l) => l.productId)).size !== lines.length)
    errors.push("메뉴 중복");
  if (
    lines.some(
      (l) =>
        !allowed.has(l.productId) || l.batches !== state.settings.extraBatches,
    )
  )
    errors.push("설정 또는 후보 메뉴 위반");
  const sim = simulate(state, [...baseline, ...lines]);
  errors.push(
    ...sim.issues,
    ...sim.shortages.map((s) => `${s.name} 재고 부족`),
  );
  // Forecast from today so reservations do not reuse finished stock allocated today.
  for (const m of forecast(state, date, addDays(date, 6))) {
    const futureReserved = Math.max(
      0,
      m.reservedNeed - (currentReserved[m.id] || 0),
    );
    if (m.stock - (sim.usage[m.id] || 0) < futureReserved)
      errors.push(`${m.name}: 향후 예약 재료 확보 필요`);
  }
  return { valid: !errors.length, errors, usage: sim.usage };
}
