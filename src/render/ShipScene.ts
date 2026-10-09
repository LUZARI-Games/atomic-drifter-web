// Main game view: the airship in the ISO 60/45 look (looking down 60°, turned 45°), orthographic, flat 2D shapes.
// Same renderer as the Ship Lab (ship_view.ts). Owns NO game state: taps are turned into ship meters and sent to core.
import Phaser from 'phaser';
import { makeView } from '../core/projection';
import { tapPoint } from '../core/selection';
import { roomOutline } from '../core/ship';
import { wallHeight } from '../core/ship3d';
import type { Store } from '../core/store';
import type { GameState } from '../core/types';
import { attachPanZoom } from './panzoom';
import { WORLD } from './palette';
import { ShipView } from './ship_view';

/** The game's camera angle (degrees). */
export const GAME_VIEW = { pitch: 60, yaw: 45 } as const;
const PX_PER_M = 40;

export class ShipScene extends Phaser.Scene {
  private view!: ShipView;
  private tint!: Phaser.GameObjects.Graphics;
  private outline!: Phaser.GameObjects.Graphics;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly store: Store<GameState>) {
    super('ship');
  }

  create(): void {
    const { ship } = this.store.get();
    this.view = new ShipView(ship, makeView(GAME_VIEW.pitch, GAME_VIEW.yaw), PX_PER_M);
    const b = this.view.bounds();

    const deck = this.add.graphics();
    this.tint = this.add.graphics().setDepth(0.5); // floor tint: on the deck, under walls and machinery
    const objects = this.add.graphics().setDepth(1);
    this.outline = this.add.graphics().setDepth(2); // outline on top of the walls, so the half walls never hide it
    this.view.draw(this, deck, objects, -b.x, -b.y, []);

    const area = new Phaser.Geom.Rectangle(0, 0, b.width, b.height);
    attachPanZoom(this, {
      bounds: () => area,
      onTap: (x, y) => this.store.update((s) => tapPoint(s, this.view.toShip(x, y))),
    });

    this.unsubscribe = this.store.subscribe(() => this.drawSelection());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
    this.drawSelection();
  }

  /** Selected room: faint lamp-light tint on its floor + crisp outline along the top of its walls. */
  private drawSelection(): void {
    const { ship, selectedRoomId } = this.store.get();
    this.tint.clear();
    this.outline.clear();
    if (!selectedRoomId) return;
    this.tint.fillStyle(WORLD.select, 0.14);
    for (const t of ship.tiles) if (t.room === selectedRoomId) this.tint.fillPoints(t.polygon.map((p) => this.view.deckPoint(p)), true);
    const h = wallHeight(ship);
    this.outline.lineStyle(3, WORLD.select, 1);
    for (const [p, q] of roomOutline(ship, selectedRoomId)) {
      const a = this.view.deckPoint(p, h);
      const c = this.view.deckPoint(q, h);
      this.outline.lineBetween(a.x, a.y, c.x, c.y);
    }
  }
}
