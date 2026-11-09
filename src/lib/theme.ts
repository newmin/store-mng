// Change this palette to brand a deployment for another shop.
// Components consume semantic CSS variables, never these literal values.
const defaultShopTheme = {
  background: "#faf7f0",
  surface: "#fffefa",
  surfaceRaised: "#fffdf7",
  surfaceMuted: "#faf5e9",
  surfaceSubtle: "#f5f0e7",
  text: "#554634",
  textSecondary: "#846d50",
  textMuted: "#786f62",
  border: "#eae3d5",
  borderStrong: "#c5b291",
  primary: "#895f36",
  primaryStrong: "#6d4c30",
  primarySoft: "#f3eadd",
  primaryBorder: "#c5a06d",
  onPrimary: "#fffdf7",
  onPrimaryMuted: "#e8d7bb",
  focus: "#d2b779",
  shadow: "#302416",
  overlay: "#251d16",
};
export type ShopTheme = { [K in keyof typeof defaultShopTheme]: string };
export const shopTheme: ShopTheme = defaultShopTheme;

// Meaning and output/content colors stay independent of shop branding.
const semanticColors = {
  success: "#345932",
  successSurface: "#eef6ea",
  successBorder: "#b6ccaa",
  warning: "#79551f",
  warningSurface: "#fff8ed",
  warningBorder: "#dfc4a3",
  danger: "#8b3c30",
  dangerSurface: "#fff2ef",
  dangerBorder: "#e7bdb4",
  info: "#365c83",
  infoSurface: "#edf4fb",
  infoBorder: "#b8ccdf",
  completed: "#73766f",
  completedSurface: "#f0f0ed",
  completedBorder: "#d8d8d3",
  printInk: "#000000",
  printPaper: "#ffffff",
  printBorder: "#dddddd",
  mask: "#000000",
  checker: "#f1f1ed",
  imagePaper: "#ffffff",
  illustrationSurface: "#f4f2e9",
  illustrationPlate: "#e6e3d6",
  illustrationShadow: "#73673d",
  illustrationShade: "#000000",
  illustrationHighlight: "#ffffff",
  channelPickup: "#c6a87d",
  channelQuick: "#86a48c",
  channelDelivery: "#88a4c9",
  channelKakaoInk: "#554626",
  channelInstagramStart: "#bb78bf",
  channelInstagramMiddle: "#dd8894",
  channelInstagramEnd: "#ecc47a",
};
export function themeVariables(
  theme: ShopTheme = shopTheme,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ ...semanticColors, ...theme }).map(([key, value]) => [
      `--color-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      value,
    ]),
  );
}
