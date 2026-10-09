// Crew on board: random crew when the ship file brings none, selecting, sending somewhere, walking along the way,
// opening doors while someone walks through. Pure functions (state) => state – engine-neutral.
import LAB from '../data/crew_lab.json';
import MOVE from '../data/crew_move.json';
import START from '../data/run_start.json';
import PORTRAITS from '../data/portraits.json';
import { CREW_GEAR, CREW_LOOKS, equip, parseCrewLook, type CrewLook, type GearId } from './crew';
import { seatPose } from './exterior';
import { buildNav, findPath, nodeAt, type NavGraph } from './nav';
import type { CrewMember, GameState, Point, Ship } from './types';

export const WALK_SPEED = MOVE.walk_speed_mps; // top speed, m/s
export const STRIDE_M = MOVE.stride_m; // one step (drives walk cycle + footstep sounds)
const SLOTS: Point[] = [[-0.45, -0.45], [0.45, 0.45], [-0.45, 0.45], [0.45, -0.45]]; // up to 4 crew share a deck tile
/** Console tile: first spot = at the desk (operator), the others stay clear of the desk. (forward = towards the desk, side) */
const CONSOLE_SLOTS: Point[] = [[0.3, 0], [-0.45, -0.45], [-0.45, 0.45], [-0.45, 0]];

/** Speed share (0…1): picks up over the first meters of a way, slows down before the end. */
export function walkFactor(moved: number, left: number): number {
  const r = MOVE.ramp_m;
  const start = MOVE.start_speed_share + (1 - MOVE.start_speed_share) * Math.min(1, moved / r);
  const end = Math.max(0.3, Math.min(1, left / r));
  return Math.min(start, end);
}

/** The console a deck node belongs to (the direction from the tile to the machine), or null. */
export function consoleOf(ship: Ship, node: string): Point | null {
  const nav = navOf(ship);
  for (const rm of ship.rooms) if (rm.console && nodeAt(ship, nav, rm.console.tile) === node) return rm.console.facing;
  return null;
}
const headingOf = (f: Point) => Math.atan2(f[1], f[0]);

/** The seat pose for a vehicle node ("v<vehicle>:<tile>"), or null for deck tiles. */
export function seatOf(ship: Ship, node: string) {
  const m = /^v(\d+):(\d+)$/.exec(node);
  return m ? seatPose(ship, Number(m[1]), Number(m[2])) : null;
}
const NAMES = ['HANK', 'MAE', 'GUS', 'IRIS', 'VERN', 'DOT', 'ABE', 'LULA', 'SILAS', 'RUTH', 'JED', 'NELL', 'OTIS', 'PEARL', 'WADE', 'FAY'];

const navCache = new WeakMap<Ship, NavGraph>();
/** Walk graph of a ship, built once per ship. */
export function navOf(ship: Ship): NavGraph {
  let n = navCache.get(ship);
  if (!n) navCache.set(ship, (n = buildNav(ship)));
  return n;
}

