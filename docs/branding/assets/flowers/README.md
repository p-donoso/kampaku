# Ume mark assets

The **active ume mark is programmatic** — generated in `apps/web/src/design/` (`ume-mark.ts`, `ume-blossom-paths.ts`, `ume-blossom.tsx`, `imperial-seal-logo.tsx`).

Do not edit static SVGs here for logo changes; update the TypeScript modules and regenerate previews:

```bash
node docs/branding/previews/render-ume-test.mjs
node docs/branding/previews/generate-matrix-preview.mjs
```

See [`../../foundations.md`](../../foundations.md) for the locked mark specification.
