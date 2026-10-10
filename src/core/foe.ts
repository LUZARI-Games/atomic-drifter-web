// Ship fights: an enemy airship (a generated ship crewed by Sentinels from the crew database) flies alongside ours.
// Both sides' guns fire at rooms: every projectile hits everyone in the room (combat.ts hitRoom / hitFoeRoom).
// Its gunnery is telegraphed: it picks one of our rooms, aims for a while (the room glows red), fires a burst, rests.
// Its guns work while someone is alive in its weapons room. Everyone aboard down = beaten: it drifts off and is gone.
// Pure functions, engine-neutral. Numbers in src/data/foe.json.
import FOE from '../data/foe.json';
import { generateCrew, hash, maxHp } from './crewmove';
import type { Roster } from './crewdb';
import { parseShip } from './ship';
import { generateShipRaw } from './shipgen';
import type { CrewMember, FoeShip, GameState, Point, Ship } from './types';
import { applyHits, mountWeapons, roomCentre, stepGuns, type TurretMode } from './weapons';

const alive = (c: CrewMember) => c.dying === undefined && c.hp > 0;

/** x extent (port/starboard) of a ship's deck incl. balconies and vehicles. */
function widthOf(ship: Ship): [number, number] {
  const xs = [...ship.tiles, ...(ship.vehicles ?? []).flatMap((v) => v.tiles)].flatMap((t) => t.polygon.map((p) => p[0]));
  return [Math.min(...xs), Math.max(...xs)];
}
function zMid(ship: Ship): number {
  const zs = ship.tiles.flatMap((t) => t.polygon.map((p) => p[1]));
  return (Math.min(...zs) + Math.max(...zs)) / 2;
}

/** A Sentinel gunship pulls up on our port side (away from the viewer), crewed by Sentinels from the database. */
export function spawnFoe(state: GameState, seed: number = FOE.seed): GameState {
  // a gunship has a weapons room: the first generated ship from `seed` on that has one
  let raw = generateShipRaw(seed);
  for (let k = 1; k < 50 && !(raw.rooms as { system: string }[]).some((r) => r.system === 'weapons'); k++) raw = generateShipRaw(seed + k);
  const ship = { ...parseShip(raw).ship!, name: FOE.name };
  const [ourMin] = widthOf(state.ship);
  const [, foeMax] = widthOf(ship);
  const offset: Point = [ourMin - FOE.gap_m - foeMax, zMid(state.ship) - zMid(ship)];
  return { ...state, foe: { ship, offset, crew: foeCrew(ship, state.roster, seed), weapons: mountWeapons(ship), ai: { phase: 'rest', timer: FOE.first_rest_s, shotsLeft: 0 } } };
}

/** Its crew: database characters of the foe faction at the consoles (weapons first), else Crew Lab Sentinels. */
function foeCrew(ship: Ship, roster: Roster | undefined, seed: number): CrewMember[] {
  const people = roster?.enemies.filter((e) => e.faction === FOE.faction) ?? [];
  const sub: Roster | undefined = roster && people.length ? { ...roster, captain: null, crew: people } : undefined;
  // the weapons console is manned first: put that room first while placing
  const order = { ...ship, rooms: [...ship.rooms].sort((a, b) => Number(b.system === 'weapons') - Number(a.system === 'weapons')) };
  return generateCrew(order, FOE.crew, seed + hash(ship.name), sub, FOE.faction).map((c, i) => {
    const hp = sub ? c.hp : maxHp(c.look, 'enemy');
    return { ...c, id: `foe_${i}`, side: 'enemy' as const, captain: false, hp, hpMax: hp };
  });
}

const roomOfFoe = (foe: FoeShip, c: CrewMember) => foe.ship.tiles[Number(c.node.slice(1))]?.room;

/** Someone alive at the enemy guns (its weapons room; a ship without one: anyone aboard). */
export function foeGunsManned(foe: FoeShip): boolean {
  const gunRooms = foe.ship.rooms.filter((r) => r.system === 'weapons').map((r) => r.id);
  return foe.crew.some((c) => alive(c) && (!gunRooms.length || gunRooms.includes(roomOfFoe(foe, c)!)));
}

