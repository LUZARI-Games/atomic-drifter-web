// ISO crew test: the NEW look (origin colour + neutral gear) seen from a 45° look-down camera, orthographic, flat 2D.
// Each body part is a simple convex solid (capsule, dome, box, sphere); its projected outline is filled flat,
// parts are drawn back to front. Top faces get a lighter shade so the figure reads as standing upright.
import Phaser from 'phaser';
import { CREW_GEAR, CREW_LOOKS, type CrewLook } from '../core/crew';
import { convexHull, depth, makeView, project, type Vec2, type Vec3, type View } from '../core/projection';
import { COLORS, WORLD } from './palette';

type G = Phaser.GameObjects.Graphics;

/** The two test angles in the Crew Lab. */
export const ISO_VIEWS = { 45: makeView(45), 60: makeView(60) } as const;

const hex = (c: string) => parseInt(c.replace('#', ''), 16);
const shade = (c: number, pct: number) =>
  pct >= 0 ? Phaser.Display.Color.ValueToColor(c).darken(pct).color : Phaser.Display.Color.ValueToColor(c).lighten(-pct).color;
const OUTLINE = WORLD.wall;
const METAL = hex(CREW_GEAR.material);
const METAL_DARK = hex(CREW_GEAR.material_dark);
const RING = 12; // samples per circle

/** Floor rectangle (meters) as a screen polygon – for deck tiles under the walkers. */
export function isoFloor(v: View, x: number, y: number, ox: number, oy: number, w: number, h: number, pxPerM: number): Phaser.Math.Vector2[] {
  const pts: Vec3[] = [[ox, oy, 0], [ox + w, oy, 0], [ox + w, oy + h, 0], [ox, oy + h, 0]];
  return pts.map((p) => {
    const [sx, sy] = project(v, p);
    return new Phaser.Math.Vector2(x + sx * pxPerM, y + sy * pxPerM);
  });
}

/**
 * Draw one crew member standing at screen point (x, y) (= feet on the floor).
 * `pxPerM` = zoom, `facing` = floor angle (0 = +x/right, PI/2 = towards the viewer), `step` = walk cycle in meters walked.
 */
