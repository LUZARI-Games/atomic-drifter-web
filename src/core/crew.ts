// Crew appearance + facing. Engine-neutral: the look is plain data, renderers turn it into shapes.
import GEAR from '../data/crew_gear.json';
import LOOKS from '../data/crew_looks.json';
import type { Point } from './types';

export type Sex = 'male' | 'female';
export type Species = 'human';
export type Build = keyof typeof LOOKS.builds;
export type Origin = keyof typeof LOOKS.origins;
export type GearId = keyof typeof GEAR.items;
export type GearSlot = 'head' | 'chest' | 'back';

export interface CrewLook {
  id: string;
  name: string;
  species: Species;
  sex: Sex;
  build: Build;
  origin: Origin;
  skin: number; // index into skin_tones
  hair: number; // index into hair_colors
  gear: GearId[]; // worn items, at most one per slot
}

export const CREW_LOOKS = LOOKS;
export const CREW_GEAR = GEAR;

export const gearSlot = (id: GearId) => GEAR.items[id].slot as GearSlot;

/** Put on `item`; whatever was worn in the same slot comes off. */
export function equip(gear: GearId[], item: GearId): GearId[] {
  return [...gear.filter((g) => gearSlot(g) !== gearSlot(item)), item];
}

export function parseCrewLook(raw: unknown): CrewLook | null {
  const r = raw as Partial<CrewLook> | null;
  if (!r || typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  if (r.species !== 'human' || (r.sex !== 'male' && r.sex !== 'female')) return null;
  if (!r.build || !(r.build in LOOKS.builds) || !r.origin || !(r.origin in LOOKS.origins)) return null;
  const idx = (v: unknown, n: number) => (Number.isInteger(v) ? (((v as number) % n) + n) % n : 0);
  const gear = (Array.isArray(r.gear) ? r.gear : [])
    .filter((g): g is GearId => typeof g === 'string' && g in GEAR.items)
    .reduce<GearId[]>(equip, []);
  return { ...(r as CrewLook), skin: idx(r.skin, LOOKS.skin_tones.length), hair: idx(r.hair, LOOKS.hair_colors.length), gear };
}

/** Facing angle (radians, 0 = +x, counter-clockwise towards +y) for a move by (dx, dy); keeps `prev` when standing still. */
export function facingFor(dx: number, dy: number, prev: number): number {
  return Math.hypot(dx, dy) < 1e-9 ? prev : Math.atan2(dy, dx);
}

/** Turn from `from` towards `to` by at most `maxStep` radians, the short way round. */
export function turnTowards(from: number, to: number, maxStep: number): number {
  let d = ((to - from) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

/** Position + walking direction at distance `dist` along a closed loop of waypoints. */
export function loopPose(path: Point[], dist: number): { pos: Point; facing: number } {
  const segs = path.map((a, i) => {
    const b = path[(i + 1) % path.length]!;
    return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
  });
  const total = segs.reduce((s, g) => s + g.len, 0);
  let d = ((dist % total) + total) % total;
  for (const s of segs) {
    if (d <= s.len || s === segs[segs.length - 1]) {
      const t = s.len ? Math.min(1, d / s.len) : 0;
      return {
        pos: [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t],
        facing: facingFor(s.b[0] - s.a[0], s.b[1] - s.a[1], 0),
      };
    }
    d -= s.len;
  }
  return { pos: path[0]!, facing: 0 };
}
