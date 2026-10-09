// Heights for the look-down views: every wall, door frame and system block becomes a flat footprint + height range.
// Half walls (1 m) so you can look into the rooms. Pure geometry in ship space ([x, z] meters) – engine-neutral.
import VIEW from '../data/ship_view.json';
import type { Point, Ship, ShipDoor, ShipWall } from './types';

export const SHIP_HEIGHTS = VIEW;

export type SolidKind = 'wall' | 'railing' | 'door_post' | 'door_lintel';

export interface Solid {
  kind: SolidKind;
  /** Convex footprint on the deck, ship space. */
  footprint: Point[];
  z0: number;
  z1: number;
  door?: ShipDoor['kind'];
}

/** Rectangle around segment a-b: `half` to each side, extended by `ext` past both ends. */
export function segmentBox(a: Point, b: Point, half: number, ext = 0): Point[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const d: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const n: Point = [-d[1], d[0]];
  const p = (base: Point, sd: number, sn: number): Point => [base[0] + d[0] * sd + n[0] * sn, base[1] + d[1] * sd + n[1] * sn];
  return [p(a, -ext, -half), p(b, ext, -half), p(b, ext, half), p(a, -ext, half)];
}

export function wallSolid(w: ShipWall): Solid {
  const t = VIEW.wall_thickness_m[w.kind];
  // ends extended by half the thickness so corners close without gaps
  return {
    kind: w.kind === 'railing' ? 'railing' : 'wall',
    footprint: segmentBox(w.a, w.b, t / 2, t / 2),
    z0: 0,
    z1: w.kind === 'railing' ? VIEW.railing_height_m : VIEW.wall_height_m,
  };
}

/** End points of the door opening. axis = the ship axis the opening runs along. */
export function doorEnds(d: ShipDoor): [Point, Point] {
  const h = d.width / 2;
  return d.axis === 'x'
    ? [[d.center[0] - h, d.center[1]], [d.center[0] + h, d.center[1]]]
    : [[d.center[0], d.center[1] - h], [d.center[0], d.center[1] + h]];
}

/** Door frame: a post at each end of the opening + a lintel on top, taller than the half walls. */
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
    { kind: 'door_lintel', footprint: segmentBox(a, b, depth * 0.8), z0: top - post, z1: top, door: d.kind },
  ];
}

/** Floor plate in the opening (drawn flat on the deck). */
export function doorThreshold(d: ShipDoor): Point[] {
  const [a, b] = doorEnds(d);
  return segmentBox(a, b, VIEW.wall_thickness_m.hull * 0.9);
}

export function shipSolids(ship: Ship): Solid[] {
  return [...ship.walls.map(wallSolid), ...ship.doors.flatMap(doorFrame)];
}
