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
import type { ShipOnScreen } from './wasteland';

/** The game's camera angle (degrees). */
export const GAME_VIEW = { pitch: 60, yaw: 45 } as const;
const PX_PER_M = 40;
const DOOR_SPEED = 2.2; // door openings per second (0 -> 1 takes ~0.45 s)
const BOB_PX = 2.5; // the airship rides the air: gentle up/down (screen px)
const BOB_PERIOD = 3.4; // seconds

export class ShipScene extends Phaser.Scene implements ShipOnScreen {
  private view!: ShipView;
  private tint!: Phaser.GameObjects.Graphics;
  private outline!: Phaser.GameObjects.Graphics;
  private objects!: Phaser.GameObjects.Graphics;
  /** How far each door is open right now (0…1) – animation only; the real state is store.openDoors. */
  private doorOpen: number[] = [];
  private area = new Phaser.Geom.Rectangle(0, 0, 1, 1);
  private fitZoom = 1;
  private bob = 0;
  ready = false;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly store: Store<GameState>) {
    super({ key: 'ship', active: true });
  }

  create(): void {
    const { ship } = this.store.get();
    this.view = new ShipView(ship, makeView(GAME_VIEW.pitch, GAME_VIEW.yaw), PX_PER_M);
    const b = this.view.bounds();

    const deck = this.add.graphics();
    this.tint = this.add.graphics().setDepth(0.5); // floor tint: on the deck, under walls and machinery
    this.objects = this.add.graphics().setDepth(1);
    this.doorOpen = ship.doors.map((_, i) => (this.store.get().openDoors.includes(i) ? 1 : 0));
    this.outline = this.add.graphics().setDepth(2); // outline on top of the walls, so the half walls never hide it
    this.view.drawStatic(this, deck, -b.x, -b.y);
    this.view.drawObjects(this.objects, [], (i) => this.doorOpen[i] ?? 0);

    this.area = new Phaser.Geom.Rectangle(0, 0, b.width, b.height);
    attachPanZoom(this, {
      bounds: () => this.area,
      onTap: (x, y) => this.store.update((s) => tapPoint(s, this.view.toShip(x, y))),
    });
    // zoom right after fitting = "1" for the wasteland's zoom parallax (refit on resize happens first)
    this.fitZoom = this.cameras.main.zoom;
    this.scale.on(Phaser.Scale.Events.RESIZE, () => (this.fitZoom = this.cameras.main.zoom));
    this.ready = true;

    this.unsubscribe = this.store.subscribe(() => this.drawSelection());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
    this.drawSelection();
  }

  /** Ship centre on screen + zoom relative to the fitted view – the wasteland scenes follow it for parallax. */
  screen(): { x: number; y: number; zoom: number } {
    const cam = this.cameras.main;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;
    return {
      x: (this.area.centerX - cx) * cam.zoom + cam.width / 2,
      y: (this.area.centerY - this.bob / cam.zoom - cy) * cam.zoom + cam.height / 2, // without the bob: the ground does not bob
      zoom: cam.zoom / this.fitZoom,
    };
  }

  /** Slide doors towards their open/closed state; redraw the standing objects only while something moves. */
  override update(time: number, delta: number): void {
    // bob: shift the camera by the change of the offset, so pan/zoom and taps stay exact
    const cam = this.cameras.main;
    const bob = Math.sin((time / 1000 / BOB_PERIOD) * Math.PI * 2) * BOB_PX;
    cam.scrollY -= (bob - this.bob) / cam.zoom;
    this.bob = bob;

    const open = this.store.get().openDoors;
    const step = (DOOR_SPEED * delta) / 1000;
    let moved = false;
    this.doorOpen = this.doorOpen.map((v, i) => {
      const target = open.includes(i) ? 1 : 0;
      if (v === target) return v;
      moved = true;
      return target > v ? Math.min(target, v + step) : Math.max(target, v - step);
    });
    if (!moved) return;
    this.objects.clear();
    this.view.drawObjects(this.objects, [], (i) => this.doorOpen[i] ?? 0);
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
