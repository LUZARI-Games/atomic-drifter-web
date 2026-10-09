// Ship Lab test page (/ship-lab/): any ship (planner test ship or demo) from three angles – TOP-DOWN, ISO 60/45, ISO 45/45 – with half walls,
// 1 m system blocks, framed doors and a few crew for scale. Orthographic, flat 2D shapes.
import Phaser from 'phaser';
import { parseCrewLook, type CrewLook } from './core/crew';
import { makeView } from './core/projection';
import type { Point, Ship } from './core/types';
import LAB from './data/crew_lab.json';
import { COLORS, FONT_FAMILY, FONT_SIZES } from './render/palette';
import { attachPanZoom } from './render/panzoom';
import { ShipView, type CrewOnDeck } from './render/ship_view';
import { applyGreyscale, greyscaleItem, mountMenu, toggleFullscreen } from './ui/menu';
import { loadShip } from './ui/shipSource';
import './ui/styles.css';

const PX_PER_M = 40;
const PANEL_GAP = 70;
const ANGLES = [
  { title: 'TOP-DOWN (2D)', pitch: 90, yaw: 0 },
  { title: 'ISO 60/45 (DOWN 60°, TURNED 45°)', pitch: 60, yaw: 45 },
  { title: 'ISO 45/45 (DOWN 45°, TURNED 45°)', pitch: 45, yaw: 45 },
];

/** A few crew standing on free deck tiles (one per room, up to four) for scale. */
function crewOnDeck(ship: Ship): CrewOnDeck[] {
  const looks = LAB.map(parseCrewLook).filter((l): l is CrewLook => !!l);
  const seen = new Set<string>();
  const spots: Point[] = [];
  for (const t of ship.tiles) {
    if (!t.room || t.machinery || t.shape !== 'full' || seen.has(t.room)) continue;
    seen.add(t.room);
    spots.push([t.center[0] - 0.35, t.center[1] + 0.45]); // off-centre so the room label stays readable
  }
  const pick = [0, 5, 3, 6]; // raider, sentinel tank, iron mall, deserter tank
  return spots.slice(0, 4).map((at, i) => ({ look: looks[pick[i]! % looks.length]!, at, facing: [0.4, 1.9, -0.6, 2.8][i]! }));
}

class ShipLabScene extends Phaser.Scene {
  constructor(private readonly ship: Ship) {
    super('ship-lab');
  }

  create(): void {
    const crew = crewOnDeck(this.ship);
    const views = ANGLES.map((a) => ({ ...a, view: new ShipView(this.ship, makeView(a.pitch, a.yaw), PX_PER_M) }));
    const width = Math.max(...views.map((v) => v.view.bounds().width));
    let y = 0;
    for (const v of views) {
      const b = v.view.bounds();
      this.add.text(0, y, v.title, { fontFamily: FONT_FAMILY, fontSize: FONT_SIZES.medium, color: '#1aff80', resolution: 4 });
      y += 34;
      const deck = this.add.graphics();
      const objects = this.add.graphics(); // created after deck; labels added in between by draw()
      objects.setDepth(1);
      v.view.draw(this, deck, objects, (width - b.width) / 2 - b.x, y - b.y, crew);
      y += b.height + PANEL_GAP;
    }
    const bounds = new Phaser.Geom.Rectangle(0, 0, width, y - PANEL_GAP);
    attachPanZoom(this, { bounds: () => bounds, fit: 'width' });
  }
}

async function boot(): Promise<void> {
  const { ship, source } = loadShip();
  mountMenu(document.getElementById('hud')!, `SHIP LAB // ${ship.name.toUpperCase()} (${source === 'planner' ? 'FROM PLANNER' : 'DEMO'})`, [
    { label: 'GAME', href: '/' },
    { label: 'CREW LAB', href: '/crew-lab/' },
    { label: 'PLANNER', href: '/planner/' },
    greyscaleItem(),
    ...(document.fullscreenEnabled ? [{ label: 'FULLSCREEN', onClick: () => void toggleFullscreen() }] : []),
  ]);
  applyGreyscale();
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
    scene: [new ShipLabScene(ship)],
  });
}

void boot();