/** Everyone aboard the enemy ship is down. */
export const foeBeaten = (foe: FoeShip): boolean => !foe.crew.some(alive);

/** The room the enemy guns are telegraphing / firing at (on our ship), if any. */
export function foeThreat(state: GameState): string | null {
  const f = state.foe;
  return f && f.ai.phase !== 'rest' ? f.weapons.target : null;
}

/** Our room the enemy aims at next: the one with the most of our people standing in it (any room if empty). */
function pickTarget(state: GameState, seed: number): string | null {
  const count = new Map<string, number>();
  for (const c of state.crew) {
    if (c.side === 'enemy' || c.ko !== undefined || c.hp <= 0) continue;
    const room = state.ship.tiles[Number(c.node.slice(1))]?.room;
    if (room && roomCentre(state.ship, room)) count.set(room, (count.get(room) ?? 0) + 1);
  }
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];
  const rooms = state.ship.rooms.filter((r) => r.kind !== 'balcony' && roomCentre(state.ship, r.id));
  return rooms.length ? rooms[Math.abs(seed) % rooms.length]!.id : null;
}

/** One step of the enemy ship: dying crew, gunnery (rest -> aim -> fire), its projectiles hitting our rooms. */
export function tickFoe(state: GameState, dt: number): GameState {
  const f0 = state.foe;
  if (!f0) return state;
  const crew = f0.crew.map((c) => (c.dying !== undefined ? { ...c, dying: c.dying - dt } : c)).filter((c) => c.dying === undefined || c.dying > 0);
  let foe: FoeShip = { ...f0, crew };
  if (foeBeaten(foe)) {
    const beaten = (foe.beaten ?? 0) + dt;
    if (beaten >= FOE.leave_after_s && !foe.weapons.shots.length) {
      const w = state.weapons;
      return { ...state, foe: undefined, weapons: w?.targetFoe ? { ...w, target: null, targetFoe: false } : w };
    }
    foe = { ...foe, beaten };
  }
  // gunnery
  let ai = foe.ai;
  let w = foe.weapons;
  const setMode = (mode: TurretMode, when: (m: TurretMode) => boolean) => ({ ...w, turrets: w.turrets.map((t) => (when(t.mode) ? { ...t, mode, queue: [] } : t)) });
  if (!foeGunsManned(foe)) {
    w = { ...setMode('down', (m) => m === 'on' || m === 'up'), target: null };
    ai = { phase: 'rest', timer: FOE.rest_s, shotsLeft: 0 };
  } else {
    w = setMode('up', (m) => m === 'off' || m === 'down');
    const timer = ai.timer - dt;
    if (ai.phase === 'rest' && timer <= 0) {
      w = { ...w, target: pickTarget(state, Math.floor(w.fired + state.crew.length * 31)), targetFoe: false };
      ai = { phase: 'aim', timer: FOE.aim_s, shotsLeft: 0 };
    } else if (ai.phase === 'aim' && timer <= 0) ai = { phase: 'fire', timer: 0, shotsLeft: FOE.burst_shots * w.turrets.length };
    else ai = { ...ai, timer };
  }
  const aimAt = w.target ? roomCentre(state.ship, w.target) : null;
  const before = w.fired;
  const { weapons, landed } = stepGuns(w, dt, aimAt, foe.offset, ai.phase === 'fire');
  if (ai.phase === 'fire') {
    const shotsLeft = ai.shotsLeft - (weapons.fired - before);
    ai = shotsLeft <= 0 ? { phase: 'rest', timer: FOE.rest_s, shotsLeft: 0 } : { ...ai, shotsLeft };
  }
  const next: GameState = { ...state, foe: { ...foe, ai, weapons: ai.phase === 'rest' ? { ...weapons, target: null } : weapons } };
  return applyHits(next, landed);
}
