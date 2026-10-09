// Draws the ship from core state. Owns NO game state: input is forwarded to core via the store.
import Phaser from 'phaser';
import { tapCell } from '../core/selection';
import type { Store } from '../core/store';
import type { RoomDef, ShipState } from '../core/types';
import { COLORS, FONT_FAMILY, FONT_SIZES, GAME_HEIGHT, GAME_WIDTH } from './palette';

const CELL = 170; // px per grid cell
const HULL_PAD = 36;

export class ShipScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private origin = { x: 0, y: 0 };
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly store: Store<ShipState>) {
    super('ship');
  }

  create(): void {
    const { cols, rows } = this.store.get().layout.gridSize;
    this.origin = {
      x: Math.round((GAME_WIDTH - cols * CELL) / 2),
      y: Math.round((GAME_HEIGHT - rows * CELL) / 2),
    };

    this.gfx = this.add.graphics();
    this.createLabels();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const col = Math.floor((p.worldX - this.origin.x) / CELL);
      const row = Math.floor((p.worldY - this.origin.y) / CELL);
      this.store.update((s) => tapCell(s, col, row));
    });

    this.unsubscribe = this.store.subscribe(() => this.draw());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
    this.draw();
  }

  private roomRect(r: RoomDef): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(
      this.origin.x + r.x * CELL,
      this.origin.y + r.y * CELL,
      r.w * CELL,
      r.h * CELL,
    );
  }

  private createLabels(): void {
    for (const room of this.store.get().layout.rooms) {
      const rect = this.roomRect(room);
      this.add
        .text(rect.centerX, rect.centerY, room.name.toUpperCase(), {
          fontFamily: FONT_FAMILY,
          fontSize: `${FONT_SIZES.large}px`,
          color: '#1AFF80',
        })
        .setLetterSpacing(4)
        .setOrigin(0.5);
    }
  }

  private draw(): void {
    const state = this.store.get();
    const { cols, rows } = state.layout.gridSize;
    const g = this.gfx;
    g.clear();

    // Hull outline (dim) with a pointed nose on the cockpit side.
    const hx = this.origin.x - HULL_PAD;
    const hy = this.origin.y - HULL_PAD;
    const hw = cols * CELL + HULL_PAD * 2;
    const hh = rows * CELL + HULL_PAD * 2;
    g.lineStyle(3, COLORS.greenDim, 1);
    const nose = [
      [hx, hy],
      [hx + hw, hy],
      [hx + hw + 70, hy + hh / 2],
      [hx + hw, hy + hh],
      [hx, hy + hh],
    ] as const;
    g.beginPath();
    g.moveTo(nose[0][0], nose[0][1]);
    for (const [px, py] of nose.slice(1)) g.lineTo(px, py);
    g.closePath();
    g.strokePath();

    for (const room of state.layout.rooms) {
      const rect = this.roomRect(room);
      const selected = room.id === state.selectedRoomId;

      if (selected) {
        g.fillStyle(COLORS.green, 0.12);
        g.fillRect(rect.x, rect.y, rect.width, rect.height);
        // Fake glow: wide, faint strokes under the main outline.
        for (const [w, a] of [[18, 0.06], [12, 0.1], [7, 0.18]] as const) {
          g.lineStyle(w, COLORS.green, a);
          g.strokeRect(rect.x, rect.y, rect.width, rect.height);
        }
      }

      g.lineStyle(3, COLORS.green, selected ? 1 : 0.75);
      g.strokeRect(rect.x + 4, rect.y + 4, rect.width - 8, rect.height - 8);
    }
  }
}