export function drawCrewIso(g: G, v: View, look: CrewLook, x: number, y: number, pxPerM: number, facing: number, step: number, hostile: boolean): void {
  const color = hex(CREW_LOOKS.origins[look.origin].color);
  const skin = hex(CREW_LOOKS.skin_tones[look.skin]!);
  const hair = hex(CREW_LOOKS.hair_colors[look.hair]!);
  const tank = look.build === 'tank';
  const female = look.sex === 'female';
  const wears = (id: string) => look.gear.includes(id as never);

  // body proportions (meters)
  const k = tank ? 1.1 : 1; // tanks are taller and broader
  const torso = CREW_LOOKS.builds[look.build].torso; // tanks: very wide shoulders, narrow waist = V shape
  const W = 0.2 * torso.shoulders * (female ? 0.9 : 1); // shoulder half-width
  const D = tank ? 0.15 : 0.12; // torso half-depth
  const hip = 0.85 * k;
  const shoulder = 1.4 * k;
  const head = 1.6 * k;
  const headR = 0.12 * (tank ? 1.05 : 1);

  // walk cycle: legs and arms swing in opposite directions
  const swing = Math.sin((step / 0.75) * Math.PI) * 0.16;

  // local (forward, side, up) -> world -> screen
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  const W3 = ([f, s, u]: Vec3): Vec3 => [f * cos - s * sin, f * sin + s * cos, u];
  const S = (p: Vec3): Vec2 => {
    const [sx, sy] = project(v, W3(p));
    return [x + sx * pxPerM, y + sy * pxPerM];
  };
  const D3 = (p: Vec3) => depth(v, W3(p));

  const parts: { d: number; draw: () => void }[] = [];
  const add = (center: Vec3, draw: () => void, bias = 0) => parts.push({ d: D3(center) + bias, draw });
  const line = () => g.lineStyle(Math.max(1, 0.025 * pxPerM), OUTLINE, 1);
  const fill = (pts: Vec2[], col: number, outline = true) => {
    const vs = pts.map(([a, b]) => new Phaser.Math.Vector2(a, b));
    g.fillStyle(col, 1);
    g.fillPoints(vs, true);
    if (outline) {
      line();
      g.strokePoints(vs, true);
    }
  };
  const circlePts = (c: Vec2, r: number): Vec2[] =>
    Array.from({ length: RING }, (_, i) => [c[0] + Math.cos((i / RING) * 2 * Math.PI) * r, c[1] + Math.sin((i / RING) * 2 * Math.PI) * r]);

  // solids
  const capsule = (a: Vec3, b: Vec3, r: number, col: number) =>
    add([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], () =>
      fill(convexHull([...circlePts(S(a), r * pxPerM), ...circlePts(S(b), r * pxPerM)]), col));
  const sphere = (c: Vec3, r: number, col: number, bias = 0) =>
    add(c, () => {
      const p = S(c);
      g.fillStyle(col, 1);
      g.fillCircle(p[0], p[1], r * pxPerM);
      line();
      g.strokeCircle(p[0], p[1], r * pxPerM);
    }, bias);
  /** Part of a sphere surface whose normals point within `limit` of direction n (a cap / helmet / hair). */
  const cap = (c: Vec3, r: number, n: Vec3, limit: number, col: number, bias = 0) =>
    add(c, () => {
      const pts: Vec2[] = [];
      for (let i = 0; i <= 8; i++) {
        for (let j = 0; j < 16; j++) {
          const th = (i / 8) * Math.PI;
          const ph = (j / 16) * 2 * Math.PI;
          const d: Vec3 = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
          if (d[0] * n[0] + d[1] * n[1] + d[2] * n[2] >= limit) pts.push(S([c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r]));
        }
      }
      fill(convexHull(pts), col);
    }, bias);
  /** Upright elliptic column (torso), side radius `rs0` at the bottom widening to `rs1` at the top, lighter top face. */
  const column = (rf: number, rs0: number, rs1: number, z0: number, z1: number, col: number) =>
    add([0, 0, (z0 + z1) / 2], () => {
      const ring = (z: number, rs: number): Vec3[] =>
        Array.from({ length: 16 }, (_, i) => [Math.cos((i / 16) * 2 * Math.PI) * rf, Math.sin((i / 16) * 2 * Math.PI) * rs, z]);
      fill(convexHull([...ring(z0, rs0), ...ring(z1, rs1)].map(S)), col);
      fill(ring(z1, rs1).map(S), shade(col, -12));
    });
  /** Box from local min to max corner with a lighter top face. */
  const box = (a: Vec3, b: Vec3, col: number, bias = 0) =>
    add([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], () => {
      const c: Vec3[] = [];
      for (const f of [a[0], b[0]]) for (const s of [a[1], b[1]]) for (const u of [a[2], b[2]]) c.push([f, s, u]);
      fill(convexHull(c.map(S)), col);
      fill(([[a[0], a[1], b[2]], [b[0], a[1], b[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]] as Vec3[]).map(S), shade(col, -12));
    }, bias);

  // --- floor: shadow + friend/foe ring (always underneath everything) ---
  const floorEllipse = (r: number): Vec2[] =>
    Array.from({ length: 24 }, (_, i): Vec2 => {
      const [sx, sy] = project(v, [Math.cos((i / 24) * 2 * Math.PI) * r, Math.sin((i / 24) * 2 * Math.PI) * r, 0]);
      return [x + sx * pxPerM, y + sy * pxPerM];
    });
  g.fillStyle(0x000000, 0.3);
  g.fillPoints(floorEllipse(W + 0.12).map(([a, b]) => new Phaser.Math.Vector2(a, b)), true);
  g.lineStyle(Math.max(1.5, 0.05 * pxPerM), hostile ? COLORS.amber : COLORS.green, 1);
  g.strokePoints(floorEllipse(W + 0.3).map(([a, b]) => new Phaser.Math.Vector2(a, b)), true);

  // --- legs (trousers = dark origin colour) ---
  const legR = tank ? 0.085 : 0.07;
  for (const side of [-1, 1]) {
    const f = swing * side;
    const hipW = Math.max(W * torso.waist * 0.6, legR * 1.1);
    capsule([f * 0.5, side * hipW, hip], [f, side * hipW, legR], legR, shade(color, 35));
  }

  // --- torso + arms + hands ---
  column(D, W * torso.waist, W, hip - 0.05 * k, shoulder, color);
  const armR = tank ? 0.075 : 0.06;
  for (const side of [-1, 1]) {
    const f = -swing * side;
    const sh: Vec3 = [0, side * (W + armR * 0.6), shoulder - 0.04];
    const hand: Vec3 = [f * 1.4 + 0.03, side * (W + armR * 0.9), shoulder - 0.55 * k];
    capsule(sh, hand, armR, shade(color, 14));
    sphere(hand, armR * 1.05, skin, 0.01);
  }

  // --- gear (neutral metal) ---
  if (wears('backpack')) box([-D - 0.17, -0.15, hip + 0.1], [-D + 0.02, 0.15, shoulder - 0.02], METAL);
  if (wears('shoulder_plates')) {
    for (const side of [-1, 1]) cap([0, side * W, shoulder - 0.02], tank ? 0.13 : 0.1, [0, side * 0.5, 0.85], 0.05, METAL, 0.05);
  }

  // --- head: skin ball, hair cap tilted to the back, ponytail ---
  const hc: Vec3 = [0.02, 0, head];
  sphere(hc, headR, skin);
  if (wears('helmet')) {
    cap(hc, headR * 1.15, [-0.15, 0, 1], -0.05, METAL, 0.02);
    box([headR * 0.75, -headR * 0.9, head + 0.02], [headR * 1.25, headR * 0.9, head + 0.05], METAL_DARK, 0.03); // brim
  } else {
    cap(hc, headR * 1.06, [-0.55, 0, 0.84], 0.0, hair, 0.02);
    if (female) capsule([hc[0] - headR * 0.9, 0, head + 0.02], [hc[0] - headR * 1.6, 0, head - 0.12], 0.045, hair);
  }

  parts.sort((a, b) => a.d - b.d);
  for (const p of parts) p.draw();
}
