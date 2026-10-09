// Ship Lab renderer: the airship seen from any look-down angle (90° = top-down, 60°, 45°), orthographic, flat 2D shapes.
// Every object is a flat footprint extruded to its height (ship3d.ts); visible side faces get darker paint,
// tops the normal paint. Painter's order: deck first, then walls / door frames / system blocks / crew from back to front.
import Phaser from 'phaser';
import type { CrewLook } from '../core/crew';
import { airshipHull, blockPolygons, systemBlocks } from '../core/hull';
import { project, type Vec2, type Vec3, type View } from '../core/projection';
import { roomFloorCenter } from '../core/ship';
import { doorThreshold, SHIP_HEIGHTS, shipSolids, type Solid } from '../core/ship3d';
import { systemColor } from '../core/systems';
import type { Point, Ship } from '../core/types';
import { drawCrewIso } from './crew_iso';
import { drawSystemIcon } from './icons';
import { FONT_FAMILY, FONT_SIZES, WORLD, worldPaint } from './palette';

type G = Phaser.GameObjects.Graphics;
type V2 = Phaser.Math.Vector2;

const BLOCK_GAP_M = 0.32; // gap between a system block and the walls
const ICON_RADIUS_M = 0.5;
const FRAME = 0x9a8650; // brass door frame – brighter than the walls so doors stand out
const shade = (c: number, pct: number) =>
  pct >= 0 ? Phaser.Display.Color.ValueToColor(c).darken(pct).color : Phaser.Display.Color.ValueToColor(c).lighten(-pct).color;

export interface CrewOnDeck {
  look: CrewLook;
  at: Point; // ship space
  facing: number; // screen angle, 0 = towards the bow (right)
}

/** Ship space [x, z] + height -> view world (x = towards the bow/right, y = starboard/towards the viewer, z = up). */
const W = ([x, z]: Point, h = 0): Vec3 => [-z, x, h];

export class ShipView {
  constructor(
    private readonly ship: Ship,
    private readonly view: View,
    private readonly pxPerM: number,
  ) {}

  private ox = 0;
  private oy = 0;

  private S(p: Vec3): V2 {
    const [sx, sy] = project(this.view, p);
    return new Phaser.Math.Vector2(this.ox + sx * this.pxPerM, this.oy + sy * this.pxPerM);
  }

