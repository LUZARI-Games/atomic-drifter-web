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
  hull with a rounded-pointed nose at the bow (right), tail fins at the stern (left). Never space/rockets.
  Atomic technology: airships, cars and bikes run on atomic reactors and float on levitation drives (nozzles pointing
  down, pushing like jets). Airship: 4 levitation drives (2 per side, on arms, kept clear of balconies), 2 big atomic
  thrusters behind the stern (forward drive), reactor housing on the stern cap (`airshipHull` in core/hull.ts).
  Car: hovers, no wheels, 4 drives at the corners, reactor glows through the grille. Bike: hover bike, 2 drives
  (front/back), reactor core where the tank was; sidecar pod has its own small drive. Vehicles bob at the dock.
  Reactors + drives pulse together in atomic green (`ATOMIC` in palette.ts, `PULSE_S`), redrawn per frame by
  `ShipView.drawEnergy` / `drawVehicleEnergy` (thrust columns with small steering wobble, exhaust, halo, glowing rims).
  Each system's machine tiles form ONE continuous block (gap to the walls, darker rim, dark system symbol),
  filled with the **Ship Planner colour, faded into Fallout paint** (`worldPaint` in palette.ts; no neon) (`src/data/systems.json`, `src/core/systems.ts`) – `src/core/hull.ts`.
  No room names on the floor – the system icon on the block is enough.
  Grimdark, desaturated Fallout 3 tones from `WORLD` in `src/render/palette.ts` (olive-grey steel, rust, dim lamp-yellow).
  No phosphor-green UI glow and no scanlines on the world – the only glow there is atomic energy (see above). Selection = pale lamp-yellow outline.
  Contrast rule (checked with GREYSCALE): dark world outside → bright, desaturated Vault-like interior (light concrete
  floor, blue-grey steel half walls with bright tops, dark stencil labels) → crew darker + more saturated on top, with a
  team-coloured outline (green = own crew, red-amber `HOSTILE` = enemy) and thin dark inner edges (`drawCrewIso`).
  Friend / foe never depends on faction: thick team outline + team ring under the feet + a health bar over every
  head (green = ours, red = hostile). Clothes = the character's faction colour from the crew database (`look.clothes`,
  grey without a faction). Body types (database field BODY, `look.body`): human, super_mutant (1.3× tall, very wide,
  hunched, bald, bare green-yellow arms, big hands), ghoul (thin, bald, brown-grey skin). `?test=looks`.

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
  A railing edge that carries a vehicle exit is a dock: the railing STAYS CLOSED (crew climb over it); two brass docking
  arms (`dockArms`) hold the vehicle. Vehicles (bike / bike + egg-shaped sidecar pod / open-top car you can look into)
  come from the planner export `vehicles[]`, lie along the dock edge outside (`vehicleFrame`), drawn from simple shapes.
  Deck floor is light (`WORLD.floor`) so crew stand out.
  The main game view (`ShipScene`) uses the same renderer at ISO 60/45 (owner's choice).

## Crew on board
- `src/core/nav.ts`: walk graph – deck tiles (machinery excluded), same-room tiles connect directly, rooms only through
  doors, balcony → docked vehicle seat over the railing (dock point). `findPath` (Dijkstra), `nodeAt`.
- `src/core/crewmove.ts`: `generateCrew` (planner exports carry no crew yet → 4 random Crew Lab types, seeded by ship
  name, start at consoles), `selectCrew`, `sendSelected` (tap a tile / vehicle seat), `tickCrew` (real time; speed,
  start/stop easing and stride in `src/data/crew_move.json`, 3.2 m/s), `doorsInUse` (doors open by themselves while
  someone walks through). ONE per side per deck tile (2 m × 2 m), 1 per seat; a taken tile → nearest free tile of the
  room, full room → order refused (`freeTileNear`). Spots (`tileSpot`): alone → tile centre (console tile: at the desk,
  facing the machine); crew + enemy on one tile → crew in the screen-LEFT corner, enemy in the screen-RIGHT corner
  (`GameState.fightAxis`, set by ShipScene from the camera). Everyone standing steps to their spot every tick.
- Idle animation (`IdlePose` in crew_iso.ts): breathing, weight from foot to foot, looking around, hands on hips now
  and then, typing at a desk – each person on their own rhythm. Redrawn at ~20 fps while nobody walks.
- Vehicles: 1 tile = 1 seat. `seatPose` (core/exterior.ts, layout `SEATS`): astride the bike (hands on the bar), car
  seats (driver at the wheel, legs hidden), low in the sidecar pod. Seated crew face the driving direction (`SitPose`
  in crew_iso.ts). Car: front and back row are walled apart (`vehicles[].walls` from the export) – you get in at your
  row's door only and can switch seats only within the row; a rust partition shows it.
- Seated crew are drawn BY their vehicle (`ShipView.drawVehicle`), in depth-sorted groups: bike = rider's far half
  (far leg + arm, `drawCrewIso(..., half)`) → bike → near half; pod = egg → passenger (only chest + head above the
  rim) → egg sides; car = body → people → near walls/hood. Check with `?test=bike|sidecar|car`.
- Taps: a figure on screen selects / deselects it; with crew selected a tap sends them; tapping the void lets go.
- Orders go to ROOMS, not tiles (FTL, `roomTarget`): the first one sent into a room takes its console tile (operates /
  repairs automatically), later ones the free tile nearest to the tap. Tapping your own room does nothing – to swap the
  operator, send them out and someone else in.
- Rendering: `ShipView.mountObjects` draws every standing object ONCE into its own graphics (stacked by depth);
  per frame only crew (and moving doors) are redrawn and slotted in by `isBehind`. Never redraw the whole ship per frame.
- Demo ship: 4 rooms in a row (machinery port side, floors connected by doors) + a 2-tile balcony with a docked car
  (both rows at the railing) and a bike.

## Run screens + HUD (from the owner's design mockups)
- Title screen = `/` without parameters (`src/ui/titleScreen.ts`, styles in styles.css `.title-screen`): 1950s poster
  logo (Bungee font, chrome/rust letters, atom emblem) over the player's current ship flying (ShipScene `attract`:
  no input, no boarders, slow camera drift). Buttons: NEW GAME (→ /new-run/), CONTINUE (only with a saved run →
  `/?play`), OPTIONS (sound, volume, greyscale, fullscreen), DEV TOOLS (planner, labs, database, sound list, upgrades,
  salvage, all test scenes), WISHLIST ON STEAM (`src/data/game_info.json` steam_url; empty = COMING SOON).
  The game itself = `/?play` (also `?test=`, planner `?ship=test`); in-game menu has MAIN MENU.
