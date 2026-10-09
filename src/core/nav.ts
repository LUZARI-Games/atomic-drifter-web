// Walking on the ship: a graph of "spots" crew can stand on (deck tiles, vehicle seats) and the ways between them.
// Tiles of the same room connect directly; different rooms only through a door; a balcony tile connects to a docked
// vehicle over the railing (crew climb over). Machinery tiles are not walkable. Pure data – engine-neutral.
import { dockEdges } from './exterior';
import type { Point, Ship } from './types';

export interface NavNode {
  id: string; // "t<index>" deck tile, "v<vehicle>:<tile>" vehicle seat
  pos: Point; // where crew stands / sits (ship meters)
  room: string | null; // deck room id, null for vehicle seats
  vehicle: number | null;
}

export interface NavLink {
  to: string;
  via: Point | null; // door centre / dock point crew pass through
  cost: number;
}

export interface NavGraph {
  nodes: Map<string, NavNode>;
  links: Map<string, NavLink[]>;
}

const k = ([x, z]: Point) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`;
const edgeKey = (a: Point, b: Point) => [k(a), k(b)].sort().join('|');
const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const edges = (poly: Point[]) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]!] as [Point, Point]);

/** Where crew sits in a vehicle: pulled from the tile centre towards the vehicle centre. */
export function seatPos(ship: Ship, v: number, t: number): Point {
  const veh = ship.vehicles![v]!;
  const n = veh.tiles.length;
  const c: Point = [veh.tiles.reduce((s, x) => s + x.center[0], 0) / n, veh.tiles.reduce((s, x) => s + x.center[1], 0) / n];
  const p = veh.tiles[t]!.center;
  return [c[0] + (p[0] - c[0]) * 0.5, c[1] + (p[1] - c[1]) * 0.5];
}

export function buildNav(ship: Ship): NavGraph {
  const nodes = new Map<string, NavNode>();
  const links = new Map<string, NavLink[]>();
  const link = (a: string, b: string, via: Point | null) => {
    const pa = nodes.get(a)!.pos;
    const pb = nodes.get(b)!.pos;
    const cost = via ? dist(pa, via) + dist(via, pb) : dist(pa, pb);
    links.get(a)!.push({ to: b, via, cost });
    links.get(b)!.push({ to: a, via, cost });
  };

  // deck tiles (machinery excluded)
  const byEdge = new Map<string, string[]>();
  ship.tiles.forEach((t, i) => {
    if (t.machinery) return;
    const id = `t${i}`;
    nodes.set(id, { id, pos: t.center, room: t.room, vehicle: null });
    links.set(id, []);
    for (const [a, b] of edges(t.polygon)) {
      const key = edgeKey(a, b);
      byEdge.set(key, [...(byEdge.get(key) ?? []), id]);
    }
  });

  // doors: an edge whose midpoint is a door centre
  const doorAt = new Map(ship.doors.map((d) => [k(d.center), d.center]));
  for (const [key, ids] of byEdge) {
    if (ids.length !== 2) continue;
    const [a, b] = ids as [string, string];
    const na = nodes.get(a)!;
    const nb = nodes.get(b)!;
    const [p, q] = key.split('|').map((s) => s.split(',').map((v) => Number(v) / 1000) as Point) as [Point, Point];
    if (na.room === nb.room) link(a, b, null);
    else {
      const door = doorAt.get(k(mid(p, q)));
      if (door) link(a, b, door);
    }
  }

  // vehicles: seats, linked to each other and – over the railing – to the balcony tile at the dock
  const docks = dockEdges(ship);
  (ship.vehicles ?? []).forEach((v, vi) => {
    const seatIds = v.tiles.map((_, ti) => {
      const id = `v${vi}:${ti}`;
      nodes.set(id, { id, pos: seatPos(ship, vi, ti), room: null, vehicle: vi });
      links.set(id, []);
      return id;
    });
    for (let i = 0; i < seatIds.length; i++) for (let j = i + 1; j < seatIds.length; j++) link(seatIds[i]!, seatIds[j]!, null);
    for (const e of v.exits) {
      const key = edgeKey(e.a, e.b);
      if (!docks.has(key)) continue;
      const deck = byEdge.get(key)?.[0];
      if (!deck) continue;
      // the seat nearest to this dock
      const m = mid(e.a, e.b);
      const seat = seatIds.reduce((best, id) => (dist(nodes.get(id)!.pos, m) < dist(nodes.get(best)!.pos, m) ? id : best), seatIds[0]!);
      link(deck, seat, m);
    }
  });
  return { nodes, links };
}

/** Shortest way from node `from` to node `to`: the points to walk through (doors / dock, then the target spot). */
export function findPath(nav: NavGraph, from: string, to: string): { nodes: string[]; points: Point[] } | null {
  if (!nav.nodes.has(from) || !nav.nodes.has(to)) return null;
  const best = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { node: string; via: Point | null }>();
  const open = new Set([from]);
  while (open.size) {
    let cur = '';
    for (const n of open) if (!cur || best.get(n)! < best.get(cur)!) cur = n;
    open.delete(cur);
    if (cur === to) break;
    for (const l of nav.links.get(cur) ?? []) {
      const c = best.get(cur)! + l.cost;
      if (c < (best.get(l.to) ?? Infinity)) {
        best.set(l.to, c);
        prev.set(l.to, { node: cur, via: l.via });
        open.add(l.to);
      }
    }
  }
  if (!best.has(to)) return null;
  const nodes: string[] = [to];
  const points: Point[] = [nav.nodes.get(to)!.pos];
  let n = to;
  while (n !== from) {
    const p = prev.get(n)!;
    if (p.via) points.unshift(p.via);
    if (p.node !== from) points.unshift(nav.nodes.get(p.node)!.pos);
    nodes.unshift(p.node);
    n = p.node;
  }
  return { nodes, points };
}

/** The walkable spot under a ship point: the deck tile containing it, or a vehicle seat tile. */
export function nodeAt(ship: Ship, nav: NavGraph, p: Point): string | null {
  const inside = (poly: Point[]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i]!;
      const [xj, zj] = poly[j]!;
      if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  for (let i = 0; i < ship.tiles.length; i++) if (nav.nodes.has(`t${i}`) && inside(ship.tiles[i]!.polygon)) return `t${i}`;
  for (const [vi, v] of (ship.vehicles ?? []).entries()) for (let ti = 0; ti < v.tiles.length; ti++) if (inside(v.tiles[ti]!.polygon)) return `v${vi}:${ti}`;
  return null;
}
