// HTML overlay: top bar, info line, fullscreen button. Reads core state only.

import type { Game } from '../core/game';
import { findRoom } from '../core/ship';

export function mountHud(game: Game): void {
  const info = document.getElementById('info');
  const fsButton = document.getElementById('fullscreen');

  if (info) {
    game.subscribe((state) => {
      const room = findRoom(state.ship, state.selection.selectedRoomId);
      info.textContent = room ? `> ROOM: ${room.name.toUpperCase()}` : '> NO ROOM SELECTED';
    });
  }

  fsButton?.addEventListener('click', () => void toggleFullscreen());
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    // Not supported everywhere (e.g. iOS); landscape lock is best-effort.
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    await orientation.lock?.('landscape').catch(() => undefined);
  } catch {
    // Fullscreen denied or unsupported – the game still works windowed.
  }
}
