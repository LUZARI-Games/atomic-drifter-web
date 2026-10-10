// Sound switch + volume, shared by the game, the terminal pages and the /sounds/ page (remembered per browser).
export const SOUND_ON_KEY = 'adw.sound';
export const SOUND_VOL_KEY = 'adw.volume';

export function loadSoundPrefs(): { on: boolean; volume: number } {
  try {
    return { on: localStorage.getItem(SOUND_ON_KEY) !== '0', volume: Number(localStorage.getItem(SOUND_VOL_KEY) ?? 0.5) || 0.5 };
  } catch {
    return { on: true, volume: 0.5 };
  }
}
