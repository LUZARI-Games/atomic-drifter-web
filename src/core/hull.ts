// Airship hull + system blocks, derived from the ship layout. Pure geometry in ship space (meters, [x, z]):
// x = starboard, bow = -z. No Phaser, no DOM – the same numbers can drive the Godot version.
import { pointInPolygon, pointKey as key, shipBounds, tilesOutline } from './ship';

export { tilesOutline };
import type { Point, Ship, ShipTile } from './types';

export interface HullShape {
  /** Outer hull outline (convex, clockwise or counter-clockwise), incl. rounded-pointed nose and rounded stern. */
  outline: Point[];
  /** Centres of the stern propellers. */
  propellers: Point[];
  /** Propeller radius in meters. */
  propRadius: number;
  /** Tail fins (triangles) at the stern. */
  fins: Point[][];
}

export interface SystemBlock {
  room: string;
  system: string | null;
  tiles: ShipTile[];
  /** Outer edges of the merged block (shared tile edges removed). */
  outline: [Point, Point][];
  /** Centre of the block (average of its tile centres) – may lie outside an L-shaped block. */
  center: Point;
  /** Where the system symbol goes: the exact centre of a rectangular block, otherwise the corner tile where the arms meet. */
  anchor: Point;
  /** Smallest side of the block's bounding box (meters) – for sizing the symbol. */
  minSide: number;
}

