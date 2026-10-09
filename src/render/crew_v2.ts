// NEW crew look (compared with the old one in the Crew Lab):
// plain clothes in the ORIGIN COLOUR (never covered), gear = neutral metal add-ons per slot,
// friend/foe = thin ring under the feet (green = own crew, amber = hostile).
// Local space: the figure faces +x; `s` = figure radius in px.
import Phaser from 'phaser';
import { CREW_GEAR, CREW_LOOKS, type CrewLook } from '../core/crew';
import { COLORS, WORLD } from './palette';

type G = Phaser.GameObjects.Graphics;
type V = [number, number];

const hex = (c: string) => parseInt(c.replace('#', ''), 16);
const shade = (c: number, pct: number) => Phaser.Display.Color.ValueToColor(c).darken(pct).color;
const OUTLINE = WORLD.wall;
const METAL = hex(CREW_GEAR.material);
const METAL_DARK = hex(CREW_GEAR.material_dark);

export function drawCrewV2(g: G, look: CrewLook, x: number, y: number, s: number, facing: number, hostile: boolean): void {
  const color = hex(CREW_LOOKS.origins[look.origin].color);
  const skin = hex(CREW_LOOKS.skin_tones[look.skin]!);
  const hair = hex(CREW_LOOKS.hair_colors[look.hair]!);
  const tank = look.build === 'tank';
  const female = look.sex === 'female';
  const wears = (id: string) => look.gear.includes(id as never);

  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  const P = ([lx, ly]: V) => new Phaser.Math.Vector2(x + (lx * cos - ly * sin) * s, y + (lx * sin + ly * cos) * s);
  const line = (w: number, col: number) => g.lineStyle(Math.max(1, w * s), col, 1);
  const poly = (pts: V[], col: number, outline = false) => {
    g.fillStyle(col, 1);
    g.fillPoints(pts.map(P), true);
    if (outline) g.strokePoints(pts.map(P), true);
  };
  const ellipse = (cx: number, cy: number, rx: number, ry: number): V[] =>
    Array.from({ length: 18 }, (_, i) => [cx + Math.cos((i / 18) * 2 * Math.PI) * rx, cy + Math.sin((i / 18) * 2 * Math.PI) * ry]);
  const circle = (cx: number, cy: number, r: number, col: number, outline = false) => {
    const c = P([cx, cy]);
    g.fillStyle(col, 1);
    g.fillCircle(c.x, c.y, r * s);
    if (outline) g.strokeCircle(c.x, c.y, r * s);
  };
  const box = (x0: number, y0: number, x1: number, y1: number): V[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

  const W = 0.62 * CREW_LOOKS.builds[look.build].torso.shoulders * (female ? 0.88 : 1); // shoulder half-width (tanks: V shape)
  const D = tank ? 0.36 : 0.3; // torso half-depth

  // --- friend / foe ring under the feet ---
  line(0.07, hostile ? COLORS.amber : COLORS.green);
  g.strokeCircle(x, y, (W + 0.38) * s);

  line(0.05, OUTLINE);

  // --- back slot ---
  if (wears('backpack')) {
    poly(box(-D - 0.26, -0.32, -D + 0.08, 0.32), METAL, true);
    line(0.04, METAL_DARK);
    g.lineBetween(P([-D - 0.26, 0]).x, P([-D - 0.26, 0]).y, P([-D + 0.02, 0]).x, P([-D + 0.02, 0]).y);
    line(0.05, OUTLINE);
  }

  // --- arms (sleeves in origin colour) + hands ---
  const armR = tank ? 0.24 : 0.18;
  for (const side of [-1, 1]) {
    circle(0.1, side * (W - 0.04), armR, shade(color, 14), true);
    circle(0.42, side * W * 0.62, tank ? 0.13 : 0.1, skin, true);
  }

  // --- torso: plain clothes, collar seam for depth ---
  poly(ellipse(0, 0, D, W), color, true);
  line(0.05, shade(color, 25));
  const c0 = P([D * 0.35, -W * 0.45]);
  const c1 = P([D * 0.55, 0]);
  const c2 = P([D * 0.35, W * 0.45]);
  g.lineBetween(c0.x, c0.y, c1.x, c1.y);
  g.lineBetween(c1.x, c1.y, c2.x, c2.y);
  line(0.05, OUTLINE);

  // --- chest slot ---
  if (wears('shoulder_plates')) {
    for (const side of [-1, 1]) {
      circle(0, side * W * 0.74, tank ? 0.32 : 0.25, METAL, true);
      circle(0, side * W * 0.74, tank ? 0.14 : 0.1, METAL_DARK); // rivet plate
    }
  }

  // --- head ---
  const hx = 0.06;
  const hr = 0.3;
  if (female && !wears('helmet')) poly(ellipse(hx - 0.36, 0, 0.15, 0.1), hair, true); // ponytail
  circle(hx, 0, hr, skin, true);
  if (wears('helmet')) {
    circle(hx - 0.05, 0, hr * 1.08, METAL, true); // cap from above, face edge stays visible at the front
    poly(box(hx + 0.14, -0.2, hx + 0.24, 0.2), METAL_DARK); // brim
  } else {
    g.fillStyle(hair, 1);
    const c = P([hx - 0.06, 0]);
    g.fillCircle(c.x, c.y, hr * 0.9 * s);
  }
}
