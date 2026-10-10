// New Run hangar (the "game side" next to the New Run terminal): the selected ship flying (Phaser, same scenes as the
// game in title-screen drift mode), ◀ ▶ to flip ships, top-left HUD (crew + hull …) and a bottom-left systems /
// reactor placeholder. Locked ships are shown dark with LOCKED and "???".
import Phaser from 'phaser';
import { rosterFrom, SEED_DB } from '../core/crewdb';
import { generateCrew, placedCrew } from '../core/crewmove';
import { flip, hangarShips, indexOfChoice, type HangarShip } from '../core/hangar';
import { defaultRun, statusFromRun } from '../core/run';
import { createGameState } from '../core/selection';
import { Store } from '../core/store';
import { systemId } from '../core/systems';
import type { GameState } from '../core/types';
import { effectiveReactor, levelOrNull } from '../core/upgrades';
import SYSTEMS from '../data/systems.json';
import { COLORS } from '../render/palette';
import { ShipScene } from '../render/ShipScene';
import { HazeScene, WastelandScene } from '../render/wasteland';
import { TEST_SHIP_KEY } from './shipSource';
import { START_CREW, START_FACTION } from '../core/story';
import { mountStatusHud } from './statusHud';

export const SHIP_CHOICE_KEY = 'adw.shipChoice';

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

export interface Hangar {
  /** The ship shown right now is locked (START must be refused). */
  locked(): boolean;
  /** Remember the shown (unlocked) ship as the run's ship. */
  commit(): void;
  /** Shake the name plate (START refused on a locked ship). */
  deny(): void;
}

/** Ships saved on the server (planner SAVE TO SERVER); [] when the server is not reachable. */
async function serverShips(): Promise<{ id: string; raw: unknown }[]> {
  try {
    const list = (await (await fetch('/api/ships', { cache: 'no-store' })).json()) as { id: string }[];
    const files = await Promise.all(list.slice(0, 20).map(async (m) => ({ id: m.id, raw: (await (await fetch(`/api/ships/${m.id}`)).json()) as unknown })));
    return files;
  } catch {
    return [];
  }
}

export function mountHangar(root: HTMLElement): Hangar {
  let plannerRaw: unknown = null;
  try {
    plannerRaw = JSON.parse(read(TEST_SHIP_KEY) ?? 'null');
  } catch {
    plannerRaw = null;
  }
  let ships = hangarShips(plannerRaw);
  let index = indexOfChoice(ships, read(SHIP_CHOICE_KEY));
  const roster = rosterFrom(SEED_DB);
  const run = defaultRun();

  root.innerHTML = `
    <div class="hg-game" data-ref="game"></div>
    <div class="hg-hud" data-ref="hud"></div>
    <div class="hg-plate" data-ref="plate">
      <button type="button" class="hg-arrow" data-step="-1" aria-label="PREVIOUS SHIP">◀</button>
      <div class="hg-name"><span data-ref="name"></span><small data-ref="sub"></small></div>
      <button type="button" class="hg-arrow" data-step="1" aria-label="NEXT SHIP">▶</button>
    </div>
    <div class="hg-lock" data-ref="lock">LOCKED</div>
    <div class="hg-sys" data-ref="sys"></div>`;
  const $ = (r: string) => root.querySelector(`[data-ref="${r}"]`) as HTMLElement;
  let game: Phaser.Game | null = null;

  const show = () => {
    const h: HangarShip = ships[index]!;
    $('name').textContent = h.name;
    $('sub').textContent = h.locked ? 'LOCKED // UNLOCK CONDITION ???' : `${index + 1} / ${ships.length}`;
    root.classList.toggle('locked', h.locked);
    // crew: the ones placed in the planner, else random from the crew database (none for locked ships)
    const placed = placedCrew(h.ship, roster);
    const crew = h.locked ? [] : placed.length ? placed : generateCrew(h.ship, START_CREW, undefined, roster, START_FACTION);
    const state: GameState = { ...createGameState(h.ship), crew, status: statusFromRun(run), roster };
    const store = new Store(state);
    $('hud').innerHTML = '';
    if (!h.locked) mountStatusHud($('hud'), store);
    renderSystems(h);
    game?.destroy(true);
    $('game').innerHTML = '';
    const scene = new ShipScene(store, undefined, undefined, true);
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: $('game'),
      backgroundColor: COLORS.bg,
      scale: { mode: Phaser.Scale.RESIZE },
      scene: [new WastelandScene(() => (scene.ready ? scene : null)), scene, new HazeScene(() => (scene.ready ? scene : null))],
    });
  };

  // bottom left: systems with their power bars + reactor (placeholder – read-only for now)
  const renderSystems = (h: HangarShip) => {
    if (h.locked) {
      $('sys').innerHTML = '<div class="hg-sys-hd">SYSTEMS // ???</div>';
      return;
    }
    const seen = new Set<string>();
    const rows = h.ship.rooms
      .filter((r) => r.system)
      .map((r) => systemId(r.system))
      .filter((id) => !seen.has(id) && !!seen.add(id))
      .map((id) => {
        const lvl = levelOrNull(run, id) ?? 1;
        const info = (SYSTEMS as Record<string, { name: string; color: string }>)[id];
        return `<div class="hg-col" title="${info?.name ?? id.toUpperCase()}">
          <div class="hg-bars">${'<i></i>'.repeat(lvl)}</div>
          <span class="hg-ico" style="background:${info?.color ?? '#888'}"></span>
          <span class="hg-lbl">${(info?.name ?? id).slice(0, 3).toUpperCase()}</span>
        </div>`;
      })
      .join('');
    const reactor = effectiveReactor(run);
    $('sys').innerHTML = `<div class="hg-sys-hd">SYSTEMS // REACTOR ${reactor}</div>
      <div class="hg-sys-row"><div class="hg-col reactor"><div class="hg-bars">${'<i></i>'.repeat(Math.min(reactor, 12))}</div><span class="hg-lbl">PWR</span></div>${rows}</div>`;
  };

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-step]') as HTMLElement | null;
    if (!b) return;
    index = flip(ships.length, index, Number(b.dataset.step));
    show();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (e.target instanceof HTMLInputElement) return;
      index = flip(ships.length, index, e.key === 'ArrowLeft' ? -1 : 1);
      show();
    }
  });
  show();
  // ships saved on the server appear once they are loaded (the shown ship stays)
  void serverShips().then((server) => {
    if (!server.length) return;
    const current = ships[index]!.id;
    ships = hangarShips(plannerRaw, server);
    index = Math.max(0, ships.findIndex((s) => s.id === current));
    show();
  });

  return {
    locked: () => ships[index]!.locked,
    commit: () => {
      const h = ships[index]!;
      if (h.locked) return;
      try {
        // a server ship is handed to the game like a planner TEST IN GAME ship
        if (h.raw) localStorage.setItem(TEST_SHIP_KEY, JSON.stringify(h.raw));
        localStorage.setItem(SHIP_CHOICE_KEY, h.raw ? 'planner' : h.id);
      } catch {
        /* not remembered */
      }
    },
    deny: () => {
      const plate = $('plate');
      plate.classList.remove('deny');
      void plate.offsetWidth;
      plate.classList.add('deny');
    },
  };
}
