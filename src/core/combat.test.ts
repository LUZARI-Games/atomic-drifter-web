import { describe, expect, it } from 'vitest';
import COMBAT from '../data/combat.json';
import demo from '../data/demo_ship.json';
import meleeShip from '../data/test_ships/melee.json';
import { roomOf, spawnEnemy, spawnShipEnemies, systemBars, tickCombat, workOf } from './combat';
import { generateCrew, moveTo, navOf, placeCrew, selectCrew, sendSelected, tickCrew, tileSpot } from './crewmove';
import { keepDistance, moods } from './mood';
import { createGameState } from './selection';
import { parseShip } from './ship';
import type { GameState } from './types';

const ship = parseShip(demo).ship!;
const start = (): GameState => ({ ...createGameState(ship), crew: generateCrew(ship) });
const run = (s: GameState, seconds: number, dt = 0.1) => {
  for (let t = 0; t < seconds; t += dt) s = tickCombat(tickCrew(s, dt), dt);
  return s;
};
const near = (a: [number, number] | number[], b: [number, number] | number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!) < 0.06;
const centre = (s: GameState, node: string) => navOf(s.ship).nodes.get(node)!.pos;

describe('tile positions', () => {
  it('one own crew member per tile: a second one goes to the nearest free tile of the room', () => {
    let s = start();
    const [a, b] = s.crew;
    s = placeCrew(s, a!.id, [3, 1]); // balcony, tile 1
    s = placeCrew(s, b!.id, [3, 1]); // same tile -> the other balcony tile
    const A = s.crew.find((c) => c.id === a!.id)!;
    const B = s.crew.find((c) => c.id === b!.id)!;
    expect(A.node).not.toBe(B.node);
    expect(roomOf(s, A)).toBe(roomOf(s, B));
    expect(near(A.pos, centre(s, A.node))).toBe(true); // alone -> tile centre
    // sending someone to a full room is refused
    const full = moveTo(s, s.crew[2]!.id, [3, 1]);
    expect(full!.crew.find((c) => c.id === s.crew[2]!.id)!.path).toEqual([]);
  });

  it('crew + enemy on one tile: crew in the screen-left corner, enemy in the screen-right corner', () => {
    let s = start();
    s = { ...s, crew: s.crew.slice(0, 1) };
    s = placeCrew(s, s.crew[0]!.id, [3, 1]);
    s = spawnEnemy(s, [3, 1]);
    s = run(s, 1.5);
    const crew = s.crew.find((c) => c.side !== 'enemy')!;
    const foe = s.crew.find((c) => c.side === 'enemy')!;
    expect(crew.node).toBe(foe.node);
    const c = centre(s, crew.node);
    const ax = s.fightAxis;
    expect((crew.pos[0] - c[0]) * ax[0] + (crew.pos[1] - c[1]) * ax[1]).toBeLessThan(-0.5);
    expect((foe.pos[0] - c[0]) * ax[0] + (foe.pos[1] - c[1]) * ax[1]).toBeGreaterThan(0.5);
  });
});

