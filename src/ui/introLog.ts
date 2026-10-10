// Intro log at the start of a run (core/story.ts, src/data/story.json): a terminal transmission over the ship, typed
// out line by line. Tap the log = show it all at once; the button closes it (the game waits behind it).
import { PAUSE_NAME, type Intro } from '../core/story';
import { TermSfx } from './termSfx';

const START_MS = 500;
const CHAR_MS = 14;
const LINE_PAUSE_MS = 300;

export function mountIntroLog(root: HTMLElement, intro: Intro, onClose: () => void): void {
  const sfx = new TermSfx();
  const el = document.createElement('div');
  el.className = 'intro-log';
  el.innerHTML = `
    <section class="il-panel" role="dialog" aria-label="${intro.title}">
      <p class="il-tag">INCOMING TRANSMISSION<span class="il-dot"></span></p>
      <h2>${intro.title}</h2>
      <div class="il-text">${intro.lines.map((_, i) => `<p class="${i === intro.lines.length - 1 ? 'last' : ''}"></p>`).join('')}</div>
      <p class="il-cargo">CARGO: ${PAUSE_NAME}</p>
      <button class="ts-btn primary il-ok" type="button" hidden>[ ${intro.button} ]</button>
    </section>`;
  root.appendChild(el);
  const rows = [...el.querySelectorAll<HTMLParagraphElement>('.il-text p')];
  const cargo = el.querySelector<HTMLElement>('.il-cargo')!;
  const ok = el.querySelector<HTMLButtonElement>('.il-ok')!;
  let line = 0;
  let timer = 0;
  const finish = () => {
    window.clearInterval(timer);
    rows.forEach((r, i) => {
      r.textContent = intro.lines[i]!;
      r.classList.remove('typing');
    });
    cargo.classList.add('shown');
    ok.hidden = false;
    line = rows.length;
  };
  // typed by elapsed time (a busy frame never slows the text down): each line, then a short pause
  const ends: number[] = [];
  let t = START_MS;
  for (const l of intro.lines) ends.push((t += l.length * CHAR_MS + LINE_PAUSE_MS));
  const t0 = performance.now();
  timer = window.setInterval(() => {
    const now = performance.now() - t0;
    while (line < rows.length && now >= ends[line]!) {
      rows[line]!.textContent = intro.lines[line]!;
      rows[line]!.classList.remove('typing');
      line++;
    }
    if (line >= rows.length) return finish();
    const begin = line === 0 ? START_MS : ends[line - 1]!;
    const row = rows[line]!;
    row.classList.add('typing');
    row.textContent = intro.lines[line]!.slice(0, Math.max(0, Math.floor((now - begin) / CHAR_MS)));
  }, 30);
  el.addEventListener('pointerdown', () => {
    void sfx.unlock();
    if (line < rows.length) {
      sfx.play('tick');
      finish();
    }
  });
  ok.addEventListener('click', (e) => {
    e.stopPropagation();
    void sfx.unlock().then(() => sfx.play('confirm'));
    el.classList.add('closing');
    window.setTimeout(() => {
      el.remove();
      onClose();
    }, 280);
  });
}
