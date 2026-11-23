# Brand mark (ume imperial seal)

Applies to changes in `apps/web/src/design/ume-*`, `apps/web/src/components/ui/imperial-seal-logo.tsx`, and the preview generators in `docs/branding/previews/`.

## Source of truth

- Constants: `apps/web/src/design/ume-mark.ts` and `ume-mark.shared.mjs` (keep in sync)
- Paths: `ume-blossom-paths.ts` / `.mjs`
- Layers: `ume-blossom.tsx` / `.mjs`
- Frame: `imperial-seal-logo.tsx`

Spec: `docs/branding/foundations.md`. Locked palette: **K-I Imperial Cinnabar**.

## After any logo geometry or layer change

1. Run `node docs/branding/previews/generate-ume-preview.mjs`
2. Run `node docs/branding/previews/generate-brand-preview.mjs`
3. Read `ume-test-zoom.png` before considering the change done

## Rules (from visual craft)

- One geometry template per element; paint order creates spiral weave — no per-petal special cases
- No per-petal size/angle jitter unless explicitly requested
- Hub circle paints **after** center rays
- Gold rims use `strokeLinecap="butt"`; petal tips stay curved elliptical arcs (not triangles)
- Do not reintroduce sector clip seams, inner spiral paths, or stamp rectangle gaps

## Tokens

Use CSS variables: `--brand`, `--brand-petal-light`, `--brand-gold`, `--brand-deep`. Canonical palette: `apps/web/src/design/palettes/imperial-cinnabar.css`.
