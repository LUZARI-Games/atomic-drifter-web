// Orthographic "look-down" view: no perspective, the camera faces north and is tilted down by VIEW_PITCH_DEG.
// 90° = straight top-down (the current ship view), 45° = the ISO test in the Crew Lab.
// World axes: x = right, y = towards the viewer (down on screen), z = up. Units: meters.
export const VIEW_PITCH_DEG = 45;

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export interface View {
  sin: number;
  cos: number;
}

export function makeView(pitchDeg = VIEW_PITCH_DEG): View {
  const a = (pitchDeg * Math.PI) / 180;
  return { sin: Math.sin(a), cos: Math.cos(a) };
}

/** World point -> screen offset in meters (multiply by px per meter). */
export function project(v: View, [x, y, z]: Vec3): Vec2 {
  return [x, y * v.sin - z * v.cos];
}

/** Distance towards the camera: draw smaller values first (painter's order). */
export function depth(v: View, [, y, z]: Vec3): number {
  return y * v.cos + z * v.sin;
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
