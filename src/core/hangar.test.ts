import { describe, expect, it } from 'vitest';
import demo from '../data/demo_ship.json';
import { flip, hangarShips, indexOfChoice, LOCKED_SHIPS } from './hangar';
import { navOf } from './crewmove';
import { parseShip } from './ship';
import { generateShipRaw } from './shipgen';

describe('random placeholder ships', () => {
  it('load like planner ships, are seeded, have walkable console tiles and doors between rooms', () => {
    for (const seed of [1, 2, 3, 99]) {
      const { ship, problems } = parseShip(generateShipRaw(seed));
      expect(problems).toEqual([]);
      expect(ship).not.toBeNull();
      expect(ship!.rooms.length).toBeGreaterThanOrEqual(4);
      expect(ship!.doors.length).toBe(ship!.rooms.length - 1);
      const nav = navOf(ship!);
      expect(nav.nodes.size).toBe(ship!.rooms.length); // one floor tile per room
      expect(JSON.stringify(generateShipRaw(seed))).toBe(JSON.stringify(generateShipRaw(seed)));
    }
  });
});

describe('hangar', () => {
  it('planner ship first, then demo, then locked placeholders', () => {
    const list = hangarShips(demo);
    expect(list.map((s) => s.id)).toEqual(['planner', 'demo', ...Array.from({ length: LOCKED_SHIPS }, (_, i) => `locked_${i}`)]);
    expect(list.filter((s) => s.locked).every((s) => s.name === '???')).toBe(true);
    expect(hangarShips(null)[0]!.id).toBe('demo');
    expect(hangarShips({ broken: true })[0]!.id).toBe('demo');
  });
  it('flipping wraps; remembered choices never land on a locked ship', () => {
    expect(flip(5, 0, -1)).toBe(4);
    expect(flip(5, 4, 1)).toBe(0);
    const list = hangarShips(null);
    expect(indexOfChoice(list, 'locked_0')).toBe(0);
    expect(indexOfChoice(list, 'planner')).toBe(0);
    expect(list[indexOfChoice(list, 'demo')]!.id).toBe('demo');
  });
});
