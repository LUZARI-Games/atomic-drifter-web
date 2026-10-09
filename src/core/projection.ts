// Orthographic views, no perspective. pitch = how far the camera looks down (90° = straight top-down),
// yaw = how far it is turned sideways around the vertical axis (0 = look-down, 45° = classic isometric diamond view).
// World axes: x = right, y = towards the viewer (down on screen), z = up. Units: meters.
export const VIEW_PITCH_DEG = 45;

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export interface View {
  sin: number; // of pitch
  cos: number; // of pitch
  yawSin: number;
  yawCos: number;
  yaw: number; // radians
}

export function makeView(pitchDeg = VIEW_PITCH_DEG, yawDeg = 0): View {
  const a = (pitchDeg * Math.PI) / 180;
  const y = (yawDeg * Math.PI) / 180;
  return { sin: Math.sin(a), cos: Math.cos(a), yawSin: Math.sin(y), yawCos: Math.cos(y), yaw: y };
}

/** Turn a floor point by the view's yaw. */
export function turn(v: View, x: number, y: number): Vec2 {
  return [x * v.yawCos - y * v.yawSin, x * v.yawSin + y * v.yawCos];
}

/** World point -> screen offset in meters (multiply by px per meter). */
export function project(v: View, [x, y, z]: Vec3): Vec2 {
  const [tx, ty] = turn(v, x, y);
  return [tx, ty * v.sin - z * v.cos];
}

/** Distance towards the camera: draw smaller values first (painter's order). */
export function depth(v: View, [x, y, z]: Vec3): number {
  return turn(v, x, y)[1] * v.cos + z * v.sin;
}

/** Convex hull (monotone chain) – the outline of a convex body's projected sample points. */
export function convexHull(points: Vec2[]): Vec2[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Vec2[] = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Floor footprint bounds in world x/y (meters). */
export interface FloorBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Painter's order for things standing on a grid floor (walls, blocks, crew), correct for turned views too:
 * A goes before B when A lies completely behind B along a floor axis that points towards the viewer.
 * Ties / overlaps fall back to `key` (nearest point). Returns indices in draw order.
 */
export function drawOrder(v: View, boxes: FloorBox[], key: number[]): number[] {
  const eps = 1e-6;
  const dx = v.yawSin; // how much world +x points towards the viewer
  const dy = v.yawCos; // how much world +y points towards the viewer
  const behind = (a: FloorBox, b: FloorBox) =>
    (dx > eps && a.maxX <= b.minX + eps) ||
    (dx < -eps && a.minX >= b.maxX - eps) ||
    (dy > eps && a.maxY <= b.minY + eps) ||
    (dy < -eps && a.minY >= b.maxY - eps);
  const n = boxes.length;
  const after: number[][] = Array.from({ length: n }, () => []);
  const before = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const a = boxes[i]!;
      const b = boxes[j]!;
      // only order things that can overlap on screen: behind on one axis but not side by side on the other
      if (!behind(a, b) || behind(b, a)) continue;
      after[i]!.push(j);
      before[j]!++;
    }
  }
  const out: number[] = [];
  const ready = new Set<number>();
  for (let i = 0; i < n; i++) if (before[i] === 0) ready.add(i);
  const done = new Set<number>();
  while (out.length < n) {
    let pick = -1;
    for (const i of ready) if (pick < 0 || key[i]! < key[pick]!) pick = i;
    if (pick < 0) {
      // cycle (should not happen on a grid): take the farthest remaining
      for (let i = 0; i < n; i++) if (!done.has(i) && (pick < 0 || key[i]! < key[pick]!)) pick = i;
    }
    ready.delete(pick);
    done.add(pick);
    out.push(pick);
    for (const j of after[pick]!) if (!done.has(j) && --before[j]! <= 0) ready.add(j);
  }
  return out;
}
