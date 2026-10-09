// Ship Lab renderer: the airship seen from any look-down angle (90° = top-down, 60°, 45°), orthographic, flat 2D shapes.
// Every object is a flat footprint extruded to its height (ship3d.ts); visible side faces get darker paint,
// tops the normal paint. Painter's order: deck first, then walls / door frames / system blocks / crew from back to front.
import Phaser from 'phaser';
import type { CrewLook } from '../core/crew';
import { airshipHull, blockPolygons, systemBlocks } from '../core/hull';
import { depth, drawOrder, isBehind, project, turn, unprojectFloor, type FloorBox, type Vec2, type Vec3, type View } from '../core/projection';
import { consoleDesk, doorLeaves, doorThreshold, SHIP_HEIGHTS, shipSolids, wallHeight, wallPieces, type Solid } from '../core/ship3d';
import { systemColor } from '../core/systems';
import type { Point, Ship, ShipVehicle } from '../core/types';
import { drawCrewIso, type IdlePose, type SitPose } from './crew_iso';
import { drawSystemIcon } from './icons';
import { VEHICLE, WORLD, worldPaint } from './palette';
import { balconyRoomIds, dockArms, railingParts, SEATS, vehicleFrame } from '../core/exterior';

type G = Phaser.GameObjects.Graphics;
type Item = { key: number; box: FloorBox; draw: (g: G) => void };

/** The game's standing objects, drawn once; only crew and doors are redrawn. */
export interface ObjectLayer {
  redrawDoors(): void;
  setCrew(crew: CrewOnDeck[]): void;
}

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
  step?: number; // meters walked (walk cycle)
  lift?: number; // meters above the deck (sitting in a vehicle)
  vehicle?: number; // index into ship.vehicles when sitting in one – drawn after it
  ring?: number; // ring colour override (selection)
  hostile?: boolean; // enemy boarder: amber outline
  alpha?: number; // fading out (dying)
  idle?: IdlePose; // standing still: breathing, looking around, typing
  sit?: SitPose; // seated in a vehicle (`at` = under the hips, lift 0)
}

/** Ship space [x, z] + height -> view world (x = towards the bow/right, y = starboard/towards the viewer, z = up). */
const W = ([x, z]: Point, h = 0): Vec3 => [-z, x, h];

/** Seated crew grouped by the vehicle they sit in. */
function seatedByVehicle(crew: CrewOnDeck[]): Map<number, CrewOnDeck[]> {
  const m = new Map<number, CrewOnDeck[]>();
  for (const c of crew) if (c.sit && c.vehicle !== undefined) m.set(c.vehicle, [...(m.get(c.vehicle) ?? []), c]);
  return m;
}

export class ShipView {
  /** Who sits in which vehicle right now (drawn by the vehicle). */
  private seated = new Map<number, CrewOnDeck[]>();

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
    const outside = [...this.ship.tiles.flatMap((t) => t.polygon), ...(this.ship.vehicles ?? []).flatMap((v) => v.tiles.flatMap((t) => t.polygon))];
    for (const p of [...hull.outline, ...hull.fins.flat(), ...hull.propellers.flatMap(([x, z]) => [[x - r, z + r], [x + r, z + r]] as Point[]), ...outside]) {
      pts.push(W(p, 0), W(p, -SHIP_HEIGHTS.hull_depth_m), W(p, SHIP_HEIGHTS.door_frame_height_m));
    }
    const s = pts.map((p) => project(this.view, p));
    const xs = s.map((p) => p[0] * this.pxPerM);
    const ys = s.map((p) => p[1] * this.pxPerM);
    return new Phaser.Geom.Rectangle(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  }

  /** Draw the ship with its origin at (ox, oy): deck to `deck`, labels above it, everything standing to `objects`. */
  draw(scene: Phaser.Scene, deck: G, objects: G, ox: number, oy: number, crew: CrewOnDeck[], doorOpen: (i: number) => number = () => 0): void {
    this.drawStatic(scene, deck, ox, oy);
    this.drawObjects(objects, crew, doorOpen);
  }

