import Phaser from 'phaser';
import { createGameState } from './core/selection';
import { parseShip } from './core/ship';
import { Store } from './core/store';
import type { Ship } from './core/types';
import demoShip from './data/demo_ship.json';
import { COLORS, FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH } from './render/palette';
import { ShipScene } from './render/ShipScene';
import { mountHud } from './ui/hud';
import './ui/styles.css';

/** Key the planner's TEST IN GAME button writes the exported ship to (see public/planner/bridge.js). */
export const TEST_SHIP_KEY = 'adw.testShip';

function loadShip(): { ship: Ship; source: 'planner' | 'demo'; problems: string[] } {
  const demo = parseShip(demoShip).ship!;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(TEST_SHIP_KEY);
  } catch {
    /* storage blocked – use the demo ship */
  }
  if (!raw) return { ship: demo, source: 'demo', problems: [] };
  try {
    const { ship, problems } = parseShip(JSON.parse(raw));
    return ship ? { ship, source: 'planner', problems } : { ship: demo, source: 'demo', problems };
  } catch {
    return { ship: demo, source: 'demo', problems: ['SAVED SHIP IS DAMAGED'] };
  }
}

async function boot(): Promise<void> {
  const loaded = loadShip();
  const store = new Store(createGameState(loaded.ship));

  mountHud(document.getElementById('hud')!, store, {
    source: loaded.source,
    problems: loaded.problems,
    onUseDemo: () => {
      try {
        localStorage.removeItem(TEST_SHIP_KEY);
      } catch {
        /* ignore */
      }
      location.href = location.pathname;
    },
  });

  // Make sure the web font is ready before Phaser draws text with it.
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
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: { activePointers: 2 },
    scene: [new ShipScene(store)],
  });
}

void boot();
