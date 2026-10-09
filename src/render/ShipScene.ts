// Draws the airship (planner Godot export) from core state: flat top-down like FTL / Void War, bow pointing right.
// World look = grimdark Fallout 3 tones (see WORLD in palette.ts), NOT the green terminal UI look.
// Owns NO game state: taps are converted to ship meters and forwarded to core via the store.
import Phaser from 'phaser';
import { airshipHull, blockNotches, blockPolygons, systemBlocks, type HullShape, type SystemBlock } from '../core/hull';
import { tapPoint } from '../core/selection';
import { roomFloorCenter, roomOutline } from '../core/ship';
import { systemColor } from '../core/systems';
import type { Store } from '../core/store';
import type { GameState, Point } from '../core/types';
import { drawSystemIcon } from './icons';
import { attachPanZoom } from './panzoom';
import { FONT_FAMILY, FONT_SIZES, WORLD, worldPaint } from './palette';

// Full-screen canvas (Scale.RESIZE). The ship is drawn once at a fixed size; the camera pans and zooms (panzoom.ts).
const PX_PER_M = 60; // world units per meter
const BLOCK_GAP_M = 0.32; // gap between a system block and the walls
const BLOCK_RIM_M = 0.09; // dark rim around a system block
const ICON_RADIUS_M = 0.5; // every system icon has the same size (fits a 1-tile block)

type V = Phaser.Math.Vector2;

/** Bounding box of the whole airship (hull, fins, propellers) in ship meters. */
export function hullBounds(h: HullShape): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const r = h.propRadius;
  const all: Point[] = [
    ...h.outline,
    ...h.fins.flat(),
    ...h.propellers.flatMap(([x, z]) => [[x - r, z + r], [x + r, z + r]] as Point[]),
  ];
  const xs = all.map((p) => p[0]);
  const zs = all.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

