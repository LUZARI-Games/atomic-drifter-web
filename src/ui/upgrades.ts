// SHIP UPGRADES screen (HTML overlay): buy system levels + reactor bars with scrap, then CONFIRM.
// Rules: src/core/upgrades.ts · data: src/data/upgrades.json · look: src/ui/upgrades.css.
// Wide screens: the 1600×900 mockup layout, scaled to fit. Phones (portrait): cards 3 per row in a scroll view,
// the details panel opens under the selected card's row, the action bar sticks to the bottom.
import type { RunState } from '../core/run';
import {
  REACTOR,
  UPGRADE_SYSTEMS,
  availableScrap,
  canQueueBar,
  confirmUpgrades,
  denyText,
  effectiveLevel,
  effectiveReactor,
  emptyPending,
  installStep,
  levelCost,
  pendingCost,
  pendingCount,
  pendingOf,
  queueBar,
  queueLevel,
  reactorBarCost,
  reactorRows,
  removeBar,
  removeLevel,
  systemRows,
  type Deny,
  type LevelRow,
  type Pending,
  type UpgradeSystem,
} from '../core/upgrades';
import { loadRun, saveRun } from './runStore';

// ---------- icons (24×24, stroke = currentColor) ----------
const ICON: Record<string, string> = {
  bolt: '<path d="M13 2 L5 14 H11 L10 22 L19 9 H13 Z"/>',
  sub: '<path d="M13 2 L5 14 H11 L10 22 L19 9 H13 Z"/><path d="M3 3 L21 21"/>',
  engine: '<path d="M4 6 L10 12 L4 18 M12 6 L18 12 L12 18"/>',
  crewteleporter:
    '<ellipse cx="12" cy="5" rx="7" ry="2"/><ellipse cx="12" cy="19" rx="7" ry="2"/><path d="M8 8 V16 M12 7.5 V16.5 M16 8 V16" stroke-dasharray="2 2"/>',
  medbay: '<rect x="4" y="4" width="16" height="16"/><path d="M12 8 V16 M8 12 H16"/>',
  weapons: '<circle cx="12" cy="12" r="7"/><path d="M12 2 V8 M12 16 V22 M2 12 H8 M16 12 H22"/>',
  shields: '<path d="M12 3 L20 6 V12 C20 16.5 16.5 19.5 12 21 C7.5 19.5 4 16.5 4 12 V6 Z"/>',
  drones:
    '<rect x="9" y="9" width="6" height="6"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 7 L9 9 M17 7 L15 9 M7 17 L9 15 M17 17 L15 15"/>',
  doors: '<rect x="6" y="3" width="12" height="18"/><path d="M12 3 V21"/>',
  cockpit: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 4 V9.5 M4.5 15 L9.8 13.2 M19.5 15 L14.2 13.2"/>',
  sensor: '<path d="M2 12 C6 6 18 6 22 12 C18 18 6 18 2 12 Z"/><circle cx="12" cy="12" r="3"/>',
  scrap:
    '<circle cx="12" cy="12" r="3.5"/><path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9"/>',
};
const icon = (name: string, size = 24, cls = 'ico') =>
  `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name] ?? ''}</svg>`;

const STEP_MS = 300;
const ERR_MS = 1300;
const PIPS = 8;

// ---------- state ----------
let run: RunState;
let pending: Pending = emptyPending();
let selected = 'shields'; // system id or 'reactor'
let deny: Deny | null = null;
let denyTimer = 0;
let installing = false;
let doneMsg = '';
let narrow = false;

// ---------- dom refs ----------
interface CardRefs {
  el: HTMLElement;
  sub: HTMLElement;
  pips: HTMLElement[];
  minus: HTMLButtonElement;
  buy: HTMLButtonElement;
  float: HTMLElement;
}
const cards = new Map<string, CardRefs>();
let root: HTMLElement;
let stage: HTMLElement;
let scroller: HTMLElement;
let reactorPanel: HTMLElement;
let detail: HTMLElement;
let bar: HTMLElement;
let rText: HTMLElement;
let rGroups: { pips: HTMLElement[]; price: HTMLElement }[] = [];
let rMinus: HTMLButtonElement;
let rBtn: HTMLButtonElement;
let rFloat: HTMLElement;
let undoBtn: HTMLButtonElement;
let confirmBtn: HTMLButtonElement;
let barMid: HTMLElement;
let errScreen: HTMLElement;

