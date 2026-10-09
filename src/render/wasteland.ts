// Parallax flight over the Capital-Wasteland-style ground (Fallout 3 mood): the airship stays put, the world slides
// past underneath it, opposite to the flight direction (bow). Every layer uses the same look-down view as the ship;
// nearer layers are drawn bigger, so they move faster on screen = depth.
//   WastelandScene (under the ship): ground → ruins / dead trees / pylons → ship shadow → low smog
//   HazeScene (over the ship): faint wisps sliding over it
// Purely visual; procedural from a seeded hash per grid cell, so it never repeats visibly and costs no data.
import Phaser from 'phaser';
import { airshipHull } from '../core/hull';
import { makeView, project, unprojectFloor, type Vec2, type Vec3, type View } from '../core/projection';
import type { Ship } from '../core/types';
import { WASTE } from './palette';

/** What the wasteland needs from the ship scene each frame. */
export interface ShipOnScreen {
  /** Screen position of the ship centre and the camera zoom relative to the fitted view. */
  screen(): { x: number; y: number; zoom: number };
}

const FLIGHT_SPEED = 7; // m/s over the ground
const PAN_FOLLOW = 0.35; // how much the far world follows when the player drags the ship view (parallax on pan too)
const ZOOM_FOLLOW = 0.3; // how much the far world follows the zoom

/** Tiny deterministic random per cell: same cell -> same ruins, forever. */
function rng(ix: number, iy: number, seed: number): () => number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) >>> 0;
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  };
}

interface Layer {
  scale: number; // px per meter (bigger = nearer = faster)
  cell: number; // grid cell size in meters
  seed: number;
}

const GROUND: Layer = { scale: 12, cell: 10, seed: 1 };
const RUINS: Layer = { scale: 15, cell: 16, seed: 2 };
const SMOG: Layer = { scale: 26, cell: 20, seed: 3 };
const HAZE: Layer = { scale: 70, cell: 34, seed: 4 };

/** Draws one layer: maps layer meters to screen and loops over the visible grid cells. */
class LayerPainter {
  constructor(
    private readonly g: Phaser.GameObjects.Graphics,
    private readonly view: View,
  ) {}

  ax = 0;
  ay = 0;
  scale = 1;
  offset = 0; // meters flown (the world moves towards -x = against the bow)

  S([x, y, z]: Vec3): Phaser.Math.Vector2 {
    const [sx, sy] = project(this.view, [x - this.offset, y, z]);
    return new Phaser.Math.Vector2(this.ax + sx * this.scale, this.ay + sy * this.scale);
  }

  /** Visible cells (with `margin` meters extra for tall things), far ones first. */
  cells(layer: Layer, w: number, h: number, margin: number): [number, number][] {
    const corners: Vec2[] = [[0, 0], [w, 0], [0, h], [w, h]].map(([px, py]) =>
      unprojectFloor(this.view, [(px! - this.ax) / this.scale, (py! - this.ay) / this.scale]),
    );
    const xs = corners.map((c) => c[0] + this.offset);
    const ys = corners.map((c) => c[1]);
    const c = layer.cell;
    const out: [number, number][] = [];
    for (let ix = Math.floor((Math.min(...xs) - margin) / c); ix <= Math.ceil((Math.max(...xs) + margin) / c); ix++)
      for (let iy = Math.floor((Math.min(...ys) - margin) / c); iy <= Math.ceil((Math.max(...ys) + margin) / c); iy++) out.push([ix, iy]);
    // painter's order in the turned view: smaller x + y = farther away
    return out.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  }

  poly(pts: Vec3[], color: number, alpha = 1): void {
    this.g.fillStyle(color, alpha);
    this.g.fillPoints(pts.map((p) => this.S(p)), true);
  }