export class ShipScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private scaleM = PX_PER_M;
  private origin = { x: 0, y: 0 };
  private hull!: HullShape;
  private blocks: SystemBlock[] = [];
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly store: Store<GameState>) {
    super('ship');
  }

  // Ship space (x = starboard, z = stern) -> screen: bow (-z) to the right, starboard down.
  private toScreen([x, z]: Point): { x: number; y: number } {
    return { x: this.origin.x - z * this.scaleM, y: this.origin.y + x * this.scaleM };
  }

  private toShip(px: number, py: number): Point {
    return [(py - this.origin.y) / this.scaleM, -(px - this.origin.x) / this.scaleM];
  }

  private poly(points: Point[]): V[] {
    return points.map((p) => {
      const s = this.toScreen(p);
      return new Phaser.Math.Vector2(s.x, s.y);
    });
  }

  create(): void {
    const { ship } = this.store.get();
    this.hull = airshipHull(ship);
    this.blocks = systemBlocks(ship);

    this.gfx = this.add.graphics();

    this.createLabels();

    const { minX, maxX, minZ, maxZ } = hullBounds(this.hull);
    const tl = this.toScreen([minX, maxZ]);
    const br = this.toScreen([maxX, minZ]);
    const bounds = new Phaser.Geom.Rectangle(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    attachPanZoom(this, {
      bounds: () => bounds,
      onTap: (x, y) => this.store.update((s) => tapPoint(s, this.toShip(x, y))),
    });

    this.unsubscribe = this.store.subscribe(() => this.draw());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
    this.draw();
  }

  /** Stencil paint on the free deck of each system room. Hidden when it does not fit. */
  private createLabels(): void {
    const { ship } = this.store.get();
    for (const room of ship.rooms) {
      if (room.kind !== 'system') continue; // plain rooms / balconies stay unlabelled
      const c = roomFloorCenter(ship, room.id);
      if (!c) continue;
      const free = ship.tiles.filter((t) => t.room === room.id && !t.machinery);
      const pts = (free.length ? free : ship.tiles.filter((t) => t.room === room.id)).flatMap((t) =>
        t.polygon.map((p) => this.toScreen(p)),
      );
      const roomW = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
      const pos = this.toScreen(c);
      const make = (size: number, spacing: number) =>
        this.add
          .text(pos.x, pos.y, (room.label || room.id).toUpperCase(), {
            fontFamily: FONT_FAMILY,
            fontSize: `${size}px`,
            color: '#' + WORLD.label.toString(16).padStart(6, '0'),
            resolution: 4, // stays sharp when zoomed in
          })
          .setLetterSpacing(spacing)
          .setAlpha(0.7) // worn paint on the deck
          .setOrigin(0.5);
      let label = make(FONT_SIZES.medium, 3);
      if (label.width > roomW * 0.9) {
        label.destroy();
        label = make(FONT_SIZES.small, 1);
      }
      if (label.width > roomW * 0.9) label.setVisible(false); // too narrow: the info line names it on tap
    }
  }

  private draw(): void {
    const { ship, selectedRoomId } = this.store.get();
    const g = this.gfx;
    const px = this.scaleM;
    g.clear();

    this.drawHull(g);

    // Deck plates with seams
    for (const t of ship.tiles) {
      g.fillStyle(WORLD.floor, 1);
      g.fillPoints(this.poly(t.polygon), true);
      g.lineStyle(Math.max(1, px * 0.05), WORLD.floorSeam, 1);
      g.strokePoints(this.poly(this.shrink(t.polygon, t.center, 0.1)), true);
    }

    // System blocks: one continuous shape per system in its faded planner colour, darker rim, symbol in the middle
    for (const b of this.blocks) {
      const fill = worldPaint(systemColor(ship.rooms.find((r) => r.id === b.room)));
      const rim = Phaser.Display.Color.ValueToColor(fill).darken(18).color;
      g.fillStyle(rim, 1);
      for (const p of blockPolygons(b, BLOCK_GAP_M)) g.fillPoints(this.poly(p), true);
      g.fillStyle(fill, 1);
      for (const p of blockPolygons(b, BLOCK_GAP_M + BLOCK_RIM_M)) g.fillPoints(this.poly(p), true);
      // inside corners (L-shapes): rim, then gap, cut as squares into the corner tile
      for (const { point, dir } of blockNotches(b)) {
        for (const [m, col] of [[BLOCK_GAP_M + BLOCK_RIM_M, rim], [BLOCK_GAP_M, WORLD.floor]] as const) {
          const q: Point = [point[0] + dir[0] * m, point[1] + dir[1] * m];
          g.fillStyle(col, 1);
          g.fillPoints(this.poly([point, [q[0], point[1]], q, [point[0], q[1]]]), true);
        }
      }
      const c = this.toScreen(b.anchor);
      drawSystemIcon(g, b.system, c.x, c.y, ICON_RADIUS_M * px, fill);
    }

    // Walls: dark body + light top edge; square caps fill the joints
    for (const w of ship.walls) {
      const a = this.toScreen(w.a);
      const b = this.toScreen(w.b);
      const thick = Math.max(3, px * (w.kind === 'interior' ? 0.22 : 0.3));
      const col = w.kind === 'railing' ? WORLD.hullEdge : WORLD.wall;
      g.lineStyle(thick, col, 1);
      g.lineBetween(a.x, a.y, b.x, b.y);
      g.fillStyle(col, 1);
      g.fillRect(a.x - thick / 2, a.y - thick / 2, thick, thick);
      g.fillRect(b.x - thick / 2, b.y - thick / 2, thick, thick);
    }
    for (const w of ship.walls) {
      if (w.kind === 'railing') continue;
      const a = this.toScreen(w.a);
      const b = this.toScreen(w.b);
      g.lineStyle(Math.max(1, px * 0.05), WORLD.wallTop, 0.6);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }

    // Doors: closed slabs in the wall gap; airlocks rust-orange with hazard stripes
    for (const d of ship.doors) {
      const c = this.toScreen(d.center);
      const len = d.width * px;
      const thick = Math.max(4, px * (d.kind === 'airlock' ? 0.36 : 0.26));
      const [w, h] = d.axis === 'x' ? [thick, len] : [len, thick]; // ship x axis = screen vertical
      const x0 = c.x - w / 2;
      const y0 = c.y - h / 2;
      g.fillStyle(d.kind === 'airlock' ? WORLD.airlock : WORLD.door, 1);
      g.fillRect(x0, y0, w, h);
      if (d.kind === 'airlock') {
        g.fillStyle(WORLD.hazard, 0.8);
        for (let i = 0; i < 4; i++) {
          if (d.axis === 'x') g.fillRect(x0, y0 + ((i + 0.25) * h) / 4, w, h / 8);
          else g.fillRect(x0 + ((i + 0.25) * w) / 4, y0, w / 8, h);
        }
      }
      g.lineStyle(1, WORLD.wall, 1);
      g.strokeRect(x0, y0, w, h);
      if (d.axis === 'x') g.lineBetween(x0, c.y, x0 + w, c.y);
      else g.lineBetween(c.x, y0, c.x, y0 + h);
    }

    // Selection: faint lamp-light tint on the floor + crisp outline around the room
    if (selectedRoomId) {
      g.fillStyle(WORLD.select, 0.1);
      for (const t of ship.tiles) if (t.room === selectedRoomId) g.fillPoints(this.poly(t.polygon), true);
      g.lineStyle(3, WORLD.select, 1);
      g.fillStyle(WORLD.select, 1);
      for (const [p, q] of roomOutline(ship, selectedRoomId)) {
        const s1 = this.toScreen(p);
        const s2 = this.toScreen(q);
        g.lineBetween(s1.x, s1.y, s2.x, s2.y);
        g.fillRect(s1.x - 1.5, s1.y - 1.5, 3, 3);
        g.fillRect(s2.x - 1.5, s2.y - 1.5, 3, 3);
      }
    }
  }

  /** Polygon pulled towards its centre by `m` meters (for plate seams). */
  private shrink(poly: Point[], c: Point, m: number): Point[] {
    return poly.map(([x, z]) => {
      const dx = x - c[0];
      const dz = z - c[1];
      const len = Math.hypot(dx, dz) || 1;
      return [x - (dx / len) * m * Math.SQRT2, z - (dz / len) * m * Math.SQRT2] as Point;
    });
  }

  /** Airship body: tail fins and propellers behind, then the hull plating with a rim and a centre keel line. */
  private drawHull(g: Phaser.GameObjects.Graphics): void {
    const px = this.scaleM;
    const h = this.hull;

    // propeller struts + discs (behind the hull)
    for (const p of h.propellers) {
      const c = this.toScreen(p);
      const r = h.propRadius * px;
      g.lineStyle(Math.max(3, px * 0.18), WORLD.wall, 1);
      g.lineBetween(c.x, c.y, c.x + r + 0.9 * px, c.y); // strut to the stern
      g.fillStyle(WORLD.wallTop, 0.12); // spinning blur
      g.fillCircle(c.x, c.y, r);
      g.lineStyle(Math.max(3, px * 0.14), WORLD.hullEdge, 1);
      g.lineBetween(c.x - r * 0.25, c.y - r * 0.95, c.x + r * 0.25, c.y + r * 0.95); // two blades
      g.lineBetween(c.x - r * 0.25, c.y + r * 0.95, c.x + r * 0.25, c.y - r * 0.95);
      g.fillStyle(WORLD.wall, 1);
      g.fillCircle(c.x, c.y, Math.max(3, r * 0.22));
    }

    // tail fins
    for (const f of h.fins) {
      const pts = this.poly(f);
      g.fillStyle(WORLD.hull, 1);
      g.fillPoints(pts, true);
      g.lineStyle(Math.max(2, px * 0.08), WORLD.hullEdge, 1);
      g.strokePoints(pts, true);
    }

    // hull body with a light rim
    const body = this.poly(h.outline);
    g.fillStyle(WORLD.hull, 1);
    g.fillPoints(body, true);
    g.lineStyle(Math.max(3, px * 0.12), WORLD.hullEdge, 1);
    g.strokePoints(body, true);

    // keel line along the centre, from stern to nose tip (subtle plating detail)
    const zs = h.outline.map((p) => p[1]);
    const xs = h.outline.map((p) => p[0]);
    const xc = (Math.min(...xs) + Math.max(...xs)) / 2;
    const a = this.toScreen([xc, Math.max(...zs)]);
    const b = this.toScreen([xc, Math.min(...zs)]);
    g.lineStyle(Math.max(1, px * 0.05), WORLD.hullEdge, 0.5);
    g.lineBetween(a.x + 4, a.y, b.x - 4, b.y);
  }
}
