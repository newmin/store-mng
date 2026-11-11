import { upgradeMenuCatalog } from "./catalog-upgrade";
import { addDays, today } from "./dates";
import { demoState } from "./state";
import type { Order, StoreState } from "./types";

// Used only when opening the browser-local demo, never when loading a shared shop.
export function initializeDemoState(
  cached?: StoreState,
  date = today(),
): StoreState {
  const initial = cached || { ...demoState(date), orders: [] };
  const upgraded = initializeProductionDemo(upgradeMenuCatalog(initial), date);
  const orders = upgraded.orders.map((order) =>
    order.id.startsWith("demo-month-") && /\s*\(체험\)$/.test(order.customer)
      ? { ...order, customer: order.customer.replace(/\s*\(체험\)$/, "") }
      : order,
  );
  const state = orders.some((order, index) => order !== upgraded.orders[index])
    ? { ...upgraded, orders }
    : upgraded;
  const month = date.slice(0, 7);
  if (state.demoSeededMonths?.includes(month)) return state;
  const products = state.products.filter((p) => p.active && !p.archived);
  if (!products.length) return state;

  const next = structuredClone(state);
  const names = [
    "김민지",
    "박서연",
    "이정훈",
    "최유진",
    "정지우",
    "강하윤",
    "윤서준",
    "장도윤",
    "임수빈",
    "한예린",
    "오지호",
    "신예은",
  ];
  const times = ["09:30", "11:00", "14:30"];
  const methods = ["pickup", "quick", "delivery"] as const;
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const existingIds = new Set(next.orders.map((o) => o.id));

  for (let day = 1; day <= lastDay; day++) {
    const orderDate = `${month}-${String(day).padStart(2, "0")}`;
    for (let slot = 0; slot < times.length; slot++) {
      const id = `demo-month-${orderDate}-${slot}`;
      if (existingIds.has(id)) continue;
      const index = (day - 1) * times.length + slot;
      const product = products[index % products.length];
      const second = products[(index + 1) % products.length];
      const fulfillment = methods[(day + slot) % methods.length];
      const gift = slot === 1;
      const unit = slot === 2 ? "box" : "piece";
      const status =
        day % 6 === 0 && slot === 2
          ? "cancelled"
          : orderDate < date
            ? "picked"
            : "reserved";
      const timestamp = `${orderDate}T${times[slot]}:00+09:00`;
      const order: Order = {
        id,
        customer: names[index % names.length],
        phone: `010-0000-${String(index + 100).padStart(4, "0")}`,
        date: orderDate,
        time: times[slot],
        fulfillment,
        deliveryAddress:
          fulfillment !== "pickup" && index % 4 !== 0
            ? `체험시 샘플로 ${day}길 ${slot + 1}, 예시빌딩 ${day}호`
            : "",
        kind: gift ? "gift" : "single",
        boxes: gift ? 3 + (day % 5) : 1,
        lines: gift
          ? [
              {
                productId: product.id,
                quantity: 2,
                unit: "piece",
                piecesPerUnit: 1,
              },
              {
                productId: second.id,
                quantity: 2,
                unit: "piece",
                piecesPerUnit: 1,
              },
            ]
          : [
              {
                productId: product.id,
                quantity: unit === "box" ? 1 + (day % 3) : 10 + (day % 5) * 5,
                unit,
                piecesPerUnit: unit === "box" ? product.boxSize : 1,
              },
            ],
        sticker: gift
          ? [
              "첫 생일을 축하해 주셔서 감사합니다 ♡",
              "함께해 주셔서 감사합니다",
              "생신을 축하드립니다",
            ][day % 3]
          : "",
        status,
        updatedAt: timestamp,
        ...(status === "picked"
          ? { pickedAt: timestamp, pickedBy: "체험 사용자" }
          : {}),
      };
      next.orders.push(order);
    }
  }
  next.demoSeededMonths = [...(next.demoSeededMonths || []), month];
  next.revision++;
  return next;
}

// Fictional production assumptions for trying the agent, not shop recipes.
function initializeProductionDemo(input: StoreState, date: string): StoreState {
  if (input.demoProductionVersion === 1) return input;
  const state = structuredClone(input);
  const ingredients = [
    ["rice", "멥쌀가루", 180000],
    ["sticky", "찹쌀가루", 120000],
    ["sugar", "설탕", 30000],
    ["sesame", "참깨", 10000],
    ["bean", "콩고물", 20000],
    ["demo-filling", "앙금 · 체험용", 30000],
    ["demo-flavor", "맛 재료 · 체험용", 30000],
    ["demo-milk", "우유 · 체험용", 20000],
    ["demo-butter", "버터 · 체험용", 15000],
  ] as const;
  for (const [id, name, stock] of ingredients) {
    const existing = state.materials.find((m) => m.id === id);
    if (existing) existing.stock = Math.max(existing.stock, stock);
    else
      state.materials.push({
        id,
        name,
        stock,
        unit: "g",
        kind: "ingredient",
        threshold: 3000,
      });
  }
  for (const p of state.products.filter((p) => !p.archived)) {
    p.batchYield ??= p.category === "general" ? 30 : 24;
    if (!p.recipe.length) {
      p.recipe =
        p.category === "oven"
          ? [
              { materialId: "sticky", quantity: 1000 },
              { materialId: "sugar", quantity: 180 },
              { materialId: "demo-milk", quantity: 500 },
              { materialId: "demo-butter", quantity: 120 },
              { materialId: "demo-flavor", quantity: 150 },
            ]
          : [
              {
                materialId: p.category === "seolgi" ? "rice" : "sticky",
                quantity: 1600,
              },
              { materialId: "sugar", quantity: 180 },
              {
                materialId:
                  p.category === "seolgi" ? "demo-flavor" : "demo-filling",
                quantity: 300,
              },
            ];
    }
  }
  state.settings = {
    initialized: true,
    extraCount: 2,
    extraBatches: 1,
    avoidDays: 3,
    excluded: [],
  };
  const products = state.products.filter((p) => p.active && !p.archived);
  for (let days = 7; days >= 1; days--) {
    const day = addDays(date, -days);
    const id = `demo-production-${day}`;
    const chosen = products.slice((7 - days) * 2, (7 - days) * 2 + 2);
    const lines = chosen.map((p) => ({
      productId: p.id,
      batches: 1,
      actualPieces: p.batchYield!,
    }));
    state.plans.push({
      id,
      date: day,
      status: "completed",
      lines,
      sourceRevision: state.revision,
      completedAt: `${day}T08:00:00+09:00`,
      completedBy: "체험 사용자",
      recipeSnapshot: structuredClone(chosen),
    });
    for (const p of chosen) {
      const lotId = `${id}-${p.id}`;
      const produced = p.batchYield!;
      state.lots.push({
        id: lotId,
        productId: p.id,
        date: day,
        expires: addDays(day, p.shelfDays - 1),
        produced,
        remaining: 0,
        planId: id,
      });
      state.closings.push({
        id: `closing-${lotId}`,
        date: day,
        lotId,
        remaining: 0,
        waste: 2,
        other: 0,
        soldEstimate: produced - 2,
        actor: "체험 사용자",
        at: `${day}T19:00:00+09:00`,
      });
      for (const r of p.recipe)
        state.movements.push({
          id: `${lotId}-${r.materialId}`,
          materialId: r.materialId,
          delta: -r.quantity,
          reason: "체험 생산 기록",
          actor: "체험 사용자",
          at: `${day}T08:00:00+09:00`,
          planId: id,
        });
    }
  }
  state.demoProductionVersion = 1;
  state.revision++;
  return state;
}
