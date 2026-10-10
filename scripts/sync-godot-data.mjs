// Copies the shared game data (JSON) + portraits + the owner's own sound files from this repo into the Godot project
// (../atomic_drifter_godot or the path given as argument): res://data/web/, res://assets/portraits/, res://assets/sfx/.
// The website repo is the source; run it after changing data here (`node scripts/sync-godot-data.mjs`).
// Live data (crew database, ships) is NOT copied – both read it from the website API.
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const godot = process.argv[2] ?? '../atomic_drifter_godot';
const files = [
  'combat.json', 'crew_move.json', 'crew_looks.json', 'crew_lab.json', 'crew_gear.json', 'portraits.json', 'systems.json',
  'ship_view.json', 'run_start.json', 'test_scenes.json', 'sounds.json', 'crew_db_seed.json', 'crew_db_patches.json',
  'demo_ship.json', 'game_info.json', 'story.json', 'new_run.json',
];
const out = join(godot, 'data/web');
mkdirSync(join(out, 'test_ships'), { recursive: true });
for (const f of files) cpSync(join('src/data', f), join(out, f));
for (const f of readdirSync('src/data/test_ships')) cpSync(join('src/data/test_ships', f), join(out, 'test_ships', f));
mkdirSync(join(godot, 'assets/portraits'), { recursive: true });
for (const f of readdirSync('public/portraits')) if (f.endsWith('.webp')) cpSync(join('public/portraits', f), join(godot, 'assets/portraits', f));
// own sound files (public/sfx/<id>.ogg|mp3|wav) replace the placeholders in Godot too
mkdirSync(join(godot, 'assets/sfx'), { recursive: true });
let sounds = 0;
for (const f of readdirSync('public/sfx')) if (/\.(ogg|mp3|wav)$/.test(f)) { cpSync(join('public/sfx', f), join(godot, 'assets/sfx', f)); sounds++; }
console.log(`synced ${files.length} data files + test ships + portraits + ${sounds} sounds -> ${godot}`);