  /** Hull, deck plates and door plates – drawn once. */
  drawStatic(_scene: Phaser.Scene, deck: G, ox: number, oy: number): void {
    this.ox = ox;
    this.oy = oy;
    this.drawHull(deck);
    this.drawDeck(deck); // no room names on the floor: the system icon on the block says it
  }

  /**
   * Everything standing (walls, door frames + leaves, system blocks, consoles, crew), back to front.
   * Call again (after objects.clear()) whenever doors move. `doorOpen(i)` = 0 closed … 1 open for ship.doors[i].
   */
  private collectItems(doorOpen: (i: number) => number): { items: Item[]; mustFollow: [number, number][]; vehicleItem: number[]; doorItem: number[] } {
    const items: Item[] = [];
    const mustFollow: [number, number][] = []; // [first, then] – e.g. a system symbol after its own block
    const box = (footprint: Point[]): FloorBox => {
      const w = footprint.map((p) => W(p));
      const xs = w.map((p) => p[0]);
      const ys = w.map((p) => p[1]);
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    };
    // long walls and big blocks are drawn in short pieces, so crew in front of one end is never painted over
    // balcony railings: see-through posts + rails; where a vehicle docks the railing opens into a gate
    for (const w of this.ship.walls) {
      if (w.kind !== 'railing') continue;
      const parts = railingParts(w); // stays closed at docks too: crew climb over it into the vehicle
      for (const s of parts) {
        if (s.segment) for (const p of wallPieces(s)) items.push({ key: this.sortKey(p.footprint, 0), box: box(p.footprint), draw: (g) => this.drawWallPiece(g, s, p) });
        else items.push({ key: this.sortKey(s.footprint, 0), box: box(s.footprint), draw: (g) => this.drawSolid(g, s) });
      }
    }
    // a vehicle draws the people sitting in it itself (rider legs left/right of the bike, passengers inside)
    const vehicleItem: number[] = [];
    (this.ship.vehicles ?? []).forEach((v, vi) => {
      vehicleItem.push(items.length + dockArms(this.ship, v).length);
      for (const arm of dockArms(this.ship, v)) items.push({ key: this.sortKey(arm.footprint, 0), box: box(arm.footprint), draw: (g) => this.drawSolid(g, arm) });
      const fp = v.tiles.flatMap((t) => t.polygon);
      items.push({ key: this.sortKey(fp, 0), box: box(fp), draw: (g) => this.drawVehicle(g, v, this.seated.get(vi) ?? []) });
    });
    for (const s of shipSolids(this.ship)) {
      if (s.kind === 'console') continue; // drawn below with its keyboard, after its system block
      if (s.kind === 'railing') continue; // drawn above as posts + rails
      if (s.segment) {
        for (const p of wallPieces(s)) items.push({ key: this.sortKey(p.footprint, 0), box: box(p.footprint), draw: (g) => this.drawWallPiece(g, s, p) });
      } else {
        items.push({ key: this.sortKey(s.footprint, s.z0), box: box(s.footprint), draw: (g) => this.drawSolid(g, s) });
      }
    }
    // door leaves: slide sideways into the walls as the door opens (one item per door; its box = the closed door)
    const wh = wallHeight(this.ship);
    const doorItem: number[] = [];
    this.ship.doors.forEach((d, i) => {
      const closed = doorLeaves(d, 0, wh).flatMap((l) => l.footprint);
      doorItem.push(items.length);
      items.push({ key: this.sortKey(closed, 0), box: box(closed), draw: (g) => { for (const leaf of doorLeaves(d, doorOpen(i), wh)) this.drawSolid(g, leaf); } });
    });
    for (const b of systemBlocks(this.ship)) {
      const polys = blockPolygons(b, BLOCK_GAP_M);
      const outer = this.outerEdges(polys);
      const pieces: number[] = [];
      for (const poly of polys) {
        pieces.push(items.length);
        items.push({ key: this.sortKey(poly, 0), box: box(poly), draw: (g) => this.drawBlockPiece(g, poly, outer, b.room) });
      }
      // the symbol is painted after the whole block (same floor area, drawn last among its pieces)
      // symbol on a full tile (a diagonal half tile is too small and would push it off the block)
      const full = b.tiles.filter((t) => t.shape === 'full');
      const onHalf = b.tiles.some((t) => t.shape !== 'full' && Math.hypot(t.center[0] - b.anchor[0], t.center[1] - b.anchor[1]) < 0.9);
      const anchor = onHalf && full.length
        ? full.reduce((best, t) => (Math.hypot(t.center[0] - b.anchor[0], t.center[1] - b.anchor[1]) < Math.hypot(best[0] - b.anchor[0], best[1] - b.anchor[1]) ? t.center : best), full[0]!.center)
        : b.anchor;
      for (const p of pieces) mustFollow.push([p, items.length]);
      items.push({ key: this.sortKey(polys.flat(), 0) + 0.0005, box: box(polys.flat()), draw: (g) => this.drawBlockIcon(g, b.system, anchor, b.room) });
      // console desk: on the block edge facing the crew spot, drawn after the block
      const con = this.ship.rooms.find((r) => r.id === b.room)?.console;
      if (con) {
        const desk = consoleDesk(con, this.ship.tile_size);
        const deskIdx = items.length;
        for (const p of pieces) mustFollow.push([p, deskIdx]);
        items.push({ key: this.sortKey(desk.footprint, 0) + 0.0006, box: box(desk.footprint), draw: (g) => this.drawConsole(g, desk, this.blockFill(b.room)) });
      }
    }
    return { items, mustFollow, vehicleItem, doorItem };
  }

