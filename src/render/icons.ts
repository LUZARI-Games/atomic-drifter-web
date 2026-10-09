// System icons for the world view: bold, flat, filled silhouettes (FTL-style readability),
// painted in dark stencil ink on the colour-coded system block. `s` = icon radius in px; every icon fits a circle of radius s.
import Phaser from 'phaser';
import { systemId } from '../core/systems';
import { WORLD } from './palette';

type G = Phaser.GameObjects.Graphics;
const INK_ALPHA = 0.85;
const INK = WORLD.wall; // dark stencil ink, readable on every planner system colour

/** Points rotated by `a` radians around (cx, cy). */
const rot = (pts: [number, number][], a: number, cx: number, cy: number) =>
  pts.map(([px, py]) => new Phaser.Math.Vector2(cx + px * Math.cos(a) - py * Math.sin(a), cy + px * Math.sin(a) + py * Math.cos(a)));

export const KNOWN_ICONS = ['reactor', 'engine', 'cockpit', 'weapons', 'shields', 'sensor', 'doors', 'medbay', 'crewteleporter', 'drones'];

/** `fill` = colour of the block underneath (icon "holes" are cut in it). */
export function drawSystemIcon(g: G, system: string | null, x: number, y: number, s: number, fill: number): void {
  const ink = () => { g.fillStyle(INK, INK_ALPHA); g.lineStyle(Math.max(2, s * 0.13), INK, INK_ALPHA); };
  const cut = () => g.fillStyle(fill, 1); // "holes" in the icon = block colour
  ink();

  switch (systemId(system)) {
    case 'reactor': { // ring + radiation trefoil
      g.strokeCircle(x, y, s * 0.92);
      for (let i = 0; i < 3; i++) {
        const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / 3 - 0.5;
        g.slice(x, y, s * 0.72, a0, a0 + 1.0, false);
        g.fillPath();
      }
      cut(); g.fillCircle(x, y, s * 0.24);
      ink(); g.fillCircle(x, y, s * 0.13);
      break;
    }
    case 'engine': { // 4-blade propeller (no ring, so it never looks like the reactor)
      for (let i = 0; i < 4; i++) {
        const blade: [number, number][] = [[0, -s * 0.1], [s * 0.35, -s * 0.24], [s * 0.95, -s * 0.12], [s * 0.98, s * 0.06], [s * 0.3, s * 0.14], [0, s * 0.1]];
        g.fillPoints(rot(blade, Math.PI / 4 + (i * Math.PI) / 2, x, y), true);
      }
      g.fillCircle(x, y, s * 0.24);
      cut(); g.fillCircle(x, y, s * 0.1);
      break;
    }
    case 'cockpit': { // ship's helm wheel: rim, spokes with handles, hub
      g.lineStyle(Math.max(2, s * 0.16), INK, INK_ALPHA);
      g.strokeCircle(x, y, s * 0.62);
      g.lineStyle(Math.max(2, s * 0.12), INK, INK_ALPHA);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.lineBetween(x, y, x + Math.cos(a) * s * 0.85, y + Math.sin(a) * s * 0.85);
        g.fillCircle(x + Math.cos(a) * s * 0.88, y + Math.sin(a) * s * 0.88, s * 0.11);
      }
      g.fillCircle(x, y, s * 0.24);
      break;
    }
    case 'weapons': { // deck cannon seen from above, barrel towards the bow (right)
      g.fillRect(x - s * 0.05, y - s * 0.17, s * 1.0, s * 0.34); // barrel
      g.fillRect(x + s * 0.78, y - s * 0.24, s * 0.17, s * 0.48); // muzzle
      g.fillCircle(x - s * 0.25, y, s * 0.58); // turret
      cut(); g.fillCircle(x - s * 0.25, y, s * 0.24);
      ink(); g.fillCircle(x - s * 0.25, y, s * 0.12);
      break;
    }
    case 'shields': { // mini airship inside a shield bubble
      g.lineStyle(Math.max(2, s * 0.12), INK, INK_ALPHA);
      g.strokeCircle(x, y, s * 0.92);
      g.lineStyle(Math.max(1, s * 0.06), INK, 0.45);
      g.strokeCircle(x, y, s * 0.74); // inner bubble shimmer
      ink();
      g.fillEllipse(x - s * 0.08, y, s * 1.05, s * 0.5); // hull
      g.fillTriangle(x + s * 0.3, y - s * 0.23, x + s * 0.3, y + s * 0.23, x + s * 0.62, y); // nose (bow right)
      g.fillTriangle(x - s * 0.45, y - s * 0.14, x - s * 0.66, y - s * 0.38, x - s * 0.3, y - s * 0.14); // tail fins
      g.fillTriangle(x - s * 0.45, y + s * 0.14, x - s * 0.66, y + s * 0.38, x - s * 0.3, y + s * 0.14);
      break;
    }
    case 'sensor': { // satellite, tilted like the 🛰 emoji: body, two solar panels, dish
      const t = -Math.PI / 4;
      const rect = (cx: number, cy: number, w: number, h: number): [number, number][] =>
        [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
      g.fillPoints(rot(rect(-s * 0.62, 0, s * 0.5, s * 0.42), t, x, y), true); // left panel
      g.fillPoints(rot(rect(s * 0.62, 0, s * 0.5, s * 0.42), t, x, y), true); // right panel
      g.lineStyle(Math.max(1, s * 0.06), fill, 1); // panel cells
      for (const cx of [-s * 0.62, s * 0.62]) {
        const [p1, p2] = rot([[cx, -s * 0.21], [cx, s * 0.21]], t, x, y);
        g.lineBetween(p1!.x, p1!.y, p2!.x, p2!.y);
      }
      ink();
      g.fillPoints(rot(rect(0, 0, s * 0.36, s * 0.36), t, x, y), true); // body
      const [d1, d2] = rot([[0, s * 0.18], [0, s * 0.45]], t, x, y); // dish arm
      g.lineBetween(d1!.x, d1!.y, d2!.x, d2!.y);
      const dc = rot([[0, s * 0.62]], t, x, y)[0]!;
      g.slice(dc.x, dc.y, s * 0.26, t + Math.PI, t, false); // dish opening outwards
      g.fillPath();
      break;
    }
    case 'doors': { // sliding blast door: frame + two leaves
      g.lineStyle(Math.max(2, s * 0.12), INK, INK_ALPHA);
      g.strokeRect(x - s * 0.7, y - s * 0.85, s * 1.4, s * 1.7);
      ink();
      g.fillRect(x - s * 0.55, y - s * 0.7, s * 0.47, s * 1.4);
      g.fillRect(x + s * 0.08, y - s * 0.7, s * 0.47, s * 1.4);
      break;
    }
    case 'medbay': { // medical cross in a ring
      g.strokeCircle(x, y, s * 0.92);
      g.fillRect(x - s * 0.2, y - s * 0.62, s * 0.4, s * 1.24);
      g.fillRect(x - s * 0.62, y - s * 0.2, s * 1.24, s * 0.4);
      break;
    }
    case 'crewteleporter': { // two pads + beam
      g.fillEllipse(x, y - s * 0.62, s * 1.5, s * 0.45);
      g.fillEllipse(x, y + s * 0.62, s * 1.5, s * 0.45);
      for (const dx of [-0.4, 0, 0.4]) g.lineBetween(x + dx * s, y - s * 0.32, x + dx * s, y + s * 0.32);
      break;
    }
    case 'drones': { // quad drone
      g.lineStyle(Math.max(2, s * 0.14), INK, INK_ALPHA);
      g.lineBetween(x - s * 0.6, y - s * 0.6, x + s * 0.6, y + s * 0.6);
      g.lineBetween(x + s * 0.6, y - s * 0.6, x - s * 0.6, y + s * 0.6);
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) g.fillCircle(x + dx * s * 0.62, y + dy * s * 0.62, s * 0.3);
      g.fillRect(x - s * 0.25, y - s * 0.25, s * 0.5, s * 0.5);
      break;
    }
    default: { // unknown system: riveted plate
      g.strokeRect(x - s * 0.7, y - s * 0.7, s * 1.4, s * 1.4);
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) g.fillCircle(x + dx * s * 0.42, y + dy * s * 0.42, s * 0.1);
    }
  }
}
