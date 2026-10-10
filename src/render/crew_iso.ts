// ISO crew test: the NEW look (origin colour + neutral gear) seen from a 45° look-down camera, orthographic, flat 2D.
// Each body part is a simple convex solid (capsule, dome, box, sphere); its projected outline is filled flat,
// parts are drawn back to front. Top faces get a lighter shade so the figure reads as standing upright.
import Phaser from 'phaser';
import { CREW_GEAR, CREW_LOOKS, type CrewLook } from '../core/crew';
import { STRIDE_M } from '../core/crewmove';
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

/** Standing still: `t` = seconds (clock), `seed` = per person, so nobody moves in sync; `typing` = working a console. */
export interface IdlePose {
  t: number;
  seed: number;
  typing: boolean;
  /** Mood (core/mood.ts): bored (sit 0…1 = sitting on the floor), telling a story / listening, wary of the other. */
  mood?: 'bored' | 'teller' | 'listener' | 'wary';
  sit?: number;
  /** Head turn towards someone (rad, relative to the body) – listener / wary side glances. */
  glance?: number;
  /** Working on a system at its console: hammering it (sabotage) or fixing it with a wrench (repair). */
  work?: 'sabotage' | 'repair';
  /** Melee: punch 0…1 (1 = fist fully out), which arm, hurt 0…1 (just got hit), dying 0…1 (falling). */
  punch?: number;
  punchSide?: number;
  hurt?: number;
  dying?: number;
}

const POD_RIM = 0.72; // top of the sidecar pod (m) – keep in sync with ship_view's egg

/** Sitting in a vehicle (heights in meters above the deck the figure stands on). */
export interface SitPose {
  hip: number;
  foot: number;
  kind: 'astride' | 'seat' | 'pod';
  hands: 'bar' | 'wheel' | 'lap';
  legsHidden: boolean;
}

/** 0 most of the time, eases to ±1 now and then (looking around, shifting weight). */
const now_and_then = (x: number) => {
  const s = Math.sin(x);
  const a = Math.min(1, Math.max(0, (Math.abs(s) - 0.55) / 0.35));
  return Math.sign(s) * a * a * (3 - 2 * a);
};

/**
 * Draw one crew member standing at screen point (x, y) (= feet on the floor).
 * `pxPerM` = zoom, `facing` = floor angle (0 = +x/right, PI/2 = towards the viewer), `step` = walk cycle in meters walked.
 * `idle` = standing still (breathing, weight shift, looking around, hands on hips, typing); omit while walking.
 * `sit` = seated in a vehicle: (x, y) is the deck point under the hips.
 * `half` = draw only the limbs on the side away from the viewer ('far') or everything else ('near') – a rider is drawn
 * far half, then the bike, then the near half, so the far leg disappears behind the bike.
 */
const HOSTILE = 0xff5a2a; // red-amber outline + ring of hostile crew
const MUTANT_SKIN = 0x93a04e;
const GHOUL_SKIN = 0x9a8462;

/** Height of the top of the head above the floor (m) – health bars / marks go just above it. */
export function headTop(look: { build: string; body?: string }): number {
  return look.body === 'super_mutant' ? 2.45 : 2.05;
}

