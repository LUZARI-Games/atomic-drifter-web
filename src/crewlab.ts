// Crew Lab test page (/crew-lab/): every origin x build. OLD look vs NEW look (origin colour + gear) vs ISO (NEW look, 45° view),
// close-up + walking at in-game size.
import Phaser from 'phaser';
import { CREW_LOOKS, loopPose, parseCrewLook, turnTowards, type CrewLook } from './core/crew';
import type { Point } from './core/types';
import LAB from './data/crew_lab.json';
import { drawCrew } from './render/crew';
import { drawCrewIso, isoFloor } from './render/crew_iso';
import { drawCrewV2 } from './render/crew_v2';
import { COLORS, FONT_FAMILY, FONT_SIZES, WORLD } from './render/palette';
import { attachPanZoom } from './render/panzoom';
import { mountMenu, toggleFullscreen } from './ui/menu';
import './ui/styles.css';

const PX_PER_M = 36; // roughly the in-game zoom on a phone
const TILE = 2 * PX_PER_M; // planner tiles are 2 m
const WALK_SPEED = 1.4; // m/s
const TURN_SPEED = 9; // rad/s
const CELL_W = 500;
const CELL_H = 354;
const CLOSE = { w: 100, h: 120, y: 62, xs: [8, 118, 228, 338] }; // close-ups: OLD | NEW | NEW + GEAR | ISO
const WALK = { y: 210, xs: [8, 170, 332] }; // walking at in-game size: OLD | NEW + GEAR | ISO
const ISO_CLOSE_PX_PER_M = 60;
const ISO_HEADROOM = 42; // px above the squashed ISO floor for heads
const GAP = 15;
const isPortrait = () => window.innerHeight > window.innerWidth;

class CrewLabScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private facing: number[] = [];
  private cells: { x: number; y: number }[] = [];

  constructor(private looks: () => CrewLook[]) {
    super('crew-lab');
  }

  create(): void {
    this.gfx = this.add.graphics();
    this.cells = [];
    this.facing = [];
    // phone upright: 1 column, sideways: 2 (4 on big screens) – the view starts at full width and scrolls down
    const cols = isPortrait() ? 1 : window.innerWidth >= 1800 ? 4 : 2;
    const looks = this.looks();
    looks.forEach((l, i) => {
      const x = (i % cols) * CELL_W;
      const y = Math.floor(i / cols) * (CELL_H + GAP);
      this.cells.push({ x, y });
      this.facing.push(0);
      const small = (tx: number, ty: number, text: string, color = '#0d6b3a') =>
        this.add.text(x + tx, y + ty, text, { fontFamily: FONT_FAMILY, fontSize: FONT_SIZES.small, color, resolution: 4 });
      small(8, 0, l.name, '#1aff80');
      const o = CREW_LOOKS.origins[l.origin];
      small(8, 18, o.hostile ? 'HOSTILE' : 'FRIENDLY', o.hostile ? '#ffb43a' : '#0d6b3a');
      ['OLD', 'NEW', 'NEW + GEAR', 'ISO 45°'].forEach((t, k) => small(CLOSE.xs[k]!, CLOSE.y - 18, t));
      ['IN-GAME: OLD', 'NEW + GEAR', 'ISO 45°'].forEach((t, k) => small(WALK.xs[k]!, WALK.y - 18, t));
    });

    const rows = Math.ceil(looks.length / cols);
    const bounds = new Phaser.Geom.Rectangle(0, 0, cols * CELL_W, rows * (CELL_H + GAP) - GAP);
    attachPanZoom(this, { bounds: () => bounds, fit: 'width' });

    // re-flow the columns when the phone is turned
    const portrait = isPortrait();
    const onResize = () => {
      if (isPortrait() !== portrait) this.scene.restart();
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, onResize));
  }

  override update(time: number, delta: number): void {
    const g = this.gfx;
    g.clear();
    const looks = this.looks();
    looks.forEach((l, i) => {
      const { x, y } = this.cells[i]!;
      const size = CREW_LOOKS.builds[l.build].size_m;

      const hostile = CREW_LOOKS.origins[l.origin].hostile;
      const bare = { ...l, gear: [] };
      const inset = 0.9;
      const path: Point[] = [[inset, inset], [4 - inset, inset], [4 - inset, 4 - inset], [inset, 4 - inset], [2, 2]];
      const walked = (time / 1000) * WALK_SPEED + i * 1.3;
      const pose = loopPose(path, walked);
      this.facing[i] = turnTowards(this.facing[i]!, pose.facing, (TURN_SPEED * delta) / 1000);
      const f = this.facing[i]!;

      // in-game size: walk a loop over 2x2 deck tiles
      WALK.xs.forEach((wx, k) => {
        const dx = x + wx;
        const dy = y + WALK.y;
        if (k === 2) {
          // ISO: same 4x4 m deck, squashed by the 45° view; heads may rise above it
          const fy = dy + ISO_HEADROOM;
          g.fillStyle(WORLD.floor, 1);
          g.fillPoints(isoFloor(dx, fy, 0, 0, 4, 4, PX_PER_M), true);
          g.lineStyle(1, WORLD.floorSeam, 1);
          for (let a = 0; a < 2; a++) for (let m = 0; m < 2; m++) g.strokePoints(isoFloor(dx, fy, a * 2 + 0.08, m * 2 + 0.08, 1.84, 1.84, PX_PER_M), true);
          const [fx, fz] = [pose.pos[0], pose.pos[1]];
          const p = isoFloor(dx, fy, fx, fz, 0, 0, PX_PER_M)[0]!;
          drawCrewIso(g, l, p.x, p.y, PX_PER_M, f, walked, hostile);
          return;
        }
        g.fillStyle(WORLD.floor, 1);
        g.fillRect(dx, dy, TILE * 2, TILE * 2);
        g.lineStyle(1, WORLD.floorSeam, 1);
        for (let a = 0; a < 2; a++) for (let m = 0; m < 2; m++) g.strokeRect(dx + a * TILE + 3, dy + m * TILE + 3, TILE - 6, TILE - 6);
        const px = dx + pose.pos[0] * PX_PER_M;
        const py = dy + pose.pos[1] * PX_PER_M;
        const r = (size / 2) * PX_PER_M;
        if (k === 0) drawCrew(g, l, px, py, r, f);
        else drawCrewV2(g, l, px, py, r, f, hostile);
      });

      // close-ups, same facing
      const cr = 28 * (size / CREW_LOOKS.builds.normal.size_m);
      CLOSE.xs.forEach((cx, k) => {
        g.fillStyle(WORLD.floor, 1);
        g.fillRect(x + cx, y + CLOSE.y, CLOSE.w, CLOSE.h);
        const mx = x + cx + CLOSE.w / 2;
        const my = y + CLOSE.y + CLOSE.h / 2;
        if (k === 0) drawCrew(g, l, mx, my, cr, f);
        else if (k === 3) drawCrewIso(g, l, mx, y + CLOSE.y + CLOSE.h * 0.8, ISO_CLOSE_PX_PER_M, f, walked, hostile);
        else drawCrewV2(g, k === 1 ? bare : l, mx, my, cr, f, hostile);
      });
    });
  }
}

async function boot(): Promise<void> {
  const base = LAB.map(parseCrewLook).filter((l): l is CrewLook => !!l);
  let swapped = false;
  const looks = () => (swapped ? base.map((l) => ({ ...l, sex: l.sex === 'male' ? 'female' : 'male' }) as CrewLook) : base);

  mountMenu(document.getElementById('hud')!, 'CREW LAB', [
    { label: 'SWAP M/F', onClick: () => (swapped = !swapped) },
    { label: 'GAME', href: '/' },
    ...(document.fullscreenEnabled ? [{ label: 'FULLSCREEN', onClick: () => void toggleFullscreen() }] : []),
  ]);

  try {
    await document.fonts.load(`18px ${FONT_FAMILY}`);
  } catch {
    /* fall back to monospace */
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: COLORS.bg,
    scale: { mode: Phaser.Scale.RESIZE },
    input: { activePointers: 3 }, // two fingers for pinch-zoom
    scene: [new CrewLabScene(looks)],
  });
}

void boot();
