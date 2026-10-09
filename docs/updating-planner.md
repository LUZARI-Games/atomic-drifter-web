# Ship Interior Planner on the website

Live: https://adw.luzari-games.com/planner/

## How it is built
- `planner/source.html` = the Ship Interior Planner artifact, **copied unchanged** (currently "Godot Ahmet",
  https://claude.ai/artifact/8nK5myKsy3MxGhV73HntN9).
- `public/planner/bridge.js` = small website add-on, loaded before the planner. It
  - replaces the Claude artifact runtime: downloads work as normal browser downloads, ships are kept in this browser,
  - adds **GAME** and **▶ TEST IN GAME**. TEST IN GAME presses the planner's own *DOWNLOAD GODOT JSON* button (`#gdBtn`),
    catches that file, stores it (`localStorage["adw.testShip"]`) and opens the game, which draws the ship.
- `scripts/build-planner.mjs` combines both into `public/planner/index.html` (runs automatically before dev/build; not committed).

## Updating to a new planner revision
1. Tell Claude: *"Update the website planner to <artifact link>"*.
2. Claude replaces `planner/source.html` with that artifact's HTML (nothing else changes), tests TEST IN GAME, pushes.
3. About a minute later the new version is live.

Requirements for a new revision: it must keep the **GODOT ENGINE** box with the `DOWNLOAD GODOT JSON` button (`#gdBtn`)
and the export format `atomic-drifter-ship-godot` v1. If the format changes, `src/core/ship.ts` needs a matching update.

## Things to know
- Ships and loaded Unreal tables are stored **per browser**. Ships saved in the artifact are not on the website automatically:
  in the artifact use COPY JSON, on the website IMPORT JSON. The Unreal tables have to be loaded once on the website, too.
- The artifact versions (Erick's and Ahmet's) stay untouched and keep working on claude.ai.
