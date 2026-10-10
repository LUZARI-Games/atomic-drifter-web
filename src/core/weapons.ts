// Ship weapons (web: the machine gun). Turrets sit on outriggers along the hull sides (airshipHull().turrets).
// Tap a turret = on / off (short power-up), with turrets on a tap on a room = their target (own ship too); they keep
// firing at their own rate until switched off. Aiming = heavy servo like the Godot TURRET TEST rig: reaction delay,
// limited acceleration + top speed, late braking. Each projectile flies to the room and hits EVERY character in it
// (combat.ts hitRoom, combat.json turret_hit_damage). Pure functions (state, dt) => state – engine-neutral.
import WEAPONS from '../data/weapons.json';
import { hitRoom } from './combat';
import { airshipHull } from './hull';
import type { GameState, Point, Ship } from './types';

const GUN = WEAPONS.machine_gun;
const RAD = Math.PI / 180;

export type TurretMode = 'off' | 'up' | 'on' | 'down';

export interface Turret {
  at: Point; // pad centre (ship space)
  side: number; // -1 port / +1 starboard
  mount: Point; // where the arm meets the hull
  radius: number;
  rest: number; // yaw at rest: pointing out over the side (ship-space heading, radians)
  yaw: number;
  yawVel: number; // rad/s
  goal: number;
  queue: { t: number; yaw: number }[]; // aim commands waiting for the reaction delay
  mode: TurretMode;
  power: number; // 0 dark … 1 powered
  cooldown: number;
  recoil: number; // 0 … 1, the barrels kick back on every shot
  barrel: number; // which of the two barrels fires next
  clock: number;
}

export interface Shot {
  from: Point;
  to: Point;
  fromH: number;
  toH: number;
  t: number;
  dur: number;
  room: string;
  turret: number;
}

export interface Weapons {
  turrets: Turret[];
  target: string | null; // room the turrets fire at
  shots: Shot[];
  impacts: { at: Point; h: number; t: number }[]; // for hit flashes (renderer), 0.35 s each
  fired: number; // shots fired in total (sounds)
}

/** Turret mounts of a ship, all switched off and pointing outwards. */
export function mountWeapons(ship: Ship): Weapons {
  const turrets = airshipHull(ship).turrets.map((m): Turret => {
    const rest = m.side > 0 ? 0 : Math.PI;
    return { ...m, rest, yaw: rest, yawVel: 0, goal: rest, queue: [], mode: 'off', power: 0, cooldown: 0, recoil: 0, barrel: 0, clock: 0 };
  });
  return { turrets, target: null, shots: [], impacts: [], fired: 0 };
}

const weaponsOf = (s: GameState): Weapons => s.weapons ?? mountWeapons(s.ship);
export const isActive = (t: Turret) => t.mode === 'on' || t.mode === 'up';
export const anyActive = (s: GameState) => !!s.weapons?.turrets.some(isActive);

/** Switch turret `i` on (power-up) or off (turns back to rest, powers down). The last one off clears the target. */
export function toggleTurret(state: GameState, i: number): GameState {
  const w = weaponsOf(state);
  const t = w.turrets[i];
  if (!t) return state;
  const turrets = w.turrets.map((x, k) => (k !== i ? x : { ...x, mode: (isActive(x) ? 'down' : 'up') as TurretMode, queue: [] }));
  const target = turrets.some(isActive) ? w.target : null;
  return { ...state, weapons: { ...w, turrets, target } };
}

/** Target room for all turrets that are on (null = hold fire). */
export function setWeaponTarget(state: GameState, room: string | null): GameState {
  const w = weaponsOf(state);
  return w.target === room ? state : { ...state, weapons: { ...w, target: room } };
}

/** All turrets off. */
export function deactivateAll(state: GameState): GameState {
  const w = weaponsOf(state);
  if (!w.turrets.some(isActive)) return state;
  return { ...state, weapons: { ...w, target: null, turrets: w.turrets.map((t) => (isActive(t) ? { ...t, mode: 'down' as TurretMode, queue: [] } : t)) } };
}

