// Draws the ship (planner Godot export) from core state, top-down with the bow pointing right.
// Owns NO game state: taps are converted to ship meters and forwarded to core via the store.
import Phaser from 'phaser';
import { tapPoint } from '../core/selection';
import { roomCenter, shipBounds } from '../core/ship';
import type { Store } from '../core/store';
import type { GameState, Point } from '../core/types';
import { COLORS, FONT_FAMILY, FONT_SIZES, GAME_HEIGHT, GAME_WIDTH } from './palette';

// Free play area between the HTML top bar and info line (game units).
const AREA = { x: 70, y: 105, w: GAME_WIDTH - 140, h: GAME_HEIGHT - 210 };
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
    const lenM = b.maxZ - b.minZ;
    const widM = b.maxX - b.minX;
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
      const c = roomCenter(ship, room.id);
      if (!c) continue;
      const tiles = ship.tiles.filter((t) => t.room === room.id).length;
      const big = tiles * ship.tile_size * this.scaleM >= 260;
      const pos = this.toScreen(c);
      this.add
        .text(pos.x, pos.y, (room.label || room.id).toUpperCase(), {
          fontFamily: FONT_FAMILY,
          fontSize: `${big ? FONT_SIZES.medium : FONT_SIZES.small}px`,
          color: '#1AFF80',
        })
        .setLetterSpacing(big ? 3 : 1)
        .setOrigin(0.5);
    }
  }

  private poly(points: Point[]): Phaser.Math.Vector2[] {
    return points.map((p) => {
      const s = this.toScreen(p);
      return new Phaser.Math.Vector2(s.x, s.y);
    });
  }

  private draw(): void {
    const { ship, selectedRoomId } = this.store.get();
    const g = this.gfx;
    g.clear();

    // Floor tiles
    for (const t of ship.tiles) {
      const pts = this.poly(t.polygon);
      const selected = t.room !== null && t.room === selectedRoomId;
      if (t.machinery) {
        g.fillStyle(COLORS.greenDim, selected ? 0.55 : 0.35);
        g.fillPoints(pts, true);
      } else if (selected) {
        g.fillStyle(COLORS.green, 0.14);
        g.fillPoints(pts, true);
      }
      g.lineStyle(1, COLORS.greenDim, 0.35); // faint tile grid
      g.strokePoints(pts, true);
    }

    // Glow around the selected room (wide faint strokes under the walls)
    if (selectedRoomId) {
      for (const [w, a] of [[16, 0.05], [10, 0.09], [6, 0.16]] as const) {
        g.lineStyle(w, COLORS.green, a);
        for (const t of ship.tiles) if (t.room === selectedRoomId) g.strokePoints(this.poly(t.polygon), true);
      }
    }

    // Walls
    for (const w of ship.walls) {
      const a = this.toScreen(w.a);
      const b = this.toScreen(w.b);
      if (w.kind === 'hull') g.lineStyle(3, COLORS.green, 1);
      else if (w.kind === 'railing') g.lineStyle(2, COLORS.greenDim, 1);
      else g.lineStyle(2, COLORS.green, 0.75);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }

    // Doors: a short bar across the gap (airlocks in amber = hull opening)
    for (const d of ship.doors) {
      const c = this.toScreen(d.center);
      const half = (d.width / 2) * this.scaleM;
      // axis is the ship axis the door runs along: x -> screen vertical, z -> screen horizontal
      const [dx, dy] = d.axis === 'x' ? [0, half] : [half, 0];
      g.lineStyle(d.kind === 'airlock' ? 4 : 3, d.kind === 'airlock' ? COLORS.amber : COLORS.greenDim, 1);
      g.lineBetween(c.x - dx, c.y - dy, c.x + dx, c.y + dy);
    }
  }
}
