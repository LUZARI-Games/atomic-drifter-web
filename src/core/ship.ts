// Ship loading + geometry. Pure TypeScript – no Phaser, no DOM.
import type { Point, Ship, ShipRoom, ShipTile } from './types';

export const SHIP_FORMAT = 'atomic-drifter-ship-godot';

const isPoint = (p: unknown): p is Point =>
  Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n));

/**
 * Validate a planner Godot export. Returns the ship or a list of problems.
 * Unknown extra fields are kept; missing optional ones get defaults.
 */
export function parseShip(data: unknown): { ship: Ship | null; problems: string[] } {
  const problems: string[] = [];
  const d = data as Partial<Ship> | null;
  if (!d || typeof d !== 'object') return { ship: null, problems: ['NOT A SHIP FILE'] };
  if (d.format !== SHIP_FORMAT) problems.push(`WRONG FORMAT (EXPECTED ${SHIP_FORMAT})`);
  if (!Array.isArray(d.tiles) || d.tiles.length === 0) problems.push('NO TILES');
  if (problems.length) return { ship: null, problems };

  const tiles = (d.tiles as ShipTile[]).filter((t) => Array.isArray(t.polygon) && t.polygon.length >= 3 && t.polygon.every(isPoint));
  if (tiles.length < (d.tiles as ShipTile[]).length) problems.push('SOME TILES WERE DAMAGED AND SKIPPED');
  const rooms = (Array.isArray(d.rooms) ? d.rooms : []).filter((r): r is ShipRoom => !!r && typeof r.id === 'string');
  const walls = (Array.isArray(d.walls) ? d.walls : []).filter((w) => isPoint(w.a) && isPoint(w.b));
  const doors = (Array.isArray(d.doors) ? d.doors : []).filter((o) => isPoint(o.center));

  return {
    ship: {
      ...(d as Ship),
      name: typeof d.name === 'string' && d.name ? d.name : 'SHIP',
      tile_size: typeof d.tile_size === 'number' ? d.tile_size : 2,
      rooms,
      tiles,
      walls,
      doors,
    },
    problems,
  };
}

/** Even-odd point-in-polygon test. */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Room id at a ship point (meters), or null for empty space / unassigned tiles. */
export function roomAtPoint(ship: Ship, p: Point): string | null {
  for (const t of ship.tiles) if (pointInPolygon(p, t.polygon)) return t.room;
  return null;
}

export function getRoom(ship: Ship, id: string | null): ShipRoom | null {
  return id === null ? null : (ship.rooms.find((r) => r.id === id) ?? null);
}

/** Bounding box of all tiles in ship space (meters). */
export function shipBounds(ship: Ship): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const t of ship.tiles)
    for (const [x, z] of t.polygon) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  return { minX, maxX, minZ, maxZ };
}

/** Average of a room's tile centres – where its label goes. */
export function roomCenter(ship: Ship, id: string): Point | null {
  const ts = ship.tiles.filter((t) => t.room === id);
  if (!ts.length) return null;
  return [ts.reduce((s, t) => s + t.center[0], 0) / ts.length, ts.reduce((s, t) => s + t.center[1], 0) / ts.length];
}

/** Outer outline of a room (shared tile edges removed) – used for the selection outline. */
export function roomOutline(ship: Ship, id: string): [Point, Point][] {
  return tilesOutline(ship.tiles.filter((t) => t.room === id));
}

/** Where the floor label goes: average of the free-floor tiles if it lies on them, else the nearest free tile (falls back to all tiles). */
export function roomFloorCenter(ship: Ship, id: string): Point | null {
  const free = ship.tiles.filter((t) => t.room === id && !t.machinery);
  if (!free.length) return roomCenter(ship, id);
  const avg: Point = [free.reduce((s, t) => s + t.center[0], 0) / free.length, free.reduce((s, t) => s + t.center[1], 0) / free.length];
  if (free.some((t) => pointInPolygon(avg, t.polygon))) return avg;
  // L-shaped floor: the average lies outside -> use the free tile nearest to it
  let best = free[0]!;
  for (const t of free)
    if (Math.hypot(t.center[0] - avg[0], t.center[1] - avg[1]) < Math.hypot(best.center[0] - avg[0], best.center[1] - avg[1])) best = t;
  return best.center;
}

/** Stable map key for a point (1 mm precision). */
export const pointKey = ([x, z]: Point) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`;

/** Outer edges of a group of tiles: every edge not shared by two tiles of the group. */
export function tilesOutline(tiles: ShipTile[]): [Point, Point][] {
  const seen = new Map<string, { seg: [Point, Point]; n: number }>();
  for (const t of tiles)
    for (let i = 0; i < t.polygon.length; i++) {
      const a = t.polygon[i]!;
      const b = t.polygon[(i + 1) % t.polygon.length]!;
      const k = [pointKey(a), pointKey(b)].sort().join('|');
      const e = seen.get(k);
      if (e) e.n++;
      else seen.set(k, { seg: [a, b], n: 1 });
    }
  return [...seen.values()].filter((e) => e.n === 1).map((e) => e.seg);
}
