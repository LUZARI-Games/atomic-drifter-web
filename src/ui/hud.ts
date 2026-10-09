// HTML overlay for the start page: floating menu + a small info chip. Reads core state, never changes it directly.
import { selectedCrew } from '../core/crewmove';
import { getSelectedRoom } from '../core/selection';
import type { Store } from '../core/store';
import type { GameState } from '../core/types';
import { applyGreyscale, greyscaleItem, mountMenu, toggleFullscreen, type MenuItem } from './menu';
import { shipShareItems } from './shipShare';

export interface HudOptions {
  source: 'planner' | 'demo';
  problems: string[];
  onUseDemo: () => void;
  extraItems?: MenuItem[]; // e.g. sound settings
}

export function mountHud(root: HTMLElement, store: Store<GameState>, opts: HudOptions): void {
  const items: MenuItem[] = [
    { label: 'NEW RUN', href: '/new-run/' },
    { label: 'SHIP LAB', href: '/ship-lab/' },
    { label: 'CREW LAB', href: '/crew-lab/' },
    { label: 'PLANNER', href: '/planner/' },
  ];
  if (opts.source === 'planner') items.push({ label: 'DEMO SHIP', onClick: opts.onUseDemo });
  items.push(...shipShareItems(), ...(opts.extraItems ?? []), greyscaleItem());
  if (document.fullscreenEnabled) items.push({ label: 'FULLSCREEN', onClick: () => void toggleFullscreen() });
  applyGreyscale();
  mountMenu(root, store.get().ship.name.toUpperCase(), items);

  // Info chip: only visible while there is something to say (selected room or a load problem).
  const chip = document.createElement('div');
  chip.className = 'chip';
  root.appendChild(chip);
  const problem = opts.problems.length ? `SHIP NOT LOADED: ${opts.problems.join(' · ')} // SHOWING DEMO SHIP` : '';

  const render = (s: GameState) => {
    const member = selectedCrew(s);
    if (member) {
      chip.classList.remove('warn');
      const l = member.look;
      chip.textContent = `CREW: ${member.name} // ${l.origin.toUpperCase()} ${l.build.toUpperCase()} // ${member.path.length ? 'ON THE WAY' : 'TAP WHERE TO GO'}`;
      return;
    }
    const room = getSelectedRoom(s);
    chip.classList.toggle('warn', !room && !!problem);
    chip.textContent = room
      ? `ROOM: ${(room.label || room.id).toUpperCase()}${room.system ? ` // SYSTEM: ${room.system.toUpperCase()}` : ''}`
      : problem;
  };
  store.subscribe(render);
  render(store.get());
}
