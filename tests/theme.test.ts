import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shopTheme, themeVariables } from "../src/lib/theme";
import manifest from "../src/app/manifest";

describe("shared shop color roles", () => {
  it("defines every stylesheet token without local palette literals or hue aliases", () => {
    const variables = themeVariables();
    const root = join(process.cwd(), "src/app");
    for (const file of readdirSync(root).filter((f) => f.endsWith(".css"))) {
      const css = readFileSync(join(root, file), "utf8");
      expect(css, `${file}: literal color`).not.toMatch(
        /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/i,
      );
      expect(css, `${file}: old hue alias`).not.toMatch(
        /--(?:green|green-dark|orange|bg|paper|ink|muted|border)\b/,
      );
      for (const match of css.matchAll(/var\((--color-[a-z-]+)/g))
        expect(variables, `${file}: ${match[1]}`).toHaveProperty(match[1]);
    }
  });
  it("changes brand roles without changing statuses or image output colors", () => {
    const before = themeVariables();
    const after = themeVariables({
      ...shopTheme,
      primary: "#245b9e",
      primarySoft: "#eaf2fc",
      background: "#f3f7fc",
    });
    expect(after["--color-primary"]).toBe("#245b9e");
    expect(after["--color-background"]).toBe("#f3f7fc");
    for (const key of [
      "danger",
      "warning",
      "success",
      "completed",
      "image-paper",
      "print-ink",
      "print-paper",
      "channel-quick",
    ]) {
      expect(after[`--color-${key}`]).toBe(before[`--color-${key}`]);
    }
    expect(themeVariables()).toEqual(before);
  });
  it("keeps component styling on central roles while allowing intrinsic artwork", () => {
    const root = join(process.cwd(), "src/components"),
      variables = themeVariables();
    for (const file of readdirSync(root).filter((f) => f.endsWith(".tsx"))) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source, `${file}: direct UI color`).not.toMatch(
        /\b(?:color|backgroundColor|background|borderColor)\s*:\s*["'](?:#[\da-f]{3,8}\b|rgba?\(|hsla?\()/i,
      );
      for (const m of source.matchAll(/var\((--color-[a-z-]+)/g))
        expect(variables, `${file}: ${m[1]}`).toHaveProperty(m[1]);
    }
  });
  it("keeps PWA colors aligned with the selected shop theme", () => {
    expect(manifest().theme_color).toBe(shopTheme.primary);
    expect(manifest().background_color).toBe(shopTheme.surfaceMuted);
  });
  it("keeps normal text and primary buttons readable in the default theme", () => {
    function luminance(hex: string) {
      const [r, g, b] = hex
        .match(/[\da-f]{2}/gi)!
        .map((c) => parseInt(c, 16) / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    function contrast(a: string, b: string) {
      const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    }
    expect(contrast(shopTheme.text, shopTheme.surface)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrast(shopTheme.textMuted, shopTheme.surface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(shopTheme.onPrimary, shopTheme.primary),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
