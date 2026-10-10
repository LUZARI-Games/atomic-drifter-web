// Crew on board: random crew when the ship file brings none, selecting, sending somewhere, walking along the way,
// opening doors while someone walks through. Pure functions (state) => state – engine-neutral.
import LAB from '../data/crew_lab.json';
import MOVE from '../data/crew_move.json';
import COMBAT from '../data/combat.json';
import PORTRAITS from '../data/portraits.json';
import { CREW_GEAR, CREW_LOOKS, equip, parseCrewLook, type CrewLook, type GearId } from './crew';
import type { Roster, RosterEntry } from './crewdb';
import { seatPose } from './exterior';
import { buildNav, findPath, nodeAt, type NavGraph } from './nav';
import type { CrewMember, GameState, Point, Ship } from './types';

export const WALK_SPEED = MOVE.walk_speed_mps; // top speed, m/s
export const STRIDE_M = MOVE.stride_m; // one step (drives walk cycle + footstep sounds)
/** Desk spot on a console tile: 0.3 m from the tile centre towards the machine. */
const DESK_OFFSET = 0.3;
/** Facing an opponent on one tile: each stands this far from the centre, towards their screen corner (see fightAxis). */
const CORNER_OFFSET = 0.7;

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
/**
 * Random start crew on the consoles, then other deck tiles. With a roster: the database captain + its own crew; with
 * `faction`: that faction's people first, and everyone on board joins it (the start crew all come from one home).
 */
export function generateCrew(ship: Ship, count = 4, seed = hash(ship.name), roster?: Roster, faction?: string): CrewMember[] {
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
  const faces = PORTRAITS.portraits.filter((p) => p.side === 'crew' && p.variant === 1 && p.id !== PORTRAITS.captain_portrait).sort(() => r() - 0.5);
  // crew database (website): captain = its captain-portrait character, then its own crew in random order
  const shuffled = roster ? [...roster.crew].sort(() => r() - 0.5) : [];
  const dbCrew = faction ? [...shuffled.filter((e) => e.faction === faction), ...shuffled.filter((e) => e.faction !== faction)] : shuffled;
  const factionColor = faction ? (CREW_LOOKS.origins as Record<string, { color: string }>)[faction]?.color : undefined;
  const join = (e: RosterEntry): RosterEntry => (faction && e.faction !== faction ? { ...e, faction, clothes: factionColor?.toLowerCase() ?? e.clothes } : e);
  const crew: CrewMember[] = [];
  for (let i = 0; i < Math.min(count, starts.length); i++) {
    if (roster) {
      const picked = i === 0 ? roster.captain ?? dbCrew.shift() : dbCrew[(i - 1) % Math.max(1, dbCrew.length)];
      const entry = picked && join(picked);
      if (entry) {
        const base = pick(bases);
        let gear: GearId[] = [];
        for (const g of gearIds) if (r() < 0.4) gear = equip(gear, g);
        crew.push(placeEntry(ship, starts[i]!, entry, base, gear, r, i));
        continue;
      }
    }
    const any = pick(bases);
    const base = faction && faction in CREW_LOOKS.origins ? { ...any, origin: faction as CrewLook['origin'] } : any;
    let gear: GearId[] = [];
    for (const g of gearIds) if (r() < 0.4) gear = equip(gear, g);
    const face = i === 0 ? PORTRAITS.portraits.find((p) => p.id === PORTRAITS.captain_portrait) : faces[(i - 1) % Math.max(1, faces.length)];
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
    const at = nav.nodes.get(node)!.pos;
    crew.push({
      id: look.id, name: look.name, look, node, dest: node, pos: desk ? [at[0] + desk[0] * DESK_OFFSET, at[1] + desk[1] * DESK_OFFSET] : at, path: [],
      heading: desk ? headingOf(desk) : r() * Math.PI * 2, walked: 0,
      hp: maxHp(look), hpMax: maxHp(look), captain: i === 0, // the first one is the player's captain
      portrait: face?.id,
    });
  }
  return crew;
}

/**
 * Own crew placed in the planner (ship.crew with side 'crew' + a crew database id) at their tiles. The captain is the
 * one marked captain, else the database captain if placed, else the first. Unknown ids / taken tiles are skipped.
 * Empty when nobody was placed (the game then uses `generateCrew`).
 */
