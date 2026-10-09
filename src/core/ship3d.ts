// Heights for the look-down views: every wall, door frame and system block becomes a flat footprint + height range.
// Half walls (1 m) so you can look into the rooms. Pure geometry in ship space ([x, z] meters) – engine-neutral.
import VIEW from '../data/ship_view.json';
import type { Point, Ship, ShipConsole, ShipDoor, ShipWall } from './types';

export const SHIP_HEIGHTS = VIEW;

export type SolidKind = 'wall' | 'railing' | 'door_post' | 'door_panel' | 'console' | 'dock_arm';

export interface Solid {
  kind: SolidKind;
  /** Convex footprint on the deck, ship space. */
  footprint: Point[];
  z0: number;
  z1: number;
  door?: ShipDoor['kind'];
  /** Walls only: centre line + half thickness, so a renderer can cut long walls into short pieces. */
  segment?: { a: Point; b: Point; half: number };
}

/** Rectangle around segment a-b: `half` to each side, extended by `ext` past both ends. */
export function segmentBox(a: Point, b: Point, half: number, ext = 0): Point[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const d: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const n: Point = [-d[1], d[0]];
  const p = (base: Point, sd: number, sn: number): Point => [base[0] + d[0] * sd + n[0] * sn, base[1] + d[1] * sd + n[1] * sn];
  return [p(a, -ext, -half), p(b, ext, -half), p(b, ext, half), p(a, -ext, half)];
}

/** Wall height: the ship's own value from the planner export wins, else the default from ship_view.json. */
export function wallHeight(ship: Pick<Ship, 'wall_height'>): number {
  const h = ship.wall_height;
  return typeof h === 'number' && h > 0 && h < 10 ? h : VIEW.wall_height_m;
}

export function wallSolid(w: ShipWall, height: number = VIEW.wall_height_m): Solid {
  const t = VIEW.wall_thickness_m[w.kind];
  // ends extended by half the thickness so corners close without gaps
  return {
    kind: w.kind === 'railing' ? 'railing' : 'wall',
    footprint: segmentBox(w.a, w.b, t / 2, t / 2),
    z0: 0,
    z1: w.kind === 'railing' ? VIEW.railing_height_m : height,
    segment: { a: w.a, b: w.b, half: t / 2 },
  };
}

/**
 * Cut a wall into pieces of at most `maxLen` meters (for back-to-front drawing in diagonal views).
 * Only the first and last piece are extended past the wall ends, so the pieces butt together without overlap.
 */
export function wallPieces(s: Solid, maxLen = 1): { footprint: Point[]; first: boolean; last: boolean }[] {
  if (!s.segment) return [{ footprint: s.footprint, first: true, last: true }];
  const { a, b, half } = s.segment;
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen - 1e-9));
  const lerp = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return Array.from({ length: n }, (_, i) => {
    const box = segmentBox(lerp(i / n), lerp((i + 1) / n), half);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const d: Point = [((b[0] - a[0]) / len) * half, ((b[1] - a[1]) / len) * half];
    if (i === 0) for (const k of [0, 3]) box[k] = [box[k]![0] - d[0], box[k]![1] - d[1]];
    if (i === n - 1) for (const k of [1, 2]) box[k] = [box[k]![0] + d[0], box[k]![1] + d[1]];
    return { footprint: box, first: i === 0, last: i === n - 1 };
  });
}

/** End points of the door opening. axis = the ship axis the opening runs along. */
export function doorEnds(d: ShipDoor): [Point, Point] {
  const h = d.width / 2;
  return d.axis === 'x'
    ? [[d.center[0] - h, d.center[1]], [d.center[0] + h, d.center[1]]]
    : [[d.center[0], d.center[1] - h], [d.center[0], d.center[1] + h]];
}

