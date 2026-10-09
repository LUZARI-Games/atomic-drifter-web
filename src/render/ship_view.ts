// Ship Lab renderer: the airship seen from any look-down angle (90° = top-down, 60°, 45°), orthographic, flat 2D shapes.
// Every object is a flat footprint extruded to its height (ship3d.ts); visible side faces get darker paint,
// tops the normal paint. Painter's order: deck first, then walls / door frames / system blocks / crew from back to front.
import Phaser from 'phaser';
import type { CrewLook } from '../core/crew';
import { airshipHull, blockPolygons, systemBlocks } from '../core/hull';
import { depth, drawOrder, project, turn, unprojectFloor, type FloorBox, type Vec2, type Vec3, type View } from '../core/projection';
import { roomFloorCenter } from '../core/ship';
import { consoleDesk, doorThreshold, SHIP_HEIGHTS, shipSolids, wallPieces, type Solid } from '../core/ship3d';
import { systemColor } from '../core/systems';
import type { Point, Ship } from '../core/types';
import { drawCrewIso } from './crew_iso';
import { drawSystemIcon } from './icons';
import { FONT_FAMILY, FONT_SIZES, WORLD, worldPaint } from './palette';

type G = Phaser.GameObjects.Graphics;

const edgeKey = (a: Point, b: Point) =>
  [a, b].map((p) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`).sort().join('|');
type V2 = Phaser.Math.Vector2;

const BLOCK_GAP_M = 0.32; // gap between a system block and the walls
const ICON_RADIUS_M = 0.5;
const FRAME = 0x9a8650; // brass door frame – brighter than the walls so doors stand out
/** Darker (pct > 0) or lighter (pct < 0) by a share of the colour itself, so dark paint never turns pure black. */
const shade = (c: number, pct: number) => {
  const f = (v: number) => Math.round(pct >= 0 ? v * (1 - pct / 100) : v + (255 - v) * (-pct / 100));
  return (f((c >> 16) & 0xff) << 16) | (f((c >> 8) & 0xff) << 8) | f(c & 0xff);
};

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

  /** Screen point of a ship-space point at `height` meters (0 = deck) – valid after draw() set the origin. */
  deckPoint(p: Point, height = 0): V2 {
    return this.S(W(p, height));
  }

  /** Ship-space floor point under a screen point (for taps). */
  toShip(x: number, y: number): Point {
    const [wx, wy] = unprojectFloor(this.view, [(x - this.ox) / this.pxPerM, (y - this.oy) / this.pxPerM]);
    return [wy, -wx]; // inverse of W: view x = -ship z, view y = ship x
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
    const items: { key: number; box: FloorBox; draw: () => void }[] = [];
    const mustFollow: [number, number][] = []; // [first, then] – e.g. a system symbol after its own block
    const box = (footprint: Point[]): FloorBox => {
      const w = footprint.map((p) => W(p));
      const xs = w.map((p) => p[0]);
      const ys = w.map((p) => p[1]);
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    };
    // long walls and big blocks are drawn in short pieces, so crew in front of one end is never painted over
    for (const s of shipSolids(this.ship)) {
      if (s.kind === 'console') continue; // drawn below with its keyboard, after its system block
      if (s.segment) {
        for (const p of wallPieces(s)) items.push({ key: this.sortKey(p.footprint, 0), box: box(p.footprint), draw: () => this.drawWallPiece(objects, s, p) });
      } else {
        items.push({ key: this.sortKey(s.footprint, s.z0), box: box(s.footprint), draw: () => this.drawSolid(objects, s) });
      }
    }
    for (const b of systemBlocks(this.ship)) {
      const polys = blockPolygons(b, BLOCK_GAP_M);
      const outer = this.outerEdges(polys);
      const pieces: number[] = [];
      for (const poly of polys) {
        pieces.push(items.length);
        items.push({ key: this.sortKey(poly, 0), box: box(poly), draw: () => this.drawBlockPiece(objects, poly, outer, b.room) });
      }
      // the symbol is painted after the whole block (same floor area, drawn last among its pieces)
      // symbol on a full tile (a diagonal half tile is too small and would push it off the block)
      const full = b.tiles.filter((t) => t.shape === 'full');
      const onHalf = b.tiles.some((t) => t.shape !== 'full' && Math.hypot(t.center[0] - b.anchor[0], t.center[1] - b.anchor[1]) < 0.9);
      const anchor = onHalf && full.length
        ? full.reduce((best, t) => (Math.hypot(t.center[0] - b.anchor[0], t.center[1] - b.anchor[1]) < Math.hypot(best[0] - b.anchor[0], best[1] - b.anchor[1]) ? t.center : best), full[0]!.center)
        : b.anchor;
      for (const p of pieces) mustFollow.push([p, items.length]);
      items.push({ key: this.sortKey(polys.flat(), 0) + 0.0005, box: box(polys.flat()), draw: () => this.drawBlockIcon(objects, b.system, anchor, b.room) });
      // console desk: on the block edge facing the crew spot, drawn after the block
      const con = this.ship.rooms.find((r) => r.id === b.room)?.console;
      if (con) {
        const desk = consoleDesk(con, this.ship.tile_size);
        const deskIdx = items.length;
        for (const p of pieces) mustFollow.push([p, deskIdx]);
        items.push({ key: this.sortKey(desk.footprint, 0) + 0.0006, box: box(desk.footprint), draw: () => this.drawConsole(objects, desk) });
      }
    }
    for (const c of crew) {
      const feet = W(c.at, 0);
      items.push({
        key: depth(this.view, feet) + 0.001,
        box: { minX: feet[0] - 0.3, maxX: feet[0] + 0.3, minY: feet[1] - 0.3, maxY: feet[1] + 0.3 },
        draw: () => {
          const p = this.S(feet);
          drawCrewIso(objects, this.view, c.look, p.x, p.y, this.pxPerM, c.facing, 0, false);
        },
      });
    }
    const order = drawOrder(this.view, items.map((i) => i.box), items.map((i) => i.key), mustFollow);
    for (const i of order) items[i]!.draw();
  }

  /** Nearest point to the viewer decides the order (low objects on a grid). */
  private sortKey(footprint: Point[], z0: number): number {
    return Math.max(...footprint.map((p) => depth(this.view, W(p)))) + z0 * 0.001;
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
        .setOrigin(0.5);
      // lie on the deck: run along the ship's length, squashed like the floor (text cannot shear – close enough)
      const ex = project(this.view, [1, 0, 0]);
      label.setRotation(Math.atan2(ex[1], ex[0])).setScale(1, this.view.sin);
      if (label.width > roomW * 0.9) label.setVisible(false);
    }
  }

  /** How much the outward normal of edge a-b points at the viewer (after the view's yaw; positive = visible). */
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
    return turn(this.view, nx, ny)[1];
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

  private blockFill(room: string): number {
    return worldPaint(systemColor(this.ship.rooms.find((r) => r.id === room)));
  }

  /** Outer edges of a system block = tile-piece edges used only once (inner seams are shared). */
  private outerEdges(polys: Point[][]): Set<string> {
    const count = new Map<string, number>();
    for (const poly of polys) for (let i = 0; i < poly.length; i++) {
      const k = edgeKey(poly[i]!, poly[(i + 1) % poly.length]!);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    return new Set([...count].filter(([, n]) => n === 1).map(([k]) => k));
  }

  /** One tile piece of a system block: its outer side faces + its top (pieces share inner edges, so it reads as one block). */
  private drawBlockPiece(g: G, poly: Point[], outer: Set<string>, room: string): void {
    const fill = this.blockFill(room);
    const h = SHIP_HEIGHTS.system_height_m;
    const pts = poly.map((p) => W(p));
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const edges = poly.map((p, i) => [p, poly[(i + 1) % poly.length]!] as const).filter(([p, q]) => outer.has(edgeKey(p, q)));
    if (this.view.cos > 0.01) {
      for (const [p, q] of edges) {
        const wa = W(p);
        const wb = W(q);
        const ny = this.outwardY(wa, wb, cx, cy);
        if (ny <= 0.01) continue;
        g.fillStyle(shade(shade(fill, 30), 10 * (1 - ny)), 1);
        g.fillPoints([[wa[0], wa[1], 0], [wb[0], wb[1], 0], [wb[0], wb[1], h], [wa[0], wa[1], h]].map((v) => this.S(v as Vec3)), true);
      }
    }
    g.fillStyle(fill, 1);
    g.fillPoints(poly.map((p) => this.S(W(p, h))), true);
    g.lineStyle(Math.max(1, this.pxPerM * 0.06), shade(fill, 18), 1);
    for (const [p, q] of edges) {
      const a = this.S(W(p, h));
      const b = this.S(W(q, h));
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  /** Console desk ("keyboard") with a key plate on the crew side. */
  private drawConsole(g: G, desk: ReturnType<typeof consoleDesk>): void {
    this.prism(g, desk.footprint, 0, desk.height, WORLD.console, shade(WORLD.console, 35), shade(WORLD.console, 50));
    const h = desk.height;
    g.fillStyle(WORLD.consoleKeys, 1);
    g.fillPoints(desk.keys.map((p) => this.S(W(p, h))), true);
    // 2 rows x 5 keys; corners 0/3 = crew side, 1/2 = machinery side
    const [k0, k1, k2, k3] = desk.keys as [Point, Point, Point, Point];
    const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    g.fillStyle(WORLD.consoleKey, 0.85);
    const r = Math.max(1, this.pxPerM * 0.045);
    for (const u of [0.3, 0.7]) for (let i = 1; i <= 5; i++) {
      const p = this.S(W(lerp(lerp(k0, k1, u), lerp(k3, k2, u), i / 6), h));
      g.fillRect(p.x - r, p.y - r * this.view.sin, r * 2, r * 2 * this.view.sin);
    }
  }

  /** System symbol painted on the block top, lying on it like the floor (turned + squashed). */
  private drawBlockIcon(g: G, system: string | null, anchor: Point, room: string): void {
    const c = this.S(W(anchor, SHIP_HEIGHTS.system_height_m));
    g.save();
    g.translateCanvas(c.x, c.y);
    g.scaleCanvas(1, this.view.sin);
    g.rotateCanvas(this.view.yaw);
    drawSystemIcon(g, system, 0, 0, ICON_RADIUS_M * this.pxPerM, this.blockFill(room));
    g.restore();
  }

  /** Wall piece: visible side faces, top, and the light top edge only along the wall (no seams between pieces). */
  private drawWallPiece(g: G, s: Solid, p: { footprint: Point[]; first: boolean; last: boolean }): void {
    const railing = s.kind === 'railing';
    const top = railing ? WORLD.hullEdge : shade(WORLD.wall, -22);
    const side = railing ? shade(WORLD.hullEdge, 30) : shade(WORLD.wall, -12);
    this.prism(g, p.footprint, s.z0, s.z1, top, side);
    if (railing) return;
    const t = p.footprint.map((q) => this.S(W(q, s.z1)));
    g.lineStyle(Math.max(1, this.pxPerM * 0.04), WORLD.wallTop, 0.7);
    // segmentBox order: 0-1 and 2-3 run along the wall, 1-2 / 3-0 are the ends
    g.lineBetween(t[0]!.x, t[0]!.y, t[1]!.x, t[1]!.y);
    g.lineBetween(t[2]!.x, t[2]!.y, t[3]!.x, t[3]!.y);
    if (p.last) g.lineBetween(t[1]!.x, t[1]!.y, t[2]!.x, t[2]!.y);
    if (p.first) g.lineBetween(t[3]!.x, t[3]!.y, t[0]!.x, t[0]!.y);
  }
}
