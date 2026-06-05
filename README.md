# Crate

A **record-crate browser for YouTube DJ sets**, built as a single 3D scene.
A milk crate of records sits on a tiled white floor, viewed from a locked side
angle. Arrow or click to focus a spine; open it and the record spins out of the
crate, dissolves into an ambient color field, and the YouTube video plays in a
glass overlay.

Built with **Next.js 16** (App Router, React 19), **Tailwind v4**, and
**React Three Fiber** (`three` / `@react-three/fiber` / `@react-three/drei` /
`@react-spring/three`).

## Quick start

```bash
npm install
npm run dev        # next dev — http://localhost:3000
```

| Command             | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `npm run dev`       | Next dev server                                          |
| `npm run build`     | `next build` (output: `standalone`; runs `sync:sets` first) |
| `npm run start`     | Serve the production build                               |
| `npm run lint`      | `eslint .` — includes the `tokens/no-raw-colors` guardrail |
| `npm run typecheck` | `tsc --noEmit`                                            |
| `npm run sync:sets` | Regenerate `data/sets.ts` + covers from the source JSON  |

There is no test runner; **`lint` + `typecheck` are the quality gate.**

## Architecture

Single route, fully client-rendered. `app/page.tsx` is `'use client'` and owns
all state; the 3D scene is dynamically imported with `ssr: false` (R3F is
client-only).

- **`app/page.tsx`** — owns `selectedId` (focused record) and `openId` (the
  opened "hero"), plus a `closed → opening → open` phase machine that sequences
  the open choreography (`prefers-reduced-motion` snaps it). Renders the DOM
  layers over the transparent canvas: `AmbientField` (z-0), a glass blur (z-20),
  and the `YouTubePlayer` overlay (z-30).
- **`components/crate/CrateScene.tsx`** — the whole R3F scene: locked camera, a
  runtime-measured `public/models/milk_crate.glb`, one self-animating `<Sleeve>`
  per record (spring-driven focus / open-spin / dissolve, with cover textures),
  a tiled floor, shadow catchers, and studio lighting.
- **`components/AmbientField.tsx`** — DOM "now playing" backdrop: blurred,
  drifting color blobs derived from the record's color.

### Data

`data/sets.ts` is a **generated file** — edit `data/sets.source.json`, then run
`npm run sync:sets` (also runs on `prebuild`). The build script
(`scripts/build-sets.mjs`) enriches title/venue/color from YouTube and saves
cover thumbnails to `public/covers/`. The set type lives in `types/dj-set.ts`.

The `@/*` path alias maps to the repo root (`tsconfig.json`), e.g.
`@/components/...`, `@/data/sets`.

## The one rule: tokens before pixels

Every design value is a **semantic token**, never a raw literal in markup —
enforced mechanically, not by convention.

- **Tokens live in `app/globals.css`** as `oklch` CSS vars, re-exported into
  Tailwind via `@theme inline` (`--color-canvas/surface/border/text/accent/...`,
  plus `--shadow-crate` / `--shadow-record`). The app is light / white-canvas;
  the WebGL canvas renders transparent over it. No theme toggle.
- **`eslint.config.js` ships a custom `tokens/no-raw-colors` rule** (error) that
  bans arbitrary color literals (`bg-[#...]`), raw palette colors
  (`text-zinc-100`), and raw `white`/`black`. Need a color that isn't a token?
  Add it to `@theme` in `globals.css` — don't inline it.
- **Exception — data-driven color.** Per-set colors come from `set.color` (hex
  in `data/sets.ts`), fed to 3D materials and the `AmbientField` blobs. That's
  data, not a design decision, so it bypasses the lint rule (which only sees DOM
  class strings).

See **`docs/3d-crate-plan.md`** for the phase-by-phase build log and the
canonical tunables.
