// Draws the ship from core state. Input is forwarded to core as actions;
// this scene never owns game state.

import Phaser from 'phaser';
import type { Game, GameState } from '../core/game';
import { isSelected } from '../core/selection';
import type { RoomDef } from '../core/ship';
import { FONT_FAMILY, palette } from './palette';

export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 540;

const CELL_W = 260;
const CELL_H = 180;
const ROOM_INSET = 6;
const HULL_PAD = 24;
const NOSE = 90; // length of the hull's pointed bow on the right
const FRAME = 3;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class ShipScene extends Phaser.Scene {
  private hull!: Phaser.GameObjects.Graphics;
  private rooms!: Phaser.GameObjects.Graphics;
  private origin = { x: 0, y: 0 };

  constructor(private readonly core: Game) {
    super('ship');
  }

  create(): void {
    const { ship } = this.core.getState();
    const gridW = ship.grid.cols * CELL_W;
    const gridH = ship.grid.rows * CELL_H;
    this.origin = {
      x: Math.round((VIEW_WIDTH - gridW - NOSE) / 2),
      y: Math.round((VIEW_HEIGHT - gridH) / 2),
    };

    this.hull = this.add.graphics();
    this.rooms = this.add.graphics();
    this.drawHull(gridW, gridH);

    for (const room of ship.rooms) {
      const r = this.roomRect(room);
      this.add
        .text(r.x + r.w / 2, r.y + r.h / 2, room.name.toUpperCase(), {
          fontFamily: FONT_FAMILY,
          fontSize: '24px',
          color: palette.greenCss,
        })
        .setOrigin(0.5)
        .setLetterSpacing(6);

      this.add
        .zone(r.x, r.y, r.w, r.h)
        .setOrigin(0)
        .setInteractive({ cursor: 'pointer' })
        .on('pointerdown', () => this.core.dispatch({ type: 'selectRoom', roomId: room.id }));
    }

    // Tapping empty space clears the selection.
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.core.dispatch({ type: 'clearSelection' });
    });

    const unsubscribe = this.core.subscribe((state) => this.drawRooms(state));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
  }

  private roomRect(room: RoomDef): Rect {
    return {
      x: this.origin.x + room.col * CELL_W + ROOM_INSET,
      y: this.origin.y + room.row * CELL_H + ROOM_INSET,
      w: room.cols * CELL_W - ROOM_INSET * 2,
      h: room.rows * CELL_H - ROOM_INSET * 2,
    };
  }

  private drawHull(gridW: number, gridH: number): void {
    const x0 = this.origin.x - HULL_PAD;
    const y0 = this.origin.y - HULL_PAD;
    const x1 = this.origin.x + gridW + HULL_PAD;
    const y1 = this.origin.y + gridH + HULL_PAD;
    const midY = (y0 + y1) / 2;

    this.hull.lineStyle(FRAME, palette.green, 0.45);
    this.hull.beginPath();
    this.hull.moveTo(x0, y0);
    this.hull.lineTo(x1, y0);
    this.hull.lineTo(x1 + NOSE, midY);
    this.hull.lineTo(x1, y1);
    this.hull.lineTo(x0, y1);
    this.hull.closePath();
    this.hull.strokePath();
  }

  private drawRooms(state: GameState): void {
    const g = this.rooms;
    g.clear();

    for (const room of state.ship.rooms) {
      const r = this.roomRect(room);
      const selected = isSelected(state.selection, room.id);

      if (selected) {
        // Glow: fill + a few widening, fading strokes.
        g.fillStyle(palette.green, 0.16);
        g.fillRect(r.x, r.y, r.w, r.h);
        for (let i = 3; i >= 1; i--) {
          g.lineStyle(FRAME + i * 4, palette.green, 0.08 * (4 - i));
          g.strokeRect(r.x, r.y, r.w, r.h);
        }
      }

      g.lineStyle(FRAME, palette.green, selected ? 1 : 0.8);
      g.strokeRect(r.x, r.y, r.w, r.h);
    }
  }
}
