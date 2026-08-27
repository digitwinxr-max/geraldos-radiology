---
kind: frontend_style
name: Tailwind CSS v4 + Gerald Brand Design Tokens with Radix UI Primitives
category: frontend_style
scope:
    - '**'
source_files:
    - src/app/globals.css
    - postcss.config.mjs
    - package.json
    - src/components/ui/button.tsx
    - src/components/layout/shell.tsx
---

## System / Approach

The frontend is styled with **Tailwind CSS v4** (via `@tailwindcss/postcss` in PostCSS) inside a Next.js App Router application. There is no separate `tailwind.config.ts`; Tailwind v4 uses CSS-based configuration through `@theme` blocks and the `@import "tailwindcss"` directive, so all styling lives in CSS files.

A custom design system is layered on top of Tailwind's defaults:
- A **Gerald Holdings brand palette** (Azure, Violet, Gold, Green) is declared as CSS custom properties under `@theme` in `src/app/globals.css`.
- Semantic tokens (`--color-brand`, `--color-ai`, `--color-premium`, `--color-operational`) map to those raw palette values, so components consume semantic names rather than brand-specific hex codes.
- Dark mode is implemented via a class-based strategy: the app shell toggles a `.dark` class on `<html>` and semantic token overrides live in an `@layer base .dark { ... }` block that redefines soft tints and text tokens for dark backgrounds.
- The font stack is centralized: `Inter` followed by `ui-sans-serif, system-ui, -apple-system, sans-serif`.
- Custom keyframe animations (`fade-in`, `slide-in-from-bottom`, `pulse-dot`, `scan-line`) and utility classes (`animate-fade-in`, `animate-slide-up`, `pulse-dot`) are defined inline in `globals.css`.

## Key Files

- `src/app/globals.css` — single source of truth for Tailwind import, `@theme` brand tokens, semantic color variables, dark-mode overrides, global base styles, scrollbars, and animation keyframes.
- `postcss.config.mjs` — registers `@tailwindcss/postcss` as the only PostCSS plugin.
- `package.json` — declares `tailwindcss` 4.1.17 and `@tailwindcss/postcss` 4.1.17 as devDependencies; runtime deps include `class-variance-authority`, `clsx`, `tailwind-merge`, and the full Radix UI primitive set.
- `src/components/ui/button.tsx` — canonical example of the component library pattern: variants and sizes defined via `cva` (class-variance-authority), merged with `cn` (from `@/lib/utils`, which wraps `clsx` + `tailwind-merge`).
- `src/components/layout/shell.tsx` — root layout wrapper that applies the `bg-slate-50 dark:bg-slate-950` background and drives the sidebar collapse state used across pages.
- `src/components/ui/{badge,card,dialog,input,select,table,tabs}.tsx` — additional Radix-based primitives following the same `cva` + `cn` pattern.

## Architecture & Conventions

1. **Token-first styling**: All colors flow through CSS custom properties. Components reference `bg-brand`, `text-ai`, `bg-premium`, `bg-operational`, etc., never raw hex values. This makes theming (including dark mode) a single-token change.
2. **Radix UI primitives + CVA**: Every reusable UI element is built on `@radix-ui/*` headless primitives and wrapped with `class-variance-authority` to expose typed `variant`/`size` props. Variant strings compose Tailwind utility classes directly.
3. **Class merging**: `cn(...)` from `@/lib/utils` is used at every component boundary to merge user-supplied `className` props with variant-generated classes, ensuring overrides work predictably.
4. **Dark mode via class toggle**: The `.dark` class is applied at the document level (not via `prefers-color-scheme`); semantic tokens are overridden in `@layer base .dark` so `bg-*-soft` becomes a translucent wash instead of a pale pastel.
5. **No per-component CSS modules or SCSS**: Styling is entirely utility-driven (Tailwind) plus the single global stylesheet. There is no `*.scss`, `*.module.css`, or external CSS-in-JS library.
6. **Layout composition**: Pages wrap content in `Shell` (from `components/layout/shell.tsx`), which provides the consistent sidebar/header/main chrome and responsive margin transitions between collapsed/expanded states.
7. **Animations are utility classes**: Keyframes are declared once in `globals.css` and exposed as small utility classes (e.g. `.animate-fade-in`, `.animate-slide-up`, `.pulse-dot`) consumed by components.

## Conventions & Constraints Observed

- Use semantic color tokens (`brand`, `ai`, `premium`, `operational`) instead of brand-specific palette names in component markup.
- Extend or create new UI elements by adding a variant/size to an existing `cva` definition rather than writing ad-hoc className strings.
- Merge external classNames through `cn()` from `@/lib/utils` — do not concatenate strings manually.
- Dark-mode styling must be expressed as overrides of semantic tokens inside `@layer base .dark` in `globals.css`, not as component-level conditional classes.
- Global typography, scrollbar appearance, and animation keyframes belong exclusively in `src/app/globals.css`; components should not define their own `@keyframes` or `@font-face` rules.
- The project uses Tailwind v4 CSS-based configuration; there is no `tailwind.config.*` file to edit.