# Atomic Drifter Web – project rules

2D browser **gameplay prototype** of Atomic Drifter (FTL-like ship roguelite, Fallout 3 Pip-Boy terminal style).
Purpose: find out which items, crew, systems and synergies are fun. The final game will be rebuilt in Godot/Unreal,
so **rules and data must stay engine-neutral**. Visuals = basic shapes.

The owner works from an Android phone and is not a programmer: keep explanations short, test on a 16:9 landscape phone.

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

## Design rules
- Colors: background `#030806`, phosphor green `#1AFF80`, amber `#FFB43A` = enemy/warning, red `#FF4A3A` = error/damage.
  Tokens live in `src/ui/styles.css` (`:root`) and `src/render/palette.ts` – keep both in sync.
- Font: Share Tech Mono. Sizes **24 / 18 / 15 px only** (game units for Phaser, CSS px for HTML).
- Clickable elements: 3 px frame. CRT overlay = static scanlines + vignette, **no flicker**.
- All in-game text in English, uppercase for labels.
- Landscape 16:9, logical resolution 1280×720, Phaser `Scale.FIT`. Touch first (tap, long-press), no hover-only features.

## Commands
- `npm run dev` – local dev server
- `npm test` – unit tests
- `npm run build` – typecheck + production build to `dist/`
- Deploy: Cloudflare Workers Builds runs `npm run build` + `npx wrangler deploy` on every push to `main` (see README).

## Workflow
- Small steps; after each change: `npm run typecheck && npm test && npm run build`.
- Handoff specs live in `docs/handoffs/`.
- Multiplayer (later): Cloudflare Durable Objects, server-authoritative; clients only send commands.
