import { describe, expect, it } from 'vitest';
import demo from '../data/demo_ship.json';
import { generateCrew } from './crewmove';
import { createGameState } from './selection';
import { parseShip } from './ship';
import { addAmmo, addScrap, crewHealth, damageHull } from './status';

const ship = parseShip(demo).ship!;
const start = () => ({ ...createGameState(ship), crew: generateCrew(ship) });

describe('ship status', () => {
  it('hull stays within 0…max; scrap never negative; ammo capped', () => {
    let s = start();
    s = damageHull(s, 999);
    expect(s.status.hull).toBe(0);
    s = damageHull(s, -999);
    expect(s.status.hull).toBe(s.status.hullMax);
    s = addScrap(s, -1e9);
    expect(s.status.scrap).toBe(0);
    s = addAmmo(s, 1e9);
    expect(s.status.ammo).toBe(s.status.ammoMax);
  });

  it('the first crew member is the captain; everyone starts at full health', () => {
    const s = start();
    expect(s.crew[0]!.captain).toBe(true);
    expect(s.crew.filter((c) => c.captain)).toHaveLength(1);
    expect(s.crew.every((c) => crewHealth(s, c.id) === 1)).toBe(true);
  });

  it('crew get named portraits from the roster (captain: power armour), no one twice', () => {
    const s = start();
    expect(s.crew[0]!.portrait).toBe('power_armor');
    const ids = s.crew.map((c) => c.portrait);
    expect(new Set(ids).size).toBe(ids.length);
    expect(s.crew.slice(1).every((c) => c.portrait && c.name !== 'CAPTAIN')).toBe(true);
  });
});
