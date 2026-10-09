import Phaser from 'phaser';
import { createGameState } from './core/selection';
import { parseShip } from './core/ship';
import { Store } from './core/store';
import type { Ship } from './core/types';
import demoShip from './data/demo_ship.json';
import { airshipHull } from './core/hull';
import { COLORS, FONT_FAMILY } from './render/palette';
import { hullAspect, ShipScene } from './render/ShipScene';
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

  // Portrait: the stage is wider than the screen so the ship fills the height; swipe sideways to scroll.
  const view = document.getElementById('game')!;
  const stage = document.getElementById('stage')!;
  const aspect = hullAspect(airshipHull(loaded.ship));
  const sizeStage = () => {
    const w = view.clientWidth;
    const h = view.clientHeight;
    const wanted = Math.round((h - 32) * aspect + 32);
    stage.style.width = h > w ? `${Math.min(Math.max(w, wanted), w * 2)}px` : '100%';
  };
  sizeStage();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: stage,
    backgroundColor: COLORS.bg,
    scale: { mode: Phaser.Scale.RESIZE },
    // touch.capture off: the browser may scroll the stage; ShipScene only reacts to taps
    input: { activePointers: 2, touch: { capture: false } },
    scene: [new ShipScene(store)],
  });

  let lastPortrait: boolean | null = null;
  const relayout = () => {
    sizeStage();
    game.scale.refresh();
    const portrait = view.clientHeight > view.clientWidth;
    if (portrait !== lastPortrait) view.scrollLeft = (stage.clientWidth - view.clientWidth) / 2; // start mid-ship
    lastPortrait = portrait;
  };
  new ResizeObserver(relayout).observe(view);
  game.events.once(Phaser.Core.Events.READY, relayout);
}

void boot();