/** Small seeded random (same ship -> same crew). */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const hash = (t: string) => [...t].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/** Random crew from the Crew Lab types: origin, build and gear vary; they start at the consoles, then on free deck. */
export function generateCrew(ship: Ship, count = 4, seed = hash(ship.name)): CrewMember[] {
  const nav = navOf(ship);
  const r = seeded(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!;
  const bases = LAB.map(parseCrewLook).filter((l): l is CrewLook => !!l);
  const gearIds = Object.keys(CREW_GEAR.items) as GearId[];
  const consoleNodes = ship.rooms.flatMap((rm) => (rm.console ? [nodeAt(ship, nav, rm.console.tile)] : [])).filter((n): n is string => !!n);
  const deck = [...nav.nodes.values()].filter((n) => n.vehicle === null && ship.rooms.find((rm) => rm.id === n.room)?.kind !== 'balcony').map((n) => n.id);
  const starts = [...consoleNodes, ...deck.filter((d) => !consoleNodes.includes(d)).sort(() => r() - 0.5)];
  const names = [...NAMES].sort(() => r() - 0.5);
  // own crew = named characters from the portrait roster (captain: the power-armour portrait); name + sex follow it
  const roster = PORTRAITS.portraits.filter((p) => p.side === 'crew' && p.variant === 1 && p.id !== PORTRAITS.captain_portrait).sort(() => r() - 0.5);
  const crew: CrewMember[] = [];
  for (let i = 0; i < Math.min(count, starts.length); i++) {
    const base = pick(bases);
    let gear: GearId[] = [];
    for (const g of gearIds) if (r() < 0.4) gear = equip(gear, g);
    const face = i === 0 ? PORTRAITS.portraits.find((p) => p.id === PORTRAITS.captain_portrait) : roster[(i - 1) % Math.max(1, roster.length)];
    const look: CrewLook = {
      ...base,
      id: `crew_${i}`,
      name: i === 0 ? 'CAPTAIN' : face?.name ?? names[i % names.length]!,
      sex: face ? (face.sex as CrewLook['sex']) : r() < 0.5 ? 'male' : 'female',
      skin: Math.floor(r() * CREW_LOOKS.skin_tones.length),
      hair: Math.floor(r() * CREW_LOOKS.hair_colors.length),
      gear,
    };
    const node = starts[i]!;
    const desk = consoleOf(ship, node);
    crew.push({
      id: look.id, name: look.name, look, node, dest: node, pos: spot(ship, crew, node, look.id), path: [],
      heading: desk ? headingOf(desk) : r() * Math.PI * 2, walked: 0,
      hp: START.crew_hp, hpMax: START.crew_hp, captain: i === 0, // the first one is the player's captain
      portrait: face?.id,
    });
  }
  return crew;
}

/** Free standing spot on a node: deck tiles have 4 slots, a vehicle seat one. */
function spot(ship: Ship, others: CrewMember[], node: string, self: string): Point {
  const base = navOf(ship).nodes.get(node)!.pos;
  if (node.startsWith('v')) return base;
  const desk = consoleOf(ship, node);
  const slots: Point[] = desk ? CONSOLE_SLOTS.map(([f, s]) => [f * desk[0] - s * desk[1], f * desk[1] + s * desk[0]]) : SLOTS;
  const used = new Set(others.filter((c) => c.id !== self && c.dest === node).map((c) => {
    const d: Point = [c.pathEnd?.[0] ?? c.pos[0], c.pathEnd?.[1] ?? c.pos[1]];
    return slots.findIndex((s) => Math.hypot(base[0] + s[0] - d[0], base[1] + s[1] - d[1]) < 0.05);
  }));
  const free = slots.findIndex((_, i) => !used.has(i));
  const s = slots[free < 0 ? 0 : free]!;
  return [base[0] + s[0], base[1] + s[1]];
}

/** Put crew member `id` straight onto the spot under ship point `p` (deck tile or vehicle seat) – test scenes. */
export function placeCrew(state: GameState, id: string, p: Point): GameState {
  const nav = navOf(state.ship);
  const node = nodeAt(state.ship, nav, p);
  if (!node || !state.crew.some((c) => c.id === id)) return state;
  if (node.startsWith('v') && state.crew.some((m) => m.id !== id && m.dest === node)) return state; // seat taken
  const pos = spot(state.ship, state.crew, node, id);
  const seat = seatOf(state.ship, node);
  const desk = consoleOf(state.ship, node);
  return {
    ...state,
    crew: state.crew.map((c) => (c.id === id
      ? { ...c, node, dest: node, pos, path: [], pathEnd: undefined, moved: 0, heading: seat ? seat.heading : desk ? headingOf(desk) : c.heading }
      : c)),
  };
}

export function selectCrew(state: GameState, id: string | null): GameState {
  if (id !== null && !state.crew.some((c) => c.id === id)) return state;
  return state.selectedCrewId === id ? state : { ...state, selectedCrewId: id };
}

/** Send the selected crew member to the spot under ship point `p` (deck tile or vehicle seat). */
export function sendSelected(state: GameState, p: Point): GameState | null {
  const id = state.selectedCrewId;
  if (!id) return null;
  const nav = navOf(state.ship);
  const target = nodeAt(state.ship, nav, p);
  if (!target) return null;
  const c = state.crew.find((m) => m.id === id)!;
  // a vehicle seat holds one person
  if (target.startsWith('v') && state.crew.some((m) => m.id !== id && m.dest === target)) return state;
  const way = findPath(nav, c.node, target);
  if (!way) return state; // unreachable (e.g. behind machinery)
  const end = spot(state.ship, state.crew, target, id);
  // walking already: first back to the last spot reached, so nobody cuts through a wall
  const back: Point[] = c.path.length ? [nav.nodes.get(c.node)!.pos] : [];
  const points = [...back, ...way.points.slice(0, -1), end];
  const moved = c.path.length ? (c.moved ?? 0) : 0; // already walking: no new slow start
  return { ...state, crew: state.crew.map((m) => (m.id === id ? { ...m, dest: target, path: points, pathEnd: end, moved } : m)) };
}

/** Advance everybody along their way by `dt` seconds. */
export function tickCrew(state: GameState, dt: number): GameState {
  if (!state.crew.some((c) => c.path.length)) return state;
  const crew = state.crew.map((c): CrewMember => {
    if (!c.path.length) return c;
    let pos = c.pos;
    let rest = 0;
    for (let i = 0, p = c.pos; i < c.path.length; p = c.path[i]!, i++) rest += Math.hypot(c.path[i]![0] - p[0], c.path[i]![1] - p[1]);
    const go = WALK_SPEED * walkFactor(c.moved ?? 0, rest) * dt;
    let left = go;
    let path = c.path;
    let heading = c.heading;
    while (left > 0 && path.length) {
      const [tx, tz] = path[0]!;
      const dx = tx - pos[0];
      const dz = tz - pos[1];
      const d = Math.hypot(dx, dz);
      if (d > 1e-6) heading = Math.atan2(dz, dx);
      if (d <= left) {
        pos = [tx, tz];
        left -= d;
        path = path.slice(1);
      } else {
        pos = [pos[0] + (dx / d) * left, pos[1] + (dz / d) * left];
        left = 0;
      }
    }
    const walked = c.walked + go - left;
    const moved = (c.moved ?? 0) + go - left;
    if (path.length) return { ...c, pos, path, heading, walked, moved };
    // arrived: at a console turn to the desk, in a vehicle face the driving direction
    const desk = consoleOf(state.ship, c.dest);
    const seat = seatOf(state.ship, c.dest);
    const face = seat ? seat.heading : desk ? headingOf(desk) : heading;
    return { ...c, pos, path, heading: face, walked, moved: 0, node: c.dest, pathEnd: undefined };
  });
  return { ...state, crew };
}

/** Doors someone is walking through right now (within 1.2 m of the door on their way) – they open by themselves. */
export function doorsInUse(state: GameState): number[] {
  const out: number[] = [];
  state.ship.doors.forEach((d, i) => {
    if (state.crew.some((c) => c.path.length && Math.hypot(c.pos[0] - d.center[0], c.pos[1] - d.center[1]) < 1.2)) out.push(i);
  });
  return out;
}

export function selectedCrew(state: GameState): CrewMember | null {
  return state.crew.find((c) => c.id === state.selectedCrewId) ?? null;
}