const $ = <T extends HTMLElement = HTMLElement>(parent: ParentNode, sel: string) => parent.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Restart a CSS animation class (remove, reflow, add). */
function retrigger(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// ---------- build ----------
function buildCard(sys: UpgradeSystem): HTMLElement {
  const el = document.createElement('div');
  el.className = 'upg-card';
  el.tabIndex = 0;
  el.dataset.id = sys.id;
  el.innerHTML = `
    <div class="upg-ct"><div class="upg-name g">${esc(sys.name)}</div><div class="upg-csub"></div></div>
    <div class="upg-cico">${icon(sys.id)}</div>
    <div class="upg-pips">${'<i class="pip"></i>'.repeat(PIPS)}</div>
    <div class="upg-btns">
      <button class="upg-minus" type="button" aria-label="Remove queued level">−</button>
      <button class="upg-buy" type="button"></button>
    </div>
    <span class="upg-float g"></span>`;
  const refs: CardRefs = {
    el,
    sub: $(el, '.upg-csub'),
    pips: [...el.querySelectorAll<HTMLElement>('.pip')],
    minus: $<HTMLButtonElement>(el, '.upg-minus'),
    buy: $<HTMLButtonElement>(el, '.upg-buy'),
    float: $(el, '.upg-float'),
  };
  cards.set(sys.id, refs);
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    select(sys.id);
  });
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse' && !narrow) select(sys.id);
  });
  el.addEventListener('focus', () => select(sys.id));
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    remove(sys.id);
  });
  refs.buy.addEventListener('click', () => buy(sys.id));
  refs.minus.addEventListener('click', () => remove(sys.id));
  return el;
}

function build(screen: HTMLElement): void {
  root = document.createElement('div');
  root.id = 'game';
  root.className = 'upg booting';
  root.innerHTML = `
    <div class="upg-stage">
      <div class="upg-scroll">
        <div class="upg-title g">SHIP UPGRADES</div>
        <section class="pn upg-sys bt2">
          <div class="upg-group upg-main">
            <div class="hd">${icon('bolt', 24)}<span>MAIN SYSTEMS</span></div>
            <div class="upg-grid"></div>
          </div>
          <div class="upg-group upg-subs">
            <div class="hd">${icon('sub', 24)}<span>SUBSYSTEMS</span></div>
            <div class="upg-grid"></div>
          </div>
          <div class="upg-sweep"></div>
        </section>
        <section class="pn upg-reactor" tabindex="0">
          <div class="hd">${icon('bolt', 24)}<span>REACTOR</span><span class="upg-rtext g"></span></div>
          <div class="upg-rgroups"></div>
          <div class="upg-btns upg-rbtns">
            <button class="upg-minus" type="button" aria-label="Remove queued bar">−</button>
            <button class="upg-buy upg-rbuy" type="button"></button>
          </div>
          <span class="upg-float upg-rfloat g"></span>
        </section>
        <section class="pn upg-detail bt2"></section>
      </div>
      <div class="upg-bar bt2">
        <button class="upg-undo" type="button"><span class="key">[Z] </span>UNDO ALL</button>
        <div class="upg-mid"></div>
        <button class="upg-confirm" type="button"></button>
      </div>
    </div>
    <div class="upg-errscreen"></div>
    <div class="upg-glass"><div class="upg-roll"></div></div>
    <div class="upg-dot"></div>`;
  screen.appendChild(root);

  stage = $(root, '.upg-stage');
  scroller = $(root, '.upg-scroll');
  reactorPanel = $(root, '.upg-reactor');
  detail = $(root, '.upg-detail');
  bar = $(root, '.upg-bar');
  rText = $(root, '.upg-rtext');
  rMinus = $<HTMLButtonElement>(reactorPanel, '.upg-minus');
  rBtn = $<HTMLButtonElement>(reactorPanel, '.upg-rbuy');
  rFloat = $(reactorPanel, '.upg-rfloat');
  undoBtn = $<HTMLButtonElement>(bar, '.upg-undo');
  confirmBtn = $<HTMLButtonElement>(bar, '.upg-confirm');
  barMid = $(bar, '.upg-mid');
  errScreen = $(root, '.upg-errscreen');

  const mainGrid = $(root, '.upg-main .upg-grid');
  const subGrid = $(root, '.upg-subs .upg-grid');
  for (const sys of UPGRADE_SYSTEMS) (sys.type === 'main' ? mainGrid : subGrid).appendChild(buildCard(sys));

  const groups = $(reactorPanel, '.upg-rgroups');
  rGroups = REACTOR.groupCosts.map(() => {
    const g = document.createElement('div');
    g.className = 'upg-rgroup';
    g.innerHTML = `<div class="upg-pips">${'<i class="pip"></i>'.repeat(REACTOR.groupSize)}</div><div class="upg-rprice">${icon('scrap', 18)}<span></span></div>`;
    groups.appendChild(g);
    return { pips: [...g.querySelectorAll<HTMLElement>('.pip')], price: $(g, '.upg-rprice') };
  });

  reactorPanel.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('button')) select('reactor');
  });
  reactorPanel.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse' && !narrow) select('reactor');
  });
  reactorPanel.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    remove('reactor');
  });
  rBtn.addEventListener('click', () => buy('reactor'));
  rMinus.addEventListener('click', () => remove('reactor'));
  undoBtn.addEventListener('click', undo);
  confirmBtn.addEventListener('click', confirm);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') location.href = '/';
    else if (e.key === 'z' || e.key === 'Z') undo();
    else if (e.key === 'Enter') {
      e.preventDefault();
      confirm();
    }
  });
  window.addEventListener('resize', layout);
  root.addEventListener('animationend', (e) => {
    if (e.target === root && e.animationName === 'upg-crton') root.classList.remove('booting');
  });
}

