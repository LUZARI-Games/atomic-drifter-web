# Handoff 001 – Project setup (Atomic Drifter Web, 2D prototype)

Goal: a working, deployable skeleton I can open on my Android phone.
Atomic Drifter = FTL-like ship roguelite, Fallout 3 Pip-Boy terminal style.
This is a gameplay prototype; visuals = basic shapes.

## Stack
- Vite + TypeScript (strict) + latest stable Phaser.
- Vitest for unit tests.
- No backend yet (multiplayer comes in a later handoff).

## Folder structure (important for a later Godot/Unreal port)
- src/core/   pure game rules in TypeScript. NO Phaser imports.
- src/data/   all game content as JSON (items, systems, crew…).
- src/render/ Phaser scenes – only draws state from core.
- src/ui/     HTML/CSS overlay for all UI (menus, HUD).
- Add a CLAUDE.md documenting this separation + the design rules below.

## Design rules
- Background #030806, phosphor green #1AFF80, amber #FFB43A = enemy/warning, red #FF4A3A = error/damage.
- Font: Share Tech Mono (Google Fonts). Sizes 24 / 18 / 15 px only.
- Clickable elements: 3 px frame. CSS scanlines + vignette overlay (no flicker).
- In-game language English.

## Test scene
- Landscape 16:9, Phaser scale mode FIT, fullscreen-friendly, works with touch.
- A ship drawn from basic shapes: 4 rooms (Engine, Weapons, Shields, Cockpit) in a grid, green outlines, stencil-style labels.
- Tap a room = select it (glow); info line in the HTML overlay shows the room name.
- Selection state lives in src/core, Phaser only renders it.
- Top bar in HTML: "ATOMIC DRIFTER // PROTOTYPE".
- One unit test for the core selection logic.

## Deploy
- Make `npm run build` output to dist/ and add a wrangler.jsonc for Cloudflare Workers static assets (SPA fallback).
- Write README.md with: how to run, how to build, and the exact
  Cloudflare dashboard steps for me (phone):
  1. Workers & Pages → Create → Import a GitHub repository → this repo.
  2. Build command / output settings to enter.
  3. After first deploy: Custom domains → adw.luzari-games.com.

## Done when
- npm run build + typecheck + tests pass.
- Commit, push, and tell me in 3 lines what to do next.