  blob(cx: number, cy: number, r: number, color: number, alpha: number, rand: () => number, z = 0): void {
    const n = 7;
    const pts: Vec3[] = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (0.65 + rand() * 0.5);
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, z];
    });
    this.poly(pts, color, alpha);
  }

  ring(cx: number, cy: number, r: number, color: number, alpha: number, width: number, z = 0): void {
    const pts = Array.from({ length: 20 }, (_, i) => this.S([cx + Math.cos((i / 20) * Math.PI * 2) * r, cy + Math.sin((i / 20) * Math.PI * 2) * r, z]));
    this.g.lineStyle(width, color, alpha);
    this.g.strokePoints(pts, true);
  }

  line(a: Vec3, b: Vec3, color: number, width: number, alpha = 1): void {
    const p = this.S(a);
    const q = this.S(b);
    this.g.lineStyle(width, color, alpha);
    this.g.lineBetween(p.x, p.y, q.x, q.y);
  }
}

export class WastelandScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private painter!: LayerPainter;
  private readonly view = makeView(60, 45);
  private shadow: Vec2[] = [];

  constructor(
    private readonly ship: Ship,
    private readonly getShip: () => ShipOnScreen | null,
  ) {
    super({ key: 'wasteland', active: true });
  }

  create(): void {
    this.g = this.add.graphics();
    this.painter = new LayerPainter(this.g, this.view);
    // ship shadow: hull outline flat on the ground (ship space [x, z] -> view [-z, x])
    this.shadow = airshipHull(this.ship).outline.map(([x, z]) => [-z, x]);
  }

  override update(time: number): void {
    const { width, height } = this.scale;
    const s = this.getShip()?.screen() ?? { x: width / 2, y: height / 2, zoom: 1 };
    const zoom = Math.pow(Math.max(0.2, s.zoom), ZOOM_FOLLOW);
    const ax = width / 2 + (s.x - width / 2) * PAN_FOLLOW;
    const ay = height / 2 + (s.y - height / 2) * PAN_FOLLOW;
    const flown = (time / 1000) * FLIGHT_SPEED;
    const p = this.painter;
    const g = this.g;
    g.clear();
    g.fillStyle(WASTE.ground, 1);
    g.fillRect(0, 0, width, height);

    const setLayer = (l: Layer) => {
      p.scale = l.scale * zoom;
      p.ax = ax;
      p.ay = ay;
      p.offset = flown;
    };

    // --- ground: dust patches, cracks, craters, broken highway, murky puddles, rubble ---
    setLayer(GROUND);
    for (const [ix, iy] of p.cells(GROUND, width, height, 4)) {
      const r = rng(ix, iy, GROUND.seed);
      const x0 = ix * GROUND.cell;
      const y0 = iy * GROUND.cell;
      const at = (): [number, number] => [x0 + r() * GROUND.cell, y0 + r() * GROUND.cell];
      if (iy % 5 === 0) {
        // old highway along the flight line: asphalt, faded lane paint, broken edges, missing chunks
        if (r() > 0.12) {
          p.poly([[x0, y0 + 1, 0], [x0 + GROUND.cell, y0 + 1, 0], [x0 + GROUND.cell, y0 + 6, 0], [x0, y0 + 6, 0]], WASTE.road);
          p.line([x0, y0 + 1, 0], [x0 + GROUND.cell, y0 + 1, 0], WASTE.crack, Math.max(1, 1.2 * zoom));
          p.line([x0, y0 + 6, 0], [x0 + GROUND.cell, y0 + 6, 0], WASTE.crack, Math.max(1, 1.2 * zoom));
          if (r() > 0.3) p.line([x0 + 1.5, y0 + 3.5, 0], [x0 + 5, y0 + 3.5, 0], WASTE.roadPaint, Math.max(1, 1.4 * zoom), 0.8);
          if (r() > 0.5) p.line([x0 + 6.5, y0 + 3.5, 0], [x0 + 9, y0 + 3.5, 0], WASTE.roadPaint, Math.max(1, 1.4 * zoom), 0.8);
          if (r() < 0.35) { const cx = x0 + r() * GROUND.cell; p.blob(cx, y0 + 3.5, 1.2 + r(), WASTE.ground, 1, r); } // pothole
        }
        continue; // nothing else on the road
      }
      // soft dust patches (low contrast, so the ground stays calm behind the ship)
      if (r() < 0.6) { const [cx, cy] = at(); p.blob(cx, cy, 3 + r() * 4, r() > 0.5 ? WASTE.dust : WASTE.dirtDark, 0.28, r); }
      if (r() < 0.35) {
        let [cx, cy] = at();
        for (let k = 0; k < 4; k++) { const nx = cx + (r() - 0.5) * 6; const ny = cy + (r() - 0.5) * 6; p.line([cx, cy, 0], [nx, ny, 0], WASTE.crack, Math.max(1, 1.4 * zoom)); cx = nx; cy = ny; }
      }
      if (r() < 0.07) { const [cx, cy] = at(); const rr = 1.5 + r() * 2.5; p.blob(cx, cy, rr, WASTE.crater, 0.9, r); p.ring(cx, cy, rr * 1.05, WASTE.craterRim, 0.7, Math.max(1, 1.5 * zoom)); }
      if (r() < 0.07) { const [cx, cy] = at(); p.blob(cx, cy, 1.5 + r() * 2, WASTE.puddle, 0.85, r); }
      for (let k = 0; k < 3; k++) { const [cx, cy] = at(); p.blob(cx, cy, 0.25 + r() * 0.35, WASTE.rubble, 0.9, r); }
    }

    // --- ruins, dead trees, power pylons (taller -> drawn a bit nearer/faster) ---
    setLayer(RUINS);
    for (const [ix, iy] of p.cells(RUINS, width, height, 14)) {
      const r = rng(ix, iy, RUINS.seed);
      const x0 = ix * RUINS.cell + r() * RUINS.cell * 0.6;
      const y0 = iy * RUINS.cell + r() * RUINS.cell * 0.6;
      const kind = r();
      if (iy % 2 === 0 && (iy * RUINS.cell) % 5 === 0) continue; // keep the highway rows clear
      if (kind < 0.3) this.ruin(x0, y0, r);
      else if (kind < 0.46) this.deadTree(x0, y0, r, zoom);
      else if (kind < 0.52) this.pylon(x0, y0, zoom);
    }

    // --- the airship's shadow far below (sun from the upper left) ---
    setLayer(GROUND);
    p.offset = 0; // the shadow travels with the ship
    const sh = this.shadow.map(([x, y]): Vec3 => [x * 0.9 + 9, y * 0.9 + 6, 0]);
    p.poly(sh, WASTE.shadow, 0.45);

    // --- low smog drifting just under the ship ---
    setLayer(SMOG);
    for (const [ix, iy] of p.cells(SMOG, width, height, 6)) {
      const r = rng(ix, iy, SMOG.seed);
      if (r() > 0.28) continue;
      const cx = ix * SMOG.cell + r() * SMOG.cell;
      const cy = iy * SMOG.cell + r() * SMOG.cell;
      for (let k = 0; k < 4; k++) p.blob(cx + (r() - 0.5) * 6, cy + (r() - 0.5) * 3, 2.5 + r() * 3, WASTE.smog, 0.16, r);
    }
  }

  /** Collapsed pre-war building: two visible walls with broken tops + dark window holes. */
  private ruin(x: number, y: number, r: () => number): void {
    const p = this.painter;
    const w = 5 + r() * 5;
    const d = 5 + r() * 5;
    const h = 4 + r() * 7;
    const top = () => h * (0.45 + r() * 0.55);
    // footprint corners: (x,y) back … (x+w,y+d) front; visible faces = +x side and +y side
    const hA = top(), hB = top(), hC = top(), hM = top();
    p.poly([[x, y, 0], [x + w, y, 0], [x + w, y + d, 0], [x, y + d, 0]], WASTE.rubble, 0.8); // floor slab + debris
    // +x face (towards the bow)
    p.poly([[x + w, y, 0], [x + w, y + d, 0], [x + w, y + d, hC], [x + w, y + d * 0.5, hM], [x + w, y, hB]], WASTE.ruinSide);
    // +y face (towards the viewer)
    p.poly([[x, y + d, 0], [x + w, y + d, 0], [x + w, y + d, hC], [x + w * 0.5, y + d, hM * 0.8], [x, y + d, hA]], WASTE.ruinFront);
    // window holes
    for (let k = 0; k < 3; k++) {
      const u = 0.15 + k * 0.28;
      const z0 = 1 + r() * 0.5;
      if (z0 + 1 < Math.min(hA, hC)) p.poly([[x + w * u, y + d, z0], [x + w * (u + 0.12), y + d, z0], [x + w * (u + 0.12), y + d, z0 + 1], [x + w * u, y + d, z0 + 1]], WASTE.window);
      if (z0 + 1 < Math.min(hB, hC)) p.poly([[x + w, y + d * u, z0], [x + w, y + d * (u + 0.12), z0], [x + w, y + d * (u + 0.12), z0 + 1], [x + w, y + d * u, z0 + 1]], WASTE.window);
    }
    // rebar sticking out of the broken top
    p.line([x + w, y + d, hC], [x + w + 0.3, y + d + 0.2, hC + 1], WASTE.rebar, 1.2);
  }

  private deadTree(x: number, y: number, r: () => number, zoom: number): void {
    const p = this.painter;
    const h = 3 + r() * 3;
    p.blob(x, y, 0.6, WASTE.dirtDark, 0.7, r);
    p.line([x, y, 0], [x, y, h], WASTE.tree, Math.max(1.5, 2.2 * zoom));
    for (let k = 0; k < 3; k++) {
      const z = h * (0.45 + k * 0.18);
      const a = r() * Math.PI * 2;
      p.line([x, y, z], [x + Math.cos(a) * 1.4, y + Math.sin(a) * 1.4, z + 0.9], WASTE.tree, Math.max(1, 1.4 * zoom));
    }
  }

  private pylon(x: number, y: number, zoom: number): void {
    const p = this.painter;
    const h = 11;
    const legs: [number, number][] = [[-1.2, -1.2], [1.2, -1.2], [1.2, 1.2], [-1.2, 1.2]];
    const w = Math.max(1, 1.1 * zoom);
    for (const [dx, dy] of legs) p.line([x + dx, y + dy, 0], [x + dx * 0.3, y + dy * 0.3, h], WASTE.pylon, w);
    for (const z of [3.5, 7]) {
      const k = 1 - (z / h) * 0.7;
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = legs[i]!;
        const [bx, by] = legs[(i + 1) % 4]!;
        p.line([x + ax * k, y + ay * k, z], [x + bx * k, y + by * k, z], WASTE.pylon, w);
      }
    }
    p.line([x, y - 3.5, h - 1], [x, y + 3.5, h - 1], WASTE.pylon, w); // cross arm
  }
}

