import { describe, it, expect } from "vitest";
import { validateRecommendations } from "../src/lib/recommendations";
import { demoState } from "../src/lib/state";
import { addDays, today } from "../src/lib/dates";
function base() {
  const s = demoState();
  s.orders = [];
  for (const p of s.products) p.displayTarget = 0;
  return s;
}
describe("AI 추천의 결정적 검증", () => {
  it("등록된 후보와 설정된 생산량만 허용한다", () => {
    const s = base();
    expect(
      validateRecommendations(s, today(), [
        { productId: "mugwort", batches: 1 },
      ]).valid,
    ).toBe(true);
    expect(
      validateRecommendations(s, today(), [
        { productId: "unknown", batches: 1 },
      ]).valid,
    ).toBe(false);
    expect(
      validateRecommendations(s, today(), [
        { productId: "mugwort", batches: 2 },
      ]).valid,
    ).toBe(false);
  });
  it("최근 생산 메뉴와 제외 메뉴를 다시 추천하지 않는다", () => {
    const s = base();
    s.settings.excluded = ["mugwort"];
    expect(
      validateRecommendations(s, today(), [
        { productId: "mugwort", batches: 1 },
      ]).valid,
    ).toBe(false);
    s.settings.excluded = [];
    s.lots = [
      {
        id: "lot",
        productId: "mugwort",
        date: addDays(today(), -1),
        expires: addDays(today(), -1),
        remaining: 0,
        produced: 24,
        planId: "old",
      },
    ];
    expect(
      validateRecommendations(s, today(), [
        { productId: "mugwort", batches: 1 },
      ]).valid,
    ).toBe(false);
  });
  it("오늘 생산 가능해도 미래 예약 재료를 소진하면 거절한다", () => {
    const s = base();
    s.materials[0].stock = 2000;
    const o = demoState().orders[2];
    s.orders = [
      {
        ...o,
        date: addDays(today(), 1),
        lines: [
          { productId: "white", quantity: 1, unit: "piece", piecesPerUnit: 1 },
        ],
      },
    ];
    expect(
      validateRecommendations(s, today(), [
        { productId: "mugwort", batches: 1 },
      ]).errors,
    ).toContain("멥쌀가루: 향후 예약 재료 확보 필요");
  });
  it("상시 진열 메뉴와 추천 메뉴가 겹치지 않는다", () => {
    const s = base();
    s.products[3].displayTarget = 10;
    expect(
      validateRecommendations(s, today(), [
        { productId: "mugwort", batches: 1 },
      ]).valid,
    ).toBe(false);
  });
});
