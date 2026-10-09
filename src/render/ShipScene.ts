// Draws the ship (planner Godot export) from core state: flat top-down like FTL / Void War, bow pointing right.
// World look = grimdark Fallout 3 tones (see WORLD in palette.ts), NOT the green terminal UI look.
// Owns NO game state: taps are converted to ship meters and forwarded to core via the store.
import Phaser from 'phaser';
import { tapPoint } from '../core/selection';
import { roomCenter, roomOutline, shipBounds } from '../core/ship';
import type { Store } from '../core/store';
import type { GameState, Point } from '../core/types';
import { FONT_FAMILY, FONT_SIZES, GAME_HEIGHT, GAME_WIDTH, WORLD } from './palette';

// Free play area between the HTML top bar and info line (game units).
const AREA = { x: 60, y: 110, w: GAME_WIDTH - 120, h: GAME_HEIGHT - 220 };
const MAX_SCALE = 90; // px per meter

export class ShipScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private scaleM = 1;
  private origin = { x: 0, y: 0 };
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

  create(): void {
    const { ship } = this.store.get();
    const b = shipBounds(ship);
    const HULL_MARGIN_M = 0.7; // hull plating drawn outside the deck tiles
    const lenM = b.maxZ - b.minZ + HULL_MARGIN_M * 2;
    const widM = b.maxX - b.minX + HULL_MARGIN_M * 2;
    this.scaleM = Math.min(AREA.w / lenM, AREA.h / widM, MAX_SCALE);
    // centre the bounding box in the play area
    this.origin = {
      x: AREA.x + AREA.w / 2 + ((b.minZ + b.maxZ) / 2) * this.scaleM,
      y: AREA.y + AREA.h / 2 - ((b.minX + b.maxX) / 2) * this.scaleM,
    };

    this.gfx = this.add.graphics();
    this.createLabels();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const pt = this.toShip(p.worldX, p.worldY);
      this.store.update((s) => tapPoint(s, pt));
    });

    this.unsubscribe = this.store.subscribe(() => this.draw());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
    this.draw();
  }

  private createLabels(): void {
    const { ship } = this.store.get();
    for (const room of ship.rooms) {
      if (room.kind !== 'system') continue; // plain rooms / balconies stay unlabelled, like FTL
      const c = roomCenter(ship, room.id);
      if (!c) continue;
      const pts = ship.tiles.filter((t) => t.room === room.id).flatMap((t) => t.polygon.map((p) => this.toScreen(p)));
      const roomW = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
      const pos = this.toScreen(c);
      const make = (size: number, spacing: number) =>
        this.add
          .text(pos.x, pos.y, (room.label || room.id).toUpperCase(), {
            fontFamily: FONT_FAMILY,
            fontSize: `${size}px`,
            color: '#' + WORLD.label.toString(16).padStart(6, '0'),
          })
          .setLetterSpacing(spacing)
          .setAlpha(0.7) // worn stencil paint on the deck
          .setOrigin(0.5);
      let label = make(FONT_SIZES.medium, 3);
      if (label.width > roomW * 0.9) {
        label.destroy();
        label = make(FONT_SIZES.small, 1);
      }
      if (label.width > roomW * 0.9) label.setVisible(false); // too narrow: the info line names it on tap
    }
  }

  private poly(points: Point[]): Phaser.Math.Vector2[] {
    return points.map((p) => {
      const s = this.toScreen(p);
      return new Phaser.Math.Vector2(s.x, s.y);
    });
  }

  /** Tile polygon grown outward by `m` meters (for the hull silhouette around the deck). */
  private grow(t: { center: Point; polygon: Point[] }, m: number): Point[] {
    return t.polygon.map(([x, z]) => {
      const dx = x - t.center[0];
      const dz = z - t.center[1];
      const len = Math.hypot(dx, dz) || 1;
      return [x + (dx / len) * m * Math.SQRT2, z + (dz / len) * m * Math.SQRT2] as Point;
    });
  }

  private draw(): void {
    const { ship, selectedRoomId } = this.store.get();
    const g = this.gfx;
    const px = this.scaleM;
    g.clear();

    // 1. Hull: dark plating around the deck, with a faint rim
    const HULL_M = 0.45;
    g.fillStyle(WORLD.hullEdge, 1);
    for (const t of ship.tiles) g.fillPoints(this.poly(this.grow(t, HULL_M + 0.08)), true);
    g.fillStyle(WORLD.hull, 1);
    for (const t of ship.tiles) g.fillPoints(this.poly(this.grow(t, HULL_M)), true);

    // 2. Deck: plates with seams; machinery as rusty blocks with a cross brace
    for (const t of ship.tiles) {
      const pts = this.poly(t.polygon);
      g.fillStyle(WORLD.floor, 1);
      g.fillPoints(pts, true);
      g.lineStyle(Math.max(1, px * 0.05), WORLD.floorSeam, 1);
      g.strokePoints(this.poly(this.grow(t, -0.12)), true);
      if (t.machinery) {
        const inner = this.poly(this.grow(t, -0.25));
        g.fillStyle(WORLD.machinery, 1);
        g.fillPoints(inner, true);
        g.lineStyle(Math.max(1, px * 0.06), WORLD.machineryDark, 1);
        g.strokePoints(inner, true);
        if (inner.length === 4) {
          g.lineBetween(inner[0]!.x, inner[0]!.y, inner[2]!.x, inner[2]!.y);
          g.lineBetween(inner[1]!.x, inner[1]!.y, inner[3]!.x, inner[3]!.y);
        }
      }
    }

    // 3. Walls: dark body + light top edge; square caps fill the joints
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

    // 4. Doors: closed slabs in the wall gap; airlocks rust-orange with hazard stripes
    for (const d of ship.doors) {
      const c = this.toScreen(d.center);
      const len = d.width * px;
      const thick = Math.max(4, px * (d.kind === 'airlock' ? 0.36 : 0.26));
      const [w, h] = d.axis === 'x' ? [thick, len] : [len, thick]; // x axis = screen vertical
      const x0 = c.x - w / 2;
      const y0 = c.y - h / 2;
      g.fillStyle(d.kind === 'airlock' ? WORLD.airlock : WORLD.door, 1);
      g.fillRect(x0, y0, w, h);
      if (d.kind === 'airlock') {
        g.fillStyle(WORLD.hazard, 0.8);
        const n = 4;
        for (let i = 0; i < n; i++) {
          if (d.axis === 'x') g.fillRect(x0, y0 + ((i + 0.25) * h) / n, w, h / n / 2);
          else g.fillRect(x0 + ((i + 0.25) * w) / n, y0, w / n / 2, h);
        }
      }
      g.lineStyle(1, WORLD.wall, 1);
      g.strokeRect(x0, y0, w, h);
      // split line: two leaves meeting in the middle
      g.lineStyle(1, WORLD.wall, 0.8);
      if (d.axis === 'x') g.lineBetween(x0, c.y, x0 + w, c.y);
      else g.lineBetween(c.x, y0, c.x, y0 + h);
    }

    // 5. Selection: faint lamp-light tint on the floor + crisp outline around the room
    if (selectedRoomId) {
      g.fillStyle(WORLD.select, 0.1);
      for (const t of ship.tiles) if (t.room === selectedRoomId) g.fillPoints(this.poly(t.polygon), true);
      g.lineStyle(3, WORLD.select, 1);
      for (const [p, q] of roomOutline(ship, selectedRoomId)) {
        const s1 = this.toScreen(p);
        const s2 = this.toScreen(q);
        g.lineBetween(s1.x, s1.y, s2.x, s2.y);
        g.fillStyle(WORLD.select, 1);
        g.fillRect(s1.x - 1.5, s1.y - 1.5, 3, 3); // square joints
        g.fillRect(s2.x - 1.5, s2.y - 1.5, 3, 3);
      }
    }
  }
}
