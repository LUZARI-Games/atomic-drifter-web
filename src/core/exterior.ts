// Outside the hull: balconies (open platforms hanging out of the hull), their railings and the docks where vehicles
// moor. Pure geometry in ship space ([x, z] meters) – engine-neutral.
import VIEW from '../data/ship_view.json';
import { segmentBox, type Solid } from './ship3d';
import type { Point, Ship, ShipVehicle, ShipWall } from './types';

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

/**
 * How a vehicle lies at its dock: `u` = along the dock edge (its driving direction), `w` = away from the ship,
 * `dock` = the railing edge it is moored to (null = not docked; then it simply faces the ship's length).
 */
export function vehicleFrame(ship: Ship, v: ShipVehicle): { center: Point; u: Point; w: Point; dock: { a: Point; b: Point } | null } {
  const n = v.tiles.length;
  const center: Point = [v.tiles.reduce((s, t) => s + t.center[0], 0) / n, v.tiles.reduce((s, t) => s + t.center[1], 0) / n];
  const docks = dockEdges(ship);
  const dock = v.exits.find((e) => docks.has(edgeKey(e.a, e.b))) ?? null;
  let u: Point = [0, 1];
  if (dock) {
    const l = Math.hypot(dock.b[0] - dock.a[0], dock.b[1] - dock.a[1]) || 1;
    u = [(dock.b[0] - dock.a[0]) / l, (dock.b[1] - dock.a[1]) / l];
  }
  let w: Point = [-u[1], u[0]];
  if (dock) {
    const m: Point = [(dock.a[0] + dock.b[0]) / 2, (dock.a[1] + dock.b[1]) / 2];
    if ((center[0] - m[0]) * w[0] + (center[1] - m[1]) * w[1] < 0) w = [-w[0], -w[1]];
  }
  return { center, u, w, dock };
}

/** Half depth of a vehicle body seen from its dock (car body is wide, a bike is slim). */
const BODY_HALF: Record<string, number> = { car: 0.95, sidecar: 0.2, bike: 0.2 };

/**
 * Docking arms: two short brass arms from the (closed) railing out to the vehicle body, so the vehicle visibly hangs
 * on the balcony. Crew climb over the railing to get in.
 */
export function dockArms(ship: Ship, v: ShipVehicle): Solid[] {
  const { u, w, dock, center } = vehicleFrame(ship, v);
  if (!dock) return [];
  const m: Point = [(dock.a[0] + dock.b[0]) / 2, (dock.a[1] + dock.b[1]) / 2];
  const along = (p: Point) => (p[0] - m[0]) * w[0] + (p[1] - m[1]) * w[1];
  // the body nearest to the railing: the car's own centre, for bikes the tile closest to the dock
  const near = v.type === 'car' ? along(center) : Math.min(...v.tiles.map((t) => along(t.center)));
  const reach = Math.max(0.15, near - (BODY_HALF[v.type] ?? 0.3));
  const len = Math.hypot(dock.b[0] - dock.a[0], dock.b[1] - dock.a[1]);
  return [-0.25, 0.25].map((f): Solid => {
    const s: Point = [m[0] + u[0] * f * len, m[1] + u[1] * f * len];
    const e: Point = [s[0] + w[0] * reach, s[1] + w[1] * reach];
    return { kind: 'dock_arm', footprint: segmentBox(s, e, 0.05), z0: 0.5, z1: 0.62 };
  });
}
