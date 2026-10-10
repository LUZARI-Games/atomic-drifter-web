// Main game view: the airship in the ISO 60/45 look (looking down 60°, turned 45°), orthographic, flat 2D shapes.
// Same renderer as the Ship Lab (ship_view.ts). Owns NO game state: taps are turned into ship meters and sent to core.
import { headTop } from './crew_iso';
import Phaser from 'phaser';
import { makeView } from '../core/projection';
import COMBAT from '../data/combat.json';
import { systemBars, tickCombat, workOf } from '../core/combat';
import { systemBlocks } from '../core/hull';
import { atDesk, doorsInUse, navOf, seatOf, selectCrew, STRIDE_M, tickCrew } from '../core/crewmove';
import { keepDistance, moods, type Mood } from '../core/mood';
import { moodEvents, orderRefused, stateEvents } from '../core/events';
import { nodeAt } from '../core/nav';
import { tapPoint } from '../core/selection';
import { anyActive, isActive, setWeaponTarget, tickWeapons, toggleTurret } from '../core/weapons';
import { roomAtPoint, roomOutline } from '../core/ship';
import { wallHeight } from '../core/ship3d';
import type { Store } from '../core/store';
import type { CrewMember, GameState, Point } from '../core/types';
import { attachPanZoom } from './panzoom';
import { FONT_FAMILY, WORLD } from './palette';
import { ShipView, type CrewOnDeck, type ObjectLayer } from './ship_view';
import type { ShipOnScreen } from './wasteland';

/** Sounds the scene asks for (made by src/ui/sound.ts, wired in main.ts). */
export interface ShipSounds {
  select(): void;
  deselect(): void;
  send(): void;
  door(open: boolean): void;
  step(): void;
  hit?(): void;
  die?(): void;
  heal?(): void;
  /** Any sound by id (src/data/sounds.json). */
  play?(id: string): void;
  /** Docked vehicles hum. */
  setVehicles?(on: boolean): void;
}
const SILENT: ShipSounds = { select() {}, deselect() {}, send() {}, door() {}, step() {} };
const TEXT_STYLE = { fontFamily: FONT_FAMILY, fontSize: '15px', resolution: 3 };
const COLORS_HEX = { red: 0xff4a3a, amber: 0xffb43a, green: 0x1aff80 };
const CSS = { red: '#FF4A3A', amber: '#FFB43A', green: '#1AFF80' };

