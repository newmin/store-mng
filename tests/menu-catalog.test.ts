import { describe, it, expect } from "vitest";
import {
  menuCatalog,
  specialtyMenuCatalog,
  generalMenuCatalog,
  menuBoard,
  menuPhotoKey,
} from "../src/lib/menu-catalog";
import { catalogVersion, upgradeMenuCatalog } from "../src/lib/catalog-upgrade";
import { demoState, emptyState } from "../src/lib/state";
import { orderPieces } from "../src/lib/calculations";
import { productSchema } from "../src/lib/types";

describe("첨부 메뉴판 등록", () => {
  it("설기 15종·오븐떡 5종을 박스당 24개와 메뉴판 가격으로 등록한다", () => {
    expect(menuCatalog.filter((p) => p.category === "seolgi")).toHaveLength(15);
    expect(menuCatalog.filter((p) => p.category === "oven")).toHaveLength(5);
    expect(specialtyMenuCatalog.every((p) => p.boxSize === 24)).toBe(true);
    const prices = Object.fromEntries(
      specialtyMenuCatalog.map((p) => [p.name, p.boxPrice]),
    );
    expect(prices).toEqual({
      백설기: 24000,
      꿀설기: 26000,
      백일꿀설기: 30000,
      첫돌꿀설기: 30000,
      칠순꿀설기: 30000,
      팔순꿀설기: 30000,
      하트꿀설기: 30000,
      콩설기: 29000,
      딸기설기: 34000,
      블루베리설기: 34000,
      초코설기: 34000,
      호박설기: 34000,
      오레오설기: 40000,
      로투스설기: 40000,
      체다치즈설기: 34000,
      "단호박 찹쌀오븐떡": 40000,
      "흑임자 찹쌀오븐떡": 40000,
      "쑥 찹쌀오븐떡": 40000,
      모찌꼬: 40000,
      오방떡: 40000,
    });
  });
  it("기존 메뉴 ID·생산 기준과 과거 주문 환산을 유지한다", () => {
    const before = demoState();
    before.orders.push({
      ...before.orders[2],
      id: "old-box",
      lines: [
        { productId: "white", quantity: 2, unit: "box", piecesPerUnit: 10 },
      ],
    });
    const after = upgradeMenuCatalog(before);
    for (const id of ["snack"])
      expect(after.products.find((p) => p.id === id)).toEqual(
        before.products.find((p) => p.id === id),
      );
    for (const id of ["honey", "injeolmi"]) {
      const old = before.products.find((p) => p.id === id)!;
      const updated = after.products.find((p) => p.id === id)!;
      expect(updated.recipe).toEqual(old.recipe);
      expect(updated.batchYield).toBe(old.batchYield);
      expect(updated.boxSize).toBe(30);
      expect(updated.image).toBe(menuPhotoKey(`general-${id}`));
    }
    const white = after.products.find((p) => p.id === "white")!;
    expect(white.boxSize).toBe(24);
    expect(white.boxPrice).toBe(24000);
    expect(white.recipe).toEqual(before.products[0].recipe);
    expect(white.batchYield).toBe(before.products[0].batchYield);
    expect(after.orders).toEqual(before.orders);
    expect(orderPieces(after.orders.at(-1)!)[0].pieces).toBe(20);
    expect(before.products[0].boxSize).toBe(10);
  });
  it("업그레이드는 한 번만 적용하고 이후 수정한 가격·구성을 덮어쓰지 않는다", () => {
    const state = upgradeMenuCatalog(demoState());
    state.products[0].boxPrice = 28000;
    state.products[0].boxSize = 30;
    expect(upgradeMenuCatalog(state)).toBe(state);
    expect(state.products[0].boxPrice).toBe(28000);
    expect(state.products[0].boxSize).toBe(30);
    expect(new Set(state.products.map((p) => p.id)).size).toBe(
      state.products.length,
    );
  });
  it("포장 수량을 생산 수율로 간주하거나 레시피를 만들어 넣지 않는다", () => {
    const state = upgradeMenuCatalog(emptyState());
    expect(state.products).toHaveLength(36);
    for (const p of state.products) {
      expect(p.batchYield).toBeNull();
      expect(p.recipe).toEqual([]);
      expect(p.displayTarget).toBe(0);
      expect(productSchema.safeParse(p).success).toBe(true);
    }
  });
  it("이전 인스타그램 사진 연결은 제거하고 새 메뉴판 사진만 허용한다", () => {
    const state = demoState();
    state.products[4].image = "/brand/photos/gift-boxes.jpg";
    const after = upgradeMenuCatalog(state);
    expect(after.products.find((p) => p.id === "snack")!.image).toBeUndefined();
    expect(
      productSchema.safeParse({
        ...after.products[0],
        image: "/brand/photos/gift-boxes.jpg",
      }).success,
    ).toBe(false);
    expect(
      productSchema.safeParse({
        ...after.products[0],
        image: menuPhotoKey("seolgi-white"),
      }).success,
    ).toBe(true);
  });
  it("사진 영역이 원본 안의 개별 메뉴 사진 영역에만 위치한다", () => {
    for (const entry of menuCatalog) {
      const [x, y, w, h] = entry.rect;
      expect(x + w).toBeLessThanOrEqual(menuBoard.width);
      expect(y + h).toBeLessThanOrEqual(menuBoard.height);
      expect(w).toBeGreaterThan(120);
      expect(h).toBeGreaterThan(120);
      if (entry.category === "seolgi") expect(x).toBeGreaterThan(1000);
      else if (entry.category === "oven") expect(y).toBeGreaterThan(1000);
      else {
        expect(x).toBeLessThan(1000);
        expect(y).toBeLessThan(1000);
      }
    }
  });
  it("일반떡 16종의 표기 수량·가격을 옮기고 미표기 8종만 30개로 등록한다", () => {
    expect(generalMenuCatalog).toHaveLength(16);
    expect(
      Object.fromEntries(
        generalMenuCatalog.map((p) => [p.name, [p.boxSize, p.boxPrice]]),
      ),
    ).toEqual({
      팥시루: [24, 40000],
      콩시루: [24, 40000],
      모듬영양떡: [24, 40000],
      약밥: [24, 40000],
      찹쌀모찌: [25, 40000],
      "쑥 찹쌀 모찌": [25, 45000],
      인절미: [30, 35000],
      "단호박 인절미": [30, 40000],
      초코인절미: [30, 40000],
      절편: [30, 22000],
      앙꼬절편: [30, 27000],
      경단: [30, 37000],
      수수팥떡: [30, 37000],
      꿀떡: [30, 27000],
      단호박카스테라: [24, 39000],
      쑥카스테라: [24, 39000],
    });
    expect(generalMenuCatalog.filter((p) => p.boxSize === 30)).toHaveLength(8);
  });
  it("버전 1에서 일반떡을 추가할 때 기존 설기류·오븐떡의 사용자 수정을 보존한다", () => {
    const before = upgradeMenuCatalog(demoState());
    before.products = before.products.filter(
      (p) =>
        !p.image?.startsWith("menu:general-") ||
        ["honey", "injeolmi"].includes(p.id),
    );
    before.catalogVersion = 1;
    const white = before.products.find((p) => p.id === "white")!;
    white.boxPrice = 28000;
    white.boxSize = 28;
    const oven = before.products.find((p) => p.id === "oven-pumpkin")!;
    oven.boxPrice = 42000;
    oven.active = false;
    const after = upgradeMenuCatalog(before);
    expect(after.catalogVersion).toBe(catalogVersion);
    expect(after.products.find((p) => p.id === "white")).toEqual(white);
    expect(after.products.find((p) => p.id === "oven-pumpkin")).toEqual(oven);
    expect(
      after.products.filter((p) => p.image?.startsWith("menu:general-")),
    ).toHaveLength(16);
    expect(after.orders).toEqual(before.orders);
    expect(
      after.orders
        .flatMap((o) => o.lines)
        .every((l) => after.products.some((p) => p.id === l.productId)),
    ).toBe(true);
    expect(upgradeMenuCatalog(after)).toBe(after);
  });
  it("버전 2의 쑥설기를 목록에서 제외하되 과거 주문과 수정한 일반떡 기준은 보존한다", () => {
    const before = upgradeMenuCatalog(demoState());
    before.catalogVersion = 2;
    const mugwort = before.products.find((p) => p.id === "mugwort")!;
    delete mugwort.archived;
    mugwort.active = true;
    mugwort.displayTarget = 12;
    const honey = before.products.find((p) => p.id === "honey")!;
    honey.boxPrice = 32000;
    honey.boxSize = 32;
    before.orders.push({
      ...before.orders[0],
      id: "old-mugwort-order",
      kind: "single",
      boxes: 1,
      lines: [
        { productId: "mugwort", quantity: 2, unit: "box", piecesPerUnit: 10 },
      ],
    });
    const after = upgradeMenuCatalog(before);
    const retired = after.products.find((p) => p.id === "mugwort")!;
    expect(retired).toEqual({
      ...mugwort,
      active: false,
      archived: true,
      displayTarget: 0,
    });
    expect(productSchema.parse(retired).archived).toBe(true);
    expect(
      after.products.filter((p) => p.active).some((p) => p.name === "쑥설기"),
    ).toBe(false);
    expect(
      after.products
        .filter((p) => !p.archived)
        .some((p) => p.name === "쑥설기"),
    ).toBe(false);
    expect(after.products.find((p) => p.id === "honey")).toEqual(honey);
    expect(after.orders).toEqual(before.orders);
    expect(orderPieces(after.orders.at(-1)!)[0].pieces).toBe(20);
    expect(before.products.find((p) => p.id === "mugwort")!.active).toBe(true);
    expect(upgradeMenuCatalog(after)).toBe(after);
  });
});