  /** Everything standing, drawn into one graphics (Ship Lab / still pictures). */
  drawObjects(objects: G, crew: CrewOnDeck[], doorOpen: (i: number) => number = () => 0): void {
    this.seated = seatedByVehicle(crew);
    const { items, mustFollow, vehicleItem } = this.collectItems(doorOpen);
    for (const c of crew) {
      if (c.sit && c.vehicle !== undefined) continue; // drawn by its vehicle
      const it = this.crewItem(c);
      if (c.vehicle !== undefined && vehicleItem[c.vehicle] !== undefined) mustFollow.push([vehicleItem[c.vehicle]!, items.length]);
      items.push(it);
    }
    const order = drawOrder(this.view, items.map((i) => i.box), items.map((i) => i.key), mustFollow);
    for (const i of order) items[i]!.draw(objects);
  }

  private crewItem(c: CrewOnDeck): Item {
    const feet = W(c.at, c.lift ?? 0);
    return {
      key: depth(this.view, feet) + 0.001,
      box: { minX: feet[0] - 0.3, maxX: feet[0] + 0.3, minY: feet[1] - 0.3, maxY: feet[1] + 0.3 },
      draw: (g) => {
        const p = this.S(feet);
        drawCrewIso(g, this.view, c.look, p.x, p.y, this.pxPerM, c.facing, c.step ?? 0, !!c.hostile, c.ring, c.idle, c.sit);
      },
    };
  }

