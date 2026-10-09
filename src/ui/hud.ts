// HTML overlay: top bar + info line. Reads core state, never changes it directly.
import { getSelectedRoom } from '../core/selection';
import type { Store } from '../core/store';
import type { GameState } from '../core/types';

export interface HudOptions {
  source: 'planner' | 'demo';
  problems: string[];
  onUseDemo: () => void;
}

const esc = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function mountHud(root: HTMLElement, store: Store<GameState>, opts: HudOptions): void {
  const shipName = esc(store.get().ship.name.toUpperCase());
  root.innerHTML = `
    <header class="topbar">
      <span class="title"><span class="brand">ATOMIC DRIFTER // </span>${shipName}</span>
      <nav class="actions">
        ${opts.source === 'planner' ? '<button class="btn" type="button" data-action="demo">[ DEMO SHIP ]</button>' : ''}
        <a class="btn" href="/planner/">[ PLANNER ]</a>
        <button class="btn" type="button" data-action="fullscreen">[ FULLSCREEN ]</button>
      </nav>
    </header>
    <footer class="infoline"><span class="prompt">&gt;</span> <span data-ref="info"></span><span class="cursor">_</span></footer>
    <div class="rotate-hint">ROTATE DEVICE TO LANDSCAPE</div>
  `;

  const info = root.querySelector<HTMLElement>('[data-ref="info"]')!;
  const idle = opts.problems.length
    ? `SHIP NOT LOADED: ${opts.problems.join(' · ')} // SHOWING DEMO SHIP`
    : opts.source === 'planner'
      ? 'SHIP FROM PLANNER LOADED // TAP A ROOM'
      : 'TAP A ROOM TO SELECT IT';
  info.classList.toggle('warn', opts.problems.length > 0);

  const render = (s: GameState) => {
    const room = getSelectedRoom(s);
    if (room) info.classList.remove('warn');
    info.textContent = room
      ? `ROOM: ${(room.label || room.id).toUpperCase()}${room.system ? ` // SYSTEM: ${room.system.toUpperCase()}` : ''}`
      : idle;
  };
  store.subscribe(render);
  render(store.get());

  root.querySelector('[data-action="demo"]')?.addEventListener('click', opts.onUseDemo);

  const fsButton = root.querySelector<HTMLButtonElement>('[data-action="fullscreen"]')!;
  if (!document.fullscreenEnabled) fsButton.hidden = true;
  fsButton.addEventListener('click', () => void toggleFullscreen());
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen();
    // Lock to landscape where supported (Android Chrome); ignored elsewhere.
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    await orientation.lock?.('landscape').catch(() => undefined);
  } catch {
    // Fullscreen not allowed – the game still works in the normal browser view.
  }
}