/** Faint haze wisps sliding OVER the ship (nearest layer, fastest). */
export class HazeScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private painter!: LayerPainter;

  constructor(private readonly getShip: () => ShipOnScreen | null) {
    super({ key: 'haze', active: true });
  }

  create(): void {
    this.g = this.add.graphics();
    this.painter = new LayerPainter(this.g, makeView(60, 45));
  }

  override update(time: number): void {
    const { width, height } = this.scale;
    const s = this.getShip()?.screen() ?? { x: width / 2, y: height / 2, zoom: 1 };
    const p = this.painter;
    this.g.clear();
    p.scale = HAZE.scale * Math.pow(Math.max(0.2, s.zoom), 0.6);
    p.ax = width / 2 + (s.x - width / 2) * 0.8;
    p.ay = height / 2 + (s.y - height / 2) * 0.8;
    p.offset = (time / 1000) * FLIGHT_SPEED;
    for (const [ix, iy] of p.cells(HAZE, width, height, 10)) {
      const r = rng(ix, iy, HAZE.seed);
      if (r() > 0.18) continue;
      const cx = ix * HAZE.cell + r() * HAZE.cell;
      const cy = iy * HAZE.cell + r() * HAZE.cell;
      for (let k = 0; k < 5; k++) p.blob(cx + (r() - 0.5) * 9, cy + (r() - 0.5) * 3, 2 + r() * 3, WASTE.haze, 0.07, r);
    }
  }
}