// ---------- layout (wide = scaled mockup, narrow = phone flow) ----------
function layout(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const k = Math.min(w / 1600, h / 900);
  const wasNarrow = narrow;
  narrow = k < 0.62;
  root.classList.toggle('narrow', narrow);
  root.classList.toggle('wide', !narrow);
  if (narrow) {
    stage.style.transform = '';
    // cards per row: 3 on a phone held upright, up to 6 when there is room
    const cols = Math.max(3, Math.min(6, Math.floor((w - 48) / 116)));
    root.style.setProperty('--cols', String(cols));
  } else {
    stage.style.transform = `translate(${(w - 1600 * k) / 2}px, ${(h - 900 * k) / 2}px) scale(${k})`;
  }
  if (wasNarrow !== narrow || narrow) placeDetail();
}

/** Phone: the details panel opens right under the selected card's row (or under the reactor). Wide: fixed slot. */
function placeDetail(): void {
  if (!narrow) {
    if (detail.parentElement !== scroller || detail.previousElementSibling !== reactorPanel) reactorPanel.after(detail);
    return;
  }
  if (selected === 'reactor') {
    if (detail.previousElementSibling !== reactorPanel) reactorPanel.after(detail);
    return;
  }
  const card = cards.get(selected)!.el;
  const grid = card.parentElement!;
  const list = [...grid.querySelectorAll<HTMLElement>('.upg-card')];
  const cols = Math.max(1, Number(root.style.getPropertyValue('--cols')) || 3);
  const i = list.indexOf(card);
  const last = list[Math.min(list.length - 1, Math.floor(i / cols) * cols + cols - 1)];
  if (last && last.nextElementSibling !== detail) last.after(detail);
}

// ---------- actions ----------
function select(id: string): void {
  if (selected === id) return;
  selected = id;
  if (narrow) placeDetail();
  render();
}

function showDeny(d: Deny): void {
  deny = d;
  window.clearTimeout(denyTimer);
  denyTimer = window.setTimeout(() => {
    deny = null;
    render();
  }, ERR_MS);
  render();
  const btn = d.target === 'confirm' ? confirmBtn : d.target === 'reactor' ? rBtn : cards.get(d.target)?.buy;
  if (btn) retrigger(btn, 'err');
  retrigger(errScreen, 'on');
  const g = detail.querySelector<HTMLElement>('.glitch');
  if (g) retrigger(g, 'go');
}

