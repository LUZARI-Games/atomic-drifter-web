// Title screen (main menu) over the flying ship: 1950s poster logo + terminal-style buttons.
// NEW GAME -> New Run, CONTINUE (only with a saved run) -> the game, OPTIONS (sound, volume, greyscale, fullscreen),
// DEV TOOLS (planner, labs, database, sound list, test scenes), WISHLIST ON STEAM.
import INFO from '../data/game_info.json';
import SCENES from '../data/test_scenes.json';
import { greyscaleItem, toggleFullscreen, type MenuItem } from './menu';

export const PLAY_URL = '/?play';

const DEV_LINKS: [string, string][] = [
  ['PLAY CURRENT SHIP (SANDBOX)', PLAY_URL],
  ['SHIP PLANNER', '/planner/'],
  ['CREW DATABASE', '/crew-db/'],
  ['SHIP LAB', '/ship-lab/'],
  ['CREW LAB', '/crew-lab/'],
  ['SOUND LIST', '/sounds/'],
  ['SHIP UPGRADES', '/upgrades/'],
  ['SALVAGE (TEST)', '/salvage/'],
];

const ATOM = `<svg class="ts-atom" viewBox="-100 -100 200 200" aria-hidden="true">
  <g fill="none" stroke-width="3">
    <ellipse rx="92" ry="30"/><ellipse rx="92" ry="30" transform="rotate(60)"/><ellipse rx="92" ry="30" transform="rotate(120)"/>
  </g><circle r="13" class="ts-core"/></svg>`;

export function mountTitleScreen(root: HTMLElement, opts: { hasRun: boolean; optionItems: MenuItem[] }): void {
  const el = document.createElement('div');
  el.className = 'title-screen';
  const words = INFO.title.split(' ');
  el.innerHTML = `
    <header class="ts-logo">
      ${ATOM}
      <h1>${words.map((w, i) => `<span class="ts-w${i}">${w}</span>`).join('')}</h1>
      <p class="ts-tag">${INFO.tagline}</p>
    </header>
    <nav class="ts-menu" data-ref="main">
      <a class="ts-btn primary" href="/new-run/">NEW GAME</a>
      ${opts.hasRun ? `<a class="ts-btn" href="${PLAY_URL}">CONTINUE</a>` : ''}
      <button class="ts-btn" type="button" data-open="options">OPTIONS</button>
      <button class="ts-btn" type="button" data-open="dev">DEV TOOLS</button>
      <button class="ts-btn steam" type="button" data-ref="steam">WISHLIST ON STEAM</button>
    </nav>
    <section class="ts-panel" data-panel="options" hidden>
      <h2>OPTIONS</h2><div class="ts-list" data-ref="opts"></div>
      <button class="ts-btn" type="button" data-close>BACK</button>
    </section>
    <section class="ts-panel" data-panel="dev" hidden>
      <h2>DEV TOOLS</h2>
      <div class="ts-list">${DEV_LINKS.map(([l, h]) => `<a class="ts-btn small" href="${h}">${l}</a>`).join('')}</div>
      <h3>TEST SCENES</h3>
      <div class="ts-scenes">${Object.keys(SCENES).filter((k) => !k.startsWith('_')).map((k) => `<a class="ts-btn small" href="/?test=${k}">${k.toUpperCase()}</a>`).join('')}</div>
      <button class="ts-btn" type="button" data-close>BACK</button>
    </section>
    <p class="ts-note" data-ref="note"></p>`;
  root.appendChild(el);
  const $ = (r: string) => el.querySelector(`[data-ref="${r}"]`) as HTMLElement;
  const show = (panel: string | null) => {
    $('main').hidden = panel !== null;
    el.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== panel));
  };
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const open = t.closest('[data-open]') as HTMLElement | null;
    if (open) show(open.dataset.open!);
    if (t.closest('[data-close]')) show(null);
  });

  // options: the same switches as the in-game menu (a returned string is the new label)
  const items: MenuItem[] = [...opts.optionItems, greyscaleItem()];
  if (document.fullscreenEnabled) items.push({ label: 'FULLSCREEN', onClick: () => void toggleFullscreen() });
  const list = $('opts');
  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ts-btn small';
    b.textContent = it.label;
    b.addEventListener('click', () => {
      const r = it.onClick?.();
      if (typeof r === 'string') b.textContent = r;
    });
    list.appendChild(b);
  }

  $('steam').addEventListener('click', () => {
    if (INFO.steam_url) window.open(INFO.steam_url, '_blank', 'noopener');
    else $('note').textContent = 'STEAM PAGE COMING SOON';
  });
}
