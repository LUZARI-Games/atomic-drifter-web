// Crew Lab test page (/crew-lab/): every origin x build, close-up + walking at in-game size.
import Phaser from 'phaser';
import { CREW_LOOKS, loopPose, parseCrewLook, turnTowards, type CrewLook } from './core/crew';
import type { Point } from './core/types';
import LAB from './data/crew_lab.json';
import { drawCrew } from './render/crew';
import { COLORS, FONT_FAMILY, FONT_SIZES, GAME_HEIGHT, GAME_WIDTH, WORLD } from './render/palette';
import './ui/styles.css';

const PX_PER_M = 36; // roughly the in-game zoom on a phone
const TILE = 2 * PX_PER_M; // planner tiles are 2 m
const WALK_SPEED = 1.4; // m/s
const TURN_SPEED = 9; // rad/s

class CrewLabScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private facing: number[] = [];
  private cells: { x: number; y: number }[] = [];

  constructor(private looks: () => CrewLook[]) {
    super('crew-lab');
  }

  create(): void {
    this.gfx = this.add.graphics();
    const cols = 4;
    const cw = (GAME_WIDTH - 40) / cols;
    const ch = 255;
    this.looks().forEach((l, i) => {
      const x = 20 + (i % cols) * cw;
      const y = 85 + Math.floor(i / cols) * (ch + 15);
      this.cells.push({ x, y });
      this.facing.push(0);
      this.add.text(x + 8, y, l.name, { fontFamily: FONT_FAMILY, fontSize: FONT_SIZES.small, color: '#1aff80' });
      const o = CREW_LOOKS.origins[l.origin];
      this.add.text(x + 8, y + 20, o.hostile ? 'HOSTILE' : 'FRIENDLY', {
        fontFamily: FONT_FAMILY, fontSize: FONT_SIZES.small, color: o.hostile ? '#ffb43a' : '#0d6b3a',
      });
    });
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

  const hud = document.getElementById('hud')!;
  hud.innerHTML = `
    <header class="topbar">
      <span class="title"><span class="brand">ATOMIC DRIFTER // </span>CREW LAB</span>
      <nav class="actions">
        <button class="btn" type="button" data-action="swap">[ SWAP M/F ]</button>
        <a class="btn" href="/">[ GAME ]</a>
      </nav>
    </header>
    <footer class="infoline"><span class="prompt">&gt;</span> LEFT: CLOSE-UP // RIGHT: IN-GAME SIZE, WALKING<span class="cursor">_</span></footer>
    <div class="rotate-hint">ROTATE DEVICE TO LANDSCAPE</div>`;
  hud.querySelector('[data-action="swap"]')!.addEventListener('click', () => (swapped = !swapped));

  try {
    await document.fonts.load(`18px ${FONT_FAMILY}`);
  } catch {
    /* fall back to monospace */
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: COLORS.bg,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [new CrewLabScene(looks)],
  });
}

void boot();
