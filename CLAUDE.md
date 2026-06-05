# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`crate` is a "record crate" browser for YouTube DJ sets, rebuilt as a single 3D
scene (React Three Fiber): a milk crate of records on a tiled white floor, viewed
from a locked side angle. Arrow/click to focus a spine; open it and the record
spins out of the crate, dissolves into an ambient color field, and the YouTube
video plays in a glass overlay. It's a **Next.js 16 App Router** app (React 19,
Tailwind v4) using `three` / `@react-three/fiber` / `@react-three/drei` /
`@react-spring/three`. See **`docs/3d-crate-plan.md`** for the phase-by-phase
build log and the canonical tunables.

## Commands

```bash
npm run dev        # next dev
npm run build      # next build (output: 'standalone')
npm run start      # next start (serve the build)
npm run lint       # eslint . — includes the tokens/no-raw-colors guardrail
npm run typecheck  # tsc --noEmit
```

There is no test runner configured. `lint` + `typecheck` are the quality gate.

## Legacy docs (prose only)

The Vite scaffolding (`src/`, `index.html`, `components.json`, the Vite
tsconfigs, the stale `dist/` build) has been deleted. Two Vite-era *prose* files
remain and describe the *origin*, not this app: **`README.md`** (the old Vite
template) and **`learnings.md`** (series notes). Treat both as background.

## Architecture

Single route, fully client-rendered. `app/page.tsx` is `'use client'` and owns
all state; the 3D scene (`components/crate/CrateScene.tsx`) is dynamically
imported with `ssr: false` (R3F is client-only).

- **State in `app/page.tsx`**: `selectedId` (focused record) + `openId` (the
  opened "hero"). Derives `selectedIndex`, exposes `onSelect(id)` / `onStep(offset)`
  (clamped over `djSets`). A `phase` machine (`closed → opening → open`) sequences
  the open choreography; `prefers-reduced-motion` snaps it. Renders the DOM layers
  over the transparent canvas: `AmbientField` (z-0), glass blur (z-20), and the
  `YouTubePlayer` overlay (z-30).
- **`components/crate/CrateScene.tsx`** — the whole R3F scene: locked camera, a
  runtime-measured `public/models/milk_crate.glb`, one self-animating `<Sleeve>`
  per record (spring-driven focus / open-spin / dissolve, with cover textures on
  the ±z faces), a tiled `Grid` floor, a `shadowMaterial` catcher + `ContactShadows`,
  and studio `Lightformer`s.
- **`components/AmbientField.tsx`** — DOM "now playing" backdrop: blurred, drifting
  color blobs derived from the record's `color`.
- **`data/sets.ts`** is a **GENERATED file** — edit `data/sets.source.json`, then
  `npm run sync:sets` (also runs on `prebuild`). The build (`scripts/build-sets.mjs`)
  enriches title/venue/color from YouTube and saves cover thumbnails to
  `public/covers/`. Type in `types/dj-set.ts`. **Hard cap: at most 44 sets** — the
  crate holds no more, and the build fails if `sets.source.json` exceeds it
  (`MAX_SETS` in `build-sets.mjs`).

Path alias `@/*` → **repo root** (`tsconfig.json`), e.g. `@/components/...`,
`@/data/sets`. Layout/fonts live in `app/layout.tsx`.

## The one rule: tokens before pixels

The defining discipline. Every design value is a **semantic token**, never a raw
literal in markup. This is enforced mechanically, not by convention:

- **Tokens are defined in `app/globals.css`.** Colors are `oklch` CSS vars under
  `:root`, re-exported into Tailwind via `@theme inline` as
  `--color-canvas/surface/surface-2/border/text/text-muted/text-faint/accent/`
  `accent-foreground/ring`, plus `--shadow-crate` / `--shadow-record`. This app is
  **light / white-canvas** (`color-scheme: light`); the WebGL canvas renders
  transparent over it. No theme toggle.
- **`eslint.config.js` ships a custom `tokens/no-raw-colors` rule** (error) that
  bans arbitrary color literals (`bg-[#...]`), raw palette colors
  (`text-zinc-100`), and raw `white`/`black` (with/without opacity) in class
  strings. If you need a color that isn't a token, **add it to `@theme` in
  `globals.css`** — don't inline it.
- **Legit exception — data-driven color.** Per-set colors come from `set.color`
  (hex strings in `data/sets.ts`): fed to 3D materials in `CrateScene` and to the
  inline-styled blobs in `AmbientField`. That's data, not a design decision, so it
  bypasses the class-string lint rule (which only sees DOM class strings — 3D
  material colors / hex data are always fine). Keep design colors as tokens; keep
  per-record colors as data.

## Series context

This is one app in a "30-day mini-app series." `learnings.md` is a running
playbook for the *series* (Vercel deploy via subdomain-per-app, a Sentry/
UptimeRobot/Vercel DevOps portal, the starter-template spec). Most of it is
forward-looking process notes and Vite-era recipes — useful background, not a
description of this repo's current wiring.