- New Run = ship selection screen (`new-run/index.html`, `src/newrun.ts`): HANGAR (`src/ui/hangar.ts`) + the New Run
  terminal. PC / wide: hangar left, terminal slides in from the right in a metal housing (`#game.nr` in newrun.css);
  upright phone: hangar top ~42 %, terminal slides up from below. Hangar = selected ship flying (Phaser, ShipScene
  attract mode), ◀ ▶ (also arrow keys) to flip ships, top-left HUD (crew + hull …), bottom-left systems / reactor bars
  (placeholder). Ships (`src/core/hangar.ts`): planner ship (if any), demo ship, 4 LOCKED random placeholders
  (`src/core/shipgen.ts`, seeded) shown dark with LOCKED / "???". START on a locked ship = ACCESS DENIED; START on an
  unlocked one saves `adw.shipChoice` ('planner' | 'demo') – the game uses the demo ship when 'demo' is chosen
  (planner TEST IN GAME `?ship=test` always uses the planner ship).
- Run state `src/core/run.ts` (RunState: names, difficulty, modifiers, scrap, ammo, hull, evasion, system levels,
  reactor bars, turrets), saved per browser by `src/ui/runStore.ts` (`adw.run`). The game HUD reads it (`statusFromRun`).
- Top-left HUD `src/ui/statusHud.ts`: hull segments, shield pips + recharge, evasion | ammo, scrap; crew portraits
  (captain first + bigger, health bar, station badge = system colour), tap = select. Portraits = the owner's 300×300
  face webps in `public/portraits/` (`src/data/portraits.json`: side crew/enemy, sex). Captain = power_armor, named
  from New Run; other own crew = random named characters from the crew roster (their name + sex). Enemy faces are for
  hostile crew later. Full-res / in-game-res versions of the art are not in the repo yet.
  Boarders: mirrored amber column top right under `[ MENU ]` (`.sh-foes`: portrait, name, health bar, up to 4 + "+N"),
  only while enemies are on board; tap = camera pans to them (`ShipScene.lookAt`). The enemy ship's status goes above
  it later (PC: right side, mirrored).
- Pages (plain DOM, no Phaser), each with rules in core + data JSON + tests:
  `/new-run/` (newrun.ts: names, difficulty, modifiers → buildRun), `/upgrades/` (upgrades.ts: system levels, reactor
  bars, undo/confirm), `/salvage/` (salvage.ts: seeded offer of 3 turrets by rarity, pick / scrap all; `?seed=`).
  Look follows the mockups (corner-bracket panels, glow, CRT-on/off, glitch, ACCESS DENIED shake) at 24/18/15 px,
  reflowed for a phone held upright.
