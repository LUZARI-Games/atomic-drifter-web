// The owner's own sound files: public/sfx/<sound id>.ogg|mp3|wav (listed in /sfx/index.json at build time).
// Every sound in the game asks `playFile(id)` first and only synthesizes its placeholder when there is no file.
import { loadSoundPrefs } from './soundPrefs';

let files = new Map<string, string>(); // sound id -> URL
const cache = new Map<string, HTMLAudioElement>();

/** Resolves once the list of own files is known (or failed). */
export const filesReady: Promise<void> = fetch('/sfx/index.json', { cache: 'no-store' })
  .then((r) => (r.ok ? r.json() : { files: [] }))
  .then((d: { files?: string[] }) => {
    files = new Map((d.files ?? []).map((f) => [f.replace(/\.[a-z0-9]+$/, ''), `/sfx/${f}`]));
  })
  .catch(() => undefined);

/** URL of the owner's file for this sound id, or null. */
export const customFile = (id: string): string | null => files.get(id) ?? null;

/** Play the owner's file for `id` (if there is one) at the user's volume; true = played, so skip the synth. */
export function playFile(id: string, gain = 1): boolean {
  const url = files.get(id);
  if (!url) return false;
  const { on, volume } = loadSoundPrefs();
  if (!on) return true;
  let base = cache.get(id);
  if (!base) cache.set(id, (base = new Audio(url)));
  const a = base.cloneNode() as HTMLAudioElement;
  a.volume = Math.max(0, Math.min(1, volume * gain));
  void a.play().catch(() => undefined);
  return true;
}

/** A looping file (engine hum …) or null when the owner has none. */
export function loopFile(id: string): HTMLAudioElement | null {
  const url = files.get(id);
  if (!url) return null;
  const a = new Audio(url);
  a.loop = true;
  return a;
}