function buy(id: string): void {
  if (installing) return;
  if (selected !== id) {
    selected = id;
    if (narrow) placeDetail();
  }
  const res = id === 'reactor' ? queueBar(run, pending) : queueLevel(run, pending, id);
  if (!res.ok) return showDeny(res.deny);
  pending = res.pending;
  if (deny?.target === id) deny = null;
  render();
}

function remove(id: string): void {
  if (installing) return;
  pending = id === 'reactor' ? removeBar(pending) : removeLevel(pending, id);
  render();
}

function undo(): void {
  if (installing) return;
  pending = emptyPending();
  deny = null;
  render();
}

function confirm(): void {
  if (installing) return;
  const res = confirmUpgrades(run, pending);
  if (!res.ok) return showDeny(res.deny);
  saveRun(res.run); // saved right away; the steps below are only the show
  installing = true;
  deny = null;
  root.classList.add('installing');
  const paid = res.paid;
  const step = () => {
    if (pendingCount(pending) === 0) {
      installing = true;
      doneMsg = `> UPGRADES INSTALLED · −${paid} SCRAP`;
      render();
      root.classList.remove('installing');
      window.setTimeout(() => root.classList.add('crtoff'), 1000);
      window.setTimeout(() => (location.href = '/'), 1700);
      return;
    }
    const s = installStep(run, pending);
    run = s.run;
    pending = s.pending;
    render();
    for (const id of s.installed) popInstalled(id);
    retrigger($(barMid, '.upg-now') ?? barMid, 'cnt');
    window.setTimeout(step, STEP_MS);
  };
  render();
  window.setTimeout(step, 120);
}

function popInstalled(id: string): void {
  if (id === 'reactor') {
    const n = effectiveReactor(run) - 1;
    const pip = rGroups[Math.floor(n / REACTOR.groupSize)]?.pips[n % REACTOR.groupSize];
    if (pip) retrigger(pip, 'pop');
    retrigger(reactorPanel, 'flash');
    rFloat.textContent = '+1 BAR';
    retrigger(rFloat, 'go');
    return;
  }
  const c = cards.get(id);
  if (!c) return;
  const pip = c.pips[effectiveLevel(run, id) - 1];
  if (pip) retrigger(pip, 'pop');
  retrigger(c.el, 'flash');
  c.float.textContent = UPGRADE_SYSTEMS.find((s) => s.id === id)?.type === 'main' ? '+1 POWER' : '+1 LEVEL';
  retrigger(c.float, 'go');
}

// ---------- render ----------
function setBuy(btn: HTMLButtonElement, ok: boolean, html: string): void {
  btn.classList.toggle('ok', ok);
  btn.classList.toggle('dim', !ok);
  if (btn.innerHTML !== html) btn.innerHTML = html;
}

function rowHtml(r: LevelRow): string {
  return `<div class="upg-row ${r.state}"><span class="lv">${esc(r.level)}</span><span class="eff">${esc(r.effect)}</span><span class="cost">${esc(r.cost)}</span></div>`;
}