  /** Screen-space bounds of the whole ship (relative to the origin) – for laying out panels. */
  bounds(): Phaser.Geom.Rectangle {
    const hull = airshipHull(this.ship);
    const pts: Vec3[] = [];
    const r = hull.propRadius;
    for (const p of [...hull.outline, ...hull.fins.flat(), ...hull.propellers.flatMap(([x, z]) => [[x - r, z + r], [x + r, z + r]] as Point[])]) {
      pts.push(W(p, 0), W(p, -SHIP_HEIGHTS.hull_depth_m), W(p, SHIP_HEIGHTS.door_frame_height_m));
    }
    const s = pts.map((p) => project(this.view, p));
    const xs = s.map((p) => p[0] * this.pxPerM);
    const ys = s.map((p) => p[1] * this.pxPerM);
    return new Phaser.Geom.Rectangle(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  }

  /** Draw the ship with its origin at (ox, oy). Deck goes to `deck`, everything standing to `objects`, labels in between. */
  draw(scene: Phaser.Scene, deck: G, objects: G, ox: number, oy: number, crew: CrewOnDeck[]): void {
    this.ox = ox;
    this.oy = oy;
    this.drawHull(deck);
    this.drawDeck(deck);
    this.drawLabels(scene);

    // standing things, back to front
    const items: { key: number; draw: () => void }[] = [];
    for (const s of shipSolids(this.ship)) items.push({ key: this.sortKey(s.footprint, s.z0), draw: () => this.drawSolid(objects, s) });
    for (const b of systemBlocks(this.ship)) {
      const polys = blockPolygons(b, BLOCK_GAP_M);
      items.push({ key: this.sortKey(polys.flat(), 0), draw: () => this.drawBlock(objects, b.system, b.anchor, polys, b.room) });
    }
    for (const c of crew) {
      const feet = W(c.at, 0);
      items.push({
        key: feet[1] + 0.001,
        draw: () => {
          const p = this.S(feet);
          drawCrewIso(objects, this.view, c.look, p.x, p.y, this.pxPerM, c.facing, 0, false);
        },
      });
    }
    items.sort((a, b) => a.key - b.key);
    for (const it of items) it.draw();
  }

  /** Nearest point to the viewer decides the order (low objects on a grid). */
  private sortKey(footprint: Point[], z0: number): number {
    return Math.max(...footprint.map((p) => W(p)[1])) + z0 * 0.001;
  }

  private drawHull(g: G): void {
    const h = airshipHull(this.ship);
    const px = this.pxPerM;

    // propellers lie flat behind the stern
    for (const p of h.propellers) {
      const c = W(p, 0);
      const r = h.propRadius;
      const disc = Array.from({ length: 24 }, (_, i): Vec3 => [c[0] + Math.cos((i / 24) * 2 * Math.PI) * r, c[1] + Math.sin((i / 24) * 2 * Math.PI) * r, 0]);
      g.lineStyle(Math.max(3, px * 0.18), WORLD.wall, 1);
      const a = this.S(c);
      const b = this.S([c[0] - r - 0.9, c[1], 0]);
      g.lineBetween(a.x, a.y, b.x, b.y);
      g.fillStyle(WORLD.wallTop, 0.12);
      g.fillPoints(disc.map((q) => this.S(q)), true);
      g.lineStyle(Math.max(3, px * 0.14), WORLD.hullEdge, 1);
      for (const s of [1, -1]) {
        const p1 = this.S([c[0] - r * 0.25 * s, c[1] - r * 0.95, 0]);
        const p2 = this.S([c[0] + r * 0.25 * s, c[1] + r * 0.95, 0]);
        g.lineBetween(p1.x, p1.y, p2.x, p2.y);
      }
    }

    // tail fins
    for (const f of h.fins) {
      const pts = f.map((p) => this.S(W(p, 0)));
      g.fillStyle(WORLD.hull, 1);
      g.fillPoints(pts, true);
      g.lineStyle(Math.max(2, px * 0.08), WORLD.hullEdge, 1);
      g.strokePoints(pts, true);
    }

    // hull side (visible below the deck edge when looking at an angle), then the deck plating on top
    const outline = h.outline.map((p) => W(p, 0));
    if (this.view.cos > 0.01) {
      const down = SHIP_HEIGHTS.hull_depth_m;
      const n = outline.length;
      const cx = outline.reduce((s, p) => s + p[0], 0) / n;
      const cy = outline.reduce((s, p) => s + p[1], 0) / n;
      for (let i = 0; i < n; i++) {
        const a = outline[i]!;
        const b = outline[(i + 1) % n]!;
        const ny = this.outwardY(a, b, cx, cy);
        if (ny <= 0.01) continue;
        g.fillStyle(shade(WORLD.hull, 18 + 12 * (1 - ny)), 1);
        g.fillPoints([a, b, [b[0], b[1], -down], [a[0], a[1], -down]].map((p) => this.S(p as Vec3)), true);
      }
      g.lineStyle(Math.max(2, px * 0.06), shade(WORLD.hull, 35), 1);
      g.strokePoints(outline.map((p) => this.S([p[0], p[1], -down])), true);
    }
    const body = outline.map((p) => this.S(p));
    g.fillStyle(WORLD.hull, 1);
    g.fillPoints(body, true);
    g.lineStyle(Math.max(3, px * 0.12), WORLD.hullEdge, 1);
    g.strokePoints(body, true);
  }

  private drawDeck(g: G): void {
    const px = this.pxPerM;
    for (const t of this.ship.tiles) {
      g.fillStyle(WORLD.floor, 1);
      g.fillPoints(t.polygon.map((p) => this.S(W(p))), true);
      const inner = t.polygon.map(([x, z]): Point => {
        const dx = x - t.center[0];
        const dz = z - t.center[1];
        const l = Math.hypot(dx, dz) || 1;
        return [x - (dx / l) * 0.14, z - (dz / l) * 0.14];
      });
      g.lineStyle(Math.max(1, px * 0.05), WORLD.floorSeam, 1);
      g.strokePoints(inner.map((p) => this.S(W(p))), true);
    }
    // door thresholds: brass plate in the opening, airlocks with hazard stripes
    for (const d of this.ship.doors) {
      const plate = doorThreshold(d).map((p) => this.S(W(p)));
      g.fillStyle(d.kind === 'airlock' ? WORLD.airlock : shade(FRAME, 25), 1);
      g.fillPoints(plate, true);
      if (d.kind === 'airlock') {
        const [a, b, c, e] = doorThreshold(d);
        g.fillStyle(WORLD.hazard, 0.8);
        for (let i = 0; i < 4; i++) {
          const t0 = (i + 0.25) / 4;
          const t1 = t0 + 1 / 8;
          const lerp = (p: Point, q: Point, t: number): Point => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
          g.fillPoints([lerp(a!, b!, t0), lerp(a!, b!, t1), lerp(e!, c!, t1), lerp(e!, c!, t0)].map((p) => this.S(W(p))), true);
        }
      }
    }
  }

  /** Stencil paint on the free deck of each system room, squashed like the floor. */
  private drawLabels(scene: Phaser.Scene): void {
    for (const room of this.ship.rooms) {
      if (room.kind !== 'system') continue;
      const c = roomFloorCenter(this.ship, room.id);
      if (!c) continue;
      const free = this.ship.tiles.filter((t) => t.room === room.id && !t.machinery);
      const tiles = free.length ? free : this.ship.tiles.filter((t) => t.room === room.id);
      const xs = tiles.flatMap((t) => t.polygon.map((p) => this.S(W(p)).x));
      const roomW = Math.max(...xs) - Math.min(...xs);
      const pos = this.S(W(c));
      const label = scene.add
        .text(pos.x, pos.y, (room.label || room.id).toUpperCase(), {
          fontFamily: FONT_FAMILY,
          fontSize: `${FONT_SIZES.small}px`,
          color: '#' + WORLD.label.toString(16).padStart(6, '0'),
          resolution: 4,
        })
        .setLetterSpacing(1)
        .setAlpha(0.7)
        .setOrigin(0.5)
        .setScale(1, this.view.sin);
      if (label.width > roomW * 0.9) label.setVisible(false);
    }
  }

  /** World-y component of the outward normal of edge a-b (positive = faces the viewer). */
  private outwardY(a: Vec3 | Vec2, b: Vec3 | Vec2, cx: number, cy: number): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    let nx = dy / l;
    let ny = -dx / l;
    const mx = (a[0] + b[0]) / 2 - cx;
    const my = (a[1] + b[1]) / 2 - cy;
    if (nx * mx + ny * my < 0) {
      nx = -nx;
      ny = -ny;
    }
    return ny;
  }

