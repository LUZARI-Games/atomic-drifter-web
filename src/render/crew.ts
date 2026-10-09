// Crew figures for the world view: flat top-down, built from a few simple shapes for readability.
// Read order: silhouette = build (normal / tank), outfit colour + one detail = origin, hair = sex.
// Local space: the figure faces +x; `s` = figure radius in px.
import Phaser from 'phaser';
import { CREW_LOOKS, type CrewLook } from '../core/crew';
import { WORLD } from './palette';

type G = Phaser.GameObjects.Graphics;
type V = [number, number];

const hex = (c: string) => parseInt(c.replace('#', ''), 16);
const shade = (c: number, pct: number) => Phaser.Display.Color.ValueToColor(c).darken(pct).color;
const OUTLINE = WORLD.wall;

export function drawCrew(g: G, look: CrewLook, x: number, y: number, s: number, facing: number): void {
  const o = CREW_LOOKS.origins[look.origin];
  const outfit = hex(o.outfit);
  const accent = hex(o.accent);
  const trim = hex(o.trim);
  const skin = hex(CREW_LOOKS.skin_tones[look.skin]!);
  const hair = hex(CREW_LOOKS.hair_colors[look.hair]!);
  const tank = look.build === 'tank';
  const female = look.sex === 'female';

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
  const spikes = (cy: number, side: number) => {
    for (const dx of [-0.16, 0.0, 0.16]) poly([[dx - 0.07, cy], [dx + 0.07, cy], [dx, cy + side * 0.24]], WORLD.label);
  };

  const W = 0.62 * CREW_LOOKS.builds[look.build].shoulders * (female ? 0.88 : 1); // shoulder half-width
  const D = tank ? 0.36 : 0.3; // torso half-depth
  line(0.05, OUTLINE);

  // --- behind the body ---
  if (look.origin === 'deserter') {
    poly([[0.05, -W * 1.02], [-D - 0.42, -W * 0.85], [-D - 0.56, -W * 0.3], [-D - 0.4, 0], [-D - 0.58, W * 0.38], [-D - 0.44, W * 0.86], [0.05, W * 1.02]], accent, true);
  }
  if (look.origin === 'ironmall' && !tank) poly(box(-D - 0.24, -0.3, -D + 0.08, 0.3), accent, true); // backpack
  if (look.origin === 'sentinel' && tank) poly(box(-D - 0.2, -0.32, -D + 0.1, 0.32), trim, true); // power core

  // --- arms + hands (forward = facing) ---
  const armR = tank ? 0.24 : 0.18;
  const gloves = look.origin === 'sentinel' && tank ? shade(outfit, 10) : skin;
  for (const side of [-1, 1]) {
    circle(0.1, side * (W - 0.04), armR, shade(outfit, 12), true);
    circle(0.42, side * W * 0.62, tank ? 0.13 : 0.1, gloves, true);
  }

  // --- torso ---
  poly(ellipse(0, 0, D, W), outfit, true);

  // --- origin details on the shoulders ---
  switch (look.origin) {
    case 'raider':
      circle(0, -W * 0.72, tank ? 0.3 : 0.24, accent, true); // scrap pad on one shoulder only
      spikes(-W * 0.72 - (tank ? 0.22 : 0.16), -1);
      if (tank) {
        circle(0, W * 0.72, 0.3, accent, true);
        spikes(W * 0.72 + 0.22, 1);
        line(0.07, trim);
        g.lineBetween(P([-D * 0.7, -W * 0.5]).x, P([-D * 0.7, -W * 0.5]).y, P([D * 0.7, W * 0.5]).x, P([D * 0.7, W * 0.5]).y); // strap
        line(0.05, OUTLINE);
      }
      break;
    case 'sentinel':
      if (tank) {
        for (const side of [-1, 1]) {
          circle(0, side * W * 0.72, 0.36, shade(outfit, -15), true); // power armour pauldrons
          line(0.07, accent);
          const c = P([0, side * W * 0.72]);
          g.strokeCircle(c.x, c.y, 0.26 * s);
          line(0.05, OUTLINE);
        }
      } else {
        for (const side of [-1, 1]) poly(box(-0.14, side * W * 0.5, 0.14, side * W * 0.95), accent, true); // brass plates
      }
      break;
    case 'deserter':
      if (tank) circle(0, W * 0.72, 0.36, shade(outfit, -10), true); // one pauldron left, the other torn off
      else poly(box(-0.14, W * 0.5, 0.14, W * 0.95), shade(outfit, -15), true);
      circle(-0.1, -W * 0.35, 0.09, trim); // rust patch
      break;
    case 'ironmall':
      if (tank) {
        poly(box(-0.12, -W * 0.7, 0.12, W * 0.7), trim, true); // sports shoulder pads: band + two humps
        for (const side of [-1, 1]) circle(0, side * W * 0.74, 0.3, trim, true);
      }
      else poly(box(-0.06, -W * 0.85, 0.06, W * 0.85), accent); // backpack straps
      break;
  }

  // --- head ---
  const hx = 0.06;
  const hr = 0.3;
  if (look.origin === 'sentinel' && tank) {
    circle(hx, 0, hr * 1.12, shade(outfit, -8), true); // closed helmet
    poly(box(hx + 0.12, -0.17, hx + 0.3, 0.17), trim); // visor
    line(0.06, accent);
    g.lineBetween(P([hx - 0.3, 0]).x, P([hx - 0.3, 0]).y, P([hx + 0.08, 0]).x, P([hx + 0.08, 0]).y);
    return;
  }
  const hairCol = look.origin === 'raider' ? accent : hair; // raiders dye their hair
  if (female) poly(ellipse(hx - 0.36, 0, 0.15, 0.1), hairCol, true); // ponytail
  circle(hx, 0, hr, skin, true);
  if (look.origin === 'raider' && !female) {
    poly(box(hx - hr * 0.95, -0.06, hx + hr * 0.7, 0.06), hairCol); // mohawk on a shaved head
  } else {
    g.fillStyle(hairCol, 1);
    const c = P([hx - 0.06, 0]);
    g.fillCircle(c.x, c.y, hr * 0.9 * s); // hair from above, face side stays visible
  }
}
