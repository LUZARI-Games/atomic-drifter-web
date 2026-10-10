// /crew-db/ – the crew database page: characters, factions, portraits. Everything saves straight to the website's
// server (worker/index.ts); the game reads the same data at start. Plain DOM, phone first.
import { characterHp, cleanRecord, toId, type CharacterRecord, type Collection, type CrewDb, type FactionRecord } from './core/crewdb';
import { deleteRecord, fetchCrewDb, saveRecord, uploadPortrait } from './ui/crewDbApi';
import './ui/crewdb.css';

const app = document.getElementById('app')!;
app.innerHTML = `
  <div class="wrap">
    <div class="top">
      <h1>CREW DATABASE</h1>
      <a class="btn" href="/">BACK TO GAME</a>
    </div>
    <p class="sub">Characters, factions and portraits. Tap a card to edit. Saved on the server – the game uses it.</p>
    <div class="bar">
      <button class="btn on" data-tab="chars" type="button">CHARACTERS <span class="count" data-ref="nchars"></span></button>
      <button class="btn" data-tab="facs" type="button">FACTIONS <span class="count" data-ref="nfacs"></span></button>
      <button class="btn add" data-ref="add" type="button">+ NEW</button>
    </div>
    <section data-ref="chars">
      <div class="filters">
        <input data-ref="q" type="search" placeholder="SEARCH NAME" aria-label="Search name">
        <select data-ref="fside" aria-label="Side"><option value="">ALL SIDES</option><option value="crew">CREW</option><option value="enemy">ENEMY</option></select>
        <select data-ref="ffac" aria-label="Faction"></select>
      </div>
      <div class="grid" data-ref="grid"></div>
    </section>
    <section data-ref="facs" hidden><div class="list" data-ref="faclist"></div></section>
    <p class="note" data-ref="status">LOADING…</p>
  </div>
  <div class="sheet" data-ref="sheet" hidden><form class="box" data-ref="form" autocomplete="off"></form></div>`;

const $ = <T extends HTMLElement = HTMLElement>(r: string) => app.querySelector(`[data-ref="${r}"]`) as T;
const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
let db: CrewDb = { characters: {}, factions: {}, portraits: {} };
let tab: 'chars' | 'facs' = 'chars';
let editing = false; // don't refresh under an open sheet

const picUrl = (pid: string | null) => (pid && db.portraits[pid] ? db.portraits[pid]!.file : '');
const uniqueId = (col: Collection, name: string) => {
  let id = toId(name);
  for (let n = 2; db[col][id]; n++) id = `${toId(name)}_${n}`;
  return id;
};

async function refresh(): Promise<void> {
  const live = await fetchCrewDb(6000);
  if (!live) {
    $('status').textContent = 'SERVER NOT REACHABLE – changes cannot be saved right now. Try again in a moment.';
    return;
  }
  db = live;
  $('status').textContent = 'Every change is saved on the server at once and used by the game on its next start.';
  render();
}

