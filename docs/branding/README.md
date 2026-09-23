# Kampaku brand system

This directory documents the active brand. The production source of truth is in
`apps/web/src/design/`; this directory contains the specification, synchronized palette copy, and
generated visual QA examples.

## Canonical system

- **Mark:** Imperial Seal with flat ume blossom.
- **Palette:** Imperial Cinnabar (K-I), the only active palette.
- **Typography:** Geist Sans for UI and Geist Mono for code.
- **Tone:** calm command center, precise, bounded, and evidence-led.

## Directory map

- [`foundations.md`](foundations.md) — brand rules and decisions.
- [`assets/palettes/imperial-cinnabar.css`](assets/palettes/imperial-cinnabar.css) — synchronized
  documentation copy of the production palette.
- [`previews/`](previews/) — current UME and operator-shell examples for visual QA.

## Change rule

Change geometry and production tokens in `apps/web/src/design/` first. Then regenerate the UME
previews and update this documentation only when the active system changes. Do not add alternate
logos, palette experiments, or unverified exports here.
