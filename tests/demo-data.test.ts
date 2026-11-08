import { describe, expect, it } from "vitest";
import { initializeDemoState } from "../src/lib/demo-data";
import { demoState } from "../src/lib/state";
import { orderSchema } from "../src/lib/types";
import { orderMessage } from "../src/lib/order-message";

describe("월별 체험 주문", () => {
  it("11월 전체에 하루 세 건씩 다양한 주문을 등록한다", () => {
    const state = initializeDemoState(undefined, "2026-11-08");
    expect(state.orders).toHaveLength(90);
    expect(new Set(state.orders.map((o) => o.id)).size).toBe(90);
    expect(new Set(state.orders.map((o) => o.date)).size).toBe(30);
    expect(
      state.orders.every(
        (o) =>
          o.date.startsWith("2026-11-") && orderSchema.safeParse(o).success,
      ),
    ).toBe(true);
    expect(new Set(state.orders.map((o) => o.fulfillment))).toEqual(
      new Set(["pickup", "quick", "delivery"]),
    );
    expect(new Set(state.orders.map((o) => o.status))).toEqual(
      new Set(["picked", "reserved", "cancelled"]),
    );
    expect(
      state.orders.filter(
        (o) => o.date === "2026-11-08" && o.status === "reserved",
      ),
    ).toHaveLength(3);
    for (const order of state.orders) {
      expect(
        order.lines.every((l) =>
          state.products.some((p) => p.id === l.productId && !p.archived),
        ),
      ).toBe(true);
      expect(orderMessage(order, state.products)).not.toContain("미등록 메뉴");
    }
  });

  it("저장된 주문과 변경한 샘플을 유지하며 새로 열어도 중복 등록하지 않는다", () => {
    const cached = demoState("2026-11-08");
    const original = structuredClone(cached);
    const first = initializeDemoState(cached, "2026-11-08");
    expect(cached).toEqual(original);
    expect(first.orders.slice(0, cached.orders.length)).toEqual(cached.orders);
    first.orders.at(-1)!.customer = "수정한 고객";
    const next = initializeDemoState(first, "2026-11-09");
    expect(next).toBe(first);
    expect(next.orders).toHaveLength(94);
    expect(next.orders.at(-1)!.customer).toBe("수정한 고객");
  });

  it("월말과 윤년을 처리하고 다음 달 주문을 추가할 때 지난 기록을 보존한다", () => {
    const february = initializeDemoState(undefined, "2028-02-29");
    expect(february.orders).toHaveLength(29 * 3);
    const march = initializeDemoState(february, "2028-03-01");
    expect(march.orders).toHaveLength((29 + 31) * 3);
    expect(march.orders.slice(0, february.orders.length)).toEqual(
      february.orders,
    );
    expect(march.demoSeededMonths).toEqual(["2028-02", "2028-03"]);
  });
});
