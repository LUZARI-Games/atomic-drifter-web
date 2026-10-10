import Phaser from 'phaser';
import { generateCrew, placedCrew } from './core/crewmove';
import { createGameState } from './core/selection';
import { Store } from './core/store';
import { COLORS, FONT_FAMILY } from './render/palette';
import { ShipScene } from './render/ShipScene';
import { HazeScene, WastelandScene } from './render/wasteland';
import { mountHud } from './ui/hud';
import { spawnShipEnemies } from './core/combat';
import { statusFromRun } from './core/run';
import { systemId } from './core/systems';
import { levelOrNull } from './core/upgrades';
import { parseShip } from './core/ship';
import { rosterFrom } from './core/crewdb';
import type { GameState } from './core/types';
import { loadCrewDb } from './ui/crewDbApi';
import { hasSavedRun, loadRun, saveRun } from './ui/runStore';
import { introFor, markBriefed, needsIntro, START_FACTION, startCrewCount } from './core/story';
import { mountIntroLog } from './ui/introLog';
import { mountTitleScreen } from './ui/titleScreen';
import { SHIP_CHOICE_KEY } from './ui/hangar';
import { loadShip, TEST_SHIP_KEY } from './ui/shipSource';
import { applyTestScene, testSceneFromUrl, testShip } from './ui/testScene';
import { Sound } from './ui/sound';
import { mountStatusHud } from './ui/statusHud';
import './ui/styles.css';

async function boot(): Promise<void> {
  // ?test=<name>: a fixed test scene (src/data/test_scenes.json) instead of the saved / demo ship
  const scene = testSceneFromUrl();
  // no ?play / ?test / ?ship: the title screen (main menu) over the flying ship
  const params = new URLSearchParams(location.search);
  const title = !scene && !params.has('play') && !params.has('ship');
  const sceneShip = scene?.ship ? parseShip(testShip(scene.ship)).ship : null;
  // the hangar choice (New Run): 'demo' ignores the planner ship; a planner TEST IN GAME (?ship=test) always uses it
  let choice: string | null = null;
  try {
    choice = localStorage.getItem(SHIP_CHOICE_KEY);
  } catch {
    /* none */
  }
  const usePlanner = new URLSearchParams(location.search).has('ship') || choice !== 'demo';
  const loaded = sceneShip ? { ship: sceneShip, source: 'demo' as const, problems: [] } : loadShip(!scene && usePlanner); // scenes use the demo ship
  // the planner export carries no crew yet -> random crew from the Crew Lab types
  // ship status (hull, shields, scrap …) comes from the saved run (New Run / Ship Upgrades / Salvage)
  const run = loadRun();
  // the captain carries the name entered in New Run
  // crew + boarders come from the crew database on the website (/crew-db/); built-in copy if the server is not reachable
  const roster = rosterFrom((await loadCrewDb()).db);
  // crew placed in the planner (CREW tool) spawn where they were put; nobody placed = the run's survivors (story.json:
  // 3 Iron Mall citizens); test scenes keep 4 random database crew
  const placed = placedCrew(loaded.ship, roster);
  const crew = (placed.length ? placed : (scene ? generateCrew(loaded.ship, 4, undefined, roster) : generateCrew(loaded.ship, startCrewCount(run), undefined, roster, START_FACTION))).map((c) => (c.captain && run.captainName ? { ...c, name: run.captainName, look: { ...c.look, name: run.captainName } } : c));
  // system health bars = their power level in this run (Ship Upgrades)
  // (systems without upgrade levels, e.g. the reactor, keep the default number of bars)
  const systemBarsByRoom: Record<string, number> = {};
  for (const r of loaded.ship.rooms) {
    const level = r.system ? levelOrNull(run, systemId(r.system)) : null;
    if (level !== null) systemBarsByRoom[r.id] = level;
  }
  let start: GameState = { ...createGameState(loaded.ship), crew, status: statusFromRun(run), systemBars: systemBarsByRoom, roster };
  if (!title) start = spawnShipEnemies(start); // enemy boarders placed in the planner (ENEMY CREW)
  if (scene) start = applyTestScene(start, scene);
  const store = new Store(start);
  const sound = new Sound();

  let look: ((id: string) => void) | null = null;
  if (title) mountTitleScreen(document.getElementById('hud')!, { hasRun: hasSavedRun(), optionItems: sound.menuItems() });
  else mountStatusHud(document.getElementById('hud')!, store, { onFocus: (id) => look?.(id) });
  if (!title) mountHud(document.getElementById('hud')!, store, {
    source: loaded.source,
    extraItems: sound.menuItems(),
    problems: loaded.problems,
    onUseDemo: () => {
      try {
        localStorage.removeItem(TEST_SHIP_KEY);
      } catch {
        /* ignore */
      }
      location.href = '/?play';
    },
  });

  // Make sure the web font is ready before Phaser draws text with it.
  try {
    await document.fonts.load(`18px ${FONT_FAMILY}`);
  } catch {
    /* fall back to monospace */
  }

  const shipScene = new ShipScene(store, sound, scene?.focus ? { at: scene.focus, zoom: scene.zoom ?? 1 } : undefined, title);
  // debug hook for automated checks: window.adw.screenOf([x, z]) = where to tap for a ship point
  (window as unknown as { adw: unknown }).adw = { store, scene: shipScene };
  // a new run opens on its intro log (once per run; not in test scenes / planner tests; `?play&intro` = always);
  // the game waits behind it
  if (!title && !scene && (params.has('intro') || (!params.has('ship') && hasSavedRun() && needsIntro(run)))) {
    shipScene.held = true;
    mountIntroLog(document.getElementById('hud')!, introFor(START_FACTION), () => {
      if (hasSavedRun()) saveRun(markBriefed(loadRun()));
      shipScene.held = false;
    });
  }
  look = (id) => {
    const c = store.get().crew.find((m) => m.id === id);
    if (c) shipScene.lookAt(c.pos);
  };
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