function render(): void {
  const chars = Object.entries(db.characters);
  const facs = Object.entries(db.factions);
  $('nchars').textContent = `(${chars.length})`;
  $('nfacs').textContent = `(${facs.length})`;
  const ffac = $<HTMLSelectElement>('ffac');
  const keep = ffac.value;
  ffac.innerHTML = '<option value="">ALL FACTIONS</option>' + facs.map(([id, f]) => `<option value="${esc(id)}">${esc(f.name)}</option>`).join('') + '<option value="-">NO FACTION</option>';
  ffac.value = keep;
  const q = $<HTMLInputElement>('q').value.trim().toLowerCase();
  const side = $<HTMLSelectElement>('fside').value;
  const fac = ffac.value;
  const list = chars
    .filter(([, c]) => (!q || c.name.toLowerCase().includes(q)) && (!side || c.side === side) && (!fac || (fac === '-' ? !c.faction : c.faction === fac)))
    .sort(([, a], [, b]) => (a.side === b.side ? a.name.localeCompare(b.name) : a.side === 'crew' ? -1 : 1));
  $('grid').innerHTML = list.length
    ? list.map(([id, c]) => {
        const f = c.faction ? db.factions[c.faction] : undefined;
        const img = picUrl(c.portrait);
        return `<button type="button" class="card ${c.side === 'enemy' ? 'enemy' : ''}" data-id="${esc(id)}">
          ${img ? `<img class="face" src="${esc(img)}" alt="" loading="lazy">` : '<span class="face"></span>'}
          <span class="info">
            <span class="name">${esc(c.name)}</span>
            <span class="chips">
              <span class="chip ${c.side === 'enemy' ? 'foe' : ''}">${c.side === 'enemy' ? 'ENEMY' : 'CREW'}</span>
              <span class="chip" style="color:${f ? esc(f.color) : 'var(--dim)'}">${f ? esc(f.name) : 'NO FACTION'}</span>
              <span class="chip">${c.build === 'tank' ? 'TANK' : 'NORMAL'}</span>
              ${c.body !== 'human' ? `<span class="chip">${c.body === 'super_mutant' ? 'SUPER MUTANT' : 'GHOUL'}</span>` : ''}
            </span>
            <span class="stats"><span>HP <b>${characterHp(c)}</b></span><span>HIT <b>${c.hit}</b></span><span>${c.sex.toUpperCase()}</span></span>
          </span>
        </button>`;
      }).join('')
    : `<div class="empty">${chars.length ? 'No character matches the filter.' : 'No characters yet. Tap + NEW to add the first one.'}</div>`;
  $('faclist').innerHTML = facs.length
    ? facs.sort(([, a], [, b]) => a.name.localeCompare(b.name)).map(([id, f]) => `<button type="button" class="facrow" data-fac="${esc(id)}">
        <span class="swatch" style="background:${esc(f.color)}"></span>
        <span class="facinfo"><span class="name">${esc(f.name)}</span><span class="sub">${esc(f.notes)}</span></span>
        <span class="count">${chars.filter(([, c]) => c.faction === id).length}</span></button>`).join('')
    : '<div class="empty">No factions yet. Tap + NEW to add one.</div>';
}

function setTab(t: 'chars' | 'facs'): void {
  tab = t;
  $('chars').hidden = t !== 'chars';
  $('facs').hidden = t !== 'facs';
  app.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.tab === t));
  $('add').textContent = t === 'chars' ? '+ NEW CHARACTER' : '+ NEW FACTION';
}

// ---------- edit sheets ----------
const form = () => $<HTMLFormElement>('form');
const f$ = <T extends HTMLElement = HTMLInputElement>(r: string) => form().querySelector(`[data-f="${r}"]`) as T;
function openSheet(html: string): void {
  form().innerHTML = html;
  $('sheet').hidden = false;
  editing = true;
}
function closeSheet(): void {
  $('sheet').hidden = true;
  form().innerHTML = '';
  form().onsubmit = null;
  editing = false;
  void refresh();
}
const attrRow = (a: { name?: string; value?: string }) =>
  `<div class="attr"><input placeholder="E.G. PILOTING" value="${esc(a.name)}" aria-label="Attribute name"><input placeholder="VALUE" value="${esc(a.value)}" aria-label="Value"><button type="button" class="btn danger" data-rm aria-label="Remove">×</button></div>`;
const msg = (t: string) => (f$('msg').textContent = t);
const confirmTwice = (btn: HTMLElement, then: () => void) => {
  if (btn.dataset.sure !== '1') {
    btn.dataset.sure = '1';
    btn.textContent = 'TAP AGAIN TO DELETE';
    return;
  }
  then();
};