export function drawCrewIso(g: G, v: View, look: CrewLook, x: number, y: number, pxPerM: number, facing: number, step: number, hostile: boolean, ringColor?: number, idle?: IdlePose, sit?: SitPose, half?: 'far' | 'near'): void {
  // clothes: faction colour from the crew database, else the Crew Lab origin colour; flashes lighter when hit
  const color = shade(hex(look.clothes ?? CREW_LOOKS.origins[look.origin].color), -45 * (idle?.hurt ?? 0));
  const mutant = look.body === 'super_mutant'; // big hunched hulk, bald, bare green-yellow arms
  const ghoul = look.body === 'ghoul'; // thin, bald, patchy brown-grey skin
  const skin = mutant ? MUTANT_SKIN : ghoul ? GHOUL_SKIN : hex(CREW_LOOKS.skin_tones[look.skin]!);
  const hair = hex(CREW_LOOKS.hair_colors[look.hair]!);
  const tank = look.build === 'tank';
  const female = look.sex === 'female';
  const wears = (id: string) => look.gear.includes(id as never);

  // body proportions (meters)
  const k = mutant ? 1.32 : tank ? 1.1 : 1; // tanks are taller and broader, super mutants much more
  const torso = CREW_LOOKS.builds[look.build].torso; // tanks: very wide shoulders, narrow waist = V shape
  const W = 0.2 * torso.shoulders * (female ? 0.9 : 1) * (mutant ? 1.55 : ghoul ? 0.88 : 1); // shoulder half-width
  const D = mutant ? 0.22 : tank ? 0.15 : 0.12; // torso half-depth
  // idle: breathing lifts chest + head a little, weight moves from foot to foot, the head turns now and then
  const it = idle?.t ?? 0;
  const sd = idle?.seed ?? 0;
  const mood = idle?.mood;
  const work = idle?.work;
  if (work === 'sabotage' && idle) {
    // hammering the machine: big alternating blows, faster than a fist fight
    idle = { ...idle, punch: Math.max(0, Math.sin((idle.t + idle.seed) * 7)) ** 2, punchSide: Math.sin((idle.t + idle.seed) * 3.5) > 0 ? 1 : -1 };
  }
  const fighting = idle?.punch !== undefined;
  const special = !!mood || fighting || idle?.dying !== undefined;
  const breath = idle ? Math.sin((it / (2.6 + (sd % 1) * 1.2)) * Math.PI * 2) * (mood === 'bored' ? 0.03 : 0.022) : 0;
  const shift = idle && !sit && !special ? now_and_then(it * 0.37 + sd * 7) * 0.055 : 0; // weight from foot to foot (m, sideways)
  let headTurn = idle && !special ? now_and_then(it * 0.6 + sd * 13) * (idle.typing ? 0.35 : 0.8) : 0; // head turn (rad)
  const akimbo = idle && !idle.typing && !sit && !special ? Math.abs(now_and_then(it * 0.19 + sd * 3 + 1)) : 0; // hands on hips (0…1)
  // bored: deep sighs (shoulders sag), now and then a big yawn / stretch, a tapping foot, sitting down on the floor
  const sigh = mood === 'bored' ? Math.max(0, Math.sin(it * 0.9 + sd * 5)) ** 6 : 0;
  const stretch = mood === 'bored' ? Math.abs(now_and_then(it * 0.21 + sd * 11)) : 0;
  const tap = mood === 'bored' && !stretch ? Math.max(0, Math.sin(it * 10)) * (now_and_then(it * 0.33 + sd) !== 0 ? 1 : 0) : 0;
  const floorSit = Math.max(mood === 'bored' ? idle?.sit ?? 0 : 0, idle?.dying ?? 0); // dying = slumping down
  // telling a story: lively head bob, laughing fits (shoulders shake, head back); listening: nods
  const laugh = mood === 'teller' ? Math.abs(now_and_then(it * 0.47 + sd * 3)) : 0;
  const shake = laugh * Math.sin(it * 42) * 0.016;
  const bob = mood === 'teller' ? Math.sin(it * 6.3) * 0.012 : 0;
  const nod = mood === 'listener' ? Math.max(0, Math.sin(it * 4.2)) * (now_and_then(it * 0.7 + sd) !== 0 ? 0.03 : 0.008) : 0;
  if (mood === 'listener' || mood === 'teller') headTurn = (idle?.glance ?? 0) * 0.8;
  // wary: side glances at the other, otherwise looking a bit away
  if (mood === 'wary') headTurn = now_and_then(it * 0.55 + sd * 9) !== 0 ? (idle?.glance ?? 0) : -(idle?.glance ?? 0) * 0.25;
  const standHip = 0.85 * k;
  const hip = sit ? sit.hip : standHip + (0.24 - standHip) * floorSit;
  const shoulder = hip + 0.55 * k + breath - sigh * 0.05 + shake;
  const head = shoulder + (mutant ? 0.1 : 0.2) * k + breath * 0.1 + bob - nod + laugh * 0.02 - (idle?.dying ?? 0) * 0.08; // mutants: hunched, head low between the shoulders
  const headR = mutant ? 0.13 : 0.12 * (tank ? 1.05 : 1);

  // walk cycle: legs and arms swing in opposite directions
  const swing = Math.sin((step / STRIDE_M) * Math.PI) * 0.18; // one stride per leg swing

  // local (forward, side, up) -> world -> screen
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  const W3 = ([f, s, u]: Vec3): Vec3 => [f * cos - s * sin, f * sin + s * cos, u];
  const S = (p: Vec3): Vec2 => {
    const [sx, sy] = project(v, W3(p));
    return [x + sx * pxPerM, y + sy * pxPerM];
  };
  const D3 = (p: Vec3) => depth(v, W3(p));

  const parts: { d: number; draw: () => void; side: number }[] = [];
  // two passes: first every part as a thick silhouette in the team colour (green = own crew, amber = hostile),
  // then the normal figure on top with thin dark edges -> a coloured outline that also reads in greyscale
  const team = hostile ? HOSTILE : COLORS.green;
  const rim = Math.max(3.5, 0.14 * pxPerM); // thick: friend / foe must read at a glance
  let sil = false;
  let limbSide = 0; // -1 / +1 while adding a left / right limb, 0 = middle of the body
  const add = (center: Vec3, draw: () => void, bias = 0) => parts.push({ d: D3(center) + bias, draw, side: limbSide });
  // which side of the body faces away from the viewer
  const farSide = depth(v, W3([0, 1, 0])) > depth(v, W3([0, 0, 0])) ? -1 : 1;
  const line = () => g.lineStyle(Math.max(1, 0.025 * pxPerM), OUTLINE, 1);
  const fill = (pts: Vec2[], col: number, outline = true) => {
    const vs = pts.map(([a, b]) => new Phaser.Math.Vector2(a, b));
    if (sil) {
      g.fillStyle(team, 1);
      g.fillPoints(vs, true);
      g.lineStyle(rim, team, 1);
      g.strokePoints(vs, true);
      return;
    }
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
      if (sil) {
        g.fillStyle(team, 1);
        g.fillCircle(p[0], p[1], r * pxPerM + rim / 2);
        return;
      }
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
  const column = (rf: number, rs0: number, rs1: number, z0: number, z1: number, col: number, side = 0) =>
    add([0, side, (z0 + z1) / 2], () => {
      const ring = (z: number, rs: number): Vec3[] =>
        Array.from({ length: 16 }, (_, i) => [Math.cos((i / 16) * 2 * Math.PI) * rf, side + Math.sin((i / 16) * 2 * Math.PI) * rs, z]);
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
  const floorEllipse = (r: number, z = 0): Vec2[] =>
    Array.from({ length: 24 }, (_, i): Vec2 => {
      const [sx, sy] = project(v, [Math.cos((i / 24) * 2 * Math.PI) * r, Math.sin((i / 24) * 2 * Math.PI) * r, z]);
      return [x + sx * pxPerM, y + sy * pxPerM];
    });
  if (!sit && half !== 'near') {
    g.fillStyle(0x000000, 0.35);
    g.fillPoints(floorEllipse(W + 0.14).map(([a, b]) => new Phaser.Math.Vector2(a, b)), true);
  }
  if (!sit && half !== 'near' && floorSit < 0.5) {
    // friend / foe ring under the feet: green = own crew, red-amber = hostile
    g.lineStyle(Math.max(2, 0.06 * pxPerM), team, 0.95);
    g.strokePoints(floorEllipse(W + 0.2).map(([a, b]) => new Phaser.Math.Vector2(a, b)), true);
  }
  if (ringColor !== undefined && half !== 'near') {
    // selected: ring on the floor (team colour is already the outline)
    g.lineStyle(Math.max(2, 0.08 * pxPerM), ringColor, 1);
    g.strokePoints(floorEllipse(W + 0.3, sit ? (sit.kind === 'pod' ? 0.74 : sit.hip) : 0).map(([a, b]) => new Phaser.Math.Vector2(a, b)), true);
  }

  // --- legs (trousers = dark origin colour) ---
  const legR = mutant ? 0.12 : tank ? 0.085 : 0.07;
  const hipW = Math.max(W * torso.waist * 0.6, legR * 1.1);
  for (const side of [-1, 1]) {
    limbSide = side;
    if (sit) {
      if (sit.legsHidden) continue; // inside the car / pod
      // astride: thighs forward and out, shins down to the footpegs
      const knee: Vec3 = [0.3, side * (hipW + 0.14), hip - 0.1];
      capsule([0, side * hipW * 1.5, hip], knee, legR, shade(color, 35));
      capsule(knee, [0.24, side * (hipW + 0.12), sit.foot], legR, shade(color, 35));
      continue;
    }
    const f = swing * side;
    // weight on one foot: the other knee bends a little, its foot slides forward
    const free = idle ? Math.max(0, -side * Math.sign(shift)) * Math.abs(shift) * 1.6 : 0;
    const stance = fighting ? side * 0.14 : 0; // fight: one foot forward, the other back
    const wide = fighting ? 0.07 : 0;
    let foot: Vec3 = [f + free + stance, side * (hipW + wide), legR + (side > 0 ? tap * 0.05 : 0)];
    // sitting on the floor: legs stretched out in front
    if (floorSit > 0) foot = [foot[0] + (0.62 - foot[0]) * floorSit, foot[1] + side * 0.04 * floorSit, foot[2]];
    capsule([f * 0.5, side * hipW + shift, hip], foot, legR, shade(color, 35));
  }

  limbSide = 0;

  // --- torso + arms + hands ---
  // low in the sidecar pod: only the chest above its rim shows (the rest is inside the egg)
  const inPod = sit?.kind === 'pod';
  column(D, W * torso.waist, W, inPod ? Math.max(hip, POD_RIM - 0.02) : hip - 0.05 * k, shoulder, color, shift);
  const armR = mutant ? 0.115 : tank ? 0.075 : ghoul ? 0.05 : 0.06;
  const sleeve = mutant ? skin : shade(color, 14); // super mutants: bare arms
  for (const side of [-1, 1]) {
    if (inPod) break; // arms rest inside the pod
    limbSide = side;
    const f = -swing * side;
    const sh: Vec3 = [0, side * (W + armR * 0.6) + shift, shoulder - 0.04];
    // typing: hands on the desk in front, tapping in short bursts
    const tap = idle?.typing ? Math.max(0, Math.sin(it * 17 + side * 1.7)) * 0.025 * (now_and_then(it * 0.9 + sd) !== 0 ? 0 : 1) : 0;
    const down: Vec3 = [f * 1.4 + 0.03, side * (W + armR * 0.9) + shift * 0.6, shoulder - 0.55 * k + breath * 0.5];
    let hand: Vec3 = down;
    let elbow: Vec3 | null = null;
    if (sit) {
      const grip = Math.sin(it * 1.3 + side) * 0.01; // small steering moves
      hand = sit.hands === 'bar' ? [0.66, side * 0.34, 0.93] // on the handlebar grips
        : sit.hands === 'wheel' ? [0.34, side * 0.15, hip + 0.28 + grip * side]
          : [0.24, side * W * 0.75, hip + 0.1];
    } else if (work === 'repair') {
      // wrench hand works in small circles at the machine, the other hand steadies on the desk
      hand = side > 0
        ? [0.46 + 0.04 * Math.sin(it * 9), 0.08 + 0.05 * Math.cos(it * 9), 0.86 + 0.03 * Math.sin(it * 4.5)]
        : [0.4, -W * 0.7, 0.8];
    } else if (idle?.typing) hand = [0.42, side * W * 0.55 + shift, 0.82 + tap];
    else if (fighting) {
      // fists up; the punching arm shoots forward
      const guard: Vec3 = [0.24, side * 0.15, shoulder - 0.12];
      const out = side === (idle?.punchSide ?? 1) ? idle?.punch ?? 0 : 0;
      hand = [guard[0] + 0.38 * out, guard[1] - side * 0.08 * out, guard[2] + 0.04 * out];
      elbow = [0.08 + 0.2 * out, side * (W + 0.1 - 0.06 * out), shoulder - 0.3 + 0.18 * out];
    } else if (floorSit > 0.5) hand = [-0.22, side * (W + 0.06), hip - 0.14]; // leaning back on the hands
    else if (mood === 'bored' && stretch > 0) {
      // yawn + stretch: arms up over the head
      hand = [down[0] + (0.05 - down[0]) * stretch, down[1] + (side * 0.16 - down[1]) * stretch, down[2] + (head + 0.3 - down[2]) * stretch];
    } else if (mood === 'teller') {
      // gesturing while telling the story
      hand = [0.3 + 0.1 * Math.sin(it * 3.1 + side), side * (W + 0.12 + 0.08 * Math.sin(it * 2.3 + side * 2)), shoulder - 0.18 + 0.16 * Math.sin(it * 3.7 + side * 1.3)];
      elbow = [0.08, side * (W + 0.14), shoulder - 0.28];
    } else if (mood === 'wary') {
      // arms crossed over the chest
      hand = [0.15, -side * 0.08, shoulder - 0.27 - (side > 0 ? 0.03 : 0)];
      elbow = [0.12, side * (W + 0.06), shoulder - 0.3];
    } else if (akimbo > 0) {
      // hands on hips, elbows out
      const onHip: Vec3 = [0.02, side * (W * torso.waist + 0.06) + shift, hip + 0.06];
      const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      hand = lerp(down, onHip, akimbo);
      const mid = lerp(sh, hand, 0.5);
      elbow = [mid[0] - 0.05 * akimbo, mid[1] + side * 0.17 * akimbo, mid[2]];
    }
    if (elbow) {
      capsule(sh, elbow, armR, sleeve);
      capsule(elbow, hand, armR, sleeve);
    } else capsule(sh, hand, armR, sleeve);
    sphere(hand, armR * (mutant ? 1.35 : 1.05), skin, 0.01);
  }
  limbSide = 0;

  // --- gear (neutral metal) ---
  if (wears('backpack')) box([-D - 0.17, -0.15 + shift, hip + 0.1], [-D + 0.02, 0.15 + shift, shoulder - 0.02], METAL);
  if (wears('shoulder_plates')) {
    for (const side of [-1, 1]) {
      limbSide = side;
      cap([0, side * W + shift, shoulder - 0.02], tank ? 0.13 : 0.1, [0, side * 0.5, 0.85], 0.05, METAL, 0.05);
    }
    limbSide = 0;
  }

  // --- head: skin ball, hair cap tilted to the back, ponytail (turned by `look` around the neck) ---
  const hc: Vec3 = [mutant ? 0.1 : 0.02, shift, head];
  const lc = Math.cos(headTurn);
  const ls = Math.sin(headTurn);
  const turn = ([f, s2, u]: Vec3): Vec3 => [f * lc - s2 * ls, f * ls + s2 * lc, u]; // direction
  const at = ([f, s2, u]: Vec3): Vec3 => { const [a, b] = turn([f - hc[0], s2 - hc[1], 0]); return [hc[0] + a, hc[1] + b, u]; };
  sphere(hc, headR, skin);
  if (wears('helmet')) {
    cap(hc, headR * 1.15, turn([-0.15, 0, 1]), -0.05, METAL, 0.02);
    // brim: a flat box in front of the face, turned with the head
    const brim: Vec3[] = [];
    for (const f of [headR * 0.75, headR * 1.25]) for (const s2 of [-headR * 0.9, headR * 0.9]) for (const u of [head + 0.02, head + 0.05]) brim.push(at([f + hc[0] - 0.02, s2 + hc[1], u]));
    add(at([hc[0] + headR, hc[1], head + 0.035]), () => fill(convexHull(brim.map(S)), METAL_DARK), 0.03);
  } else if (mutant || ghoul) {
    // bald: a darker brow ridge / patch instead of hair
    cap(hc, headR * 1.02, turn([0.5, 0, 0.86]), 0.55, shade(skin, -28), 0.02);
  } else {
    cap(hc, headR * 1.06, turn([-0.55, 0, 0.84]), 0.0, hair, 0.02);
    if (female) capsule(at([hc[0] - headR * 0.9, hc[1], head + 0.02]), at([hc[0] - headR * 1.6, hc[1], head - 0.12]), 0.045, hair);
  }

  const shown = parts.filter((p) => half === undefined || (half === 'far') === (p.side === farSide)).sort((a, b) => a.d - b.d);
  sil = true;
  for (const p of shown) p.draw();
  sil = false;
  for (const p of shown) p.draw();
}
