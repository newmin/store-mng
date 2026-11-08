import { describe, expect, it } from "vitest";
import { productSchema } from "../src/lib/types";
import { applyCommand, demoState } from "../src/lib/state";
import { upgradeMenuCatalog } from "../src/lib/catalog-upgrade";
import { menuPhotoKey } from "../src/lib/menu-catalog";
import {
  isUploadedMenuImage,
  menuImageBelongsToShop,
} from "../src/lib/menu-image";
import { validateMenuImage } from "../src/lib/menu-image-client";

const shop = "11111111-1111-4111-8111-111111111111";
const imageId = "22222222-2222-4222-8222-222222222222";
const path = `${shop}/${imageId}.webp`;

describe("메뉴별 사진", () => {
  it("기존 메뉴판 사진과 업로드한 사진을 읽고 외부 URL과 잘못된 경로를 거절한다", () => {
    const product = demoState().products[0];
    for (const image of [
      menuPhotoKey("seolgi-white"),
      path,
      `demo-menu:${shop}`,
    ]) {
      expect(productSchema.safeParse({ ...product, image }).success).toBe(true);
    }
    for (const image of [
      "https://example.com/photo.jpg",
      "javascript:alert(1)",
      "data:image/png;base64,abc",
      `${shop}/../secret.webp`,
      "demo-menu:invalid",
      `${shop}/${imageId}.svg`,
    ]) {
      expect(productSchema.safeParse({ ...product, image }).success).toBe(
        false,
      );
    }
  });

  it("메뉴 사진을 저장·교체·삭제하고 다시 읽을 때 다른 메뉴의 사진을 보존한다", () => {
    let state = upgradeMenuCatalog(demoState());
    const original = structuredClone(state.products);
    for (const image of [path, `demo-menu:${shop}`, undefined]) {
      state = applyCommand(
        state,
        { type: "saveProduct", product: { ...state.products[0], image } },
        "테스트",
      );
      state = upgradeMenuCatalog(JSON.parse(JSON.stringify(state)));
      expect(state.products[0].image).toBe(image);
      expect(state.products.slice(1)).toEqual(original.slice(1));
    }
  });

  it("공유 매장에는 자기 매장 저장소의 사진만 연결할 수 있다", () => {
    expect(menuImageBelongsToShop(path, shop)).toBe(true);
    expect(menuImageBelongsToShop(path, imageId)).toBe(false);
    expect(menuImageBelongsToShop(`demo-menu:${shop}`, shop)).toBe(false);
    expect(menuImageBelongsToShop(`${shop}/../${imageId}.webp`, shop)).toBe(
      false,
    );
    expect(isUploadedMenuImage(menuPhotoKey("seolgi-white"))).toBe(false);
  });

  it("빈 파일과 지원하지 않는 형식, 5MB 초과 사진을 거절한다", () => {
    expect(() =>
      validateMenuImage(
        new File(["photo"], "menu.jpg", { type: "image/jpeg" }),
      ),
    ).not.toThrow();
    expect(() =>
      validateMenuImage(new File([], "empty.png", { type: "image/png" })),
    ).toThrow();
    expect(() =>
      validateMenuImage(
        new File(["<svg/>"], "menu.svg", { type: "image/svg+xml" }),
      ),
    ).toThrow();
    expect(() =>
      validateMenuImage(
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.webp", {
          type: "image/webp",
        }),
      ),
    ).toThrow();
  });
});
