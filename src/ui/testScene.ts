// Test scenes for quick checks: `?test=<name>` puts crew straight into a set situation (seats, deck spots, walking)
// and points the camera at it – see src/data/test_scenes.json. Ships pasted from the owner (COPY SHIP) can be stored
// in src/data/test_ships/ and used by name.
import SCENES from '../data/test_scenes.json';
import { spawnEnemy } from '../core/combat';
import { placeCrew, selectCrew, sendSelected } from '../core/crewmove';
import type { GameState, Point } from '../core/types';

interface SceneCrew {
  at: Point;
  send?: Point;
  selected?: boolean;
  enemy?: boolean; // spawn an enemy boarder here (does not use up a crew member)
  origin?: string; // give this crew member another origin (mood tests)
  idle?: number; // seconds they have been standing around already (bored tests)
  hp?: number; // start HP (knock-out / med bay tests)
}
export interface TestScene {
  name: string;
  ship?: string;
  crew: SceneCrew[];
  focus?: Point;
  zoom?: number;
  damage?: Record<string, number>; // preset system damage in health bars (repair tests)
}

const SHIPS = import.meta.glob('../data/test_ships/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

/** The scene named in the URL (?test=name), or null. */
export function testSceneFromUrl(): TestScene | null {
  const name = new URLSearchParams(location.search).get('test');
  if (!name) return null;
  const scene = (SCENES as unknown as Record<string, Omit<TestScene, 'name'>>)[name];
  return scene && name !== '_info' ? { name, ...scene } : null;
}

/** Ship data of a test ship file (src/data/test_ships/<name>.json), or null. */
export function testShip(name: string): unknown {
  return SHIPS[`../data/test_ships/${name}.json`] ?? null;
}

/** Place the scene's crew (in order), send the ones that should walk, select the one marked. */
export function applyTestScene(state: GameState, scene: TestScene): GameState {
  let s = state;
  const own = scene.crew.filter((c) => !c.enemy);
  own.forEach((c, i) => {
    const m = s.crew[i];
    if (!m) return;
    s = placeCrew(s, m.id, c.at);
    if (c.hp !== undefined) s = { ...s, crew: s.crew.map((x) => (x.id === m.id ? { ...x, hp: Math.min(x.hpMax, c.hp!) } : x)) };
    if (c.origin || c.idle !== undefined) {
      s = {
        ...s,
        crew: s.crew.map((x) => (x.id === m.id
          ? { ...x, look: c.origin ? { ...x.look, origin: c.origin as typeof x.look.origin } : x.look, idle: c.idle ?? x.idle }
          : x)),
      };
    }
  });
  scene.crew.forEach((c, i) => {
    if (c.enemy) s = spawnEnemy(s, c.at, 500 + i * 7919);
  });
  own.forEach((c, i) => {
    const m = s.crew[i];
    if (!m || !c.send) return;
    s = sendSelected(selectCrew(s, m.id), c.send) ?? s;
    s = selectCrew(s, null);
  });
  if (scene.damage) s = { ...s, systemDamage: { ...s.systemDamage, ...scene.damage } };
  const sel = own.findIndex((c) => c.selected);
  if (sel >= 0 && s.crew[sel]) s = selectCrew(s, s.crew[sel]!.id);
  return s;
}