  /**
   * Game view: every standing object gets its own graphics, drawn ONCE and stacked by depth (Phaser depth between
   * `depthFrom` and `depthTo`). Per frame only the crew (and moving doors) are redrawn and slotted in between –
   * walking crew stay cheap on a phone. Call after drawStatic().
   */
  mountObjects(scene: Phaser.Scene, depthFrom: number, depthTo: number, doorOpen: (i: number) => number): ObjectLayer {
    const { items, mustFollow, vehicleItem, doorItem } = this.collectItems(doorOpen);
    const order = drawOrder(this.view, items.map((i) => i.box), items.map((i) => i.key), mustFollow);
    const posOf = new Map(order.map((idx, pos) => [idx, pos]));
    const n = order.length;
    const depthAt = (pos: number) => depthFrom + ((pos + 1) / (n + 2)) * (depthTo - depthFrom);
    const gfx = items.map((it, i) => {
      const g = scene.add.graphics().setDepth(depthAt(posOf.get(i)!));
      it.draw(g);
      return g;
    });
    const crewGfx: G[] = [];
    return {
      redrawDoors: () => {
        for (const i of doorItem) {
          gfx[i]!.clear();
          items[i]!.draw(gfx[i]!);
        }
      },
      setCrew: (crew: CrewOnDeck[]) => {
        // seated people are part of their vehicle's picture: redraw the vehicles that have (or just had) someone in them
        const before = this.seated;
        this.seated = seatedByVehicle(crew);
        vehicleItem.forEach((idx, vi) => {
          if (!before.has(vi) && !this.seated.has(vi)) return;
          gfx[idx]!.clear();
          items[idx]!.draw(gfx[idx]!);
        });
        while (crewGfx.length < crew.length) crewGfx.push(scene.add.graphics());
        crewGfx.forEach((g, ci) => {
          g.clear();
          const c = crew[ci];
          if (!c || (c.sit && c.vehicle !== undefined)) return;
          const it = this.crewItem(c);
          // after everything that is behind the figure (and after its vehicle, when climbing in), before the rest
          let after = -1;
          items.forEach((other, oi) => { if (isBehind(this.view, other.box, it.box)) after = Math.max(after, posOf.get(oi)!); });
          if (c.vehicle !== undefined && vehicleItem[c.vehicle] !== undefined) after = Math.max(after, posOf.get(vehicleItem[c.vehicle]!)!);
          g.setDepth(depthAt(after + 0.5) + it.key * 1e-6).setAlpha(c.alpha ?? 1);
          it.draw(g);
        });
      },
    };
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
    const balcony = balconyRoomIds(this.ship);
    this.drawBalconyUndersides(g, balcony);
    for (const t of this.ship.tiles) {
      if (t.room && balcony.has(t.room)) {
        this.drawGrating(g, t.polygon);
        continue;
      }
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

  /** Open steel grating: dark plate with a fine grid – you can tell it is outside, hanging over the void. */
  private drawGrating(g: G, poly: Point[]): void {
    g.fillStyle(WORLD.grate, 1);
    g.fillPoints(poly.map((p) => this.S(W(p))), true);
    const xs = poly.map((p) => p[0]);
    const zs = poly.map((p) => p[1]);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    g.lineStyle(Math.max(1, this.pxPerM * 0.03), WORLD.grateLine, 1);
    for (let x = x0 + 0.25; x < x1; x += 0.25) { const a = this.S(W([x, z0])); const b = this.S(W([x, z1])); g.lineBetween(a.x, a.y, b.x, b.y); }
    for (let z = z0 + 0.25; z < z1; z += 0.25) { const a = this.S(W([x0, z])); const b = this.S(W([x1, z])); g.lineBetween(a.x, a.y, b.x, b.y); }
    g.lineStyle(Math.max(1, this.pxPerM * 0.05), WORLD.hullEdge, 0.8);
    g.strokePoints(poly.map((p) => this.S(W(p))), true);
  }

  /** Platform edge (0.3 m thick) + two brackets under each outer balcony edge facing the viewer. */
  private drawBalconyUndersides(g: G, balcony: Set<string>): void {
    if (this.view.cos < 0.01) return;
    const tiles = this.ship.tiles.filter((t) => t.room && balcony.has(t.room));
    const count = new Map<string, number>();
    const k = (a: Point, b: Point) => [a, b].map((p) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`).sort().join('|');
    for (const t of this.ship.tiles) for (let i = 0; i < t.polygon.length; i++) {
      const key = k(t.polygon[i]!, t.polygon[(i + 1) % t.polygon.length]!);
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    const th = 0.3;
    for (const t of tiles) {
      const c = W(t.center);
      for (let i = 0; i < t.polygon.length; i++) {
        const a = t.polygon[i]!;
        const b = t.polygon[(i + 1) % t.polygon.length]!;
        if (count.get(k(a, b))! > 1) continue; // shared with another tile: not an outer edge
        const wa = W(a);
        const wb = W(b);
        const ny = this.outwardY(wa, wb, c[0], c[1]);
        if (ny <= 0.01) continue;
        // brackets: from the edge down-inwards to the hull
        g.lineStyle(Math.max(2, this.pxPerM * 0.07), WORLD.underside, 1);
        for (const f of [0.2, 0.8]) {
          const e: Vec3 = [wa[0] + (wb[0] - wa[0]) * f, wa[1] + (wb[1] - wa[1]) * f, -th];
          const inward: Vec3 = [e[0] + (c[0] - e[0]) * 0.9, e[1] + (c[1] - e[1]) * 0.9, -th - 1.1];
          const p = this.S(e);
          const q = this.S(inward);
          g.lineBetween(p.x, p.y, q.x, q.y);
        }
        g.fillStyle(shade(WORLD.underside, 10 * (1 - ny)), 1);
        g.fillPoints([[wa[0], wa[1], 0], [wb[0], wb[1], 0], [wb[0], wb[1], -th], [wa[0], wa[1], -th]].map((p) => this.S(p as Vec3)), true);
      }
    }
  }

  /**
   * A docked vehicle, built from simple shapes: bike / bike with an egg-shaped sidecar pod / open car you can look into.
   * It lies along the railing it is docked to, on the outer side of it.
   */
  private drawVehicle(g: G, v: ShipVehicle, seated: CrewOnDeck[] = []): void {
    const { center: c, u, w } = vehicleFrame(this.ship, v);
    const at = (o: Point, du: number, dw: number): Point => [o[0] + u[0] * du + w[0] * dw, o[1] + u[1] * du + w[1] * dw];
    // Parts belong to a group: 'bike' (with its rider), 'pod' (sidecar egg with its passenger), 'car' (with everyone in it).
    // layer: 0 = wheels (under the body), 1 = floor pan, 2 = everything else (back to front)
    // shell = car walls / hood / trunk / windscreen: the ones nearer the viewer than the car's middle are drawn over the
    // people inside; pod = the egg: drawn whole under the passenger, its sides again over them (they sit IN it)
    type Group = 'bike' | 'pod' | 'car';
    type Part = { fp: Point[]; z0: number; z1: number; top: number; side: number; layer: number; group: Group; shell?: boolean; pod?: boolean };
    const parts: Part[] = [];
    let group: Group = v.type === 'car' ? 'car' : 'bike';
    const box = (o: Point, du0: number, du1: number, dw0: number, dw1: number, z0: number, z1: number, col: number, layer = 2, shell = false) =>
      parts.push({ fp: [at(o, du0, dw0), at(o, du1, dw0), at(o, du1, dw1), at(o, du0, dw1)], z0, z1, top: col, side: shade(col, 30), layer, shell, group });
    /** Egg shape (convex): length 2·ru along u, width 2·rw, narrower towards the front (+u). */
    const egg = (o: Point, ru: number, rw: number, z0: number, z1: number, col: number, pod = false) => {
      const fp = Array.from({ length: 18 }, (_, i): Point => {
        const a = (i / 18) * Math.PI * 2;
        const cu = Math.cos(a);
        return at(o, cu * ru, Math.sin(a) * rw * (cu > 0 ? 1 - 0.3 * cu : 1));
      });
      parts.push({ fp, z0, z1, top: col, side: shade(col, 30), layer: 2, pod, group });
    };
    const bike = (o: Point) => {
      box(o, -0.85, -0.45, -0.06, 0.06, 0, 0.55, VEHICLE.tyre); // rear wheel
      box(o, 0.45, 0.85, -0.06, 0.06, 0, 0.55, VEHICLE.tyre); // front wheel
      box(o, -0.55, 0.5, -0.12, 0.12, 0.3, 0.6, VEHICLE.rust); // frame + engine
      box(o, -0.05, 0.4, -0.16, 0.16, 0.55, 0.78, VEHICLE.rustLight); // fuel tank
      box(o, -0.5, -0.05, -0.13, 0.13, 0.6, 0.72, VEHICLE.seat); // seat
      box(o, 0.55, 0.62, -0.38, 0.38, 0.88, 0.95, VEHICLE.chrome); // handlebar
      box(o, 0.62, 0.72, -0.08, 0.08, 0.6, 0.75, VEHICLE.chrome); // headlight
    };
    if (v.type === 'car') {
      // open-top while docked (a roof could close when it flies off): floor, low sides, hood, trunk, two rows of seats
      for (const [du0, du1] of [[-1.7, -1.1], [1.1, 1.7]]) for (const [dw0, dw1] of [[-0.95, -0.7], [0.7, 0.95]]) box(c, du0!, du1!, dw0!, dw1!, 0, 0.6, VEHICLE.tyre, 0);
      box(c, -1.9, 1.9, -0.85, 0.85, 0.3, 0.42, shade(VEHICLE.olive, 35), 1); // floor pan
      box(c, 1.05, 1.9, -0.85, 0.85, 0.3, 0.9, VEHICLE.olive, 2, true); // hood
      box(c, -1.9, -1.35, -0.85, 0.85, 0.3, 0.85, VEHICLE.olive, 2, true); // trunk
      for (const [du0, du1] of [[-1.25, -0.2], [-0.05, 0.95]]) {
        box(c, du0!, du1!, -0.8, -0.1, 0.42, 0.62, VEHICLE.seat); // seat cushions (left / right)
        box(c, du0!, du1!, 0.1, 0.8, 0.42, 0.62, VEHICLE.seat);
        box(c, du0!, du0! + 0.14, -0.8, 0.8, 0.42, 1.0, shade(VEHICLE.seat, -10)); // backrest of the row
      }
      box(c, 0.82, 0.92, 0.25, 0.65, 0.75, 1.0, VEHICLE.chrome); // steering wheel (driver side)
      box(c, 0.95, 1.05, -0.8, 0.8, 0.9, 1.15, VEHICLE.glass, 2, true); // windscreen
      box(c, -1.35, 1.05, -0.85, -0.75, 0.42, 0.88, VEHICLE.olive, 2, true); // side walls
      box(c, -1.35, 1.05, 0.75, 0.85, 0.42, 0.88, VEHICLE.oliveLight, 2, true);
      box(c, -0.19, -0.06, -0.85, 0.85, 0.42, 1.1, VEHICLE.rust); // partition: no way between back row and front row
    } else if (v.type === 'sidecar' && v.tiles.length >= 2) {
      // bike on the tile nearer the ship, the egg-shaped pod right beside it
      const along = (p: Point) => (p[0] - c[0]) * w[0] + (p[1] - c[1]) * w[1];
      const sorted = [...v.tiles].sort((p, q) => along(p.center) - along(q.center));
      const bc = sorted[0]!.center;
      bike(bc);
      const o = sorted[sorted.length - 1]!.center;
      const l = Math.hypot(o[0] - bc[0], o[1] - bc[1]) || 1;
      const t: Point = [bc[0] + ((o[0] - bc[0]) / l) * SEATS.podOffset, bc[1] + ((o[1] - bc[1]) / l) * SEATS.podOffset];
      for (const du of [-0.45, 0.25]) box(bc, du, du + 0.05, 0.12, SEATS.podOffset - 0.35, 0.38, 0.46, VEHICLE.chrome); // struts to the bike
      group = 'pod';
      box(t, -0.35, 0.15, 0.3, 0.44, 0, 0.45, VEHICLE.tyre); // pod wheel
      egg(t, 0.75, 0.45, 0.2, 0.72, VEHICLE.olive, true); // egg-shaped pod
      egg(at(t, -0.12, 0), 0.4, 0.27, 0.72, 0.73, VEHICLE.seat); // open cockpit of the pod
      box(t, -0.45, -0.32, -0.2, 0.2, 0.55, 0.9, shade(VEHICLE.seat, -10)); // backrest
    } else {
      bike(c);
    }
    const mid = (p: Part) => {
      const cx = p.fp.reduce((s2, x) => s2 + x[0], 0) / p.fp.length;
      const cz = p.fp.reduce((s2, x) => s2 + x[1], 0) / p.fp.length;
      return depth(this.view, W([cx, cz], p.z1));
    };
    const sorted = (ps: Part[]) => [...ps].sort((p, q) => p.layer - q.layer || mid(p) - mid(q));
    const prism = (p: Part, withTop = true) => this.prism(g, p.fp, p.z0, p.z1, p.top, p.side, undefined, withTop);
    const person = (cr: CrewOnDeck, half?: 'far' | 'near') => {
      const pt = this.S(W(cr.at, 0));
      drawCrewIso(g, this.view, cr.look, pt.x, pt.y, this.pxPerM, cr.facing, 0, false, cr.ring, cr.idle, cr.sit, half);
    };
    const byDepth = (cs: CrewOnDeck[]) => [...cs].sort((a, b) => depth(this.view, W(a.at, 0)) - depth(this.view, W(b.at, 0)));
    const groupOf = (cr: CrewOnDeck): Group => (cr.sit?.kind === 'pod' ? 'pod' : cr.sit?.kind === 'seat' ? 'car' : 'bike');

    // each group back to front: its far stuff, its people, its near stuff
    const draws: { d: number; draw: () => void }[] = [];
    for (const gr of ['bike', 'pod', 'car'] as Group[]) {
      const ps = parts.filter((p) => p.group === gr);
      if (!ps.length) continue;
      const people = byDepth(seated.filter((cr) => groupOf(cr) === gr));
      const d = ps.reduce((sum, p) => sum + mid(p), 0) / ps.length;
      draws.push({
        d,
        draw: () => {
          if (gr === 'bike') {
            // rider: far leg + arm behind the bike, body + near leg + arm in front of it
            for (const cr of people) person(cr, 'far');
            for (const p of sorted(ps)) prism(p);
            for (const cr of people) person(cr, 'near');
          } else if (gr === 'pod') {
            for (const p of sorted(ps)) prism(p);
            for (const cr of people) person(cr);
            for (const p of sorted(ps)) if (p.pod) prism(p, false); // egg sides over the passenger
          } else {
            const centre = depth(this.view, W(c, 0.6));
            const near = (p: Part) => !!p.shell && mid(p) > centre + 0.05;
            for (const p of sorted(ps)) if (!near(p)) prism(p);
            for (const cr of people) person(cr);
            for (const p of sorted(ps)) if (near(p)) prism(p);
          }
        },
      });
    }
    draws.sort((a, b) => a.d - b.d);
    for (const x of draws) x.draw();
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
  private prism(g: G, footprint: Point[], z0: number, z1: number, top: number, side: number, edge?: number, withTop = true): void {
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
    if (!withTop) return;
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
        this.prism(g, s.footprint, s.z0, s.z1, WORLD.innerWall, shade(WORLD.innerWall, 22), WORLD.innerWallTop);
        break;
      case 'railing':
        this.prism(g, s.footprint, s.z0, s.z1, WORLD.hullEdge, shade(WORLD.hullEdge, 30));
        break;
      case 'door_post': {
        const col = s.door === 'airlock' ? WORLD.airlock : FRAME;
        this.prism(g, s.footprint, s.z0, s.z1, shade(col, -8), shade(col, 28), shade(col, 45));
        break;
      }
      case 'dock_arm':
        this.prism(g, s.footprint, s.z0, s.z1, shade(FRAME, -8), shade(FRAME, 28), shade(FRAME, 45));
        break;
      case 'door_panel': {
        // sliding leaf: darker than the frame so the frame posts stay readable; airlocks rust-orange
        const col = s.door === 'airlock' ? shade(WORLD.airlock, 15) : WORLD.door;
        this.prism(g, s.footprint, s.z0, s.z1, shade(col, -10), shade(col, 22), shade(col, 45));
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

  /** Console ("keyboard") shelf on the block front, in the system's paint, with a dark key plate. */
  private drawConsole(g: G, desk: ReturnType<typeof consoleDesk>, fill: number): void {
    this.prism(g, desk.footprint, 0, desk.height, shade(fill, 8), shade(fill, 30), shade(fill, 45));
    const h = desk.height;
    g.fillStyle(shade(fill, 62), 1);
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
    const top = railing ? WORLD.hullEdge : WORLD.innerWall;
    const side = railing ? shade(WORLD.hullEdge, 30) : shade(WORLD.innerWall, 22);
    this.prism(g, p.footprint, s.z0, s.z1, top, side);
    if (railing) return;
    const t = p.footprint.map((q) => this.S(W(q, s.z1)));
    g.lineStyle(Math.max(1, this.pxPerM * 0.05), WORLD.innerWallTop, 0.9);
    // segmentBox order: 0-1 and 2-3 run along the wall, 1-2 / 3-0 are the ends
    g.lineBetween(t[0]!.x, t[0]!.y, t[1]!.x, t[1]!.y);
    g.lineBetween(t[2]!.x, t[2]!.y, t[3]!.x, t[3]!.y);
    if (p.last) g.lineBetween(t[1]!.x, t[1]!.y, t[2]!.x, t[2]!.y);
    if (p.first) g.lineBetween(t[3]!.x, t[3]!.y, t[0]!.x, t[0]!.y);
  }
}
