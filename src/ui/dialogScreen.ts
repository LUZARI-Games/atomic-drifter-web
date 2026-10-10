// Conversations in the Fallout 3 style (core/dialog.ts, src/data/dialogs.json): the other side's portrait, name and
// line at the top of a terminal panel, the player's numbered answers below. Tap the line = show it at once; tap an
// answer (or press 1–9); [ SKIP ] ends it (the events still happen). The game shows through above the panel.
import { answer, eventsAhead, fillText, type Dialog } from '../core/dialog';
import { TermSfx } from './termSfx';

const CHAR_MS = 18;

export interface DialogOptions {
  vars: Record<string, string>;
  portrait: string | null; // image URL of the speaker
  onEvent: (event: string) => void;
  onClose: () => void;
}

export function mountDialog(root: HTMLElement, d: Dialog, o: DialogOptions): void {
  const sfx = new TermSfx();
  const el = document.createElement('div');
  el.className = 'dlg';
  el.innerHTML = `
    <div class="dlg-col">
    <button class="dlg-skip" type="button">[ SKIP ]</button>
    <section class="dlg-panel" role="dialog" aria-label="${d.speaker.name}">
      <header class="dlg-who">
        <div class="dlg-face${d.speaker.silhouette ? ' silhouette' : ''}">${o.portrait ? `<img src="${o.portrait}" alt="" draggable="false">` : ''}</div>
        <div><h2>${d.speaker.name}</h2><p class="dlg-title"><span class="dlg-dot"></span>${d.speaker.title}</p></div>
      </header>
      <p class="dlg-line"></p>
      <ol class="dlg-options"></ol>
    </section>
    </div>`;
  root.appendChild(el);
  const line = el.querySelector<HTMLElement>('.dlg-line')!;
  const list = el.querySelector<HTMLOListElement>('.dlg-options')!;
  let node: string | null = d.start;
  let full = '';
  let timer = 0;
  let typing = false;
  let closed = false;
  const fired = new Set<string>();
  const fire = (ev: string) => {
    if (fired.has(ev)) return;
    fired.add(ev);
    o.onEvent(ev);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    window.clearInterval(timer);
    document.removeEventListener('keydown', onKey);
    el.classList.add('closing');
    window.setTimeout(() => {
      el.remove();
      o.onClose();
    }, 260);
  };
  const showOptions = () => {
    typing = false;
    window.clearInterval(timer);
    line.textContent = full;
    line.classList.remove('typing');
    list.innerHTML = '';
    d.nodes[node!]!.options.forEach((opt, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dlg-opt';
      b.innerHTML = `<span class="n">${i + 1}.</span> ${fillText(opt.text, o.vars)}`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        pick(i);
      });
      li.appendChild(b);
      list.appendChild(li);
    });
    list.classList.add('shown');
  };
  const show = (id: string) => {
    node = id;
    const n = d.nodes[id]!;
    if (n.event) fire(n.event);
    full = fillText(n.text, o.vars);
    list.classList.remove('shown');
    list.innerHTML = '';
    line.classList.add('typing');
    typing = true;
    const t0 = performance.now();
    window.clearInterval(timer);
    timer = window.setInterval(() => {
      const k = Math.floor((performance.now() - t0) / CHAR_MS);
      if (k >= full.length) return showOptions();
      line.textContent = full.slice(0, k);
    }, 30);
  };
  const pick = (i: number) => {
    if (!node || typing) return;
    const opts = d.nodes[node]!.options;
    if (!opts[i]) return;
    void sfx.unlock().then(() => sfx.play('click'));
    const next = answer(d, node, i);
    if (next) show(next);
    else close();
  };
  const onKey = (e: KeyboardEvent) => {
    const n = Number(e.key);
    if (n >= 1 && n <= 9) pick(n - 1);
    else if (e.key === ' ' || e.key === 'Enter') {
      if (typing) showOptions();
    } else if (e.key === 'Escape') skip();
  };
  const skip = () => {
    // the rest of the conversation is skipped, not its consequences
    for (const ev of eventsAhead(d, node)) fire(ev);
    close();
  };
  el.querySelector('.dlg-panel')!.addEventListener('pointerdown', () => {
    void sfx.unlock();
    if (typing) showOptions();
  });
  el.querySelector('.dlg-skip')!.addEventListener('click', (e) => {
    e.stopPropagation();
    void sfx.unlock().then(() => sfx.play('click'));
    skip();
  });
  document.addEventListener('keydown', onKey);
  window.setTimeout(() => show(d.start), 450);
}
