# 3D Crate — build plan & handoff

The app was rebuilt as a single 3D scene: a white page with **only** a milk
crate of records, viewed from a locked side angle. Browse pulls a record into
focus; selecting spins it up and plays its video. This doc is the running plan.

## Stack added

- `three` 0.184, `@react-three/fiber` v9, `@react-three/drei` v10,
  `@react-spring/three` v10 (drives the Phase 2 sleeve springs).
- White theme in `app/globals.css` (was dark-only). `body { overflow: hidden }`.

## Where everything lives

- **`app/page.tsx`** — owns state: `selectedId`, derived `selectedIndex`,
  `selectByOffset(offset)` (clamped over `djSets`). Dynamically imports the
  canvas with `ssr: false`. Passes `sets / selectedId / onSelect / onStep` down —
  all wired in Phase 2 (`onSelect` ← click, `onStep` ← arrow keys).
- **`components/crate/CrateScene.tsx`** — the whole scene. Key parts:
  - `LockedCamera` — fixes the camera (no orbit). `CAMERA_POSITION` /
    `CAMERA_TARGET` are the canonical framing; compose everything against it.
  - `CrateAndRecords` — loads `public/models/milk_crate.glb` via `useGLTF`,
    measures it at runtime (`Box3`), scales footprint to `CRATE_TARGET_WIDTH`,
    sits base on `y=0`, and **recolors** it to `CRATE_COLOR` (#0024cc) by
    cloning the material.
  - `Records` — one `<Sleeve>` per real `djSet` (no filler — **all 44 records
    are real/selectable**). Sleeve size derived from the measured crate (square,
    `recW = crate.width*FIT_WIDTH`), base at `crate.height*FIT_FLOOR`. Packed at
    `SLEEVE_PITCH`, tightened to fit if `djSets` outgrows the crate depth. Index
    increases toward screen-right so ArrowRight (`onStep+1`) moves focus right.
  - `Sleeve` — self-animating spine (`@react-spring/three`): springs up on
    `active` (focus) with subtle scale + emissive; click → `onSelect(set.id)`,
    pointer cursor on hover.
- **Asset:** `public/models/milk_crate.glb` (single mesh, one material, no
  textures — takes our lighting; recolored in code).
- **Tunables (top of CrateScene.tsx):** `RECORD_DEPTH`, `RECORD_GAP`,
  `FIT_WIDTH`, `FIT_DEPTH`, `FIT_FLOOR`, `CRATE_TARGET_WIDTH`, `CRATE_COLOR`,
  `CAMERA_POSITION/TARGET`.
- **Data:** all 44 records live in `data/sets.source.json` (edit there, then
  `npm run sync:sets`). 9 original + 35 placeholder entries over reused working
  YouTube ids, each with an explicit `color` so spines stay varied.

## Status

- **Phase 0 — scaffold** ✅ canvas, white page, state model, dynamic import.
- **Phase 1 — look-dev** ✅ real crate asset, lighting (local Lightformers, no
  HDRI download), contact shadows, square sleeves filling the crate, blue color,
  locked framing. **Signed off as accurate.**
- **Phase 2 — browse / focus** ✅ each spine is a self-animating `<Sleeve>`
  (`@react-spring/three` `useSpring` on `position-y` + subtle scale/emissive on
  `active`). Arrow keys → `onStep(∓1)` (window keydown in `CrateScene`); click a
  spine → `onSelect(set.id)`; pointer cursor on hover. (Filler later removed —
  all records real.) `eslint-disable` removed.
- **Phase 3 — selection choreography (hero)** ✅ `page.tsx` owns `openId` on top
  of `selectedId`. Click model: new record → focus; focused record → open;
  opened record → close. Stepping + `Escape` close. The opened `<Sleeve>` runs
  one spring timeline — springs up out of the crate (`openLift`), recenters to
  `z=0`, rotates cover face-on (`rotation-y → π/2`), scales up. Video is a DOM
  overlay over the canvas (reuses `YouTubePlayer`, now with an `autoplay` prop)
  at a fixed upper anchor; fades/scales in once the field blooms, fades out on
  close (panel stays mounted briefly so the iframe stops only after the exit).
  `prefers-reduced-motion` → springs + fades snap (`immediate` / no delay).
- **Phase 3.1 — ambient "now playing" field** ✅ a page `phase` machine
  (`closed → opening → open`) sequences the hero: the opened record springs up,
  then at `open` it **dissolves** (3D opacity→0 + scale-up + emissive flare) and
  that "queues" the background change. Layers (back→front): `AmbientField`
  (`components/AmbientField.tsx` — heavily-blurred color blobs derived from
  `set.color`, drifting via the `ambientDrift{A,B,C}` keyframes in `globals.css`)
  `z-0` behind the transparent canvas → crate `z-10` → glass blur
  (`backdrop-blur-2xl bg-canvas/15`, click-to-close) `z-20` turning the crate
  into a dim presence → crisp video `z-30`. NOTE: live YouTube frames can't be
  sampled (cross-origin), so the field is palette-derived, not the video itself;
  the *movement* is procedural. Tunables: `REMOVE_MS`/`EXIT_MS` (page), blob
  `LAYOUT`/blur/sat (`AmbientField`), glass tint.

- **Phase 4 — cover textures (spin)** ✅ `cover?: string` on `DJSet`. The build
  (`scripts/build-sets.mjs`) saves each video's maxres thumbnail to
  `/public/covers/<youtubeId>.jpg` (cached/deduped by id; 2 of 9 ids have no
  maxres → those records fall back to `color`). `Records` loads the unique covers
  via `useTexture`, center-crops 16:9 → square (`repeat.x = 9/16`, centered), and
  passes a `THREE.Texture` to each `Sleeve`. The sleeve is now an
  `animated.group`: a color box + a cover **plane on the +z face** (the one that
  turns to camera on the spin; the crate's edge-on spines stay solid color). The
  cover material can't be `animated.*` (Texture prop blows up the spring types),
  so its opacity is synced from the spring via `useFrame`. NOTE: covers repeat
  (44 records ÷ 9 videos) and only show during the ~620ms spin before dissolve.

## Remaining

### Phase 4 leftovers (deferred — content-blocked / not requested)
- Real `youtubeId`s and real cover art (chose placeholders; covers come from the
  reused thumbnails). Optional real HDRI / shadow / material look-dev.
- **Cleanup:** ✅ done — `FocusPanel`, `RecordCrate`, `RecordSlit`, `SetMeta`
  deleted, along with all Vite scaffolding (`src/`, `index.html`, `components.json`,
  the Vite tsconfigs, `dist/`). `tsconfig`/`eslint` ignores and CLAUDE.md updated
  to match.

## Quality gate
`npm run typecheck` + `npm run lint` (no test runner). Dev server already runs on
:3000. Lint includes `tokens/no-raw-colors` — only affects DOM class strings;
3D material colors / hex data are fine.
