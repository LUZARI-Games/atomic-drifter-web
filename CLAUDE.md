# Atomic Drifter Web – project rules

2D browser **gameplay prototype** of Atomic Drifter (FTL-like ship roguelite, Fallout 3 Pip-Boy terminal style).
Purpose: find out which items, crew, systems and synergies are fun. The final game will be rebuilt in Godot/Unreal,
so **rules and data must stay engine-neutral**. Visuals = basic shapes.

The owner works from an Android phone and is not a programmer: keep explanations short, test on a phone held upright (portrait) – landscape must work too, but is never required.
Replies: always in English (even when the owner writes German), short and to the point, bullet lists for multiple points,
never restate the owner's tasks back to them.

## Architecture (strict)
| Folder | Contains | May import |
|---|---|---|
| `src/core/` | Pure game rules + state (TypeScript). Ports 1:1 to GDScript/C++. | `src/data`, other core files. **Never Phaser or DOM.** |
| `src/data/` | All game content as JSON (rooms, systems, items, crew…). snake_case ids. | – |
| `src/render/` | Phaser scenes. Only *draws* core state and forwards input to core. | core, data, Phaser |
| `src/ui/` | HTML/CSS overlay for all UI (menus, HUD, panels). | core |
| `planner/source.html` | Ship Interior Planner artifact, **copied unchanged**. Never edit it – replace it with a new revision. | – |
| `public/planner/bridge.js` | Website add-on for the planner (downloads, TEST IN GAME). See `docs/updating-planner.md`. | – |

- State lives in a `Store` (`src/core/store.ts`); updates are pure functions `(state) => newState`.
- Renderer/UI subscribe to the store; they never hold their own copy of game state.
- Every rule in `src/core` gets a Vitest test next to it (`*.test.ts`).
- Ships use the planner's Godot export (`atomic-drifter-ship-godot` v1: meters, bow = -Z, starboard = +X) unchanged –
  the same file feeds the web prototype and Godot. The game draws it top-down with the bow pointing right.

## Two looks
- **Terminal UI** (HTML overlay: bars, menus, HUD) – green phosphor rules below.
- **Game world** (the ship in Phaser) – flat 2D top-down like FTL / Void War, no 3D / 2.5D / perspective.
  Setting: post-nuclear Earth (Fallout-like); ships are patched-up pre-war **airships** flying low over the wasteland –
  hull with a rounded-pointed nose at the bow (right), propellers + tail fins at the stern (left). Never space/rockets.
  Each system's machine tiles form ONE continuous block (gap to the walls, darker rim, dark system symbol),
  filled with the **Ship Planner colour, faded into Fallout paint** (`worldPaint` in palette.ts; no neon) (`src/data/systems.json`, `src/core/systems.ts`) – `src/core/hull.ts`.
  Grimdark, desaturated Fallout 3 tones from `WORLD` in `src/render/palette.ts` (olive-grey steel, rust, dim lamp-yellow).
  No green glow and no scanlines on the world. Selection = pale lamp-yellow outline.

## Crew look (in evaluation)
- OLD look: `src/render/crew.ts` (armour baked into the origin). NEW look: `src/render/crew_v2.ts` – plain clothes in the
  origin `color` (`crew_looks.json`), gear = neutral metal add-ons, one per slot (`crew_gear.json`, `equip` in core),
  friend/foe ring under the feet. The Crew Lab shows OLD | NEW | NEW + GEAR side by side until the owner decides.

## Design rules (terminal UI)
- Colors: background `#030806`, phosphor green `#1AFF80`, amber `#FFB43A` = enemy/warning, red `#FF4A3A` = error/damage.
  Tokens live in `src/ui/styles.css` (`:root`) and `src/render/palette.ts` – keep both in sync.
- Font: Share Tech Mono. Sizes **24 / 18 / 15 px only** (game units for Phaser, CSS px for HTML).
- Clickable elements: 3 px frame. CRT overlay = vignette, **no flicker**.
- All in-game text in English, uppercase for labels.
- **Full screen, any orientation, never force landscape.** No top/bottom bars: every page is a full-screen Phaser canvas
  (`Scale.RESIZE`) with only a floating `[ MENU ]` (top right, `src/ui/menu.ts`) and an info chip that shows only when needed.
- Navigation in every view: 1 finger drags, 2 fingers pinch-zoom, mouse wheel zooms, a still touch = tap
  (`src/render/panzoom.ts`). Draw content once at a fixed world size; the camera does fitting and zoom.
- Touch first (tap, long-press), no hover-only features.

## Commands
- `npm run dev` – local dev server
- `npm test` – unit tests
- `npm run build` – typecheck + production build to `dist/`
- Deploy: Cloudflare Workers Builds runs `npm run build` + `npx wrangler deploy` on every push to `main` (see README).

## Workflow
- The owner works from several sessions (phone cloud session + PC). Start every session with `git pull`.
- Owner wants changes live right away: commit and push straight to `main` (auto deploy) after checks pass.
- Small steps; after each change: `npm run typecheck && npm test && npm run build`.
- Handoff specs live in `docs/handoffs/`.
- Multiplayer (later): Cloudflare Durable Objects, server-authoritative; clients only send commands.
