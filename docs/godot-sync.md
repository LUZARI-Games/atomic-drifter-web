# Website prototype ↔ Godot project – comparison (10.10.2026)

Website: `LUZARI-Games/atomic-drifter-web` (live at adw.luzari-games.com).
Godot: `LUZARI-Games/atomic_drifter_godot` (Godot 4.7.2, GDScript, 1600 × 900).

## What exists where

| Area | Website | Godot |
|---|---|---|
| Ship format (planner export `atomic-drifter-ship-godot` v1) | ✔ reads it (`src/core/ship.ts`) | ✔ reads it (`ship/ship_layout.gd`) – **same format** |
| Ship in 3D | ISO 60/45 drawn in 2D from 3D geometry (`src/core/ship3d.ts`, `ship_view.ts`) | ✔ real 3D: floor, half walls (cut caps), sliding doors, railings (`ship/ship_interior.gd`), dev view with true-iso camera (`screens/ship_view`) |
| Hull, airship shape, atomic drives, vehicles, consoles, system blocks | ✔ | ✘ (interior only) |
| Crew (walking, rooms, vehicles, moods) | ✔ | ✘ |
| Boarding combat, sabotage / repair, med bay, KO | ✔ | ✘ |
| Crew database (characters, factions, portraits, body types) | ✔ live on the website (`/api/db`) | ✘ (could read the same `/api/db` JSON) |
| Title screen / main menu | ✔ | UI Select (dev list) + Options menu |
| New Run | ✔ + hangar ship selection | ✔ (left half = framed 3D placeholder) |
| Ship Upgrades | ✔ | ✔ (more complete: drag, right click, pips, install ticks) |
| Salvage Reward | ✔ | ✔ (Rev. 5, item catalog with perks per rarity, holograms) |
| Items / turrets data | `turrets.json`, `equipment.json` (simple) | `item_catalog.tres` (ItemDef + perks per rarity, prices) – **richer** |
| Turret 3D models | ✘ | ✔ 4 rigged FBX turrets |
| Sounds | synthesized placeholders, ids in `sounds.json`, `/sounds/` page | 116 WAV placeholders (rendered from the same mockup recipes), `UISound` autoload |
| CRT look | CSS glow / glass on terminal pages | `crt.gdshader` (scanlines, scan bar, grain, reflection) |
| Fonts | Share Tech Mono | Monofonto (Share Tech Mono = fallback) |
| Game design (GDD) | rules in CLAUDE.md | Obsidian vault `Atomic_Drifter_GDD` – **not on GitHub yet** |

## Differences to settle
1. **Camera:** website ISO 60/45 (looks down 60°), Godot true isometric (35.264° pitch, 45° yaw). Pick one for both.
2. **Font:** website Share Tech Mono, Godot Monofonto.
3. **Wall thickness:** website interior 0.22 / hull 0.30 m (`ship_view.json`), Godot 0.12 / 0.24 m.
4. **Floor colour:** website light concrete (crew stand out), Godot dark grey with a room-colour tint.
5. **Items:** Godot's item catalog is the better model; the website should take it over (or both read one JSON).
6. **Balancing numbers:** website keeps them in `src/data/*.json`, Godot in `.tres` files – choose one source (JSON both can read).

## Suggested sync plan
- **Shared data as JSON** (ships, crew database, combat numbers, items, sound ids): one source, both read it. Godot can load the live crew database from `https://adw.luzari-games.com/api/db`.
- **Shared look as data:** heights, thicknesses, colours (`ship_view.json`, palette) → Godot reads the same file instead of its own constants.
- **Rules stay in the website prototype** while testing what's fun (fast to change, phone-testable); proven rules get ported to GDScript one system at a time.
- 3D test on the website (Three.js) only after the camera choice above – then it can match Godot's camera exactly.
- Put the GDD vault on GitHub too, so both projects (and Claude) can read it.
