# Atomic Drifter Web – guidance for Claude

FTL-like ship roguelite, Fallout 3 Pip-Boy terminal style. Gameplay prototype:
visuals are basic shapes. In-game language: **English**.

## Commands
- `npm run dev` – dev server (`--host`, so it's reachable from a phone on the LAN)
- `npm run typecheck` – `tsc --noEmit` (strict)
- `npm test` – Vitest unit tests (`src/**/*.test.ts`)
- `npm run build` – typecheck + Vite build into `dist/`
- Run typecheck, tests and build before every commit.

## Architecture (strict layering – a later Godot/Unreal port depends on it)

| Folder        | Contains                                         | May import            |
|---------------|--------------------------------------------------|-----------------------|
| `src/core/`   | Pure game rules + state (TypeScript only)        | `src/data/` only      |
| `src/data/`   | All game content as JSON (ships, items, crew…)   | nothing               |
| `src/render/` | Phaser scenes – draw state from core             | `core`, `data`, Phaser|
| `src/ui/`     | HTML/CSS overlay for all UI (menus, HUD)         | `core`, `data`        |

Rules:
- **No Phaser (or DOM) imports in `src/core/`.** Core must run in plain Node (tests do).
- All game state lives in core (`createGame` in `src/core/game.ts`). Render and UI
  read via `getState()`/`subscribe()` and change it only via `dispatch(action)`.
- New rules = pure functions in core + an action in `GameAction` + a unit test.
- Content (numbers, names, layouts) goes in `src/data/*.json`, not in code.
- Phaser draws the game world only. Text UI, menus and HUD are HTML in `src/ui/`.
- `main.ts` is the only place that wires the layers together.

## Design rules
- Colors: background `#030806`, phosphor green `#1AFF80` (default),
  amber `#FFB43A` = enemy / warning, red `#FF4A3A` = error / damage.
  CSS variables in `src/ui/style.css`; canvas copy in `src/render/palette.ts` – keep in sync.
- Font: **Share Tech Mono** (Google Fonts). Sizes **24 / 18 / 15 px only**
  (`--fs-l`, `--fs-m`, `--fs-s`). In Phaser, sizes are in game-space px (960×540 view).
- Every clickable element has a **3 px frame** (`.btn` in CSS, `FRAME` in render).
- CRT look: CSS scanlines + vignette overlay (`#crt`). **No flicker** or animated noise.
- Labels on the ship: uppercase, wide letter spacing (stencil look).
- Landscape 16:9, Phaser scale mode `FIT`, must work with touch on Android.

## Deploy
Cloudflare Workers static assets (`wrangler.jsonc`, SPA fallback), serving `dist/`.
No backend yet; multiplayer comes in a later handoff. Handoff specs live in `docs/handoffs/`.

## Communication with the owner
- Always answer in **English**, short and to the point.
- Always give honest **critique** of what the owner plans or implements,
  plus a concrete **suggested fix / alternative**.
