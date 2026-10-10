// Hangar (New Run ship selection): the ships you can flip through with ◀ ▶. Unlocked: the demo ship and your planner
// ship (if there is one); locked: a few random placeholder airships (shipgen) shown dark with LOCKED / "???".
import demoShip from '../data/demo_ship.json';
import { parseShip } from './ship';
import { generateShipRaw } from './shipgen';
import type { Ship } from './types';

export type ShipChoice = 'demo' | 'planner';

export interface HangarShip {
  id: string; // 'planner' | 'server:<id>' | 'demo' | 'locked_<n>'
  name: string; // shown name ('???' when locked)
  locked: boolean;
  ship: Ship;
  raw?: unknown; // server ships: the planner export (handed to the game when chosen)
}

export const LOCKED_SHIPS = 4;

/**
 * All hangar ships in order: your planner ship (TEST IN GAME, if valid), ships saved on the server (planner SAVE TO
 * SERVER), the demo ship, then the locked placeholders.
 */
export function hangarShips(plannerRaw: unknown | null, server: { id: string; raw: unknown }[] = []): HangarShip[] {
  const out: HangarShip[] = [];
  const planner = plannerRaw ? parseShip(plannerRaw).ship : null;
  if (planner) out.push({ id: 'planner', name: planner.name.toUpperCase(), locked: false, ship: planner });
  for (const s of server) {
    const ship = parseShip(s.raw).ship;
    if (ship) out.push({ id: `server:${s.id}`, name: ship.name.toUpperCase(), locked: false, ship, raw: s.raw });
  }
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
