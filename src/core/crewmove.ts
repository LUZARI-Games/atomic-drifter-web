// Crew on board: random crew when the ship file brings none, selecting, sending somewhere, walking along the way,
// opening doors while someone walks through. Pure functions (state) => state – engine-neutral.
import LAB from '../data/crew_lab.json';
import { CREW_GEAR, CREW_LOOKS, equip, parseCrewLook, type CrewLook, type GearId } from './crew';
import { buildNav, findPath, nodeAt, type NavGraph } from './nav';
import type { CrewMember, GameState, Point, Ship } from './types';

export const WALK_SPEED = 1.5; // m/s
const SLOTS: Point[] = [[-0.45, -0.45], [0.45, 0.45], [-0.45, 0.45], [0.45, -0.45]]; // up to 4 crew share a deck tile
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
  const crew: CrewMember[] = [];
  for (let i = 0; i < Math.min(count, starts.length); i++) {
    const base = pick(bases);
    let gear: GearId[] = [];
    for (const g of gearIds) if (r() < 0.4) gear = equip(gear, g);
    const look: CrewLook = {
      ...base,
      id: `crew_${i}`,
      name: names[i % names.length]!,
      sex: r() < 0.5 ? 'male' : 'female',
      skin: Math.floor(r() * CREW_LOOKS.skin_tones.length),
      hair: Math.floor(r() * CREW_LOOKS.hair_colors.length),
      gear,
    };
    const node = starts[i]!;
    crew.push({ id: look.id, name: look.name, look, node, dest: node, pos: spot(ship, crew, node, look.id), path: [], heading: 0, walked: 0 });
  }
  return crew;
}

/** Free standing spot on a node: deck tiles have 4 slots, a vehicle seat one. */
function spot(ship: Ship, others: CrewMember[], node: string, self: string): Point {
  const base = navOf(ship).nodes.get(node)!.pos;
  if (node.startsWith('v')) return base;
  const used = new Set(others.filter((c) => c.id !== self && c.dest === node).map((c) => {
    const d: Point = [c.pathEnd?.[0] ?? c.pos[0], c.pathEnd?.[1] ?? c.pos[1]];
    return SLOTS.findIndex((s) => Math.hypot(base[0] + s[0] - d[0], base[1] + s[1] - d[1]) < 0.05);
  }));
  const free = SLOTS.findIndex((_, i) => !used.has(i));
  const s = SLOTS[free < 0 ? 0 : free]!;
  return [base[0] + s[0], base[1] + s[1]];
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
  return { ...state, crew: state.crew.map((m) => (m.id === id ? { ...m, dest: target, path: points, pathEnd: end } : m)) };
}

/** Advance everybody along their way by `dt` seconds. */
export function tickCrew(state: GameState, dt: number): GameState {
  if (!state.crew.some((c) => c.path.length)) return state;
  const crew = state.crew.map((c): CrewMember => {
    if (!c.path.length) return c;
    let pos = c.pos;
    let left = WALK_SPEED * dt;
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
    const walked = c.walked + WALK_SPEED * dt - left;
    return path.length ? { ...c, pos, path, heading, walked } : { ...c, pos, path, heading, walked, node: c.dest, pathEnd: undefined };
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