export function placedCrew(ship: Ship, roster: Roster, seed = hash(ship.name)): CrewMember[] {
  const nav = navOf(ship);
  const r = seeded(seed);
  const people = [roster.captain, ...roster.crew].filter((e): e is RosterEntry => !!e);
  const spawns = (ship.crew ?? []).filter((c) => c.side === 'crew' && c.id && people.some((e) => e.id === c.id));
  const seen = new Set<string>();
  const unique = spawns.filter((c) => !seen.has(c.id!) && !!seen.add(c.id!));
  const marked = unique.findIndex((c) => c.captain);
  const dbCaptain = unique.findIndex((c) => c.id === roster.captain?.id);
  const capIdx = marked >= 0 ? marked : dbCaptain >= 0 ? dbCaptain : 0;
  const ordered = unique.length ? [unique[capIdx]!, ...unique.filter((_, i) => i !== capIdx)] : [];
  const bases = LAB.map(parseCrewLook).filter((l): l is CrewLook => !!l);
  const used = new Set<string>();
  const crew: CrewMember[] = [];
  for (const sp of ordered) {
    const node = nodeAt(ship, nav, sp.tile);
    if (!node || !node.startsWith('t') || used.has(node)) continue;
    used.add(node);
    const entry = people.find((e) => e.id === sp.id)!;
    crew.push(placeEntry(ship, node, entry, bases[Math.floor(r() * bases.length)]!, [], r, crew.length));
  }
  return crew;
}

/** A crew database character as a crew member at deck node `node` (look: random Crew Lab base, faction = origin). */
function placeEntry(ship: Ship, node: string, e: RosterEntry, base: CrewLook, gear: GearId[], r: () => number, i: number): CrewMember {
  const nav = navOf(ship);
  const origin = e.faction && e.faction in CREW_LOOKS.origins ? (e.faction as CrewLook['origin']) : base.origin;
  const name = i === 0 && !e.name ? 'CAPTAIN' : e.name;
  const look: CrewLook = {
    ...base, id: `crew_${i}`, name, sex: e.sex, build: e.build, origin, gear, clothes: e.clothes, body: e.body,
    skin: Math.floor(r() * CREW_LOOKS.skin_tones.length), hair: Math.floor(r() * CREW_LOOKS.hair_colors.length),
  };
  const desk = consoleOf(ship, node);
  const at = nav.nodes.get(node)!.pos;
  return {
    id: look.id, name, look, node, dest: node, pos: desk ? [at[0] + desk[0] * DESK_OFFSET, at[1] + desk[1] * DESK_OFFSET] : at, path: [],
    heading: desk ? headingOf(desk) : r() * Math.PI * 2, walked: 0,
    hp: e.hp, hpMax: e.hp, hit: e.hit, captain: i === 0, portrait: e.portrait ?? undefined,
  };
}

/** Full health of a crew member / boarder (tanks are tougher). */
export function maxHp(look: CrewLook, side: 'crew' | 'enemy' = 'crew'): number {
  return COMBAT.hp[side][look.build === 'tank' ? 'tank' : 'normal'];
}

const sideOf = (c: CrewMember) => c.side ?? 'crew';
const standing = (c: CrewMember) => c.dying === undefined && c.hp > 0;

/**
 * Where `id` stands on deck tile `node` (one per side per tile): alone → the tile centre (on a console tile: at the
 * desk); with an opponent on the same tile → own crew in the screen-left corner, enemies in the screen-right corner
 * (`state.fightAxis` = ship direction of screen-right). Vehicle seats: the seat.
 */
export function tileSpot(state: GameState, id: string, node: string): Point {
  const base = navOf(state.ship).nodes.get(node)!.pos;
  if (node.startsWith('v')) return base;
  const me = state.crew.find((c) => c.id === id);
  const side = me ? sideOf(me) : 'crew';
  const foe = state.crew.some((o) => o.id !== id && standing(o) && sideOf(o) !== side && o.dest === node);
  if (foe) {
    const k = (side === 'enemy' ? 1 : -1) * CORNER_OFFSET;
    return [base[0] + state.fightAxis[0] * k, base[1] + state.fightAxis[1] * k];
  }
  const desk = consoleOf(state.ship, node);
  return desk ? [base[0] + desk[0] * DESK_OFFSET, base[1] + desk[1] * DESK_OFFSET] : base;
}

/** Deck tile `node` taken by someone else of the same side (standing there or on the way)? */
function taken(state: GameState, id: string, node: string): boolean {
  const me = state.crew.find((c) => c.id === id);
  const side = me ? sideOf(me) : 'crew';
  return state.crew.some((o) => o.id !== id && (standing(o) || o.ko !== undefined) && sideOf(o) === side && o.dest === node);
}

