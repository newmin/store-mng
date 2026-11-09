<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Product UI copy

- Do not add helper text that merely explains an obvious input behavior, such as automatic formatting, placeholders, or that an optional field may be left blank.
- Add explanatory copy only when it helps the user make a meaningful choice, understand a non-obvious consequence, or recover from an error.
- Keep implementation details out of user-facing text.

## Store themes and colors

- Define shop branding colors only in `src/lib/theme.ts` (`shopTheme`). All application screens and components must consume the semantic `--color-*` CSS variables supplied by the root layout. Do not add literal hex/RGB/HSL colors, per-screen palettes, or `:root` color overrides in stylesheets or UI components.
- Name tokens by role (`primary`, `surface`, `text`, `border`, `focus`), not a hue (`green`, `brown`) or a component name. Reuse a role before adding another token. Add necessary new tokens to the central theme file.
- Keep success, warning, error, completed-state and fulfillment-category colors in the central semantic palette, independent of shop branding. Do not replace status colors with the primary brand color.
- Customer-selected sticker text colors, product color data, actual artwork and exported sticker paper are content, not shop branding. Preserve their colors when changing themes. Static illustration and print/checkerboard colors belong to the central fixed palette; SVG artwork and canvas output may retain intrinsic content colors. Canvas selection outlines must use the theme variable.
- PWA manifest and browser theme metadata must reuse the same brand/theme configuration. Do not copy palette literals into `brand.ts`, the manifest, or layout metadata.
- Verify a second, visibly different palette on desktop and mobile when adding or changing shared theme behavior. Check buttons, selected states, dialogs, warnings, sticker controls and print output. `tests/theme.test.ts` enforces the no-literal CSS rule and checks token coverage; keep it passing.