function charForm(id: string | null): void {
  const c: CharacterRecord = (id && db.characters[id]) || { name: '', side: 'crew', faction: null, build: 'normal', sex: 'male', hp: null, hit: 4, portrait: null, body: 'human', attrs: [], notes: '' };
  const pics = Object.entries(db.portraits).sort(([a], [b]) => a.localeCompare(b));
  openSheet(`
    <h2>${id ? esc(c.name) : 'NEW CHARACTER'}</h2>
    <label class="f">NAME<input data-f="name" value="${esc(c.name)}" required></label>
    <div class="row2">
      <label class="f">SIDE<select data-f="side"><option value="crew">CREW</option><option value="enemy">ENEMY</option></select></label>
      <label class="f">FACTION<select data-f="faction"><option value="">NO FACTION</option>${Object.entries(db.factions).map(([fid, f]) => `<option value="${esc(fid)}">${esc(f.name)}</option>`).join('')}</select></label>
    </div>
    <div class="row2">
      <label class="f">BUILD<select data-f="build"><option value="normal">NORMAL</option><option value="tank">TANK</option></select></label>
      <label class="f">SEX<select data-f="sex"><option value="male">MALE</option><option value="female">FEMALE</option></select></label>
    </div>
    <label class="f">BODY<select data-f="body"><option value="human">HUMAN</option><option value="super_mutant">SUPER MUTANT</option><option value="ghoul">GHOUL</option></select></label>
    <div class="row2">
      <label class="f">HP (EMPTY = DEFAULT)<input data-f="hp" type="number" min="1" inputmode="numeric" value="${esc(c.hp ?? '')}" placeholder="${characterHp({ ...c, hp: null })}"></label>
      <label class="f">DAMAGE PER HIT<input data-f="hit" type="number" min="0" inputmode="numeric" value="${esc(c.hit)}"></label>
    </div>
    <div class="f">PORTRAIT
      <div class="picker" data-f="pics">${pics.map(([pid, p]) => `<button type="button" data-pic="${esc(pid)}" class="${pid === c.portrait ? 'sel' : ''}" title="${esc(pid)}"><img src="${esc(p.file)}" alt="${esc(pid)}" loading="lazy"></button>`).join('')}</div>
      <label class="btn upload">UPLOAD NEW PORTRAIT (WEBP / PNG / JPEG, MAX 1 MB)<input data-f="upload" type="file" accept="image/webp,image/png,image/jpeg" hidden></label>
    </div>
    <div class="f">MORE ATTRIBUTES (FREE: NAME + VALUE)
      <div class="attrs" data-f="attrs">${c.attrs.map(attrRow).join('')}</div>
      <button type="button" class="btn" data-f="addattr">+ ATTRIBUTE</button>
    </div>
    <label class="f">NOTES<textarea data-f="notes" rows="3">${esc(c.notes)}</textarea></label>
    <p class="msg" data-f="msg"></p>
    <div class="acts">
      <button class="btn on grow" type="submit">SAVE</button>
      <button class="btn" type="button" data-f="close">CLOSE</button>
      ${id ? '<button class="btn danger" type="button" data-f="del">DELETE</button>' : ''}
    </div>`);
  f$<HTMLSelectElement>('side').value = c.side;
  f$<HTMLSelectElement>('faction').value = c.faction ?? '';
  f$<HTMLSelectElement>('build').value = c.build;
  f$<HTMLSelectElement>('sex').value = c.sex;
  f$<HTMLSelectElement>('body').value = c.body;
  let portrait = c.portrait;
  const choose = (pid: string) => {
    portrait = pid;
    f$('pics').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.pic === pid));
  };
  f$('pics').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-pic]') as HTMLElement | null;
    if (b) choose(b.dataset.pic!);
  });
  f$('addattr').addEventListener('click', () => f$('attrs').insertAdjacentHTML('beforeend', attrRow({})));
  f$('attrs').addEventListener('click', (e) => (e.target as HTMLElement).closest('[data-rm]')?.closest('.attr')?.remove());
  f$('upload').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    msg('UPLOADING…');
    const pid = uniqueId('portraits', file.name.replace(/\.[a-z0-9]+$/i, ''));
    try {
      await uploadPortrait(pid, file);
      db.portraits[pid] = { file: `/api/portrait-img/${pid}` };
      f$('pics').insertAdjacentHTML('beforeend', `<button type="button" data-pic="${esc(pid)}" title="${esc(pid)}"><img src="/api/portrait-img/${esc(pid)}" alt="${esc(pid)}"></button>`);
      choose(pid);
      msg('PORTRAIT UPLOADED – tap SAVE to keep it on this character.');
    } catch (err) {
      msg(`UPLOAD FAILED: ${(err as Error).message}`);
    }
  });
  f$('close').addEventListener('click', closeSheet);
  form().querySelector('[data-f="del"]')?.addEventListener('click', (e) =>
    confirmTwice(e.currentTarget as HTMLElement, () => void deleteRecord('characters', id!).then(closeSheet, (err) => msg(`NOT DELETED: ${(err as Error).message}`))));
  form().onsubmit = async (e) => {
    e.preventDefault();
    const attrs = [...f$('attrs').querySelectorAll('.attr')].map((r) => ({ name: (r.children[0] as HTMLInputElement).value, value: (r.children[1] as HTMLInputElement).value }));
    const rec = cleanRecord('characters', {
      name: f$('name').value, side: f$<HTMLSelectElement>('side').value, faction: f$<HTMLSelectElement>('faction').value || null,
      build: f$<HTMLSelectElement>('build').value, sex: f$<HTMLSelectElement>('sex').value, body: f$<HTMLSelectElement>('body').value, hp: f$('hp').value, hit: f$('hit').value,
      portrait, attrs, notes: f$<HTMLTextAreaElement>('notes').value,
    });
    if (!rec) return msg('NAME IS MISSING.');
    msg('SAVING…');
    try {
      await saveRecord('characters', id ?? uniqueId('characters', (rec as CharacterRecord).name), rec);
      closeSheet();
    } catch (err) {
      msg(`NOT SAVED: ${(err as Error).message}`);
    }
  };
}

