// Hangar (New Run ship selection): the ships you can flip through with ◀ ▶. Unlocked: the demo ship and your planner
// ship (if there is one); locked: a few random placeholder airships (shipgen) shown dark with LOCKED / "???".
import demoShip from '../data/demo_ship.json';
import { parseShip } from './ship';
import { generateShipRaw } from './shipgen';
import type { Ship } from './types';

export type ShipChoice = 'demo' | 'planner';

export interface HangarShip {
  id: string; // 'demo' | 'planner' | 'locked_<n>'
  name: string; // shown name ('???' when locked)
  locked: boolean;
  ship: Ship;
}

export const LOCKED_SHIPS = 4;

/** All hangar ships in order: your planner ship first (if valid), the demo ship, then the locked placeholders. */
export function hangarShips(plannerRaw: unknown | null): HangarShip[] {
  const out: HangarShip[] = [];
  const planner = plannerRaw ? parseShip(plannerRaw).ship : null;
  if (planner) out.push({ id: 'planner', name: planner.name.toUpperCase(), locked: false, ship: planner });
  const demo = parseShip(demoShip).ship!;
  out.push({ id: 'demo', name: demo.name.toUpperCase(), locked: false, ship: demo });
  for (let i = 0; i < LOCKED_SHIPS; i++) {
    const ship = parseShip(generateShipRaw(4242 + i * 977)).ship;
    if (ship) out.push({ id: `locked_${i}`, name: '???', locked: true, ship });
  }
  return out;
}

/** Index after flipping by `step` (wraps around). */
export function flip(count: number, index: number, step: number): number {
  return (((index + step) % count) + count) % count;
}

/** Index of the remembered choice (falls back to the first unlocked ship). */
export function indexOfChoice(ships: HangarShip[], choice: string | null): number {
  const i = ships.findIndex((s) => s.id === choice && !s.locked);
  return i >= 0 ? i : Math.max(0, ships.findIndex((s) => !s.locked));
}
