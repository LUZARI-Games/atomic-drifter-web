# Ship Interior Planner on the website

Live: https://adw.luzari-games.com/planner/

## How it is built
- `planner/source.html` = the owner's website planner. It started as a copy of the Ship Interior Planner artifact
  ("Godot Ahmet", https://claude.ai/artifact/8nK5myKsy3MxGhV73HntN9) and **may be changed** for the website.
  Every website change is marked `// [website]` in the file and listed below.
- `public/planner/bridge.js` = small website add-on, loaded before the planner. It
  - replaces the Claude artifact runtime: downloads work as normal browser downloads, ships are kept in this browser,
  - adds **GAME**, **▶ SHIP LAB** and **▶ TEST IN GAME**. TEST IN GAME presses the planner's own *DOWNLOAD GODOT JSON* button (`#gdBtn`),
    catches that file, stores it (`localStorage["adw.testShip"]`) and opens the game, which draws the ship.
- `scripts/build-planner.mjs` combines both into `public/planner/index.html` (runs automatically before dev/build; not committed).

## Updating to a new planner revision
1. Tell Claude: *"Update the website planner to <artifact link>"*.
2. Claude replaces `planner/source.html` with that artifact's HTML, **re-applies the website changes below**, tests TEST IN GAME, pushes.
3. About a minute later the new version is live.

Requirements for a new revision: it must keep the **GODOT ENGINE** box with the `DOWNLOAD GODOT JSON` button (`#gdBtn`)
and the export format `atomic-drifter-ship-godot` v1. If the format changes, `src/core/ship.ts` needs a matching update.

## Website changes (re-apply after every new revision)
- No automatic "BEFORE YOU START · LOAD YOUR GAME TABLES" pop-up on start (the `setTimeout(... openSetup() ...)` at the end
  of the setup code is removed). The window still opens with **[T]** or the tables button.
- Console = keyboard desk drawn ON the machinery edge facing the console tile, overhanging that tile a little (`drawConsoleRect`).
- Godot export: `rooms[].console = { tile: [x, z], facing: [x, z] } | null` (+ `console_info`), read by `src/core/ship.ts`.
- Godot export: `vehicles[] = { type, seats, docked, tiles[{center, polygon}], exits[{a, b}], walls[{a, b}] }` (+ `vehicles_info`).
- **Crew database** (`loadCrewDb`, `CREWDB`): on start the planner loads `/api/db` (website crew database). The CREW
  ROSTER lists characters marked CREW (portraits, grouped by faction); the Unreal DataTable buttons are hidden and the stored
  Unreal table is not loaded. Placed crew show their portrait on the grid (`drawFace`). Only works on the website.
- **ENEMY CREW** tool (amber, key **[E]**) + **ENEMY CREW** box under the crew roster: pick a database enemy (or RANDOM
  ENEMY), tap floor fields (up to 4 per field, the 5th tap clears it; not on machinery). Stored as
  `tile.enemies = [characterId | null, …]` (older saves with a count still load), drawn as amber-ringed portraits.
- Godot export `crew[] = { side: "crew" | "enemy", tile: [x, z], id?, captain? }` (+ `crew_info`): own crew = placed
  database characters (captain = the starred one), enemies = one entry per enemy, `id` missing = random. `tile` = floor
  tile centre like `rooms[].console.tile`. Older exports without `crew` stay valid.
- `window.__planner = { ship, sx, sy, godotShip }` debug hook for automated checks.

## Things to know
- Ships and loaded Unreal tables are stored **per browser**. Ships saved in the artifact are not on the website automatically:
  in the artifact use COPY JSON, on the website IMPORT JSON. The Unreal tables have to be loaded once on the website, too.
- The artifact versions (Erick's and Ahmet's) on claude.ai stay untouched and keep working there.
