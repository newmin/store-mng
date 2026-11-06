import { describe, it, expect } from "vitest";
import { applyCommand, demoState, emptyState } from "../src/lib/state";
import {
  demand,
  forecast,
  orderPieces,
  requirements,
  simulate,
} from "../src/lib/calculations";
import { addDays, today } from "../src/lib/dates";
import { commandSchema } from "../src/lib/types";
const date = today();
function base() {
  const s = demoState(date);
  s.orders = [];
  for (const p of s.products) p.displayTarget = 0;
  return s;
}
function order(quantity = 30) {
  const o = structuredClone(demoState(date).orders[2]);
  o.lines[0].quantity = quantity;
  return o;
}
function confirmed() {
  let s = base();
  s.orders = [order()];
  s = applyCommand(
    s,
    {
      type: "savePlan",
      id: "p",
      date,
      status: "confirmed",
      lines: [{ productId: "white", batches: 2 }],
    },
    "누나",
  );
  return s;
}
const completion = {
  type: "completePlan" as const,
  id: "p",
  actual: [{ productId: "white", pieces: 48 }],
  usage: [
    { materialId: "rice", quantity: 3200 },
    { materialId: "sugar", quantity: 360 },
  ],
};
describe("주문 · 수량 환산", () => {
  it("선물상자별 구성과 박스를 개수로 변환한다", () => {
    const s = demoState(date);
    expect(orderPieces(s.orders[0])).toEqual([
      { productId: "white", pieces: 10 },
      { productId: "honey", pieces: 20 },
    ]);
    expect(orderPieces(s.orders[1])[0].pieces).toBe(24);
    expect(demand(s, date)).toEqual({ white: 40, honey: 20, injeolmi: 24 });
  });
  it("수정·취소·수령일 변경을 합계에 반영한다", () => {
    let s = base();
    s = applyCommand(s, { type: "saveOrder", order: order() }, "누나");
    s = applyCommand(
      s,
      { type: "saveOrder", order: { ...s.orders[0], date: addDays(date, 1) } },
      "누나",
    );
    expect(demand(s, date)).toEqual({});
    expect(demand(s, addDays(date, 1)).white).toBe(30);
    s = applyCommand(
      s,
      { type: "orderStatus", id: s.orders[0].id, status: "cancelled" },
      "누나",
    );
    expect(demand(s, addDays(date, 1))).toEqual({});
  });
  it("박스당 개수 변경 후 과거 주문 환산 기준을 유지한다", () => {
    let s = base();
    const o = order();
    o.lines = [
      { productId: "white", unit: "box", piecesPerUnit: 999, quantity: 2 },
    ];
    s = applyCommand(s, { type: "saveOrder", order: o }, "누나");
    expect(orderPieces(s.orders[0])[0].pieces).toBe(20);
    s.products[0].boxSize = 12;
    s = applyCommand(
      s,
      { type: "saveOrder", order: { ...s.orders[0], sticker: "변경" } },
      "누나",
    );
    expect(orderPieces(s.orders[0])[0].pieces).toBe(20);
  });
  it("수령 완료와 되돌리기는 재료를 차감하지 않는다", () => {
    let s = base();
    s.orders = [order()];
    const stock = s.materials[0].stock;
    s = applyCommand(
      s,
      { type: "orderStatus", id: s.orders[0].id, status: "picked" },
      "매형",
    );
    expect(s.orders[0].pickedBy).toBe("매형");
    expect(s.materials[0].stock).toBe(stock);
    s = applyCommand(
      s,
      { type: "orderStatus", id: s.orders[0].id, status: "reserved" },
      "누나",
    );
    expect(s.orders[0].pickedAt).toBeUndefined();
  });
  it("잘못된 날짜와 음수·소수 수량을 거절한다", () => {
    expect(
      commandSchema.safeParse({
        type: "saveOrder",
        order: { ...order(), date: "2026-02-31" },
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        type: "saveOrder",
        order: { ...order(), lines: [{ ...order().lines[0], quantity: -1 }] },
      }).success,
    ).toBe(false);
  });
});
describe("생산량 · 기간별 재료 예측", () => {
  it("같은 재료를 쓰는 진열 예상 메뉴와 별도 확정 메뉴를 각각 계산한다", () => {
    const s = base();
    s.products[0].displayTarget = 10;
    s.plans = [
      {
        id: "extra",
        date,
        status: "confirmed",
        sourceRevision: 0,
        lines: [{ productId: "mugwort", batches: 1 }],
      },
    ];
    const f = forecast(s, date, date).find((m) => m.id === "rice")!;
    expect(f.reservedNeed).toBe(0);
    expect(f.displayNeed).toBe(3200);
  });
  it("예약 여분이 진열 목표를 채우며 생산 단위로 올림한다", () => {
    const s = base();
    s.orders = [order(35)];
    s.products[0].displayTarget = 20;
    const r = requirements(s, date)[0];
    expect(r.reservationBatches).toBe(2);
    expect(r.displayBatches).toBe(1);
    expect(r.batches).toBe(3);
    s.products[0].displayTarget = 10;
    expect(requirements(s, date)[0].batches).toBe(2);
  });
  it("주간 주문을 한 번에 올림하지 않고 날짜별로 계산한다", () => {
    const s = base();
    s.orders = [order(1), { ...order(1), id: "other", date: addDays(date, 1) }];
    const f = forecast(s, date, addDays(date, 1)).find((m) => m.id === "rice")!;
    expect(f.reservedNeed).toBe(3200);
    expect(f.displayNeed).toBe(0);
  });
  it("미래 예약에 대한 첫 재료 부족 날짜를 표시한다", () => {
    const s = base();
    s.materials[0].stock = 2000;
    s.orders = [order(1), { ...order(1), id: "other", date: addDays(date, 1) }];
    const f = forecast(s, date, addDays(date, 1)).find((m) => m.id === "rice")!;
    expect(f.shortage).toBe(1200);
    expect(f.firstShortage).toBe(addDays(date, 1));
    expect(s.materials[0].stock).toBe(2000);
  });
  it("유효한 여러 날 판매 재고를 먼저 사용하고 만료 재고는 제외한다", () => {
    const s = base();
    s.products[0].shelfDays = 3;
    s.orders = [order(30)];
    s.lots = [
      {
        id: "lot",
        productId: "white",
        date: addDays(date, -1),
        expires: addDays(date, 1),
        remaining: 30,
        produced: 30,
        planId: "old",
      },
    ];
    expect(requirements(s, date)[0].batches).toBe(0);
    s.lots[0].expires = addDays(date, -1);
    expect(requirements(s, date)[0].batches).toBe(2);
  });
  it("여러 날 품목은 예측 기간에도 가용 여분을 이월한다", () => {
    const s = base();
    s.products[0].shelfDays = 3;
    s.orders = [order(1), { ...order(1), id: "next", date: addDays(date, 1) }];
    expect(
      forecast(s, date, addDays(date, 1)).find((m) => m.id === "rice")!
        .reservedNeed,
    ).toBe(1600);
  });
  it("등록된 확정 계획과 예약 재료를 중복 합산하지 않는다", () => {
    const s = confirmed();
    expect(
      forecast(s, date, date).find((m) => m.id === "rice")!.reservedNeed,
    ).toBe(3200);
    expect(
      forecast(s, date, date).find((m) => m.id === "rice")!.displayNeed,
    ).toBe(0);
  });
  it("레시피가 없으면 시뮬레이션에 계산 불가 사유를 반환한다", () => {
    const s = base();
    s.products[0].recipe = [];
    expect(simulate(s, [{ productId: "white", batches: 1 }]).issues).toContain(
      "백설기: 재료 사용량 미등록",
    );
  });
});
describe("생산 완료 · 차감 · 마감", () => {
  it("수령을 먼저 기록한 주문은 나중에 생산 등록 시 완제품에 반영한다", () => {
    let s = confirmed();
    s = applyCommand(
      s,
      { type: "orderStatus", id: s.orders[0].id, status: "picked" },
      "누나",
    );
    s = applyCommand(
      s,
      {
        type: "savePlan",
        id: "p",
        date,
        status: "confirmed",
        lines: [{ productId: "white", batches: 2 }],
      },
      "매형",
    );
    s = applyCommand(s, completion, "매형");
    expect(s.lots[0].remaining).toBe(18);
    expect(s.orders[0].pickupAllocations?.[0].pieces).toBe(30);
  });
  it("수령 시 완제품만 차감하고 되돌리면 같은 생산분을 복구한다", () => {
    let s = applyCommand(confirmed(), completion, "매형");
    const stock = s.materials[0].stock;
    s = applyCommand(
      s,
      { type: "orderStatus", id: s.orders[0].id, status: "picked" },
      "누나",
    );
    expect(s.lots[0].remaining).toBe(18);
    expect(s.materials[0].stock).toBe(stock);
    expect(requirements(s, date)[0].pending).toBe(0);
    s = applyCommand(
      s,
      { type: "orderStatus", id: s.orders[0].id, status: "reserved" },
      "누나",
    );
    expect(s.lots[0].remaining).toBe(48);
    expect(requirements(s, date)[0].pending).toBe(30);
  });
  it("수령 후 마감의 판매 추정량에 예약 수령을 한 번만 포함한다", () => {
    let s = applyCommand(confirmed(), completion, "매형");
    s = applyCommand(
      s,
      { type: "orderStatus", id: s.orders[0].id, status: "picked" },
      "누나",
      "2026-11-05T01:00:00Z",
    );
    s = applyCommand(
      s,
      {
        type: "closeLot",
        lotId: s.lots[0].id,
        date,
        remaining: 8,
        waste: 2,
        other: 3,
      },
      "누나",
      "2026-11-05T09:00:00Z",
    );
    expect(s.closings[0].soldEstimate).toBe(35);
    expect(() =>
      applyCommand(
        s,
        { type: "orderStatus", id: s.orders[0].id, status: "reserved" },
        "누나",
      ),
    ).toThrow("이미 마감");
  });
  it("예약을 충족하지 못하는 생산안은 확정할 수 없다", () => {
    const s = base();
    s.orders = [order(30)];
    expect(() =>
      applyCommand(
        s,
        {
          type: "savePlan",
          id: "short",
          date,
          status: "confirmed",
          lines: [{ productId: "white", batches: 1 }],
        },
        "매형",
      ),
    ).toThrow("예약 수량");
  });
  it("생산과 재료 차감을 한 번만 적용하고 기준을 보관한다", () => {
    const before = confirmed();
    const after = applyCommand(before, completion, "매형");
    expect(after.materials[0].stock).toBe(12800);
    expect(before.materials[0].stock).toBe(16000);
    expect(after.lots[0].produced).toBe(48);
    expect(after.plans[0].recipeSnapshot![0].recipe[0].quantity).toBe(1600);
    expect(applyCommand(after, completion, "누나")).toEqual(after);
    expect(requirements(after, date)[0].batches).toBe(0);
    expect(
      forecast(after, date, date).find((m) => m.id === "rice")!.reservedNeed,
    ).toBe(0);
  });
  it("주문·재고가 바뀐 계획은 재확정 전 완료할 수 없다", () => {
    let s = confirmed();
    s = applyCommand(
      s,
      {
        type: "adjustStock",
        materialId: "rice",
        mode: "receive",
        quantity: 100,
        note: "입고",
      },
      "누나",
    );
    expect(() => applyCommand(s, completion, "매형")).toThrow("재계산");
  });
  it("재료가 부족하면 어떤 재고나 실적도 바뀌지 않는다", () => {
    const s = confirmed();
    s.materials.find((m) => m.id === "sugar")!.stock = 10;
    const copy = structuredClone(s);
    expect(() => applyCommand(s, completion, "매형")).toThrow("재고가 부족");
    expect(s).toEqual(copy);
  });
  it("중복 실제 생산량 입력과 사용량 누락을 거절한다", () => {
    const s = confirmed();
    expect(() =>
      applyCommand(
        s,
        { ...completion, actual: [...completion.actual, ...completion.actual] },
        "매형",
      ),
    ).toThrow("실제 생산량");
    expect(() => applyCommand(s, { ...completion, usage: [] }, "매형")).toThrow(
      "실제 사용량",
    );
  });
  it("실사 보정은 차액을 원장에 기록한다", () => {
    const s = applyCommand(
      base(),
      {
        type: "adjustStock",
        materialId: "rice",
        mode: "count",
        quantity: 1000,
        note: "실사",
      },
      "누나",
    );
    expect(s.materials[0].stock).toBe(1000);
    expect(s.movements[0].delta).toBe(-15000);
  });
  it("입출고에서 음수 재고와 기존 단위 변경을 거절한다", () => {
    const s = base();
    expect(() =>
      applyCommand(
        s,
        {
          type: "adjustStock",
          materialId: "rice",
          mode: "waste",
          quantity: 99999,
          note: "폐기",
        },
        "누나",
      ),
    ).toThrow();
    expect(() =>
      applyCommand(
        s,
        { type: "saveMaterial", material: { ...s.materials[0], unit: "개" } },
        "누나",
      ),
    ).toThrow("변경할 수 없습니다");
  });
  it("마감 차액을 기록하고 당일 잔량을 다음 날 생산에서 제외한다", () => {
    let s = applyCommand(confirmed(), completion, "매형");
    s = applyCommand(
      s,
      {
        type: "closeLot",
        lotId: s.lots[0].id,
        date,
        remaining: 8,
        waste: 2,
        other: 3,
      },
      "누나",
    );
    expect(s.closings[0].soldEstimate).toBe(35);
    s.orders = [{ ...order(1), date: addDays(date, 1) }];
    expect(requirements(s, addDays(date, 1))[0].carry).toBe(0);
    expect(() =>
      applyCommand(
        s,
        {
          type: "closeLot",
          lotId: s.lots[0].id,
          date,
          remaining: 0,
          waste: 0,
          other: 0,
        },
        "누나",
      ),
    ).toThrow("이미 마감");
  });
  it("마감 총량 초과와 만료 후 잔량 이월을 거절한다", () => {
    const s = applyCommand(confirmed(), completion, "매형");
    expect(() =>
      applyCommand(
        s,
        {
          type: "closeLot",
          lotId: s.lots[0].id,
          date,
          remaining: 40,
          waste: 10,
          other: 0,
        },
        "누나",
      ),
    ).toThrow("초과");
    s.lots[0].date = addDays(date, -2);
    s.lots[0].expires = addDays(date, -1);
    expect(() =>
      applyCommand(
        s,
        {
          type: "closeLot",
          lotId: s.lots[0].id,
          date,
          remaining: 1,
          waste: 0,
          other: 0,
        },
        "누나",
      ),
    ).toThrow("폐기");
  });
  it("빈 운영 매장은 샘플 데이터로 오염되지 않는다", () => {
    const s = emptyState();
    expect(s.orders).toHaveLength(0);
    expect(s.products).toHaveLength(0);
    expect(s.settings.initialized).toBe(false);
  });
});
