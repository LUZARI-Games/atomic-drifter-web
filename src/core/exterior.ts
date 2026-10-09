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

/** How crew sits on a seat: astride a bike, in a car seat, low in the sidecar pod (legs hidden inside). */
export type SeatKind = 'astride' | 'seat' | 'pod';
export interface SeatPose {
  pos: Point; // where the hips are (ship meters)
  hip: number; // hip height above the deck (m)
  foot: number; // foot height (m) – pegs / floor pan
  kind: SeatKind;
  hands: 'bar' | 'wheel' | 'lap'; // handlebar, steering wheel or resting
  heading: number; // facing = the vehicle's driving direction (atan2(dz, dx))
  legsHidden: boolean; // inside a car / pod the legs are out of sight
}

/** Seat layout in the vehicle's own frame (du = along the driving direction, dw = away from the ship) – shared with the renderer. */
export const SEATS = {
  bike: { du: -0.25, hip: 0.74, foot: 0.3 },
  car: { rowDu: { back: -0.62, front: 0.48 }, sideDw: 0.45, hip: 0.62, foot: 0.42, wheelSide: 1 },
  pod: { du: -0.12, hip: 0.4 }, // low inside the egg (its rim is at 0.72 m): only shoulders + head look out
  podOffset: 1.05, // pod centre beside the bike (m, towards the pod tile) – room between rider and passenger
} as const;

/** Where and how a crew member sits on seat `t` (= tile) of vehicle `vi`. */
export function seatPose(ship: Ship, vi: number, t: number): SeatPose {
  const v = ship.vehicles![vi]!;
  const { center: c, u, w } = vehicleFrame(ship, v);
  const tile = v.tiles[t]!.center;
  const heading = Math.atan2(u[1], u[0]);
  const at = (o: Point, du: number, dw: number): Point => [o[0] + u[0] * du + w[0] * dw, o[1] + u[1] * du + w[1] * dw];
  const rel = (p: Point) => [(p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1], (p[0] - c[0]) * w[0] + (p[1] - c[1]) * w[1]] as const;
  if (v.type === 'car') {
    const [ru, rw] = rel(tile);
    const front = ru > 0;
    const side = rw > 0 ? 1 : -1;
    return {
      pos: at(c, front ? SEATS.car.rowDu.front : SEATS.car.rowDu.back, side * SEATS.car.sideDw),
      hip: SEATS.car.hip,
      foot: SEATS.car.foot,
      kind: 'seat',
      hands: front && side === SEATS.car.wheelSide ? 'wheel' : 'lap',
      heading,
      legsHidden: true,
    };
  }
  if (v.type === 'sidecar' && v.tiles.length >= 2) {
    const sorted = [...v.tiles].sort((p, q) => rel(p.center)[1] - rel(q.center)[1]);
    const bc = sorted[0]!.center;
    if (tile !== bc) {
      const o = sorted[sorted.length - 1]!.center;
      const l = Math.hypot(o[0] - bc[0], o[1] - bc[1]) || 1;
      const pod: Point = [bc[0] + ((o[0] - bc[0]) / l) * SEATS.podOffset, bc[1] + ((o[1] - bc[1]) / l) * SEATS.podOffset];
      return { pos: at(pod, SEATS.pod.du, 0), hip: SEATS.pod.hip, foot: SEATS.pod.hip, kind: 'pod', hands: 'lap', heading, legsHidden: true };
    }
    return { pos: at(bc, SEATS.bike.du, 0), hip: SEATS.bike.hip, foot: SEATS.bike.foot, kind: 'astride', hands: 'bar', heading, legsHidden: false };
  }
  return { pos: at(c, SEATS.bike.du, 0), hip: SEATS.bike.hip, foot: SEATS.bike.foot, kind: 'astride', hands: 'bar', heading, legsHidden: false };
}
