// Test scenes for quick checks: `?test=<name>` puts crew straight into a set situation (seats, deck spots, walking)
// and points the camera at it – see src/data/test_scenes.json. Ships pasted from the owner (COPY SHIP) can be stored
// in src/data/test_ships/ and used by name.
import SCENES from '../data/test_scenes.json';
import { placeCrew, selectCrew, sendSelected } from '../core/crewmove';
import type { GameState, Point } from '../core/types';

interface SceneCrew {
  at: Point;
  send?: Point;
  selected?: boolean;
}
export interface TestScene {
  name: string;
  ship?: string;
  crew: SceneCrew[];
  focus?: Point;
  zoom?: number;
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
  scene.crew.forEach((c, i) => {
    const m = s.crew[i];
    if (!m) return;
    s = placeCrew(s, m.id, c.at);
  });
  scene.crew.forEach((c, i) => {
    const m = s.crew[i];
    if (!m || !c.send) return;
    s = sendSelected(selectCrew(s, m.id), c.send) ?? s;
    s = selectCrew(s, null);
  });
  const sel = scene.crew.findIndex((c) => c.selected);
  if (sel >= 0 && s.crew[sel]) s = selectCrew(s, s.crew[sel]!.id);
  return s;
}
