import Phaser from 'phaser';
import { createGameState } from './core/selection';
import { Store } from './core/store';
import { COLORS, FONT_FAMILY } from './render/palette';
import { ShipScene } from './render/ShipScene';
import { HazeScene, WastelandScene } from './render/wasteland';
import { mountHud } from './ui/hud';
import { loadShip, TEST_SHIP_KEY } from './ui/shipSource';
import './ui/styles.css';

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

  const shipScene = new ShipScene(store);
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: COLORS.bg,
    scale: { mode: Phaser.Scale.RESIZE },
    input: { activePointers: 3 }, // two fingers for pinch-zoom
    // bottom to top: wasteland far below (parallax) -> the airship -> haze drifting over it
    scene: [
      new WastelandScene(loaded.ship, () => (shipScene.ready ? shipScene : null)),
      shipScene,
      new HazeScene(() => (shipScene.ready ? shipScene : null)),
    ],
  });
}

void boot();