/** Convex hull (Andrew's monotone chain). */
export function convexHull(points: Point[]): Point[] {
  const pts = [...new Map(points.map((p) => [key(p), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Airship hull around the deck: a smooth convex body with a margin, a rounded-pointed nose at the bow (-z)
 * and a blunt rounded stern (+z) carrying two propellers and two tail fins.
 */
export function airshipHull(ship: Ship, margin = 0.6): HullShape {
  const b = shipBounds(ship);
  const xc = (b.minX + b.maxX) / 2;
  const halfW = (b.maxX - b.minX) / 2 + margin;
  const len = b.maxZ - b.minZ;
  const front = b.minZ - margin;
  const back = b.maxZ + margin;
  const noseLen = Math.min(Math.max(halfW * 1.1, 2), len * 0.5 + 2);
  const sternLen = Math.min(halfW * 0.35, 1.5);

  const pts: Point[] = [];
  // deck corners grown by the margin
  for (const t of ship.tiles)
    for (const [x, z] of t.polygon)
      for (const dx of [-margin, margin]) for (const dz of [-margin, margin]) pts.push([x + dx, z + dz]);
  // nose: ogive with a rounded tip (|u|^1.7 keeps the tip smooth, sides taper to a point)
  // stern: blunt rounded cap
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const u = -1 + (2 * i) / N;
    pts.push([xc + halfW * u, front - noseLen * (1 - Math.abs(u) ** 1.7)]);
    pts.push([xc + halfW * u, back + sternLen * (1 - Math.abs(u) ** 4)]);
  }

  // propellers sit behind the stern on short struts; small tail fins flare out at the stern corners
  const propRadius = Math.max(0.6, Math.min(halfW * 0.28, 1.3));
  const propZ = back + sternLen + propRadius + 0.5;
  const propX = halfW * 0.5;
  const finOut = Math.min(Math.max(0.6, halfW * 0.18), 1.0);
  const fins: Point[][] = [-1, 1].map((s) => [
    [xc + s * halfW * 0.9, back - Math.min(1.6, len * 0.12)],
    [xc + s * (halfW + finOut), back + sternLen * 0.4 + 0.5],
    [xc + s * halfW * 0.75, back + sternLen * 0.6],
  ]);

  return {
    outline: convexHull(pts),
    propellers: [[xc - propX, propZ], [xc + propX, propZ]],
    propRadius,
    fins,
  };
}

/** Machinery tiles of each room merged into one block per room. */
export function systemBlocks(ship: Ship): SystemBlock[] {
  const byRoom = new Map<string, ShipTile[]>();
  for (const t of ship.tiles) {
    if (!t.machinery || !t.room) continue;
    byRoom.set(t.room, [...(byRoom.get(t.room) ?? []), t]);
  }
  return [...byRoom.entries()].map(([room, tiles]) => {
    const xs = tiles.flatMap((t) => t.polygon.map((p) => p[0]));
    const zs = tiles.flatMap((t) => t.polygon.map((p) => p[1]));
    const center: Point = [
      tiles.reduce((s, t) => s + t.center[0], 0) / tiles.length,
      tiles.reduce((s, t) => s + t.center[1], 0) / tiles.length,
    ];
    return {
      room,
      system: ship.rooms.find((r) => r.id === room)?.system ?? null,
      tiles,
      outline: tilesOutline(tiles),
      center,
      anchor: blockAnchor(tiles, center),
      minSide: Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)),
    };
  });
}

/**
 * Fill polygons for a system block, shrunk by `inset` meters on its OUTER sides only, so the block keeps a gap
 * to the walls but stays one continuous shape (shared sides between its tiles are not moved).
 * Works for any convex tile polygon (full squares and diagonal halves).
 */
export function blockPolygons(block: SystemBlock, inset: number): Point[][] {
  const outer = new Set(block.outline.map(([a, b]) => [key(a), key(b)].sort().join('|')));
  return block.tiles.map((t) => {
    const poly = t.polygon;
    const n = poly.length;
    // signed area -> orientation, so we know which side is "inside"
    let area = 0;
    for (let i = 0; i < n; i++) {
      const [x1, z1] = poly[i]!;
      const [x2, z2] = poly[(i + 1) % n]!;
      area += x1 * z2 - x2 * z1;
    }
    const sgn = area > 0 ? 1 : -1;
    // each side as a line (point + direction), moved inward when it is an outer side
    const lines = poly.map((a, i) => {
      const b = poly[(i + 1) % n]!;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      const isOuter = outer.has([key(a), key(b)].sort().join('|'));
      const d = isOuter ? inset : 0;
      // inward normal for this orientation
      const nx = (-dz / len) * sgn;
      const nz = (dx / len) * sgn;
      return { p: [a[0] + nx * d, a[1] + nz * d] as Point, d: [dx, dz] as Point };
    });
    // new vertex i = intersection of side (i-1) and side i
    return lines.map((l, i) => {
      const m = lines[(i - 1 + n) % n]!;
      const det = m.d[0] * l.d[1] - m.d[1] * l.d[0];
      if (Math.abs(det) < 1e-9) return l.p;
      const t = ((l.p[0] - m.p[0]) * l.d[1] - (l.p[1] - m.p[1]) * l.d[0]) / det;
      return [m.p[0] + m.d[0] * t, m.p[1] + m.d[1] * t] as Point;
    });
  });
}

/**
 * Symbol position for a block. A full rectangle (every cell of its bounding box filled with full tiles) uses its exact
 * centre. Any other shape (L, T, …) uses the tile that joins the arms: the tile with neighbours in both directions
 * (horizontal + vertical) and the most neighbours; ties go to the tile nearest the average centre.
 */
export function blockAnchor(tiles: ShipTile[], center: Point): Point {
  if (!tiles.length) return center;
  const xs = tiles.flatMap((t) => t.polygon.map((p) => p[0]));
  const zs = tiles.flatMap((t) => t.polygon.map((p) => p[1]));
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...zs) - Math.min(...zs);
  const cell = Math.sqrt(polygonArea(tiles[0]!.polygon)) || 1;
  const filled = tiles.every((t) => t.shape === 'full') && Math.round((w * h) / (cell * cell)) === tiles.length;
  if (filled) return [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2];

  const edgesOf = (t: ShipTile) =>
    t.polygon.map((a, i) => {
      const b = t.polygon[(i + 1) % t.polygon.length]!;
      return { k: [key(a), key(b)].sort().join('|'), alongX: Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) };
    });
  const owners = new Map<string, number>();
  for (const t of tiles) for (const e of edgesOf(t)) owners.set(e.k, (owners.get(e.k) ?? 0) + 1);

  let best: ShipTile = tiles[0]!;
  let bestScore = -Infinity;
  for (const t of tiles) {
    const shared = edgesOf(t).filter((e) => owners.get(e.k)! > 1);
    const bothAxes = shared.some((e) => e.alongX) && shared.some((e) => !e.alongX);
    const dist = Math.hypot(t.center[0] - center[0], t.center[1] - center[1]);
    const score = (bothAxes ? 100 : 0) + shared.length * 10 - dist * 0.01;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best.center;
}

export function polygonArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i]!;
    const [x2, z2] = poly[(i + 1) % poly.length]!;
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

/**
 * Inner (concave) corners of a block, e.g. the inside corner of an L. Shrinking each tile on its outer sides leaves
 * the corner tile too full there, so the renderer cuts a square notch: from `point` towards `dir` (both axes ±1).
 */
export function blockNotches(block: SystemBlock): { point: Point; dir: Point }[] {
  const eps = 0.01;
  const inside = (p: Point) => block.tiles.some((t) => pointInPolygon(p, t.polygon));
  const seen = new Set<string>();
  const out: { point: Point; dir: Point }[] = [];
  for (const t of block.tiles)
    for (const c of t.polygon) {
      const k = key(c);
      if (seen.has(k)) continue;
      seen.add(k);
      const quads = ([[1, 1], [1, -1], [-1, 1], [-1, -1]] as Point[]).filter(([sx, sz]) => !inside([c[0] + sx * eps, c[1] + sz * eps]));
      if (quads.length === 1) {
        const [sx, sz] = quads[0]!;
        out.push({ point: c, dir: [-sx, -sz] });
      }
    }
  return out;
}

