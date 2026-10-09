// Which ship to show: the one sent from the planner (TEST IN GAME) or the demo ship.
import { parseShip } from '../core/ship';
import type { Ship } from '../core/types';
import demoShip from '../data/demo_ship.json';

/** Key the planner's TEST IN GAME button writes the exported ship to (see public/planner/bridge.js). */
export const TEST_SHIP_KEY = 'adw.testShip';

export function loadShip(useSaved = true): { ship: Ship; source: 'planner' | 'demo'; problems: string[] } {
  const demo = parseShip(demoShip).ship!;
  let raw: string | null = null;
  try {
    if (useSaved) raw = localStorage.getItem(TEST_SHIP_KEY);
  } catch {
    /* storage blocked – use the demo ship */
  }
  if (!raw) return { ship: demo, source: 'demo', problems: [] };
  try {
    const { ship, problems } = parseShip(JSON.parse(raw));
    return ship ? { ship, source: 'planner', problems } : { ship: demo, source: 'demo', problems };
  } catch {
    return { ship: demo, source: 'demo', problems: ['SAVED SHIP IS DAMAGED'] };
  }
}

/** The ship data as it was loaded (planner export from TEST IN GAME, else the demo ship) – for COPY SHIP. */
export function rawShipText(): string {
  try {
    const raw = localStorage.getItem(TEST_SHIP_KEY);
    if (raw) return raw;
  } catch {
    /* storage blocked */
  }
  return JSON.stringify(demoShip);
}
