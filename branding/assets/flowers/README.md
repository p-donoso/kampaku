# Ume mark assets

The **active ume mark is programmatic** — generated in `kampaku-web/src/design/` (`ume-mark.ts`, `ume-blossom-paths.ts`, `ume-blossom.tsx`, `imperial-seal-logo.tsx`).

Do not edit static SVGs here for logo changes; update the TypeScript modules and regenerate previews:

```bash
node kampaku-docs/branding/previews/render-ume-test.mjs
node kampaku-docs/branding/previews/generate-matrix-preview.mjs
```

## Archive

[`archive/`](archive/) holds deprecated experiments — not used in the product:

| File | Notes |
|------|-------|
| `ume-flat.svg` | Early flat ume prototype (no gradient, spiral, or tapered rays) |
| `dahlia-openclipart-*.svg` | Discarded dahlia direction before ume was chosen |

See [`../foundations.md`](../foundations.md) for the locked mark specification.