function render(): void {
  const avail = availableScrap(run, pending);
  const total = pendingCost(run, pending);
  const count = pendingCount(pending);

  // system cards
  for (const sys of UPGRADE_SYSTEMS) {
    const c = cards.get(sys.id)!;
    const lv = effectiveLevel(run, sys.id);
    const pend = pendingOf(pending, sys.id);
    const tot = lv + pend;
    c.el.classList.toggle('sel', selected === sys.id);
    c.sub.textContent = `${sys.type === 'main' ? 'POWER' : 'LEVEL'} ${tot} / ${sys.max}`;
    c.pips.forEach((p, j) => {
      const cls = j >= sys.max ? 'hid' : j < lv ? 'on' : j < tot ? 'pend' : j >= sys.buyMax ? 'man' : '';
      p.classList.toggle('hid', cls === 'hid');
      p.classList.toggle('on', cls === 'on');
      p.classList.toggle('pend', cls === 'pend');
      p.classList.toggle('man', cls === 'man');
    });
    c.minus.hidden = pend <= 0;
    if (tot >= sys.buyMax) {
      setBuy(c.buy, false, `<span class="upg-maxt">${tot >= sys.max ? 'MAX' : `MAN FOR LVL ${sys.max}`}</span>`);
    } else {
      const cost = levelCost(sys, tot + 1);
      const afford = cost <= avail;
      setBuy(c.buy, afford, `${icon('scrap', 18)}<span class="${afford ? '' : 'red'}">${cost}</span>`);
    }
    c.buy.setAttribute('aria-label', `Buy ${sys.name} level`);
  }

  // reactor
  const rLv = effectiveReactor(run);
  const rTot = rLv + pending.reactor;
  rText.textContent = `${rTot} / ${REACTOR.max} BARS`;
  reactorPanel.classList.toggle('sel', selected === 'reactor');
  rGroups.forEach((g, gi) => {
    g.pips.forEach((p, j) => {
      const n = gi * REACTOR.groupSize + j; // 0-based bar index
      p.classList.toggle('on', n < rLv);
      p.classList.toggle('pend', n >= rLv && n < rTot);
    });
    const full = rTot >= gi * REACTOR.groupSize + REACTOR.groupSize;
    g.price.classList.toggle('done', full);
    g.price.querySelector('span')!.textContent = String(REACTOR.groupCosts[gi]);
  });
  rMinus.hidden = pending.reactor <= 0;
  if (rTot >= REACTOR.max) setBuy(rBtn, false, `<span class="upg-maxt">MAX</span>`);
  else {
    const cost = reactorBarCost(rTot + 1);
    const afford = !canQueueBar(run, pending);
    setBuy(rBtn, afford, `<span class="ls">+1 BAR</span>${icon('scrap', 18)}<span class="${afford ? '' : 'red'}">${cost}</span>`);
  }

  // details
  if (deny) {
    const t = denyText(deny);
    const html = `<div class="glitch go"><div class="g et">ACCESS DENIED // ${esc(t.title)}</div><div class="ex">&gt; ${esc(t.text)}</div></div>`;
    if (!detail.querySelector('.glitch') || detail.dataset.err !== t.text) {
      detail.innerHTML = html;
      detail.dataset.err = t.text;
    }
  } else {
    delete detail.dataset.err;
    const isR = selected === 'reactor';
    const sys = isR ? null : UPGRADE_SYSTEMS.find((s) => s.id === selected)!;
    const name = isR ? 'REACTOR' : sys!.name;
    const tag = isR ? 'POWER SOURCE' : sys!.type === 'main' ? 'MAIN SYSTEM · USES POWER' : 'SUBSYSTEM · NO POWER';
    const rows = isR ? reactorRows(run, pending) : systemRows(run, pending, selected);
    detail.innerHTML = `<div class="upg-dt"><span class="g dn">${esc(name)}</span><span class="tag">${esc(tag)}</span></div>
      <div class="upg-rows">${rows.map(rowHtml).join('')}</div>`;
  }

  // action bar
  const now = run.scrap;
  if (doneMsg) barMid.innerHTML = `<span class="donepop g">${esc(doneMsg)}</span>`;
  else if (deny && narrow) barMid.innerHTML = `<span class="upg-barerr">ACCESS DENIED // ${esc(denyText(deny).title)}</span>`;
  else
    barMid.innerHTML = `${icon('scrap', 24)}<span class="lbl">SCRAP</span><span class="g big upg-now">${now}</span>${
      total > 0 ? `<span class="amber">−${total}</span><span class="arrow">→</span><span class="g big">${now - total}</span>` : ''
    }`;
  confirmBtn.classList.toggle('ok', count > 0 || installing);
  confirmBtn.innerHTML = `<span class="key">[ENTER] </span>${doneMsg ? 'INSTALLED' : installing ? 'INSTALLING...' : count > 0 ? `CONFIRM · ${total} SCRAP` : 'CONFIRM'}`;
  undoBtn.classList.toggle('dim', count === 0);
}

// ---------- start ----------
export function mountUpgrades(screen: HTMLElement): void {
  run = loadRun();
  document.body.classList.add('upg-page');
  build(screen);
  layout();
  render();
}
