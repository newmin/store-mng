import {
  specialtyMenuCatalog,
  generalMenuCatalog,
  menuPhotoKey,
} from "./menu-catalog";
import type { Product, StoreState } from "./types";
export const catalogVersion = 3;

// Idempotent upgrade: keep IDs, recipe/production data, and historical orders.
// Box prices/counts come from the board; they are not production yields.
export function upgradeMenuCatalog(input: StoreState): StoreState {
  if ((input.catalogVersion || 0) >= catalogVersion) return input;
  const previousVersion = input.catalogVersion || 0;
  const state = structuredClone(input);
  for (const product of state.products) {
    if (product.image?.startsWith("/brand/photos/")) delete product.image;
  }
  // Only apply newly introduced categories so later upgrades preserve edits.
  const additions = [
    ...(previousVersion < 1 ? specialtyMenuCatalog : []),
    ...(previousVersion < 2 ? generalMenuCatalog : []),
  ];
  for (const item of additions) {
    const existing = state.products.find(
      (p) => p.id === item.id || p.name === item.name,
    );
    if (existing) {
      Object.assign(existing, {
        name: item.name,
        category: item.category,
        boxPrice: item.boxPrice,
        boxSize: item.boxSize,
        image: menuPhotoKey(item.id),
      });
    } else
      state.products.push({
        id: item.id,
        name: item.name,
        category: item.category,
        boxPrice: item.boxPrice,
        boxSize: item.boxSize,
        image: menuPhotoKey(item.id),
        color: item.category === "oven" ? "#bf9458" : "#e7dcc6",
        batchYield: null,
        batchLabel: "1생산단위",
        shelfDays: 1,
        displayTarget: 0,
        active: true,
        recipe: [],
      } satisfies Product);
  }
  // Retain historical references while removing this retired sample menu from
  // ordering, recommendations and the editable menu catalog.
  for (const product of state.products) {
    if (product.id === "mugwort" || product.name === "쑥설기") {
      product.active = false;
      product.archived = true;
      product.displayTarget = 0;
    }
  }
  state.catalogVersion = catalogVersion;
  state.revision++;
  return state;
}