  /** Convex footprint extruded from z0 to z1: front faces darker, top in the base paint. */
  private prism(g: G, footprint: Point[], z0: number, z1: number, top: number, side: number, edge?: number): void {
    const pts = footprint.map((p) => W(p));
    const n = pts.length;
    const cx = pts.reduce((s, p) => s + p[0], 0) / n;
    const cy = pts.reduce((s, p) => s + p[1], 0) / n;
    if (this.view.cos > 0.01) {
      for (let i = 0; i < n; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % n]!;
        const ny = this.outwardY(a, b, cx, cy);
        if (ny <= 0.01) continue;
        g.fillStyle(shade(side, 10 * (1 - ny)), 1);
        g.fillPoints([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]].map((p) => this.S(p as Vec3)), true);
      }
    }
    const topPts = pts.map((p) => this.S([p[0], p[1], z1]));
    g.fillStyle(top, 1);
    g.fillPoints(topPts, true);
    if (edge !== undefined) {
      g.lineStyle(Math.max(1, this.pxPerM * 0.04), edge, 0.7);
      g.strokePoints(topPts, true);
    }
  }

  private drawSolid(g: G, s: Solid): void {
    switch (s.kind) {
      case 'wall':
        this.prism(g, s.footprint, s.z0, s.z1, shade(WORLD.wall, -22), shade(WORLD.wall, -12), WORLD.wallTop);
        break;
      case 'railing':
        this.prism(g, s.footprint, s.z0, s.z1, WORLD.hullEdge, shade(WORLD.hullEdge, 30));
        break;
      case 'door_post':
      case 'door_lintel': {
        const col = s.door === 'airlock' ? WORLD.airlock : FRAME;
        this.prism(g, s.footprint, s.z0, s.z1, shade(col, -8), shade(col, 28), shade(col, 45));
        break;
      }
    }
  }

  /** System block: one continuous 1 m block (tile pieces share their inner edges), symbol on top. */
  private drawBlock(g: G, system: string | null, anchor: Point, polys: Point[][], room: string): void {
    const fill = worldPaint(systemColor(this.ship.rooms.find((r) => r.id === room)));
    const side = shade(fill, 30);
    const h = SHIP_HEIGHTS.system_height_m;
    const key = (p: Point) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;

    // outer edges = edges used by only one tile piece
    const edges: { a: Point; b: Point; poly: Point[] }[] = [];
    const count = new Map<string, number>();
    for (const poly of polys) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        const k = [key(a), key(b)].sort().join('|');
        count.set(k, (count.get(k) ?? 0) + 1);
        edges.push({ a, b, poly });
      }
    }
    const outer = edges.filter((e) => count.get([key(e.a), key(e.b)].sort().join('|')) === 1);

    if (this.view.cos > 0.01) {
      const faces = outer
        .map(({ a, b, poly }) => {
          const wa = W(a);
          const wb = W(b);
          const c = poly.map((p) => W(p));
          const cx = c.reduce((s, p) => s + p[0], 0) / c.length;
          const cy = c.reduce((s, p) => s + p[1], 0) / c.length;
          return { wa, wb, ny: this.outwardY(wa, wb, cx, cy), d: Math.max(wa[1], wb[1]) };
        })
        .filter((f) => f.ny > 0.01)
        .sort((p, q) => p.d - q.d);
      for (const f of faces) {
        g.fillStyle(shade(side, 10 * (1 - f.ny)), 1);
        g.fillPoints([[f.wa[0], f.wa[1], 0], [f.wb[0], f.wb[1], 0], [f.wb[0], f.wb[1], h], [f.wa[0], f.wa[1], h]].map((p) => this.S(p as Vec3)), true);
      }
    }
    g.fillStyle(fill, 1);
    for (const poly of polys) g.fillPoints(poly.map((p) => this.S(W(p, h))), true);
    g.lineStyle(Math.max(1, this.pxPerM * 0.06), shade(fill, 18), 1);
    for (const e of outer) {
      const a = this.S(W(e.a, h));
      const b = this.S(W(e.b, h));
      g.lineBetween(a.x, a.y, b.x, b.y);
    }

    // symbol painted on the top, squashed like the top face
    const c = this.S(W(anchor, h));
    g.save();
    g.translateCanvas(c.x, c.y);
    g.scaleCanvas(1, this.view.sin);
    drawSystemIcon(g, system, 0, 0, ICON_RADIUS_M * this.pxPerM, fill);
    g.restore();
  }
}
