// Crew Lab test page (/crew-lab/): every origin x build, close-up + walking at in-game size.
import Phaser from 'phaser';
import { CREW_LOOKS, loopPose, parseCrewLook, turnTowards, type CrewLook } from './core/crew';
import type { Point } from './core/types';
import LAB from './data/crew_lab.json';
import { drawCrew } from './render/crew';
import { COLORS, FONT_FAMILY, FONT_SIZES, WORLD } from './render/palette';
import { attachPanZoom } from './render/panzoom';
import { mountMenu, toggleFullscreen } from './ui/menu';
import './ui/styles.css';

const PX_PER_M = 36; // roughly the in-game zoom on a phone
const TILE = 2 * PX_PER_M; // planner tiles are 2 m
const WALK_SPEED = 1.4; // m/s
const TURN_SPEED = 9; // rad/s
const CELL_W = 310;
const CELL_H = 255;
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
    // phone upright: 2 columns, sideways: 4 – the view starts at full width and scrolls down
    const cols = isPortrait() ? 2 : 4;
    const looks = this.looks();
    looks.forEach((l, i) => {
      const x = (i % cols) * CELL_W;
      const y = Math.floor(i / cols) * (CELL_H + GAP);
      this.cells.push({ x, y });
      this.facing.push(0);
      this.add.text(x + 8, y, l.name, { fontFamily: FONT_FAMILY, fontSize: FONT_SIZES.small, color: '#1aff80', resolution: 4 });
      const o = CREW_LOOKS.origins[l.origin];
      this.add.text(x + 8, y + 20, o.hostile ? 'HOSTILE' : 'FRIENDLY', {
        fontFamily: FONT_FAMILY, fontSize: FONT_SIZES.small, color: o.hostile ? '#ffb43a' : '#0d6b3a', resolution: 4,
      });
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

      // in-game size: walk a loop over 2x2 deck tiles
      const dx = x + 135;
      const dy = y + 50;
      g.fillStyle(WORLD.floor, 1);
      g.fillRect(dx, dy, TILE * 2, TILE * 2);
      g.lineStyle(1, WORLD.floorSeam, 1);
      for (let k = 0; k < 2; k++) for (let m = 0; m < 2; m++) g.strokeRect(dx + k * TILE + 3, dy + m * TILE + 3, TILE - 6, TILE - 6);
      const inset = 0.9;
      const path: Point[] = [[inset, inset], [4 - inset, inset], [4 - inset, 4 - inset], [inset, 4 - inset], [2, 2]];
      const pose = loopPose(path, (time / 1000) * WALK_SPEED + i * 1.3);
      this.facing[i] = turnTowards(this.facing[i]!, pose.facing, (TURN_SPEED * delta) / 1000);
      drawCrew(g, l, dx + pose.pos[0] * PX_PER_M, dy + pose.pos[1] * PX_PER_M, (size / 2) * PX_PER_M, this.facing[i]!);

      // close-up, same facing
      g.fillStyle(WORLD.floor, 1);
      g.fillRect(x + 8, y + 50, 118, 144);
      drawCrew(g, l, x + 67, y + 122, 34 * (size / CREW_LOOKS.builds.normal.size_m), this.facing[i]!);
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