- Every terminal page opens on the mockups' boot screen (`src/ui/terminal.ts`, `mountBootScreen`): POWER ON / REBOOT +
  OPTIONS (SOUND = game sound switch, GLASS layer, BLOOM 0–200 % → `--bloom` + SVG bloom filter, FULLSCREEN), remembered
  per browser. Salvage adds line-ups, SENTINELS → TURRETS / RAIDERS → EQUIPMENT (`src/data/equipment.json`) and slot
  pickers. After a confirm the CRT switches off → REBOOT + BACK TO GAME. Never drop parts of the owner's mockups
  without asking. Equipment picks are stored as `equip:<id>` in `run.turrets` until the run gets an equipment list.

## Boarding combat + moods
- Planner crew (from the crew database, portraits grouped by faction): CREW tool [6] places own crew (each character once,
  ☆ = captain), ENEMY CREW tool [E] places database enemies (same one many times, or RANDOM ENEMY). One friend + one
  foe per field max (like the game's one-per-side-per-tile). Export
  `crew: [{ side, tile, id?, captain? }]`. Game: `placedCrew` spawns exactly the placed own crew on their tiles (nobody
  placed → random `generateCrew`); `spawnShipEnemies` spawns each enemy as its database character (`spawnEnemy(..., id)`).
  Everyone starts without items.
- `src/core/combat.ts` `tickCombat` (every frame), FTL melee: everyone standing still at their spot hits the NEAREST
  opponent standing still in the same room – from their own tile (attack animation only, nobody walks over to hit).
  Walkers are never attacked. `pairUp`: crew and enemies in a room pair up 1:1 on one tile (crew screen-left, enemy
  screen-right corner); the console tile is served first (an operator stays, the enemy comes to them; a free console
  tile becomes the meeting point), else the enemy walks onto the crew member's tile. Extras of the bigger side stay
  alone on their own tiles. Operators fight too (in their corner = system not manned). Boarders fight while crew are in
  their room, then go for systems. Blows every `attack_interval_s`, 4 HP each (`hit_damage`). HP (`combat.json` hp):
  crew 25 / tank 40, enemies 20 / tank 30. Enemies at 0 HP die (animation, removed). Own crew at 0 HP are KNOCKED OUT
  (`ko`): lie there with circling stars, K.O. on their portrait, cannot be selected or hit; once no enemy is left on
  board they wake after `ko_wake_after_s` with 10 % HP (`ko_wake_share`).
- Med bay (`isMedbay`, room system `medbay`, not wrecked): own crew standing in it get 5 HP once per second
  (`medbay_heal_per_s`) until full – "+5", rising green crosses and a soft chime per tick. Enemies are not healed.
  Tests: `?test=ko|medbay`.
  Test: `?test=melee` (ship `test_ships/melee.json`, one 5-tile room).
- Sabotage / repair (`workOf`): a boarder alone at a system's console desk sabotages it, 5 s per health bar
  (`sabotage_s_per_bar`); a system has as many bars as its power level (energy slots) in the run (`systemBars`, from
  `effectiveLevel`). Crew at the desk repair 5 s per bar while no boarder is in the room. Animations: hammering with
  orange sparks / wrench + welding sparks; a bar row above the block shows the remaining health.
  Enemies cannot be selected; tapping them does nothing. Numbers in `src/data/combat.json`.
- `src/core/mood.ts` `moods`: bored (alone, not operating, idle ≥ 6 s; sits on the floor after 18 s, "zZ"),
  chat (same origin in one room: the one not operating tells a story – gestures, laughs, "!"/"HA" – the other nods),
  wary (different origins in one room: crossed arms, side glances, "?"; `keepDistance` makes one walk to another tile).
  No moods while boarders are in the room. Poses in `IdlePose` (crew_iso.ts), marks/health bars/damage numbers in
  ShipScene's overlay. Test scenes: `?test=fight|boarders|sabotage|repair|chat|wary|bored`.

## Crew database (website)
- `/crew-db/` (`src/crewdbpage.ts`, `src/ui/crewdb.css`): characters (name, side, faction, build, sex, HP, hit, portrait,
  free attributes, notes), factions (name, colour, description), portraits (built-in `/portraits/*.webp` + uploads).
  Everyone can add / edit / delete for now (owner's choice; editor password later). Page reloads data every 20 s.
- Server: `worker/index.ts` (Cloudflare Worker, `wrangler.jsonc` `main`) – `/api/*` goes to ONE Durable Object
  `CrewDb` (SQLite storage, created on deploy); everything else = static `dist`. Routes: GET `/api/db`, PUT/DELETE
  `/api/db/<collection>/<id>`, POST `/api/portraits/<id>` (image ≤ 1 MB), GET `/api/portrait-img/<id>`.
  First use seeds itself from `src/data/crew_db_seed.json`. Claude cannot reach the live API from the cloud session:
  to change live data, add a patch to `src/data/crew_db_patches.json` (new id; 'merge' keeps the owner's other edits) –
  the server applies each patch once on its next start (`patch:<id>` key); the shipped copy (`SEED_DB`) = seed + patches. Local test: `npm run build && npx wrangler dev --local`.
- Rules in `src/core/crewdb.ts` (shared by server, page and game): `cleanRecord`/`parseCrewDb` (validation),
  `rosterFrom` → `GameState.roster`. The game loads the live DB at start (`src/ui/crewDbApi.ts`, 2.5 s timeout, falls
  back to the seed): captain = character with the power-armour portrait, own crew + boarders drawn from it (name,
  portrait, sex, build, HP, hit; faction = look origin when it matches a Crew Lab origin id). `npm run dev` has no
  server → seed data.

## Sound
- Every sound has an id: catalogue `src/data/sounds.json` (id, when it plays, group) = the owner's to-do list for
  making real sounds. Page `/sounds/` (`src/soundspage.ts`) lists them with ▶ and YOUR FILE / PLACEHOLDER.
- Own files: `public/sfx/<id>.ogg|mp3|wav` (`scripts/build-sfx.mjs` writes `public/sfx/index.json` before dev/build;
  `src/ui/sfxFiles.ts` `playFile` / `loopFile`) replace the synthesized placeholder everywhere.
- Game: `src/ui/sound.ts` (`Sound.play(id)`, placeholders in `SYNTHS`, test: every game id has one). Ambience =
  engine hum loop + hover hum while vehicles are docked + a soft `wind_gust` every 20–40 s (no constant wind).
  ShipScene plays events from `stateEvents` / `moodEvents` / `orderRefused` (`src/core/events.ts`: boarder_alarm,
  fight_won, crew_ko/wake, system_wrecked/repaired, vehicle_enter/exit, moods), hammer/weld ticks while working.
- Terminal pages: `src/ui/termSfx.ts` (`term_*`, New Run + Ship Upgrades + boot/off) and `src/ui/salvageSfx.ts`
  (`salvage_*`). Menu: `SOUND: ON/OFF`, `VOLUME` (`src/ui/soundPrefs.ts`, remembered per browser).

## Fast checks (for Claude)
- Test scenes: open the game with `?test=<name>` (`src/data/test_scenes.json`: car, bike, sidecar, idle, walk,
  consoles, overview). Crew are placed straight onto seats / spots (`placeCrew` in core), the camera zooms onto `focus`.
  Add a scene for every new feature instead of tapping around. Ships for scenes: `src/data/test_ships/<name>.json`.
- `window.adw` = { store, scene }: `scene.screenOf([x, z])` gives the exact screen point to tap for a ship point.
- Owner's ships: menu `COPY SHIP` (clipboard) / `SAVE SHIP FILE` (download) hands over the ship as loaded (planner
  export from TEST IN GAME, else the demo ship). Save pasted ships into `src/data/test_ships/` to reproduce bugs.

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
- Menu `GREYSCALE ON/OFF` (all pages, remembered per browser): contrast check – crew and other game-relevant things
  must still stand out without colour (`applyGreyscale` in src/ui/menu.ts).

## Commands
- `npm run dev` – local dev server
- `npm test` – unit tests
- `npm run build` – typecheck + production build to `dist/`
- Deploy: Cloudflare Workers Builds runs `npm run build` + `npx wrangler deploy` on every push to `main` (see README).

## Workflow
- When unsure what the owner wants (e.g. which part of a mockup belongs in the game), ASK before building – don't guess.
- Owner's design mockups: proper rebuild (own code, phone layout, wired to core) – never a 1:1 copy of the export.
- The owner works from several sessions (phone cloud session + PC). Start every session with `git pull`.
- Owner wants changes live right away: commit and push straight to `main` (auto deploy) after checks pass.
- Small steps; after each change: `npm run typecheck && npm test && npm run build`.
- Handoff specs live in `docs/handoffs/`.
- Multiplayer (later): Cloudflare Durable Objects, server-authoritative; clients only send commands.
