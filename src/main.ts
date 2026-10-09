import Phaser from 'phaser';
import { generateCrew } from './core/crewmove';
import { createGameState } from './core/selection';
import { Store } from './core/store';
import { COLORS, FONT_FAMILY } from './render/palette';
import { ShipScene } from './render/ShipScene';
import { HazeScene, WastelandScene } from './render/wasteland';
import { mountHud } from './ui/hud';
import { spawnShipEnemies } from './core/combat';
import { statusFromRun } from './core/run';
import { systemId } from './core/systems';
import { effectiveLevel } from './core/upgrades';
import { parseShip } from './core/ship';
import { loadRun } from './ui/runStore';
import { loadShip, TEST_SHIP_KEY } from './ui/shipSource';
import { applyTestScene, testSceneFromUrl, testShip } from './ui/testScene';
import { Sound } from './ui/sound';
import { mountStatusHud } from './ui/statusHud';
import './ui/styles.css';

async function boot(): Promise<void> {
  // ?test=<name>: a fixed test scene (src/data/test_scenes.json) instead of the saved / demo ship
  const scene = testSceneFromUrl();
  const sceneShip = scene?.ship ? parseShip(testShip(scene.ship)).ship : null;
  const loaded = sceneShip ? { ship: sceneShip, source: 'demo' as const, problems: [] } : loadShip(!scene); // scenes use the demo ship
  // the planner export carries no crew yet -> random crew from the Crew Lab types
  // ship status (hull, shields, scrap …) comes from the saved run (New Run / Ship Upgrades / Salvage)
  const run = loadRun();
  // the captain carries the name entered in New Run
  const crew = generateCrew(loaded.ship).map((c) => (c.captain && run.captainName ? { ...c, name: run.captainName, look: { ...c.look, name: run.captainName } } : c));
  // system health bars = their power level in this run (Ship Upgrades)
  const systemBarsByRoom = Object.fromEntries(loaded.ship.rooms.filter((r) => r.system).map((r) => [r.id, effectiveLevel(run, systemId(r.system))]));
  let start = { ...createGameState(loaded.ship), crew, status: statusFromRun(run), systemBars: systemBarsByRoom };
  start = spawnShipEnemies(start); // enemy boarders placed in the planner (ENEMY CREW)
  if (scene) start = applyTestScene(start, scene);
  const store = new Store(start);
  const sound = new Sound();

  mountStatusHud(document.getElementById('hud')!, store);
  mountHud(document.getElementById('hud')!, store, {
    source: loaded.source,
    extraItems: sound.menuItems(),
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

  const shipScene = new ShipScene(store, sound, scene?.focus ? { at: scene.focus, zoom: scene.zoom ?? 1 } : undefined);
  // debug hook for automated checks: window.adw.screenOf([x, z]) = where to tap for a ship point
  (window as unknown as { adw: unknown }).adw = { store, scene: shipScene };
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: COLORS.bg,
    scale: { mode: Phaser.Scale.RESIZE },
    input: { activePointers: 3 }, // two fingers for pinch-zoom
    // bottom to top: fog sea + towers + cloud decks (parallax) -> the airship -> cloud shadows + wind over it
    scene: [
      new WastelandScene(() => (shipScene.ready ? shipScene : null)),
      shipScene,
      new HazeScene(() => (shipScene.ready ? shipScene : null)),
    ],
  });
}

void boot();