/** Centre of a room's walkable floor (all tiles if it has none). */
export function roomCentre(ship: Ship, room: string): Point | null {
  const floor = ship.tiles.filter((t) => t.room === room && !t.machinery);
  const tiles = floor.length ? floor : ship.tiles.filter((t) => t.room === room);
  if (!tiles.length) return null;
  return [tiles.reduce((s, t) => s + t.center[0], 0) / tiles.length, tiles.reduce((s, t) => s + t.center[1], 0) / tiles.length];
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Heavy servo: accelerate to top speed, brake a bit late (small overshoot), settle. */
function servo(pos: number, vel: number, goal: number, dt: number): [number, number] {
  const max = GUN.yaw_max_speed_deg * RAD;
  const acc = GUN.yaw_accel_deg * RAD;
  const err = goal - pos;
  if (Math.abs(err) < 0.001 && Math.abs(vel) < 0.02) return [goal, 0];
  const stop = ((vel * vel) / (2 * acc)) * GUN.brake_late;
  let want = Math.sign(err) * max;
  if (Math.sign(err) === Math.sign(vel) && Math.abs(err) <= stop) want = 0;
  const dv = acc * dt;
  vel = vel < want ? Math.min(want, vel + dv) : Math.max(want, vel - dv);
  return [pos + vel * dt, vel];
}

/** Where a turret's active barrel ends (ship space) – projectiles start there. */
export function muzzleOf(t: Turret): Point {
  const side = (t.barrel ? 1 : -1) * 0.08;
  return [t.at[0] + Math.cos(t.yaw) * GUN.muzzle_m - Math.sin(t.yaw) * side, t.at[1] + Math.sin(t.yaw) * GUN.muzzle_m + Math.cos(t.yaw) * side];
}

/** One weapons step: power up / down, aim (reaction delay + servo), fire when on target, projectiles, room hits. */
export function tickWeapons(state: GameState, dt: number): GameState {
  const w = state.weapons;
  if (!w || (!w.turrets.some((t) => t.mode !== 'off' || t.recoil > 0) && !w.shots.length && !w.impacts.length)) return state;
  const aimAt = w.target ? roomCentre(state.ship, w.target) : null;
  const newShots: Shot[] = [];
  let fired = w.fired;
  const turrets = w.turrets.map((t0, i): Turret => {
    let t = { ...t0, clock: t0.clock + dt, recoil: Math.max(0, t0.recoil - dt * 6), cooldown: t0.cooldown - dt };
    if (t.mode === 'up') {
      const power = Math.min(1, t.power + dt / GUN.power_up_s);
      t = { ...t, power, mode: power >= 1 ? 'on' : 'up' };
    }
    // goal: the target room while on, else rest; new aim points reach the servo after the reaction delay
    const want = t.mode === 'on' && aimAt ? Math.atan2(aimAt[1] - t.at[1], aimAt[0] - t.at[0]) : t.rest;
    const cont = t.yaw + wrap(want - t.yaw); // no full spins
    const queue = Math.abs(wrap(cont - (t.queue.at(-1)?.yaw ?? t.goal))) > 1e-4 ? [...t.queue, { t: t.clock, yaw: cont }] : t.queue;
    let goal = t.goal;
    const left = queue.filter((q) => {
      if (t.clock - q.t >= GUN.reaction_delay_s) {
        goal = q.yaw;
        return false;
      }
      return true;
    });
    const [yaw, yawVel] = servo(t.yaw, t.yawVel, goal, dt);
    t = { ...t, yaw, yawVel, goal, queue: left };
    if (t.mode === 'down') {
      const power = Math.max(0, t.power - dt / GUN.power_down_s);
      t = { ...t, power, mode: power <= 0 && Math.abs(wrap(t.yaw - t.rest)) < 0.02 ? 'off' : 'down' };
    }
    // fire: on, a target, on aim, cooled down
    if (t.mode === 'on' && aimAt && w.target && t.cooldown <= 0 && Math.abs(wrap(want - t.yaw)) < GUN.aim_tolerance_deg * RAD && Math.abs(wrap(goal - want)) < 1e-3) {
      const from = muzzleOf(t);
      const dur = Math.max(0.03, Math.hypot(aimAt[0] - from[0], aimAt[1] - from[1]) / GUN.projectile_speed_mps);
      newShots.push({ from, to: aimAt, fromH: GUN.height_m, toH: GUN.target_height_m, t: 0, dur, room: w.target, turret: i });
      fired++;
      t = { ...t, cooldown: GUN.fire_interval_s, recoil: 1, barrel: 1 - t.barrel };
    }
    return t;
  });
  // projectiles fly; on arrival every character in that room is hit
  let next: GameState = state;
  const shots: Shot[] = [];
  const impacts = w.impacts.map((m) => ({ ...m, t: m.t + dt })).filter((m) => m.t < 0.35);
  for (const s of [...w.shots, ...newShots]) {
    const t = s.t + dt;
    if (t < s.dur) shots.push({ ...s, t });
    else {
      next = hitRoom(next, s.room);
      impacts.push({ at: s.to, h: s.toH, t: 0 });
    }
  }
  return { ...next, weapons: { ...w, turrets, shots, impacts, fired } };
}
