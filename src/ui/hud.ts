// HTML overlay for the start page: floating menu + a small info chip. Reads core state, never changes it directly.
import { getSelectedRoom } from '../core/selection';
import type { Store } from '../core/store';
import type { GameState } from '../core/types';
import { mountMenu, toggleFullscreen, type MenuItem } from './menu';

export interface HudOptions {
  source: 'planner' | 'demo';
  problems: string[];
  onUseDemo: () => void;
}

export function mountHud(root: HTMLElement, store: Store<GameState>, opts: HudOptions): void {
  const items: MenuItem[] = [
    { label: 'CREW LAB', href: '/crew-lab/' },
    { label: 'PLANNER', href: '/planner/' },
  ];
  if (opts.source === 'planner') items.push({ label: 'DEMO SHIP', onClick: opts.onUseDemo });
  if (document.fullscreenEnabled) items.push({ label: 'FULLSCREEN', onClick: () => void toggleFullscreen() });
  mountMenu(root, store.get().ship.name.toUpperCase(), items);

  // Info chip: only visible while there is something to say (selected room or a load problem).
  const chip = document.createElement('div');
  chip.className = 'chip';
  root.appendChild(chip);
  const problem = opts.problems.length ? `SHIP NOT LOADED: ${opts.problems.join(' · ')} // SHOWING DEMO SHIP` : '';

  const render = (s: GameState) => {
    const room = getSelectedRoom(s);
    chip.classList.toggle('warn', !room && !!problem);
    chip.textContent = room
      ? `ROOM: ${(room.label || room.id).toUpperCase()}${room.system ? ` // SYSTEM: ${room.system.toUpperCase()}` : ''}`
      : problem;
  };
  store.subscribe(render);
  render(store.get());
}
