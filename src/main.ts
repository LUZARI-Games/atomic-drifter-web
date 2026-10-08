import './ui/style.css';
import { createGame } from './core/game';
import type { ShipDef } from './core/ship';
import shipData from './data/ship.json';
import { createRenderer } from './render/createRenderer';
import { mountHud } from './ui/hud';

async function boot(): Promise<void> {
  // Canvas text needs the web font loaded before Phaser draws it.
  await document.fonts.load('24px "Share Tech Mono"').catch(() => undefined);

  const game = createGame(shipData satisfies ShipDef);
  mountHud(game);

  const parent = document.getElementById('game');
  if (!parent) throw new Error('#game container missing');
  createRenderer(parent, game);
}

void boot();
