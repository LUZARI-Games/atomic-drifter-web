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
| `planner/source.html` | The owner's **website planner** (started as a copy of the Ship Interior Planner artifact). May be edited; mark edits with `// [website]` and list them in `docs/updating-planner.md` (re-apply after importing a new artifact revision). The original artifacts on claude.ai are never touched. | – |
| `public/planner/bridge.js` | Website add-on for the planner (downloads, TEST IN GAME / SHIP LAB). See `docs/updating-planner.md`. | – |

- State lives in a `Store` (`src/core/store.ts`); updates are pure functions `(state) => newState`.
- Renderer/UI subscribe to the store; they never hold their own copy of game state.
- Every rule in `src/core` gets a Vitest test next to it (`*.test.ts`).
- Ships use the planner's Godot export (`atomic-drifter-ship-godot` v1: meters, bow = -Z, starboard = +X) unchanged –
  the same file feeds the web prototype and Godot. The game draws it in the ISO 60/45 view (see Two looks).

## Two looks
- **Terminal UI** (HTML overlay: bars, menus, HUD) – green phosphor rules below.
- **Game world** (the ship in Phaser) – **ISO 60/45**: orthographic view looking down 60°, turned 45° (`GAME_VIEW` in
  `src/render/ShipScene.ts`, drawn by `src/render/ship_view.ts`). Still flat 2D shapes, no perspective, no 3D engine.
  Half walls (1 m) so you can see into the rooms; selection outline is drawn on top of the walls.
  Flight (`src/render/wasteland.ts`, colours `WASTE` in palette.ts): the ship never moves, the world slides past against
  the bow. A fog sea hides the ground; only ruined high-rises / water towers / pylons poke out of it (they ARE the fog
  layer: same depth, same speed). Above: 2 cloud decks = tileable B/W noise textures (generated at start, tinted).
  Over the ship: cloud-shadow texture + wind streaks. Each layer has a depth factor k (1 = ship): size and screen speed
  scale with k; pan/zoom follow the ship camera. `FAR_IS_SLOWER` flips the speed order if the owner wants it reversed.
  Scenes bottom→top: WastelandScene → ShipScene → HazeScene. The ship bobs gently. Everything stays greyer than the ship.
  Setting: post-nuclear Earth (Fallout-like); ships are patched-up pre-war **airships** flying low over the wasteland –
  hull with a rounded-pointed nose at the bow (right), propellers + tail fins at the stern (left). Never space/rockets.
  Each system's machine tiles form ONE continuous block (gap to the walls, darker rim, dark system symbol),
  filled with the **Ship Planner colour, faded into Fallout paint** (`worldPaint` in palette.ts; no neon) (`src/data/systems.json`, `src/core/systems.ts`) – `src/core/hull.ts`.
  Grimdark, desaturated Fallout 3 tones from `WORLD` in `src/render/palette.ts` (olive-grey steel, rust, dim lamp-yellow).
  No green glow and no scanlines on the world. Selection = pale lamp-yellow outline.

## Crew look (in evaluation)
- OLD look: `src/render/crew.ts` (armour baked into the origin). NEW look: `src/render/crew_v2.ts` – plain clothes in the
  origin `color` (`crew_looks.json`), gear = neutral metal add-ons, one per slot (`crew_gear.json`, `equip` in core),
  friend/foe ring under the feet. ISO test: `src/render/crew_iso.ts` – NEW look seen from a 45° and a 60° look-down
  camera, orthographic, still flat 2D shapes (projection in `src/core/projection.ts`, angles = `ISO_VIEWS`).
  New looks use `builds.*.torso` (shoulders/waist) – tanks are a clear V shape; OLD keeps `builds.*.shoulders`.
  The Crew Lab shows OLD | NEW | NEW + GEAR | ISO 45° | ISO 60° side by side until the owner decides.

## Ship Lab (in evaluation)
- `/ship-lab/` (`src/shiplab.ts`, `src/render/ship_view.ts`): ANY ship (planner ship via the planner's `▶ SHIP LAB` button
  or TEST IN GAME, else the demo ship) in three views: TOP-DOWN (2D), ISO 60/45 (down 60°, turned 45°), ISO 45/45.
  Orthographic, flat 2D. Views = `makeView(pitch, yaw)`; the ship's own `wall_height` from the export wins;
  draw order via `drawOrder` (core/projection.ts, with fixed pairs like symbol-after-block) – long walls / blocks are drawn
  in 1 m / per-tile pieces. Shading in ship_view is proportional (dark paint never turns black). Heights in `src/data/ship_view.json` (half walls 1 m, systems 1 m, door posts 1.1 m) → `src/core/ship3d.ts`.
  Doors = 2 slim brass posts (no top beam) + floor plate + two leaves that slide sideways into the walls (`doorLeaves`);
  airlocks rust-orange with hazard stripes. Tap a door to open/close it (`toggleDoor`, `GameState.openDoors`);
  ShipScene animates the slide and redraws only the standing objects (`ShipView.drawObjects`) while doors move.
- Consoles: a system's console tile is where crew stands to use it (doors on its other edges are fine – crew can pass). The keyboard is a shelf in the
  system's paint, fixed to the block front facing that tile, lower than the block, overhanging the tile ~0.28 m
  (`consoleDesk` in core/ship3d.ts; drawn by ship_view in game + Ship Lab).
  Planner export: `rooms[].console = { tile, facing } | null` – older exports without it still load.
- Balconies + vehicles (`src/core/exterior.ts`): the hull is built around the enclosed deck only, so balconies hang out
  of it (steel grating floor, visible platform edge + brackets underneath). Railings = posts + top/middle rail, see-through.
  A railing edge that carries a vehicle exit is a dock: the railing opens into a gate (2 posts). Vehicles (bike / sidecar /
  car) come from the planner export `vehicles[]` and are drawn from boxes, lying along the dock edge, outside.
  The main game view (`ShipScene`) uses the same renderer at ISO 60/45 (owner's choice).

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
