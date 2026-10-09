// Outside the hull: balconies (open platforms hanging out of the hull), their railings and the docks where vehicles
// moor. Pure geometry in ship space ([x, z] meters) – engine-neutral.
import VIEW from '../data/ship_view.json';
import { segmentBox, type Solid } from './ship3d';
import type { Point, Ship, ShipWall } from './types';

const key = ([x, z]: Point) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`;
const edgeKey = (a: Point, b: Point) => [key(a), key(b)].sort().join('|');

export function balconyRoomIds(ship: Ship): Set<string> {
  return new Set(ship.rooms.filter((r) => r.kind === 'balcony').map((r) => r.id));
}

/** Railing edges where a vehicle exit lies = docks (the railing opens there into a gate). */
export function dockEdges(ship: Ship): Set<string> {
  const rails = new Set(ship.walls.filter((w) => w.kind === 'railing').map((w) => edgeKey(w.a, w.b)));
  const out = new Set<string>();
  for (const v of ship.vehicles ?? []) for (const e of v.exits) {
    const k = edgeKey(e.a, e.b);
    if (rails.has(k)) out.add(k);
  }
  return out;
}

export function isDock(ship: Ship, w: ShipWall): boolean {
  return w.kind === 'railing' && dockEdges(ship).has(edgeKey(w.a, w.b));
}

/**
 * A see-through railing: a post at least every metre, a top rail and a middle rail (thin bars, not a wall).
 * Rails carry `segment` so renderers can cut them into short pieces like walls.
 */
export function railingParts(w: ShipWall, height: number = VIEW.railing_height_m): Solid[] {
  const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const n = Math.max(1, Math.ceil(len / 1 - 1e-9));
  const post = 0.09;
  const parts: Solid[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c: Point = [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t];
    parts.push({ kind: 'railing', footprint: segmentBox([c[0] - post / 2, c[1]], [c[0] + post / 2, c[1]], post / 2), z0: 0, z1: height });
  }
  const rail = (z0: number, z1: number): Solid => ({ kind: 'railing', footprint: segmentBox(w.a, w.b, 0.04), z0, z1, segment: { a: w.a, b: w.b, half: 0.04 } });
  parts.push(rail(height - 0.07, height), rail(height * 0.5 - 0.035, height * 0.5 + 0.035));
  return parts;
}

/** Dock gate: two sturdy brass posts at the ends of the railing gap (the vehicle moors between them). */
export function dockGate(w: ShipWall): Solid[] {
  const p = 0.16;
  const gate = (c: Point): Solid => ({ kind: 'door_post', footprint: segmentBox([c[0] - p / 2, c[1]], [c[0] + p / 2, c[1]], p / 2), z0: 0, z1: VIEW.door_frame_height_m, door: 'airlock' });
  return [gate(w.a), gate(w.b)];
}
