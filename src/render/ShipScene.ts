// Main game view: the airship in the ISO 60/45 look (looking down 60°, turned 45°), orthographic, flat 2D shapes.
// Same renderer as the Ship Lab (ship_view.ts). Owns NO game state: taps are turned into ship meters and sent to core.
import Phaser from 'phaser';
import { makeView } from '../core/projection';
import { doorsInUse, navOf, selectCrew, tickCrew } from '../core/crewmove';
import { nodeAt } from '../core/nav';
import { tapPoint } from '../core/selection';
import { roomOutline } from '../core/ship';
import { wallHeight } from '../core/ship3d';
import type { Store } from '../core/store';
import type { GameState } from '../core/types';
import { attachPanZoom } from './panzoom';
import { WORLD } from './palette';
import { ShipView, type CrewOnDeck, type ObjectLayer } from './ship_view';
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
  private layer!: ObjectLayer;
  /** How far each door is open right now (0…1) – animation only; the real state is store.openDoors. */
  private doorOpen: number[] = [];
  private area = new Phaser.Geom.Rectangle(0, 0, 1, 1);
  private fitZoom = 1;
  private bob = 0;
  private lastTime = -1; // real time of the previous frame (Phaser's `delta` is smoothed and undercounts on slow devices)
  private dirty = false; // standing objects need a redraw (crew moved / selection changed)
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
    this.doorOpen = ship.doors.map((_, i) => (this.store.get().openDoors.includes(i) ? 1 : 0));
    this.outline = this.add.graphics().setDepth(3); // outline on top of the walls, so the half walls never hide it
    this.view.drawStatic(this, deck, -b.x, -b.y);
    // walls, blocks, vehicles … drawn once (depth 1..2); crew + moving doors are redrawn and slotted in between
    this.layer = this.view.mountObjects(this, 1, 2, (i) => this.doorOpen[i] ?? 0);
    this.layer.setCrew(this.crewToDraw());

    this.area = new Phaser.Geom.Rectangle(0, 0, b.width, b.height);
    attachPanZoom(this, {
      bounds: () => this.area,
      onTap: (x, y) => {
        // a figure under the finger wins (they stand up from the floor, so test on screen, not on the deck)
        const hit = this.crewAt(x, y);
        if (hit) this.store.update((s) => selectCrew(s, s.selectedCrewId === hit ? null : hit));
        else this.store.update((s) => tapPoint(s, this.view.toShip(x, y)));
      },
    });
    // zoom right after fitting = "1" for the wasteland's zoom parallax (refit on resize happens first)
    this.fitZoom = this.cameras.main.zoom;
    this.scale.on(Phaser.Scale.Events.RESIZE, () => (this.fitZoom = this.cameras.main.zoom));
    this.ready = true;

    let lastSel = this.store.get().selectedCrewId;
    this.unsubscribe = this.store.subscribe((st) => {
      this.drawSelection();
      if (st.selectedCrewId !== lastSel) this.dirty = true;
      lastSel = st.selectedCrewId;
    });
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

    // crew walk (core rules), doors open by themselves while someone walks through
    const walking = this.store.get().crew.some((c) => c.path.length);
    const now = performance.now();
    const dt = this.lastTime < 0 ? delta / 1000 : Math.min(now - this.lastTime, 250) / 1000;
    this.lastTime = now;
    if (walking) this.store.update((st) => tickCrew(st, dt)); // real elapsed time: same walking speed on any device
    const state = this.store.get();
    const inUse = doorsInUse(state);
    const step = DOOR_SPEED * dt;
    let doorsMoved = false;
    this.doorOpen = this.doorOpen.map((v, i) => {
      const target = state.openDoors.includes(i) || inUse.includes(i) ? 1 : 0;
      if (v === target) return v;
      doorsMoved = true;
      return target > v ? Math.min(target, v + step) : Math.max(target, v - step);
    });
    if (doorsMoved) this.layer.redrawDoors();
    if (walking || this.dirty) this.layer.setCrew(this.crewToDraw());
    this.dirty = false;
  }

  /** Crew as the renderer needs them: facing on screen, lifted onto a vehicle seat, selection ring. */
  private crewToDraw(): CrewOnDeck[] {
    const { ship, crew, selectedCrewId } = this.store.get();
    const nav = navOf(ship);
    return crew.map((c) => {
      const node = nodeAt(ship, nav, c.pos);
      const vehicle = node?.startsWith('v') ? Number(node.slice(1).split(':')[0]) : undefined;
      // ship heading (atan2(dz, dx)) -> view angle: ship x -> view y, ship z -> view -x
      const facing = Math.atan2(Math.cos(c.heading), -Math.sin(c.heading));
      return { look: c.look, at: c.pos, facing, step: c.walked, lift: vehicle !== undefined ? 0.35 : 0, vehicle, ring: c.id === selectedCrewId ? WORLD.select : undefined };
    });
  }

  /** Crew member drawn at world point (x, y): feet up to the head, nearest to the viewer first. */
  private crewAt(x: number, y: number): string | null {
    const { crew } = this.store.get();
    const draw = this.crewToDraw();
    let best: string | null = null;
    let bestD = Infinity;
    crew.forEach((c, i) => {
      const feet = this.view.deckPoint(c.pos, draw[i]!.lift ?? 0);
      const dx = x - feet.x;
      const dy = y - feet.y;
      const h = 1.9 * PX_PER_M * Math.cos((GAME_VIEW.pitch * Math.PI) / 180); // figure height on screen
      if (Math.abs(dx) < 0.55 * PX_PER_M && dy < 0.35 * PX_PER_M && dy > -h) {
        const d = Math.abs(dx) + Math.abs(dy + h / 2);
        if (d < bestD) { bestD = d; best = c.id; }
      }
    });
    return best;
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
