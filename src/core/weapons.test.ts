import { describe, expect, it } from 'vitest';
import COMBAT from '../data/combat.json';
import demo from '../data/demo_ship.json';
import { hitRoom, roomOf, spawnEnemy } from './combat';
import { generateCrew, placeCrew } from './crewmove';
import { airshipHull } from './hull';
import { createGameState } from './selection';
import { parseShip } from './ship';
import { generateShipRaw } from './shipgen';
import type { GameState } from './types';
import { anyActive, deactivateAll, mountWeapons, setWeaponTarget, tickWeapons, toggleTurret } from './weapons';

const ship = parseShip(demo).ship!;
const start = (): GameState => ({ ...createGameState(ship), crew: generateCrew(ship, 2), weapons: mountWeapons(ship) });
const run = (s: GameState, seconds: number, dt = 0.02) => {
  for (let t = 0; t < seconds; t += dt) s = tickWeapons(s, dt);
  return s;
};

describe('weapon mounts', () => {
  it('turrets sit on the hull sides, clear of the drives; a side blocked by the balcony gives its spots away', () => {
    const h = airshipHull(ship);
    expect(h.turrets.length).toBeGreaterThan(0);
    for (const t of h.turrets) for (const l of h.lifters) expect(Math.hypot(t.at[0] - l.at[0], t.at[1] - l.at[1])).toBeGreaterThan(l.radius + t.radius);
    expect(new Set(h.turrets.map((t) => t.side)).size).toBe(1); // demo: balcony + car on the port side
    const plain = parseShip(generateShipRaw(4242)).ship!;
    expect(new Set(airshipHull(plain).turrets.map((t) => t.side))).toEqual(new Set([-1, 1]));
  });
});

describe('room hits', () => {
  it('every character in the hit room loses 20 HP – friend and foe; 0 HP = KO / dying', () => {
    let s: GameState = { ...createGameState(ship), crew: generateCrew(ship, 2) };
    s = placeCrew(s, s.crew[0]!.id, [3, 1]);
    s = placeCrew(s, s.crew[1]!.id, [1, 3]);
    s = spawnEnemy(s, [3, -1]);
    const room = roomOf(s, s.crew[0]!)!;
    const hp0 = s.crew[0]!.hp;
    s = hitRoom(s, room);
    expect(s.crew[0]!.hp).toBe(hp0 - COMBAT.turret_hit_damage);
    expect(s.crew[1]!.hp).toBe(s.crew[1]!.hpMax); // other room
    expect(s.crew.find((c) => c.side === 'enemy')!.hp).toBeLessThan(s.crew.find((c) => c.side === 'enemy')!.hpMax);
    s = hitRoom(hitRoom(s, room), room);
    expect(s.crew[0]!.ko).toBeDefined();
    expect(s.crew.find((c) => c.side === 'enemy')!.dying).toBeDefined();
  });
});

describe('turrets', () => {
  it('tap = power up; a target room = turn there and keep firing; projectiles hit the room', () => {
    let s = start();
    s = placeCrew(s, s.crew[0]!.id, [1, 3]); // engine room of our own ship
    s = toggleTurret(s, 0);
    expect(anyActive(s)).toBe(true);
    s = run(s, 0.8);
    expect(s.weapons!.turrets[0]!.mode).toBe('on');
    s = setWeaponTarget(s, 'engines');
    const hp = s.crew[0]!.hp;
    s = run(s, 5);
    expect(s.weapons!.fired).toBeGreaterThan(3); // keeps firing
    expect(s.crew[0]!.hp < hp || s.crew[0]!.ko !== undefined).toBe(true);
  });

  it('switched off: holds fire, turns back to rest and goes dark', () => {
    let s = run(setWeaponTarget(run(toggleTurret(start(), 0), 0.8), 'engines'), 3);
    s = deactivateAll(s);
    const fired = s.weapons!.fired;
    s = run(s, 4);
    const t = s.weapons!.turrets[0]!;
    expect(t.mode).toBe('off');
    expect(Math.abs(Math.atan2(Math.sin(t.yaw - t.rest), Math.cos(t.yaw - t.rest)))).toBeLessThan(0.03);
    expect(s.weapons!.fired).toBe(fired);
    expect(s.weapons!.target).toBeNull();
  });
});
