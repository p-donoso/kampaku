# Brand previews

## Palette matrix

Logo: **imperial seal** + flat **ume** (+11°).

**Locked palette:** **K-I Imperial Cinnabar** (black / vermillion / gold). K-B Command Tent remains as alternate reference in matrix exports.

### Quick QA (ume mark only)

| File | Format |
|------|--------|
| [`ume-test.png`](ume-test.png) | 1× PNG |
| [`ume-test-zoom.png`](ume-test-zoom.png) | 4× PNG (detail) |

```bash
node docs/branding/previews/render-ume-test.mjs
```

### Full matrix (self-contained)

| File | Format |
|------|--------|
| [`matrix-preview-dark.svg`](matrix-preview-dark.svg) | SVG dark |
| [`matrix-preview-light.svg`](matrix-preview-light.svg) | SVG light |
| [`matrix-preview-dark.png`](matrix-preview-dark.png) | PNG dark |
| [`matrix-preview-light.png`](matrix-preview-light.png) | PNG light |

Includes hero seals and UI panel samples per palette.

```bash
node docs/branding/previews/generate-matrix-preview.mjs
```

Decision recorded in [`../foundations.md`](../foundations.md).
