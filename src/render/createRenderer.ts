import Phaser from 'phaser';
import type { Game } from '../core/game';
import { palette } from './palette';
import { ShipScene, VIEW_HEIGHT, VIEW_WIDTH } from './ShipScene';

export function createRenderer(parent: HTMLElement, game: Game): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: palette.bg,
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: { activePointers: 2 },
    scene: [new ShipScene(game)],
  });
}
