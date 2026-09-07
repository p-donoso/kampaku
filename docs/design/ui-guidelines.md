# Kampaku Web — UI Guidelines

Short reference for building screens in `apps/web` with the K-I Imperial Cinnabar design system.

## Brand and tokens

- **Locked palette:** K-I Imperial Cinnabar (`data-palette="imperial-cinnabar"`)
- **Canonical CSS:** `src/design/palettes/imperial-cinnabar.css`
- **App entry:** `src/design/tokens.css` (imported by `globals.css`)
- **JS helpers:** `src/design/tokens.ts` (`PALETTE_ID`, `readCssVar`)

Use semantic Tailwind classes backed by CSS variables — not raw `zinc-*` or `amber-*`:

| Token | Tailwind examples |
|-------|-------------------|
| Page background | `bg-background`, `text-foreground` |
| Surfaces | `bg-surface`, `bg-elevated` |
| Text | `text-secondary`, `text-muted` |
| Borders | `border-border` |
| Brand | `text-brand`, `text-brand-gold`, `ring-brand/40` |
| State | `text-success`, `text-warning`, `text-error`, `text-info`, `text-agent` |

**Rule:** Brand cinnabar is for chrome and primary actions. Warning/error hues are for attention states only.

## Theme behavior

- First visit follows `prefers-color-scheme`
- User toggle persists `kampaku-theme` in `localStorage`
- Anti-FOUC script in `app/layout.tsx` runs before paint
- Hook: `useTheme()` from `@/hooks/use-theme`
- Toggle: `<ThemeToggle />` in sidebar footer, mobile header, and Settings

## Logo

- **Component:** `ImperialSealLogo` / `ImperialSealMark` (`components/ui/imperial-seal-logo.tsx`)
- **Geometry source of truth:** `src/design/ume-*`
- Sidebar expanded: seal + “Kampaku” wordmark (horizontal lockup, no subtitle)
- Sidebar collapsed / favicon: mark only (`size="sm"`)
- Wordmark font: Cormorant Garamond via `.brand-wordmark`
- Do not edit logo paths without regenerating doc previews (see `.cursor/rules/brand-mark.mdc`)

## Component modules

Thematic folders under `src/components/` — file names carry the UI role (`*-view`, `*-panel`, `*-form`, `*-section`, `*-card`, `*-table`, `*-tabs`):

| Folder | Role |
|--------|------|
| `layout/` | App shell, sidebar, theme/material providers |
| `panels/` | Floating detail panels and panel provider |
| `ui/` | Shared primitives (`PageHeader`, `Surface`, `SubNav`, …) |
| `projects/`, `agents/`, `work-items/`, `chat/`, `settings/`, `execution/`, `wiki/`, `journal/` | Domain views and panels |

Section routes use Next.js `layout.tsx` for shared headers and `SubNav`.

## Primitives (`components/ui/`)

| Component | Use when |
|-----------|----------|
| `PageHeader` | Page title + description + optional actions (stacks on mobile) |
| `SubNav` | Horizontal section tabs inside route layouts |
| `Surface` | Card/panel wrapper with border + padding variants |
| `StatCard` | Dashboard metrics with optional icon and tone |
| `EmptyState` | Zero-data views with icon + CTA |
| `StatusDot` | Online/offline/running indicators |
| `ResponsiveTable` | Data tables → card rows below `md` |
| `SlideOver` | Mobile drawers (nav, filters, chat list) |
| `ThemeToggle` | Light/dark switch |

Prefer primitives over copy-pasting `rounded-xl border border-zinc-800`.

## Breakpoints

| Name | Width | Layout |
|------|-------|--------|
| Mobile | `< 768px` | Hamburger + `SlideOver` nav; full-screen floating panels |
| Tablet | `768px – 1023px` | Icon sidebar by default; 2-col stat grids |
| Desktop | `≥ 1024px` | Expanded sidebar; 4-col dashboard |

**Touch:** minimum 44×44px targets — use `.icon-button` or MUI `size="medium"` on mobile forms.

**Safe areas:** mobile header uses `env(safe-area-inset-top)`; chat input should use bottom inset when added.

## MUI + Tailwind

- MUI theme is built from Imperial Cinnabar values in `layout/material-provider.tsx`
- Typography uses Geist Sans
- Use MUI for complex inputs/buttons; use Tailwind + primitives for layout and chrome
- Prefer `Surface` for custom cards

## Icons

Keep `@mui/icons-material`. Sizing:

- `small` (16px) — inline table/meta
- `medium` (20px) — nav, buttons
- `large` (24px+) — empty states

## Testing

- **Unit / component:** Vitest + Testing Library → `npm test`
- **E2E / browser:** Playwright → `npm run test:e2e`
  - Specs live in `apps/web/e2e/`
  - Config: `playwright.config.ts` (Chromium, port `3002`)
  - Visual screenshots: `npm run test:visual` → `.audit-screenshots/`

## Checklist for new screens

1. Prefer section `layout.tsx` + page body; wrap content with responsive padding (`p-4 sm:p-5 lg:p-6`)
2. Use semantic color classes, not zinc/amber literals
3. English copy for all user-facing strings
4. Verify at 375px and 768px widths
5. Run preview scripts if logo or palette assets change
6. Cover critical shell/navigation changes with a Playwright smoke assertion when practical