/** The game's camera angle (degrees). */
export const GAME_VIEW = { pitch: 60, yaw: 45 } as const;
const PX_PER_M = 40;
const DOOR_SPEED = 2.2; // door openings per second (0 -> 1 takes ~0.45 s)
const BOB_PX = 2.5; // the airship rides the air: gentle up/down (screen px)
const BOB_PERIOD = 3.4; // seconds
const IDLE_FRAME_MS = 50; // nobody walking: idle animation redrawn at ~20 fps (saves battery)

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
  private lastIdle = 0;
  private doorTarget: number[] = [];
  private stepCount = new Map<string, number>();
  private overlay!: Phaser.GameObjects.Graphics; // health bars, damaged systems
  private energy!: Phaser.GameObjects.Graphics; // pulsing atomic glow of the airship
  private marks = new Map<string, Phaser.GameObjects.Text>(); // speech marks above heads
  private lastHp = new Map<string, number>();
  private hurtAt = new Map<string, number>();
  private workTick = new Map<string, number>(); // seconds to the next hammer / weld sound per worker
  private floats: { text: Phaser.GameObjects.Text; born: number }[] = [];
  private pluses: { x: number; y: number; born: number }[] = []; // med bay heal particles (screen points)
  private moodNow = new Map<string, Mood>();
  private blocks: ReturnType<typeof systemBlocks> = [];
  private turretGfx: Phaser.GameObjects.Graphics[] = []; // one per weapon turret, redrawn every frame
  private hoverTurret = -1;
  private lastFired = 0;
  private lastImpacts = 0;
  ready = false;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly store: Store<GameState>,
    private readonly sfx: ShipSounds = SILENT,
    /** Test scenes: camera centred on this ship point, `zoom` times the fitted view. */
    private readonly focus?: { at: Point; zoom: number },
    /** Title screen: no input, the camera drifts slowly around the ship. */
    private readonly attract = false,
  ) {
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
    this.overlay = this.add.graphics().setDepth(3.2);
    this.blocks = systemBlocks(ship);
    const axis = this.view.screenRight();
    this.store.update((s) => ({ ...s, fightAxis: axis })); // crew left, enemies right on a shared tile (as seen here)
    this.energy = this.add.graphics().setDepth(0.6); // hull reactor, thrusters, levitation drives (outside the deck)
    this.view.drawStatic(this, deck, -b.x, -b.y);
    // walls, blocks, vehicles … drawn once (depth 1..2); crew + moving doors are redrawn and slotted in between
    this.layer = this.view.mountObjects(this, 1, 2, (i) => this.doorOpen[i] ?? 0);
    this.layer.setCrew(this.crewToDraw());

    this.area = new Phaser.Geom.Rectangle(0, 0, b.width, b.height);
    // weapon turrets: in front of the deck objects on the side facing the viewer, behind them on the far side
    this.turretGfx = (this.store.get().weapons?.turrets ?? []).map((t) => this.add.graphics().setDepth(this.view.turretInFront(t) ? 2.05 : 0.65));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.attract || p.wasTouch) return;
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      this.hoverTurret = this.turretAt(wp.x, wp.y);
    });
    attachPanZoom(this, {
      bounds: () => this.area,
      onTap: (x, y) => {
        if (this.attract) return;
        // weapons first: tap a turret = on / off; with turrets on, a tap on a room = their target, the void = hold fire
        const ti = this.turretAt(x, y);
        if (ti >= 0) {
          const on = isActive(this.store.get().weapons!.turrets[ti]!);
          this.store.update((s) => toggleTurret(s, ti));
          this.sfx.play?.(on ? 'turret_off' : 'turret_on');
          return;
        }
        if (anyActive(this.store.get())) {
          const p = this.view.toShip(x, y);
          const room = roomAtPoint(this.store.get().ship, p);
          this.store.update((s) => setWeaponTarget(s, room));
          this.sfx.play?.(room ? 'select' : 'deselect');
          return;
        }
        // a figure under the finger wins (they stand up from the floor, so test on screen, not on the deck)
        const hit = this.crewAt(x, y);
        if (hit) this.store.update((s) => selectCrew(s, s.selectedCrewId === hit ? null : hit));
        else {
          const before = this.store.get();
          const p = this.view.toShip(x, y);
          this.store.update((s) => tapPoint(s, p));
          if (orderRefused(before, this.store.get(), p)) this.sfx.play?.('order_refused');
        }
      },
    });
    // zoom right after fitting = "1" for the wasteland's zoom parallax (refit on resize happens first)
    this.fitZoom = this.cameras.main.zoom;
    const focus = () => {
      if (!this.focus) return;
      const f = this.view.deckPoint(this.focus.at);
      this.cameras.main.setZoom(this.fitZoom * this.focus.zoom).centerOn(f.x, f.y);
    };
    focus();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
      this.fitZoom = this.cameras.main.zoom; // refitted by panzoom just before
      focus();
    });
    this.ready = true;
    this.sfx.setVehicles?.((this.store.get().ship.vehicles ?? []).length > 0);

    let lastSel = this.store.get().selectedCrewId;
    let lastDest = new Map(this.store.get().crew.map((c) => [c.id, c.dest]));
    let lastRoom = this.store.get().selectedRoomId;
    this.unsubscribe = this.store.subscribe((st) => {
      if (st.selectedRoomId !== lastRoom) this.drawSelection();
      lastRoom = st.selectedRoomId;
      if (st.selectedCrewId !== lastSel) {
        this.dirty = true;
        if (st.selectedCrewId) this.sfx.select();
        else this.sfx.deselect();
      } else if (st.crew.some((c) => c.path.length && c.dest !== lastDest.get(c.id))) this.sfx.send();
      lastSel = st.selectedCrewId;
      lastDest = new Map(st.crew.map((c) => [c.id, c.dest]));
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

  /** Slide the camera to ship point `p` (e.g. a boarder's portrait was tapped). */
  lookAt(p: Point): void {
    const w = this.view.deckPoint(p);
    this.cameras.main.pan(w.x, w.y, 450, 'Sine.easeInOut');
  }

  /** Where ship point `p` (height `h` m) is on the screen right now – for automated tap checks (window.adw). */
  screenOf(p: Point, h = 0): { x: number; y: number } {
    const cam = this.cameras.main;
    const w = this.view.deckPoint(p, h);
    return { x: (w.x - cam.scrollX - cam.width / 2) * cam.zoom + cam.width / 2, y: (w.y - cam.scrollY - cam.height / 2) * cam.zoom + cam.height / 2 };
  }

  /** Slide doors towards their open/closed state; redraw the standing objects only while something moves. */
  override update(time: number, delta: number): void {
    // bob: shift the camera by the change of the offset, so pan/zoom and taps stay exact
    const cam = this.cameras.main;
    const bob = Math.sin((time / 1000 / BOB_PERIOD) * Math.PI * 2) * BOB_PX;
    cam.scrollY -= (bob - this.bob) / cam.zoom;
    this.bob = bob;
    if (this.attract) {
      // title screen: slow drift + breathing zoom around the ship (the ship stays a bit low, under the logo)
      const t = time / 1000;
      // smaller than the fitted view, a bit above the middle: between the logo (top) and the menu (bottom)
      const tall = cam.height > cam.width;
      cam.setZoom(this.fitZoom * ((tall ? 0.78 : 0.62) + 0.05 * Math.sin(t / 9)));
      cam.centerOn(this.area.centerX + Math.sin(t / 13) * 40, this.area.centerY + (cam.height * (tall ? 0.04 : 0.02)) / cam.zoom + Math.cos(t / 11) * 20 - bob / cam.zoom);
    }

    // crew walk (core rules), doors open by themselves while someone walks through
    const walking = this.store.get().crew.some((c) => c.path.length);
    const now = performance.now();
    const dt = this.lastTime < 0 ? delta / 1000 : Math.min(now - this.lastTime, 250) / 1000;
    this.lastTime = now;
    // walking, then fights / boarders / repairs / idle timers (core rules), in real elapsed time
    const prev = this.store.get();
    this.store.update((st) => tickWeapons(keepDistance(tickCombat(walking ? tickCrew(st, dt) : st, dt)), dt));
    const state = this.store.get();
    for (const e of stateEvents(prev, state)) this.sfx.play?.(e);
    const wpn = state.weapons;
    if (wpn) {
      if (wpn.fired > this.lastFired) this.sfx.play?.('turret_fire');
      const landed = wpn.impacts.filter((m) => m.t === 0).length;
      if (landed > 0 && wpn.impacts.length !== this.lastImpacts) this.sfx.play?.('turret_hit');
      this.lastFired = wpn.fired;
      this.lastImpacts = wpn.impacts.length;
      wpn.turrets.forEach((t, i) => {
        const g = this.turretGfx[i];
        if (!g) return;
        g.clear();
        const hl = isActive(t) ? (wpn.target ? COLORS_HEX.amber : COLORS_HEX.green) : i === this.hoverTurret ? COLORS_HEX.green : null;
        this.view.drawTurret(g, t, hl);
      });
    }
    // hammering / welding at consoles: a tick every ~0.45 s per worker
    for (const c of state.crew) {
      const work = workOf(state, c);
      if (!work) {
        this.workTick.delete(c.id);
        continue;
      }
      const left = (this.workTick.get(c.id) ?? 0) - dt;
      if (left <= 0) this.sfx.play?.(work === 'sabotage' ? 'sabotage_hit' : 'repair_weld');
      this.workTick.set(c.id, left <= 0 ? 0.42 + Math.random() * 0.12 : left);
    }
    const inUse = doorsInUse(state);
    const step = DOOR_SPEED * dt;
    let doorsMoved = false;
    this.doorOpen = this.doorOpen.map((v, i) => {
      const target = state.openDoors.includes(i) || inUse.includes(i) ? 1 : 0;
      if (this.doorTarget[i] !== undefined && this.doorTarget[i] !== target) this.sfx.door(target === 1);
      this.doorTarget[i] = target;
      if (v === target) return v;
      doorsMoved = true;
      return target > v ? Math.min(target, v + step) : Math.max(target, v - step);
    });
    if (doorsMoved) this.layer.redrawDoors();
    for (const c of state.crew) {
      const n = Math.floor(c.walked / STRIDE_M);
      if (c.path.length && n !== this.stepCount.get(c.id)) this.sfx.step();
      this.stepCount.set(c.id, n);
    }
    this.reactToHits(now);
    const busy = state.crew.some((c) => c.fight || c.dying !== undefined || c.ko !== undefined);
    if (walking || busy || this.dirty || now - this.lastIdle > IDLE_FRAME_MS) {
      const m = moods(this.store.get());
      for (const e of moodEvents(this.moodNow, m)) this.sfx.play?.(e);
      this.moodNow = m;
      this.layer.setCrew(this.crewToDraw(now / 1000));
      this.lastIdle = now;
    }
    this.drawOverlay(now / 1000);
    this.energy.clear();
    this.view.drawEnergy(this.energy, now / 1000);
    this.layer.animate(now / 1000);
    this.dirty = false;
  }

  /** Index of the weapon turret drawn at world point (x, y), -1 = none. */
  private turretAt(x: number, y: number): number {
    let best = -1;
    let bestD = 0.75 * PX_PER_M;
    (this.store.get().weapons?.turrets ?? []).forEach((t, i) => {
      const p = this.view.deckPoint(t.at, 0.3);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  /** Crew as the renderer needs them: facing on screen, lifted onto a vehicle seat, selection ring. */
  private crewToDraw(t = performance.now() / 1000): CrewOnDeck[] {
    const { ship, crew, selectedCrewId } = this.store.get();
    const nav = navOf(ship);
    const byId = new Map(crew.map((c) => [c.id, c]));
    // ship heading (atan2(dz, dx)) -> view angle: ship x -> view y, ship z -> view -x
    const toView = (heading: number) => Math.atan2(Math.cos(heading), -Math.sin(heading));
    const towards = (from: CrewMember, to: CrewMember | undefined) => (to ? Math.atan2(to.pos[1] - from.pos[1], to.pos[0] - from.pos[0]) : from.heading);
    return crew.map((c, i) => {
      const node = nodeAt(ship, nav, c.pos);
      const vehicle = node?.startsWith('v') ? Number(node.slice(1).split(':')[0]) : undefined;
      const base = { look: c.look, vehicle, ring: c.id === selectedCrewId ? WORLD.select : undefined, hostile: c.side === 'enemy' };
      const seed = i * 0.618 + 0.3;
      const hurt = Math.max(0, 1 - (performance.now() - (this.hurtAt.get(c.id) ?? -1e9)) / 250);
      // standing still: idle animation; at the desk spot of a console: typing; in a vehicle: seated
      const seat = c.path.length ? null : seatOf(ship, c.node);
      if (seat) return { ...base, at: seat.pos, facing: toView(c.heading), step: 0, lift: 0, idle: { t, seed, typing: false }, sit: seat };
      if (c.ko !== undefined) return { ...base, at: c.pos, facing: toView(c.heading), step: 0, lift: 0, idle: { t, seed, typing: false, dying: 1 } };
      if (c.dying !== undefined) {
        const d = 1 - c.dying / COMBAT.death_s; // 0 … 1
        return { ...base, at: c.pos, facing: toView(c.heading), step: 0, lift: 0, idle: { t, seed, typing: false, dying: Math.min(1, d * 1.6) }, alpha: Math.max(0, 1 - Math.max(0, d - 0.4) / 0.6) };
      }
      if (c.fight) {
        const since = COMBAT.attack_interval_s - c.fight.cooldown; // seconds since the last blow
        const punch = c.fight.hits > 0 ? Math.max(0, 1 - since / 0.28) : 0;
        return { ...base, at: c.pos, facing: toView(towards(c, byId.get(c.fight.target))), step: 0, lift: 0, idle: { t, seed, typing: false, punch, punchSide: c.fight.hits % 2 ? 1 : -1, hurt } };
      }
      let idle: CrewOnDeck['idle'];
      let facing = toView(c.heading);
      const work = workOf(this.store.get(), c);
      if (work) return { ...base, at: c.pos, facing, step: 0, lift: 0, idle: { t, seed, typing: false, hurt, work } };
      if (!c.path.length) {
        idle = { t, seed, typing: atDesk(ship, c), hurt };
        const m = this.moodNow.get(c.id);
        if (m) {
          const other = byId.get(m.kind === 'bored' ? '' : m.kind === 'chat' ? m.partner : m.other);
          const rel = Math.atan2(Math.sin(towards(c, other) - c.heading), Math.cos(towards(c, other) - c.heading)); // turn needed to look at them
          if (m.kind === 'bored') idle = { ...idle, mood: 'bored', sit: m.sit };
          else if (m.kind === 'wary') idle = { ...idle, mood: 'wary', glance: Math.max(-1.3, Math.min(1.3, -rel)) };
          else if (m.role === 'teller' && !idle.typing) {
            facing = toView(towards(c, other)); // the storyteller turns to the listener
            idle = { ...idle, mood: 'teller' };
          } else idle = { ...idle, mood: 'listener', glance: Math.max(-1.3, Math.min(1.3, -rel)) };
        }
      }
      return { ...base, at: c.pos, facing, step: c.walked, lift: vehicle !== undefined ? 0.35 : 0, idle };
    });
  }

  /** Hits and deaths since the last frame: damage numbers, hurt flash, sounds. */
  private reactToHits(now: number): void {
    const { crew } = this.store.get();
    for (const c of crew) {
      const before = this.lastHp.get(c.id);
      if (before !== undefined && c.hp < before) {
        this.hurtAt.set(c.id, now);
        this.sfx.hit?.();
        const p = this.view.deckPoint(c.pos, headTop(c.look));
        const text = this.add.text(p.x, p.y, `-${Math.round(before - c.hp)}`, { ...TEXT_STYLE, color: CSS.red }).setOrigin(0.5).setDepth(3.4);
        this.floats.push({ text, born: now });
        if (c.hp <= 0 && c.side === 'enemy') this.sfx.die?.(); // own crew: crew_ko (stateEvents)
      } else if (before !== undefined && before > 0 && c.hp > before) {
        // med bay tick: "+5" and a few green crosses rising around the body
        this.sfx.heal?.();
        const p = this.view.deckPoint(c.pos, headTop(c.look));
        const text = this.add.text(p.x, p.y - 6, `+${Math.round(c.hp - before)}`, { ...TEXT_STYLE, color: CSS.green }).setOrigin(0.5).setDepth(3.4);
        this.floats.push({ text, born: now });
        for (let k = 0; k < 4; k++) {
          const a = this.view.deckPoint([c.pos[0] + (Math.random() - 0.5) * 0.8, c.pos[1] + (Math.random() - 0.5) * 0.8], 0.3 + Math.random() * 1.2);
          this.pluses.push({ x: a.x, y: a.y, born: now + k * 120 });
        }
      }
      this.lastHp.set(c.id, c.hp);
    }
    for (const id of [...this.lastHp.keys()]) if (!crew.some((c) => c.id === id)) this.lastHp.delete(id);
    this.floats = this.floats.filter((f) => {
      const age = (now - f.born) / 900;
      if (age >= 1) {
        f.text.destroy();
        return false;
      }
      f.text.setAlpha(1 - age).setY(f.text.y - 0.6);
      return true;
    });
  }

  /** Health bars over fighters / the wounded, speech marks over chatting / wary / bored crew, wrecked systems. */
  private drawOverlay(t: number): void {
    const state = this.store.get();
    const { ship, crew, systemDamage } = state;
    const g = this.overlay;
    g.clear();
    // weapons: the target room blinks amber, tracers fly, hits flash
    const wpn = state.weapons;
    if (wpn?.target) {
      g.lineStyle(3, COLORS_HEX.amber, 0.6 + 0.4 * Math.sin(t * 8));
      for (const [p, q] of roomOutline(ship, wpn.target)) {
        const a = this.view.deckPoint(p, 0.05);
        const c = this.view.deckPoint(q, 0.05);
        g.lineBetween(a.x, a.y, c.x, c.y);
      }
    }
    for (const sh of wpn?.shots ?? []) {
      const k = sh.t / sh.dur;
      const k0 = Math.max(0, k - 0.12);
      const at = (f: number) => this.view.deckPoint([sh.from[0] + (sh.to[0] - sh.from[0]) * f, sh.from[1] + (sh.to[1] - sh.from[1]) * f], sh.fromH + (sh.toH - sh.fromH) * f);
      const a = at(k0);
      const b = at(k);
      g.lineStyle(4, 0xffb43a, 0.5).lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(2, 0xfff2c0, 1).lineBetween(a.x, a.y, b.x, b.y);
    }
    for (const m of wpn?.impacts ?? []) {
      const x = m.t / 0.35;
      const p = this.view.deckPoint(m.at, m.h);
      g.fillStyle(0xffd27a, 0.75 * (1 - x)).fillCircle(p.x, p.y, 6 + 28 * x);
    }
    // damaged systems: the block pulses red, stronger the more it is wrecked
    for (const [room, dmg] of Object.entries(systemDamage)) {
      const a = (dmg / Math.max(1, systemBars(state, room))) * (0.25 + 0.15 * Math.sin(t * 6));
      g.fillStyle(COLORS_HEX.red, a);
      for (const tile of ship.tiles) if (tile.room === room && tile.machinery) g.fillPoints(tile.polygon.map((p) => this.view.deckPoint(p, 1)), true);
    }
    // system health bars (one per power level) above the block while it is damaged or someone works on it
    const worked = new Set(crew.filter((c) => workOf(state, c)).map((c) => ship.tiles[Number(c.node.slice(1))]?.room));
    for (const b of this.blocks) {
      const bars = systemBars(state, b.room);
      if (!bars || (!systemDamage[b.room] && !worked.has(b.room))) continue;
      const left = bars - (systemDamage[b.room] ?? 0); // remaining health in bars
      const p = this.view.deckPoint(b.anchor, 1.9);
      const w = 9;
      const x0 = p.x - (bars * (w + 3)) / 2;
      for (let i = 0; i < bars; i++) {
        const fill = Math.max(0, Math.min(1, left - i));
        g.fillStyle(0x000000, 0.75).fillRect(x0 + i * (w + 3) - 1, p.y - 1, w + 2, 16);
        g.fillStyle(COLORS_HEX.red, 0.5).fillRect(x0 + i * (w + 3), p.y, w, 14);
        if (fill > 0) g.fillStyle(COLORS_HEX.green, 1).fillRect(x0 + i * (w + 3), p.y + 14 * (1 - fill), w, 14 * fill);
      }
    }
    // sparks where someone hammers (orange) or welds (white-yellow) at a console
    for (const c of crew) {
      const work = workOf(state, c);
      if (!work) continue;
      const fx: Point = [c.pos[0] + Math.cos(c.heading) * 0.5, c.pos[1] + Math.sin(c.heading) * 0.5];
      const s = this.view.deckPoint(fx, 0.85);
      const n = work === 'repair' ? 5 : Math.random() < 0.35 ? 7 : 0; // welding: steady; hammering: bursts
      g.lineStyle(2, work === 'repair' ? 0xfff6c0 : 0xffa040, 1);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * 12;
        g.lineBetween(s.x, s.y, s.x + Math.cos(a) * r, s.y + Math.sin(a) * r - 4);
      }
      if (work === 'repair') g.fillStyle(0xfff6c0, 0.35 + 0.35 * Math.random()).fillCircle(s.x, s.y, 5);
    }
    // med bay heal particles: green crosses rising and fading
    const nowMs = t * 1000;
    this.pluses = this.pluses.filter((q) => nowMs - q.born < 900);
    for (const q of this.pluses) {
      const age = (nowMs - q.born) / 900;
      if (age < 0) continue;
      const y = q.y - age * 26;
      const r = 4;
      g.fillStyle(COLORS_HEX.green, 1 - age);
      g.fillRect(q.x - r, y - 1.5, r * 2, 3).fillRect(q.x - 1.5, y - r, 3, r * 2);
    }
    // knocked out: little yellow stars circling the head of the one lying there
    for (const c of crew) {
      if (c.ko === undefined) continue;
      const head = this.view.deckPoint([c.pos[0], c.pos[1]], 0.75);
      for (let k = 0; k < 3; k++) {
        const a = t * 3 + (k * Math.PI * 2) / 3;
        const x = head.x + Math.cos(a) * 14;
        const y = head.y - 6 + Math.sin(a) * 5;
        g.fillStyle(0xffe066, Math.sin(a) > 0 ? 1 : 0.55);
        g.fillTriangle(x, y - 4, x - 3.5, y + 2.5, x + 3.5, y + 2.5).fillTriangle(x, y + 4, x - 3.5, y - 2.5, x + 3.5, y - 2.5);
      }
    }
    const seen = new Set<string>();
    for (const c of crew) {
      if (c.dying !== undefined || c.ko !== undefined || seatOf(ship, c.node)) continue;
      const head = this.view.deckPoint(c.pos, headTop(c.look));
      {
        // health bar over every head: green = own crew, red = hostile
        const w = 0.7 * PX_PER_M;
        const share = Math.max(0, c.hp / c.hpMax);
        const col = c.side === 'enemy' ? COLORS_HEX.red : COLORS_HEX.green;
        g.fillStyle(0x000000, 0.7).fillRect(head.x - w / 2 - 1, head.y - 1, w + 2, 6);
        g.fillStyle(col, 1).fillRect(head.x - w / 2, head.y, w * share, 4);
      }
      const mark = this.markFor(c, t);
      if (!mark) continue;
      seen.add(c.id);
      let text = this.marks.get(c.id);
      if (!text) {
        text = this.add.text(0, 0, '', TEXT_STYLE).setOrigin(0.5, 1).setDepth(3.3);
        this.marks.set(c.id, text);
      }
      text.setText(mark.text).setColor(mark.color).setPosition(head.x + 10, head.y - 4).setAlpha(mark.alpha).setVisible(true);
    }
    for (const [id, text] of this.marks) if (!seen.has(id)) text.setVisible(false);
  }

  /** Speech mark for a mood: storyteller "…" / "!" / "HA", listener nods (no mark), wary "?", bored "zZ" when sitting. */
  private markFor(c: CrewMember, t: number): { text: string; color: string; alpha: number } | null {
    const m = this.moodNow.get(c.id);
    if (!m) return null;
    const seed = (c.id.length * 1.7) % 3;
    const cycle = (t + seed) % 4; // marks pop up for a while, then pause
    const show = cycle < 2.6;
    if (m.kind === 'chat' && m.role === 'teller') {
      const glyph = ['…', '!', 'HA', '…', '!!', 'HA HA'][Math.floor((t + seed) / 4) % 6]!;
      return show ? { text: glyph, color: CSS.green, alpha: 1 } : null;
    }
    if (m.kind === 'wary') return cycle < 1.4 ? { text: '?', color: CSS.amber, alpha: 0.9 } : null;
    if (m.kind === 'bored') return m.sit > 0.9 ? { text: 'zZ', color: CSS.green, alpha: 0.7 } : cycle < 1 ? { text: '…', color: CSS.green, alpha: 0.7 } : null;
    return null;
  }

  /** Crew member drawn at world point (x, y): feet up to the head, nearest to the viewer first. */
  private crewAt(x: number, y: number): string | null {
    const { crew } = this.store.get();
    const draw = this.crewToDraw();
    let best: string | null = null;
    let bestD = Infinity;
    crew.forEach((c, i) => {
      if (c.side === 'enemy' || c.dying !== undefined || c.ko !== undefined) return; // only own crew on their feet can be picked
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
