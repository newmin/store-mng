import { upgradeMenuCatalog } from "./catalog-upgrade";
import { today } from "./dates";
import { demoState } from "./state";
import type { Order, StoreState } from "./types";

// Used only when opening the browser-local demo, never when loading a shared shop.
export function initializeDemoState(
  cached?: StoreState,
  date = today(),
): StoreState {
  const initial = cached || { ...demoState(date), orders: [] };
  const state = upgradeMenuCatalog(initial);
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
        customer: `${names[index % names.length]} (체험)`,
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
