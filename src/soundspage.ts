// /sounds/ – every sound in the prototype with its id, when it plays and a ▶ button. The owner replaces a placeholder
// by putting public/sfx/<id>.ogg|mp3|wav into the repo (YOUR FILE shows which ones are already replaced).
import SOUNDS from './data/sounds.json';
import { SalvageSfx } from './ui/salvageSfx';
import { customFile, filesReady, playFile } from './ui/sfxFiles';
import { Sound } from './ui/sound';
import { TermSfx, type TermSound } from './ui/termSfx';
import './ui/crewdb.css';

const game = new Sound(false);
const term = new TermSfx();
const salvage = new SalvageSfx();
const SALVAGE_ARGS: Record<string, [number, number]> = { coin: [3, 0], shell: [2, 0], stripe: [2, 3], plimp: [3, 3], fanfare: [3, 0], charge: [4, 1.5], burst: [4, 0] };

function play(id: string, synth: string): void {
  if (synth === 'game') return game.play(id);
  if (playFile(id)) return;
  if (synth === 'term') return term.play(id.replace(/^term_/, '') as TermSound, 3, 1);
  const name = id.replace(/^salvage_/, '');
  const [a, b] = SALVAGE_ARGS[name] ?? [0, 0];
  void salvage.unlock().then(() => salvage.play(name, a, b));
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const app = document.getElementById('app')!;
function render(): void {
  const total = SOUNDS.groups.reduce((n, g) => n + g.sounds.length, 0);
  const own = SOUNDS.groups.reduce((n, g) => n + g.sounds.filter((s) => customFile(s.id)).length, 0);
  app.innerHTML = `
    <div class="wrap">
      <div class="top"><h1>SOUND LIST</h1><a class="btn" href="/">MAIN MENU</a></div>
      <p class="sub">${total} sounds · ${own} replaced by your own files. Tap ▶ to hear the current one.</p>
      <p class="note">To replace one: make a file named after its id (e.g. <b>boarder_alarm.ogg</b>, also .mp3 / .wav), send it to Claude, it goes into <b>public/sfx/</b>. Loops (engine_hum, hover_hum) should loop seamlessly.</p>
      ${SOUNDS.groups.map((g) => `
        <h2 class="grp">${esc(g.name.toUpperCase())}</h2>
        <div class="list">${g.sounds.map((s) => `
          <div class="facrow snd">
            <button class="btn play" type="button" data-id="${esc(s.id)}" data-synth="${esc(s.synth)}" aria-label="Play ${esc(s.id)}">▶</button>
            <span class="facinfo"><span class="name">${esc(s.id)}</span><span class="sub">${esc(s.when)}</span></span>
            <span class="count">${customFile(s.id) ? '<b class="own">YOUR FILE</b>' : 'PLACEHOLDER'}</span>
          </div>`).join('')}</div>`).join('')}
    </div>`;
}
app.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-id]') as HTMLElement | null;
  if (b) play(b.dataset.id!, b.dataset.synth!);
});
render();
void filesReady.then(render);