/** `node` if free for `id`, else the nearest free deck tile of the same room (null = room full). */
export function freeTileNear(state: GameState, id: string, node: string): string | null {
  if (node.startsWith('v') || !taken(state, id, node)) return node;
  const nav = navOf(state.ship);
  const room = state.ship.tiles[Number(node.slice(1))]?.room;
  const from = nav.nodes.get(node)!.pos;
  let best: { d: number; id: string } | null = null;
  for (const n of nav.nodes.values()) {
    if (n.vehicle !== null || n.room !== room || n.id === node || taken(state, id, n.id)) continue;
    const d = Math.hypot(n.pos[0] - from[0], n.pos[1] - from[1]);
    if (!best || d < best.d) best = { d, id: n.id };
  }
  return best?.id ?? null;
}

/** Put crew member `id` straight onto the spot under ship point `p` (deck tile or vehicle seat) – test scenes. */
export function placeCrew(state: GameState, id: string, p: Point): GameState {
  const nav = navOf(state.ship);
  const tapped = nodeAt(state.ship, nav, p);
  if (!tapped || !state.crew.some((c) => c.id === id)) return state;
  if (tapped.startsWith('v') && state.crew.some((m) => m.id !== id && m.dest === tapped)) return state; // seat taken
  const node = freeTileNear(state, id, tapped);
  if (!node) return state;
  const pos = tileSpot(state, id, node);
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
  if (id !== null && !state.crew.some((c) => c.id === id && c.side !== 'enemy' && c.dying === undefined && c.ko === undefined)) return state;
  return state.selectedCrewId === id ? state : { ...state, selectedCrewId: id };
}

/** Send the selected crew member to the spot under ship point `p` (deck tile or vehicle seat). */
export function sendSelected(state: GameState, p: Point): GameState | null {
  const id = state.selectedCrewId;
  if (!id) return null;
  const to = roomTarget(state, id, p);
  return to ? moveTo(state, id, to) : state;
}

/**
 * Orders go to ROOMS, not tiles (FTL): the first one sent into a room takes its console tile (operating / repairing),
 * later ones the free tile nearest to the tap. Tapping the room you are already in changes nothing – to swap the
 * operator, send them out and someone else in. Returns the point to walk to (= `p` for vehicle seats), null = nothing to do.
 */
export function roomTarget(state: GameState, id: string, p: Point): Point | null {
  const nav = navOf(state.ship);
  const tapped = nodeAt(state.ship, nav, p);
  const c = state.crew.find((m) => m.id === id);
  if (!tapped || !c || !tapped.startsWith('t')) return p;
  const room = state.ship.tiles[Number(tapped.slice(1))]?.room;
  const mine = c.dest.startsWith('t') ? state.ship.tiles[Number(c.dest.slice(1))]?.room : null;
  if (room && room === mine) return null; // already there (or on the way)
  const desk = state.ship.rooms.find((r) => r.id === room)?.console?.tile;
  const deskNode = desk ? nodeAt(state.ship, nav, desk) : null;
  if (deskNode && !taken(state, id, deskNode)) return nav.nodes.get(deskNode)!.pos;
  return p;
}

/** Walk crew member / boarder `id` to the spot under ship point `p`; null if `p` is not walkable. */
export function moveTo(state: GameState, id: string, p: Point): GameState | null {
  const nav = navOf(state.ship);
  const tapped = nodeAt(state.ship, nav, p);
  if (!tapped) return null;
  const c = state.crew.find((m) => m.id === id);
  if (!c || c.dying !== undefined || c.ko !== undefined) return state;
  // a vehicle seat holds one person; a deck tile one per side – else the nearest free tile of that room
  if (tapped.startsWith('v') && state.crew.some((m) => m.id !== id && m.dest === tapped)) return state;
  const target = freeTileNear(state, id, tapped);
  if (!target) return state; // room full
  const way = findPath(nav, c.node, target);
  if (!way) return state; // unreachable (e.g. behind machinery)
  const end = tileSpot({ ...state, crew: state.crew.map((m) => (m.id === id ? { ...m, dest: target } : m)) }, id, target);
  // walking already: first back to the last spot reached, so nobody cuts through a wall
  const back: Point[] = c.path.length ? [nav.nodes.get(c.node)!.pos] : [];
  const points = [...back, ...way.points.slice(0, -1), end];
  const moved = c.path.length ? (c.moved ?? 0) : 0; // already walking: no new slow start
  return { ...state, crew: state.crew.map((m) => (m.id === id ? { ...m, dest: target, path: points, pathEnd: end, moved, idle: 0 } : m)) };
}

/** Standing at the desk spot of a console (= operating that system). */
export function atDesk(ship: Ship, c: CrewMember): boolean {
  if (c.path.length) return false;
  const desk = consoleOf(ship, c.node);
  const base = navOf(ship).nodes.get(c.node)?.pos;
  return !!desk && !!base && Math.hypot(c.pos[0] - base[0] - desk[0] * DESK_OFFSET, c.pos[1] - base[1] - desk[1] * DESK_OFFSET) < 0.05;
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
