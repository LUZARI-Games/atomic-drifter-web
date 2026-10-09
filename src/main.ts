import Phaser from 'phaser';
import { createShipState } from './core/selection';
import { Store } from './core/store';
import type { ShipLayout } from './core/types';
import layout from './data/ship_layout.json';
import { COLORS, FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH } from './render/palette';
import { ShipScene } from './render/ShipScene';
import { mountHud } from './ui/hud';
import './ui/styles.css';

async function boot(): Promise<void> {
  const store = new Store(createShipState(layout as ShipLayout));

  mountHud(document.getElementById('hud')!, store);

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
