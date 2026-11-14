import { describe, expect, it } from "vitest";
import { applyCommand, demoState } from "../src/lib/state";
import { requirements } from "../src/lib/calculations";
import { today } from "../src/lib/dates";

describe("상시 진열 메뉴 일괄 저장", () => {
  it("목표만 한 번에 변경하고 생산 필요량에 반영한다", () => {
    const state = demoState(today());
    state.orders = [];
    state.lots = [];
    const first = state.products[0];
    const second = state.products[1];
    const next = applyCommand(
      state,
      {
        type: "saveDisplayMenus",
        targets: [
          {
            productId: first.id,
            expectedTarget: first.displayTarget,
            displayTarget: 48,
          },
          {
            productId: second.id,
            expectedTarget: second.displayTarget,
            displayTarget: 0,
          },
        ],
      },
      "매장",
    );
    expect(next.products[0]).toEqual({ ...first, displayTarget: 48 });
    expect(next.products[1]).toEqual({ ...second, displayTarget: 0 });
    expect(next.revision).toBe(state.revision + 1);
    expect(
      requirements(next, today()).find((r) => r.product.id === first.id)
        ?.batches,
    ).toBe(Math.ceil(48 / first.batchYield!));
    expect(state.products[0]).toEqual(first);
  });
  it("다른 기기에서 바꾼 목표를 덮어쓰지 않고 전체 저장을 거부한다", () => {
    const state = demoState(today());
    const snapshot = structuredClone(state);
    expect(() =>
      applyCommand(
        state,
        {
          type: "saveDisplayMenus",
          targets: [
            {
              productId: state.products[0].id,
              expectedTarget: state.products[0].displayTarget,
              displayTarget: 99,
            },
            {
              productId: state.products[1].id,
              expectedTarget: 999,
              displayTarget: 99,
            },
          ],
        },
        "매장",
      ),
    ).toThrow("진열 목표가 변경");
    expect(state).toEqual(snapshot);
  });
  it("중복 메뉴와 판매 중지 메뉴의 신규 선정을 거부한다", () => {
    const state = demoState(today());
    const product = state.products[0];
    const target = {
      productId: product.id,
      expectedTarget: product.displayTarget,
      displayTarget: 10,
    };
    expect(() =>
      applyCommand(
        state,
        { type: "saveDisplayMenus", targets: [target, target] },
        "매장",
      ),
    ).toThrow("중복");
    product.active = false;
    expect(() =>
      applyCommand(
        state,
        { type: "saveDisplayMenus", targets: [target] },
        "매장",
      ),
    ).toThrow("판매 중인");
    expect(
      applyCommand(
        state,
        {
          type: "saveDisplayMenus",
          targets: [{ ...target, displayTarget: 0 }],
        },
        "매장",
      ).products[0].displayTarget,
    ).toBe(0);
  });
});