describe('boarding combat', () => {
  it('a fight starts only once both stand in their corners; someone dies and is removed', () => {
    let s = start();
    const target = s.crew[0]!; // at the engines console
    s = spawnEnemy(s, target.pos);
    const enemy = s.crew.find((c) => c.side === 'enemy')!;
    expect(enemy.node).toBe(target.node);
    s = tickCombat(s, 0.05); // first they step into their corners – no blows yet
    expect(s.crew.find((c) => c.id === target.id)!.fight).toBeUndefined();
    s = run(s, 2);
    expect(s.crew.find((c) => c.id === target.id)!.fight?.target).toBe(enemy.id);
    expect(s.crew.find((c) => c.id === enemy.id)!.fight?.target).toBe(target.id);
    s = run(s, 40);
    expect(s.crew.some((c) => c.id === target.id) && s.crew.some((c) => c.id === enemy.id)).toBe(false);
  });

  it('walking characters are not attacked', () => {
    let s = start();
    s = spawnEnemy(s, s.crew[0]!.pos);
    const enemy = s.crew.find((c) => c.side === 'enemy')!;
    s = { ...s, crew: s.crew.map((c) => (c.id === enemy.id ? { ...c, path: [[5, 5]] } : c)) }; // on its way somewhere
    s = tickCombat(s, 0.5);
    expect(s.crew.some((c) => c.fight)).toBe(false);
  });

  it('idle crew walk onto the tile of a lone enemy in their room', () => {
    let s = start();
    s = { ...s, crew: s.crew.slice(0, 1) };
    s = placeCrew(s, s.crew[0]!.id, [3, 1]);
    s = spawnEnemy(s, [3, -1]); // other balcony tile
    s = run(s, 4);
    const crew = s.crew.find((c) => c.side !== 'enemy')!;
    const foe = s.crew.find((c) => c.side === 'enemy')!;
    expect(crew.node).toBe(foe.node);
  });

  it('enemies cannot be selected', () => {
    let s = spawnEnemy(start(), [3, 1]);
    const enemy = s.crew.find((c) => c.side === 'enemy')!;
    s = selectCrew(s, enemy.id);
    expect(s.selectedCrewId).toBeNull();
  });

  it('sabotage takes 5 s per health bar at the console (bars = power level); crew repair at the desk', () => {
    let s: GameState = { ...createGameState(ship), crew: [], systemBars: { engines: 3 } };
    s = spawnEnemy(s, [1, 3]); // engines console tile -> the desk spot
    expect(systemBars(s, 'engines')).toBe(3);
    expect(workOf(s, s.crew[0]!)).toBe('sabotage');
    const faced = tickCombat(s, 0.05).crew[0]!; // faces the machine (desk direction of the engines console)
    expect(faced.heading).toBeCloseTo(Math.atan2(ship.rooms.find((r) => r.id === 'engines')!.console!.facing[1], ship.rooms.find((r) => r.id === 'engines')!.console!.facing[0]));
    s = run(s, 3 * COMBAT.sabotage_s_per_bar - 1);
    expect(s.systemDamage.engines).toBeLessThan(3);
    s = run(s, 1.5);
    expect(s.systemDamage.engines).toBeCloseTo(3);
    // the boarder moves on to the next system
    expect(s.crew[0]!.path.length).toBeGreaterThan(0);
    const fixer: GameState = { ...s, crew: generateCrew(ship).slice(0, 1) }; // the engines operator
    let f = run(fixer, 0.1);
    expect(workOf(f, f.crew[0]!)).toBe('repair');
    f = run(f, 3 * COMBAT.repair_s_per_bar + 0.5);
    expect(f.systemDamage.engines).toBeUndefined();
  });

  it('planner enemies spawn one per tile', () => {
    const withCrew = parseShip({ ...demo, crew: [{ side: 'enemy', tile: [3, 1] }, { side: 'enemy', tile: [3, 1] }, { tile: 'bad' }] }).ship!;
    const s = spawnShipEnemies({ ...createGameState(withCrew), crew: [] });
    const enemies = s.crew.filter((c) => c.side === 'enemy');
    expect(enemies).toHaveLength(2);
    expect(enemies[0]!.node).not.toBe(enemies[1]!.node);
    expect(near(enemies[0]!.pos, tileSpot(s, enemies[0]!.id, enemies[0]!.node))).toBe(true);
  });
});

describe('room melee (FTL): pairs on one tile, extras fight from their own tile', () => {
  // one room, 5 free tiles; console tile [1, 1]
  const room = parseShip(meleeShip).ship!;
  const setup = (crewAt: [number, number][], enemiesAt: [number, number][]): GameState => {
    let s: GameState = { ...createGameState(room), crew: generateCrew(room, crewAt.length) };
    s.crew.forEach((c, i) => (s = placeCrew(s, c.id, crewAt[i]!)));
    for (const p of enemiesAt) s = spawnEnemy(s, p);
    return s;
  };
  const nodeOf = (p: [number, number]) => navOf(room).nodes.get([...navOf(room).nodes.values()].find((n) => n.pos[0] === p[0] && n.pos[1] === p[1])!.id)!.id;

  it('3 crew vs 2 enemies: two pairs share tiles, the extra crew member stays alone and still hits someone', () => {
    let s = setup([[3, 1], [-1, -1], [3, -1]], [[1, 1], [1, -1]]);
    // until everyone fights (before the first enemy falls)
    for (let i = 0; i < 40 && !s.crew.every((c) => c.fight); i++) s = run(s, 0.1);
    const crew = s.crew.filter((c) => c.side !== 'enemy');
    const foes = s.crew.filter((c) => c.side === 'enemy');
    const pairs = crew.filter((c) => foes.some((e) => e.node === c.node));
    expect(pairs).toHaveLength(2);
    const extra = crew.find((c) => !pairs.includes(c))!;
    expect(foes.some((e) => e.node === extra.node)).toBe(false);
    expect(extra.fight?.target).toBeDefined(); // hits across tiles
    expect(crew.every((c) => c.fight)).toBe(true);
    expect(foes.every((e) => e.fight)).toBe(true);
  });

  it('the console tile is served first: an enemy entering goes to the operator', () => {
    let s = setup([[1, 1], [3, -1]], [[-1, -1]]);
    s = run(s, 3);
    const foe = s.crew.find((c) => c.side === 'enemy')!;
    expect(foe.node).toBe(nodeOf([1, 1]));
  });

  it('walkers are not hit; nobody fights before standing still', () => {
    let s = setup([[3, 1]], [[-1, -1]]);
    const foe = s.crew.find((c) => c.side === 'enemy')!;
    s = { ...s, crew: s.crew.map((c) => (c.id === foe.id ? { ...c, path: [[3, -1]] } : c)) };
    s = tickCombat(s, 0.05);
    expect(s.crew.some((c) => c.fight)).toBe(false);
  });
});

