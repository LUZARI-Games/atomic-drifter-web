import { describe, expect, it } from 'vitest';
import FOE from '../data/foe.json';
import demo from '../data/demo_ship.json';
import { rosterFrom, SEED_DB } from './crewdb';
import { generateCrew } from './crewmove';
import { foeBeaten, foeGunsManned, foeThreat, spawnFoe, tickFoe } from './foe';
import { inFight, togglePause } from './pause';
import { createGameState } from './selection';
import { parseShip } from './ship';
import type { GameState } from './types';
import { roomPoint, setWeaponTarget, tickWeapons, toggleTurret } from './weapons';

const ship = parseShip(demo).ship!;
const roster = rosterFrom(SEED_DB);
const start = (): GameState => spawnFoe({ ...createGameState(ship), crew: generateCrew(ship, 3, 7, roster), roster });
const run = (s: GameState, seconds: number, dt = 0.02) => {
  for (let t = 0; t < seconds; t += dt) s = tickFoe(tickWeapons(s, dt), dt);
  return s;
};
const foeRoom = (s: GameState, i: number) => s.foe!.ship.tiles[Number(s.foe!.crew[i]!.node.slice(1))]!.room!;

describe('enemy ship', () => {
  it('a Sentinel gunship pulls up on the port side, crewed by database Sentinels, its guns manned', () => {
    const s = start();
    const f = s.foe!;
    const ourMinX = Math.min(...ship.tiles.flatMap((t) => t.polygon.map((p) => p[0])));
    expect(Math.max(...f.ship.tiles.flatMap((t) => t.polygon.map((p) => p[0] + f.offset[0])))).toBeLessThan(ourMinX);
    expect(f.crew).toHaveLength(FOE.crew);
    expect(f.crew.every((c) => c.side === 'enemy' && c.look.origin === 'sentinel')).toBe(true);
    expect(f.crew.every((c) => roster.enemies.some((e) => e.name === c.name))).toBe(true);
    expect(foeGunsManned(f)).toBe(true);
    expect(f.weapons.turrets.length).toBeGreaterThan(0);
  });

  it('it telegraphs: rests, then aims at our most crowded room, then fires – everyone there gets hit', () => {
    let s = start();
    expect(foeThreat(s)).toBeNull();
    s = run(s, FOE.first_rest_s + 0.1);
    const target = foeThreat(s)!;
    expect(s.foe!.ai.phase).toBe('aim');
    const inTarget = s.crew.filter((c) => ship.tiles[Number(c.node.slice(1))]!.room === target);
    expect(inTarget.length).toBeGreaterThan(0);
    const hp = inTarget.map((c) => c.hp);
    s = run(s, FOE.aim_s - 0.2);
    expect(s.crew.filter((c) => inTarget.some((x) => x.id === c.id)).map((c) => c.hp)).toEqual(hp); // nothing yet: time to clear the room
    s = run(s, 6);
    expect(s.crew.filter((c) => inTarget.some((x) => x.id === c.id)).some((c) => c.hp < hp[0]!)).toBe(true);
  });

  it('our guns hit rooms on the enemy ship; kill its gunners and its guns go quiet; all down = it leaves', () => {
    let s = start();
    const turrets = s.weapons!.turrets.length;
    for (let i = 0; i < turrets; i++) s = toggleTurret(s, i);
    expect(roomPoint(s, foeRoom(s, 0), true)).not.toBeNull();
    // shoot every room with someone in it until all are down
    for (let k = 0; k < 8 && !foeBeaten(s.foe!); k++) {
      const alive = s.foe!.crew.findIndex((c) => c.dying === undefined && c.hp > 0);
      s = setWeaponTarget(s, foeRoom(s, alive), true);
      s = run(s, 4);
      if (k === 0) expect(foeGunsManned(s.foe!)).toBe(false); // the weapons room is manned first
    }
    expect(foeBeaten(s.foe!)).toBe(true);
    expect(inFight(s)).toBe(false);
    s = run(s, FOE.leave_after_s + 1);
    expect(s.foe).toBeUndefined();
  });
});

describe('P.A.U.S.E.', () => {
  it('starts only during a fight, always switches off', () => {
    const calm = { ...createGameState(ship), crew: generateCrew(ship, 2) };
    expect(togglePause(calm).paused).toBeFalsy();
    const fight = start();
    expect(inFight(fight)).toBe(true);
    const p = togglePause(fight);
    expect(p.paused).toBe(true);
    expect(togglePause(p).paused).toBe(false);
  });
});
