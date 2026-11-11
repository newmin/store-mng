import { describe, expect, it } from "vitest";
import { initializeDemoState } from "../src/lib/demo-data";
import { demoState } from "../src/lib/state";
import { orderSchema } from "../src/lib/types";
import { orderMessage } from "../src/lib/order-message";
import { fallbackCandidates, recipeIssue } from "../src/lib/calculations";
import { validateRecommendations } from "../src/lib/recommendations";
import {
  recommendationContext,
  recommendationState,
} from "../src/lib/recommendation-context";

describe("월별 체험 주문", () => {
  it("모든 메뉴의 생산 기준과 최근 기록을 채우고 실제로 검증 가능한 추천 후보를 제공한다", () => {
    for (const date of [
      "2026-11-01",
      "2026-11-11",
      "2026-11-30",
      "2028-02-29",
    ]) {
      const state = initializeDemoState(undefined, date);
      expect(
        state.products
          .filter((p) => p.active)
          .every((p) => !recipeIssue(p, state)),
      ).toBe(true);
      expect(state.plans).toHaveLength(7);
      expect(state.closings).toHaveLength(14);
      expect(state.movements.length).toBeGreaterThan(0);
      const candidates = fallbackCandidates(state, date);
      const lines = candidates.slice(0, state.settings.extraCount).map((p) => ({
        productId: p.id,
        batches: state.settings.extraBatches,
      }));
      expect(lines).toHaveLength(2);
      expect(validateRecommendations(state, date, lines)).toMatchObject({
        valid: true,
        errors: [],
      });
      const snapshot = recommendationContext(state, date);
      expect(JSON.stringify(snapshot)).not.toContain("010-0000");
      expect(snapshot.orders[0]).not.toHaveProperty("customer");
      expect(snapshot).not.toHaveProperty("paymentAccount");
      expect(
        validateRecommendations(recommendationState(snapshot), date, lines),
      ).toEqual(validateRecommendations(state, date, lines));
    }
  });

  it("생산 샘플 보충은 한 번만 수행하고 이후 재고와 기준 편집을 유지한다", () => {
    const state = initializeDemoState(undefined, "2026-11-11");
    state.materials[0].stock = 1;
    state.settings.extraCount = 0;
    state.products[0].recipe = [];
    const next = initializeDemoState(state, "2026-12-01");
    expect(next.materials[0].stock).toBe(1);
    expect(next.settings.extraCount).toBe(0);
    expect(next.products[0].recipe).toEqual([]);
    expect(next.plans).toEqual(state.plans);
  });
  it("11월 전체에 하루 세 건씩 다양한 주문을 등록한다", () => {
    const state = initializeDemoState(undefined, "2026-11-08");
    expect(state.orders).toHaveLength(90);
    expect(
      state.orders.every((order) => !order.customer.includes("(체험)")),
    ).toBe(true);
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

  it("이미 저장된 샘플 주문의 체험 표시를 제거하고 직접 입력한 고객명은 유지한다", () => {
    const cached = initializeDemoState(undefined, "2026-11-08");
    cached.orders[0].customer = "김민지 (체험)";
    cached.orders[1].customer = "직접 수정한 고객";
    cached.orders.push({
      ...cached.orders[0],
      id: "customer-order",
      customer: "직접 입력 (체험)",
    });
    const original = structuredClone(cached);
    const next = initializeDemoState(cached, "2026-11-08");
    expect(next.orders[0].customer).toBe("김민지");
    expect(next.orders[1].customer).toBe("직접 수정한 고객");
    expect(next.orders.at(-1)!.customer).toBe("직접 입력 (체험)");
    expect(next.orders).toHaveLength(cached.orders.length);
    expect(cached).toEqual(original);
    expect(initializeDemoState(next, "2026-11-08")).toBe(next);
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
