# Brand foundations

`Kampaku` names the coordinating layer rather than an individual agent. The product voice should be calm, precise, capable, and transparent about uncertainty and authority.

## Voice

- Calm command center — not a chat app, not a gaming dashboard
- Precise language; surface uncertainty and authority boundaries explicitly
- Personal harness scale (one operator), not enterprise marketing tone

## Visual craft

1. **Same rule for every instance** — one geometry template; paint order creates weave (no per-element special cases).
2. **Precision over decoration** — reject effects that read as glitches (gaps, misaligned fills, fake texture).
3. **Intentional asymmetry only** — global scale/rotation (`UME_SCALE_*`, +11°) is OK; random per-petal variation is not.
4. **Verify visually** — logo changes must regenerate [`previews/render-ume-test.mjs`](previews/render-ume-test.mjs) and matrix previews before sign-off.
5. **Calm command aesthetic** — imperial/ceremonial mark on a sober control plane; `--brand-gold` is frame/accent, never semantic warning.

## Logo lockup

**Imperial seal** — square frame (kaku-in / inkan style) with a flat **ume** (plum blossom) inside. **Kampaku** in romaji always below in full lockups.

| Context | Display |
|---------|---------|
| Full lockup | Stamped seal (large) + Kampaku + Control Plane |
| Sidebar expanded | Clean seal (md) + romaji + subtitle |
| Sidebar collapsed / favicon | Clean seal mark only (sm), `aria-label="Kampaku"` |
| Stamp texture | Large surfaces only — `feTurbulence` displacement + lowered opacity; clean geometry at sm/md |

### Ume mark (programmatic)

Source of truth: `apps/web/src/design/` — not static SVG exports.

| File | Role |
|------|------|
| `ume-mark.ts` / `ume-mark.shared.mjs` | Geometry constants (sync both) |
| `ume-blossom-paths.ts` / `.mjs` | Spiral gold rim + tapered center-ray paths |
| `ume-blossom.tsx` / `.mjs` | Layer stack (React + static preview export) |
| `imperial-seal-logo.tsx` | Double square frame, corner ticks, stamp filter |

| Layer | Behavior |
|-------|----------|
| Petal fills | 5 uniform ellipses; radial gradient `--brand` → `--brand-petal-light`; slight fill pad under gold stroke |
| Gold rims | Identical spiral path per petal; paint order `[144, 216, 288, 0, 72]`; `strokeLinecap="butt"` |
| Center rays | Tapered filled wedges; stop at 85% toward petal tip (`UME_RAY_TIP_GAP = 0.15`) |
| Hub | Painted **last** (above rays): filled `--brand` + gold stroke + inner ring |
| Global pose | +11° rotation; asymmetric scale: `UME_SCALE_RX` 1.4 · `UME_SCALE_RY` 1.22 · `UME_SCALE_CY` 1.3 |

**Romaji:** Geist Sans Semibold. Wordmark uses `--brand-gold` (fallback `--brand`).

Legacy marks (kanji, L1–L3 SVG icons, dahlia experiments) archived under [`assets/logos/`](assets/logos/) and [`assets/flowers/archive/`](assets/flowers/archive/) — not in active use.

## Color psychology (design rationale)

The previous UI used Tailwind defaults (zinc + amber). That palette is functional but generic and creates **semantic collision**: amber reads as "warning" in UI semiotics while also serving as brand accent.

**Rules after visual overhaul:**

1. **Brand accent ≠ warning color** — they must never share the same hex
2. **Desaturated semantics** — reduce chroma ~20–30% vs Tailwind-400 defaults for long supervision sessions
3. **Semantic colors only for state** — never decorative chrome
4. **Neutrals carry chromatic undertone** — cool slate (precision) or warm stone (grounded authority)

## Palette

| ID | Name | Status |
|----|------|--------|
| **I** | **Imperial Cinnabar** | **Locked (default)** — black ground, vermillion seal ink, gold frame |
| B | Command Tent | Alternate reference — bronze patina, warm stone |

Discarded: A (Indigo), C (Orchestrator).

### Brand tokens (K-I)

| Token | Use |
|-------|-----|
| `--brand` | Vermillion petal fill, hub |
| `--brand-petal-light` | Petal gradient highlight (outer fade) |
| `--brand-gold` | Frame, rim strokes, center rays |
| `--brand-deep` | Crease / stamen detail lines |

**Canonical palette CSS:** [`apps/web/src/design/palettes/imperial-cinnabar.css`](../../apps/web/src/design/palettes/imperial-cinnabar.css)

Reference copies (keep synced): [`assets/palettes/imperial-cinnabar.css`](assets/palettes/imperial-cinnabar.css), [`assets/palettes/command-tent.css`](assets/palettes/command-tent.css)

## Palette matrix (Phase 0)

| ID | Palette |
|----|---------|
| K-B | Ume seal × Command Tent (reference) |
| K-I | Ume seal × Imperial Cinnabar (locked) |

**Preview:** `/dev/design-matrix` in apps/web.

**Static exports:** [`previews/README.md`](previews/README.md)

## Decision record

| Field | Value |
|-------|-------|
| **Logo** | Imperial seal (double square + flat ume) + Kampaku romaji (locked) |
| **Locked palette** | **K-I Imperial Cinnabar** |
| **Typography** | Geist Sans (UI), Geist Mono (code) |
| **Theme behavior** | System preference on first visit; manual toggle persists |

### Phase 1 follow-up

- Wire K-I tokens into production layout/sidebar ([`apps/web/src/app/globals.css`](../../apps/web/src/app/globals.css))
- Favicon export from `ImperialSealMark` size `sm`
