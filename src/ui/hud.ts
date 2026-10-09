// HTML overlay: top bar + info line. Reads core state, never changes it directly.
import { getSelectedRoom } from '../core/selection';
import type { Store } from '../core/store';
import type { ShipState } from '../core/types';

export function mountHud(root: HTMLElement, store: Store<ShipState>): void {
  root.innerHTML = `
    <header class="topbar">
      <span class="title">ATOMIC DRIFTER // PROTOTYPE</span>
      <button class="btn" type="button" data-action="fullscreen">[ FULLSCREEN ]</button>
    </header>
    <footer class="infoline"><span class="prompt">&gt;</span> <span data-ref="info"></span><span class="cursor">_</span></footer>
    <div class="rotate-hint">ROTATE DEVICE TO LANDSCAPE</div>
  `;

  const info = root.querySelector<HTMLElement>('[data-ref="info"]')!;
  const render = (s: ShipState) => {
    const room = getSelectedRoom(s);
    info.textContent = room
      ? `ROOM SELECTED: ${room.name.toUpperCase()} // SYSTEM: ${room.system.toUpperCase()}`
      : 'TAP A ROOM TO SELECT IT';
  };
  store.subscribe(render);
  render(store.get());

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
