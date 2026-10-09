import { describe, expect, it } from 'vitest';
import COMBAT from '../data/combat.json';
import demo from '../data/demo_ship.json';
import { roomOf, spawnEnemy, spawnShipEnemies, SYSTEM_MAX_DAMAGE, tickCombat } from './combat';
import { generateCrew, placeCrew, selectCrew } from './crewmove';
import { keepDistance, moods } from './mood';
import { createGameState } from './selection';
import { parseShip } from './ship';
import type { GameState } from './types';

const ship = parseShip(demo).ship!;
const start = (): GameState => ({ ...createGameState(ship), crew: generateCrew(ship) });
const run = (s: GameState, seconds: number, dt = 0.1) => {
  for (let t = 0; t < seconds; t += dt) s = tickCombat(s, dt);
  return s;
};

describe('boarding combat', () => {
  it('an enemy in a room with crew starts a melee; someone dies and is removed', () => {
    let s = start();
    const target = s.crew[0]!;
    s = spawnEnemy(s, target.pos);
    const enemy = s.crew.find((c) => c.side === 'enemy')!;
    expect(roomOf(s, enemy)).toBe(roomOf(s, target));
    s = run(s, 0.6);
    expect(s.crew.find((c) => c.id === target.id)!.fight?.target).toBe(enemy.id);
    expect(s.crew.find((c) => c.id === enemy.id)!.fight?.target).toBe(target.id);
    s = run(s, 30);
    expect(s.crew.some((c) => c.id === target.id) && s.crew.some((c) => c.id === enemy.id)).toBe(false);
  });

  it('enemies cannot be selected', () => {
    let s = spawnEnemy(start(), [1, 1]);
    const enemy = s.crew.find((c) => c.side === 'enemy')!;
    s = selectCrew(s, enemy.id);
    expect(s.selectedCrewId).toBeNull();
  });

  it('a lone boarder wrecks a system; crew repair it once the room is clear', () => {
    let s: GameState = { ...createGameState(ship), crew: [] };
    s = spawnEnemy(s, [1, 3]); // engines floor
    s = run(s, (SYSTEM_MAX_DAMAGE / COMBAT.boarder_damage_per_s) + 1);
    expect(s.systemDamage.engines).toBeCloseTo(SYSTEM_MAX_DAMAGE);
    // the boarder then walks to the next system
    expect(s.crew[0]!.path.length + (roomOf(s, s.crew[0]!) !== 'engines' ? 1 : 0)).toBeGreaterThan(0);
    const fixer: GameState = { ...s, crew: generateCrew(ship).slice(0, 1) };
    const fixed = run(placeCrew(fixer, fixer.crew[0]!.id, [1, 3]), SYSTEM_MAX_DAMAGE / COMBAT.repair_per_s + 1);
    expect(fixed.systemDamage.engines).toBeUndefined();
  });

  it('planner enemies spawn on their tiles', () => {
    const withCrew = parseShip({ ...demo, crew: [{ side: 'enemy', tile: [1, 3] }, { side: 'enemy', tile: [1, 3] }, { tile: 'bad' }] }).ship!;
    const s = spawnShipEnemies({ ...createGameState(withCrew), crew: [] });
    expect(s.crew.filter((c) => c.side === 'enemy')).toHaveLength(2);
    expect(new Set(s.crew.map((c) => `${c.pos}`)).size).toBe(2); // different spots on the tile
  });
});

describe('moods', () => {
  const two = (sameOrigin: boolean): GameState => {
    let s = start();
    const [a, b] = s.crew;
    const other = (a!.look.origin === 'deserter' ? 'ironmall' : 'deserter') as GameState['crew'][number]['look']['origin'];
    const look = sameOrigin ? a!.look : { ...a!.look, origin: other };
    s = { ...s, crew: [a!, { ...b!, look: { ...b!.look, origin: look.origin } }] };
    s = placeCrew(s, a!.id, [1, 1]);
    s = placeCrew(s, b!.id, [1, 1]);
    return s;
  };

  it('same origin in one room: one tells, the other listens', () => {
    const m = moods(two(true));
    const roles = [...m.values()].map((x) => (x.kind === 'chat' ? x.role : x.kind)).sort();
    expect(roles).toEqual(['listener', 'teller']);
  });

  it('different origins in one room: both wary', () => {
    const m = moods(two(false));
    expect([...m.values()].every((x) => x.kind === 'wary')).toBe(true);
    expect(m.size).toBe(2);
  });

  it('wary crew on the same tile: one walks away to another tile of the room', () => {
    let s = two(false);
    s = { ...s, crew: s.crew.map((c) => ({ ...c, idle: 5 })) };
    s = placeCrew(s, s.crew[0]!.id, [3, 1]);
    s = placeCrew(s, s.crew[1]!.id, [3, 1]); // both on the balcony tile
    const moved = keepDistance(s);
    expect(moved.crew.filter((c) => c.path.length)).toHaveLength(1);
  });

  it('alone with nothing to do: bored after a while, sits down later', () => {
    let s = start();
    s = { ...s, crew: s.crew.slice(0, 1) };
    s = placeCrew(s, s.crew[0]!.id, [3, 1]); // balcony – no console
    s = { ...s, crew: s.crew.map((c) => ({ ...c, idle: 0 })) };
    expect(moods(s).get(s.crew[0]!.id)).toBeUndefined();
    s = run(s, COMBAT.bored_after_s + 0.5);
    expect(moods(s).get(s.crew[0]!.id)?.kind).toBe('bored');
    s = run(s, COMBAT.sit_after_s + 2);
    const m = moods(s).get(s.crew[0]!.id);
    expect(m?.kind === 'bored' && m.sit).toBe(1);
  });
});