function facForm(id: string | null): void {
  const f: FactionRecord = (id && db.factions[id]) || { name: '', color: '#86902a', notes: '' };
  openSheet(`
    <h2>${id ? esc(f.name) : 'NEW FACTION'}</h2>
    <label class="f">NAME<input data-f="name" value="${esc(f.name)}" required></label>
    <label class="f">COLOUR<input data-f="color" type="color" value="${esc(f.color)}"></label>
    <label class="f">DESCRIPTION<textarea data-f="notes" rows="4">${esc(f.notes)}</textarea></label>
    <p class="msg" data-f="msg"></p>
    <div class="acts">
      <button class="btn on grow" type="submit">SAVE</button>
      <button class="btn" type="button" data-f="close">CLOSE</button>
      ${id ? '<button class="btn danger" type="button" data-f="del">DELETE</button>' : ''}
    </div>`);
  f$('close').addEventListener('click', closeSheet);
  form().querySelector('[data-f="del"]')?.addEventListener('click', (e) =>
    confirmTwice(e.currentTarget as HTMLElement, () => void deleteRecord('factions', id!).then(closeSheet, (err) => msg(`NOT DELETED: ${(err as Error).message}`))));
  form().onsubmit = async (e) => {
    e.preventDefault();
    const rec = cleanRecord('factions', { name: f$('name').value, color: f$('color').value, notes: f$<HTMLTextAreaElement>('notes').value });
    if (!rec) return msg('NAME IS MISSING.');
    msg('SAVING…');
    try {
      await saveRecord('factions', id ?? uniqueId('factions', (rec as FactionRecord).name), rec);
      closeSheet();
    } catch (err) {
      msg(`NOT SAVED: ${(err as Error).message}`);
    }
  };
}

// ---------- wiring ----------
app.querySelector('.bar')!.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
  if (t) setTab(t.dataset.tab as 'chars' | 'facs');
});
$('add').addEventListener('click', () => (tab === 'chars' ? charForm(null) : facForm(null)));
$('grid').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-id]') as HTMLElement | null;
  if (b) charForm(b.dataset.id!);
});
$('faclist').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-fac]') as HTMLElement | null;
  if (b) facForm(b.dataset.fac!);
});
for (const r of ['q', 'fside', 'ffac']) $(r).addEventListener('input', render);
$('sheet').addEventListener('click', (e) => {
  if (e.target === $('sheet')) closeSheet();
});
// others may edit too: reload when coming back to the page and every 20 s (not while a sheet is open)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !editing) void refresh();
});
setInterval(() => {
  if (!document.hidden && !editing) void refresh();
}, 20000);
setTab('chars');
render();
void refresh();