/** Door frame: one slim post at each end of the opening, a little taller than the half walls (no top beam). */
export function doorFrame(d: ShipDoor): Solid[] {
  const [a, b] = doorEnds(d);
  const depth = VIEW.wall_thickness_m.hull / 2 + 0.04;
  const post = VIEW.door_post_m;
  const top = VIEW.door_frame_height_m;
  const dir: Point = [(b[0] - a[0]) / d.width, (b[1] - a[1]) / d.width];
  const at = (p: Point, s: number): Point => [p[0] + dir[0] * s, p[1] + dir[1] * s];
  return [
    { kind: 'door_post', footprint: segmentBox(at(a, -post / 2), at(a, post / 2), depth), z0: 0, z1: top, door: d.kind },
    { kind: 'door_post', footprint: segmentBox(at(b, -post / 2), at(b, post / 2), depth), z0: 0, z1: top, door: d.kind },
  ];
}

/**
 * The two door leaves, sliding sideways into the walls. `open` 0 = closed (leaves meet in the middle),
 * 1 = fully open (both leaves inside the walls, nothing left in the opening).
 */
export function doorLeaves(d: ShipDoor, open: number, height: number = VIEW.wall_height_m): Solid[] {
  const o = Math.min(1, Math.max(0, open));
  const [a, b] = doorEnds(d);
  const half = (d.width / 2) * (1 - o);
  if (half < 0.01) return [];
  const dir: Point = [(b[0] - a[0]) / d.width, (b[1] - a[1]) / d.width];
  const at = (p: Point, s: number): Point => [p[0] + dir[0] * s, p[1] + dir[1] * s];
  const t = VIEW.door_panel_thickness_m / 2;
  const h = height * 0.96;
  return [
    { kind: 'door_panel', footprint: segmentBox(a, at(a, half), t), z0: 0, z1: h, door: d.kind },
    { kind: 'door_panel', footprint: segmentBox(at(b, -half), b, t), z0: 0, z1: h, door: d.kind },
  ];
}

/** Floor plate in the opening (drawn flat on the deck). */
export function doorThreshold(d: ShipDoor): Point[] {
  const [a, b] = doorEnds(d);
  return segmentBox(a, b, VIEW.wall_thickness_m.hull * 0.9);
}

export function shipSolids(ship: Ship): Solid[] {
  const h = wallHeight(ship);
  return [...ship.walls.map((w) => wallSolid(w, h)), ...ship.doors.flatMap(doorFrame), ...consoleSolids(ship)];
}

/**
 * Console (the "keyboard"): a shelf in the system's colour fixed to the FRONT of the machinery block, facing the console
 * tile. It fills the gap between block and tile edge and overhangs the tile a little; lower than the block so it reads
 * as part of it. Returns its footprint and the key plate on its top.
 */
export function consoleDesk(c: ShipConsole, tileSize = 2): { footprint: Point[]; keys: Point[]; height: number } {
  const [fx, fz] = c.facing;
  const edge: Point = [c.tile[0] + fx * (tileSize / 2), c.tile[1] + fz * (tileSize / 2)];
  const at = (along: number, across: number): Point => [edge[0] + fx * along - fz * across, edge[1] + fz * along + fx * across];
  const over = 0.28; // overhang over the floor tile
  const into = 0.32; // up to the block face (blocks keep a 0.32 m gap to the tile edge)
  const half = 0.5; // half length of the shelf
  return {
    footprint: [at(-over, -half), at(into, -half), at(into, half), at(-over, half)],
    keys: [at(-over + 0.07, -half + 0.08), at(into - 0.1, -half + 0.08), at(into - 0.1, half - 0.08), at(-over + 0.07, half - 0.08)],
    height: VIEW.console_height_m,
  };
}

/** Console desks of all rooms that have a console spot. */
export function consoleSolids(ship: Ship): Solid[] {
  return ship.rooms.flatMap((r) => {
    if (!r.console) return [];
    const d = consoleDesk(r.console, ship.tile_size);
    return [{ kind: 'console' as const, footprint: d.footprint, z0: 0, z1: d.height }];
  });
}