describe('knock-out, med bay, room orders', () => {
  const room = parseShip(meleeShip).ship!;
  it('own crew at 0 HP are knocked out (stay, cannot be selected), wake with 10 % after the last enemy is gone', () => {
    let s: GameState = { ...createGameState(room), crew: generateCrew(room, 1) };
    s = placeCrew(s, s.crew[0]!.id, [3, 1]);
    s = { ...s, crew: s.crew.map((c) => ({ ...c, hp: 1 })) };
    s = spawnEnemy(s, [3, -1]);
    s = run(s, 4);
    const me = s.crew.find((c) => c.side !== 'enemy')!;
    expect(me.ko).toBeDefined();
    expect(me.hp).toBe(0);
    expect(selectCrew(s, me.id).selectedCrewId).toBeNull();
    s = { ...s, crew: s.crew.filter((c) => c.side !== 'enemy') }; // enemy beaten
    s = run(s, COMBAT.ko_wake_after_s + 0.3);
    const up = s.crew[0]!;
    expect(up.ko).toBeUndefined();
    expect(up.hp).toBe(Math.ceil(up.hpMax * COMBAT.ko_wake_share));
  });

  it('a working med bay heals own crew 5 HP per second until full (enemies are not healed)', () => {
    const med = { ...room, rooms: room.rooms.map((r) => ({ ...r, system: 'medbay' })) };
    let s: GameState = { ...createGameState(med), crew: generateCrew(med, 1) };
    s = placeCrew(s, s.crew[0]!.id, [3, 1]);
    s = { ...s, crew: s.crew.map((c) => ({ ...c, hp: 4 })) };
    s = run(s, 1.05);
    expect(s.crew[0]!.hp).toBe(4 + COMBAT.medbay_heal_per_s);
    s = run(s, 20);
    expect(s.crew[0]!.hp).toBe(s.crew[0]!.hpMax);
  });

  it('orders go to rooms: the first one in takes the console tile, tapping your own room does nothing', () => {
    let s: GameState = { ...createGameState(ship), crew: generateCrew(ship, 1) };
    s = placeCrew(s, s.crew[0]!.id, [3, 1]); // balcony
    s = selectCrew(s, s.crew[0]!.id);
    const sent = sendSelected(s, [1, 3])!; // engines room (its console tile is [1, 3])
    const c = sent.crew[0]!;
    expect(navOf(ship).nodes.get(c.dest)!.pos).toEqual([1, 3]);
    const again = sendSelected(s, [3, -1])!; // other balcony tile = same room
    expect(again.crew[0]!.path).toEqual([]);
  });

  it('HP from the data: crew 25 / tank 40, enemies 20 / tank 30, every blow 4', () => {
    expect(COMBAT.hp).toEqual({ crew: { normal: 25, tank: 40 }, enemy: { normal: 20, tank: 30 } });
    expect(COMBAT.hit_damage).toBe(4);
  });
});

describe('moods', () => {
  const two = (sameOrigin: boolean): GameState => {
    let s = start();
    const [a, b] = s.crew;
    const other = (a!.look.origin === 'deserter' ? 'ironmall' : 'deserter') as GameState['crew'][number]['look']['origin'];
    const look = sameOrigin ? a!.look : { ...a!.look, origin: other };
    s = { ...s, crew: [a!, { ...b!, look: { ...b!.look, origin: look.origin } }] };
    s = placeCrew(s, a!.id, [3, 1]); // the two balcony tiles
    s = placeCrew(s, b!.id, [3, -1]);
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

  it('wary crew keep their distance: nobody shares a tile any more (one per tile)', () => {
    const s = keepDistance(two(false));
    expect(s.crew[0]!.node).not.toBe(s.crew[1]!.node);
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
