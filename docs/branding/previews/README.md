# Brand previews

## Active mark

Logo: **Imperial Seal** + flat **ume** (+11°).

**Locked palette:** **K-I Imperial Cinnabar** (black / vermillion / gold).

### Quick QA (ume mark only)

| File | Format |
|------|--------|
| [`ume-test.png`](ume-test.png) | 1× PNG |
| [`ume-test-zoom.png`](ume-test-zoom.png) | 4× PNG (detail) |

```bash
node docs/branding/previews/generate-ume-preview.mjs
```

### Operator-shell examples

The large previews show the locked mark in the actual software-factory context: work orders,
stations, inspection, shared knowledge, and bounded authority.

| File | Format |
|------|--------|
| [`brand-preview-dark.svg`](brand-preview-dark.svg) | SVG dark |
| [`brand-preview-dark.png`](brand-preview-dark.png) | PNG dark |
| [`brand-preview-light.svg`](brand-preview-light.svg) | SVG light |
| [`brand-preview-light.png`](brand-preview-light.png) | PNG light |

```bash
node docs/branding/previews/generate-brand-preview.mjs
```

Decision recorded in [`../foundations.md`](../foundations.md).
