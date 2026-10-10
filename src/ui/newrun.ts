// New Run screen: ship + captain name, difficulty, bonus modifiers, START RUN.
// Rules live in src/core/newrun.ts; this file only draws them and forwards taps / keys.
import './newrun.css';
import {
  NEW_RUN,
  buildRun,
  canStart,
  defaultSettings,
  difficultyIndex,
  nextShipName,
  sanitizeName,
  selectDifficulty,
  startBlock,
  startLabel,
  toggleModifier,
  type NewRunSettings,
} from '../core/newrun';
import { loadRun, saveRun } from './runStore';
import { applyGreyscale, greyscaleItem, mountMenu, toggleFullscreen } from './menu';
import { mountBootScreen } from './terminal';
import { TermSfx } from './termSfx';

const GAME_URL = '/?play';

// ---------- icons (24×24, stroke = currentColor) ----------
const P: Record<string, string> = {
  ship: '<path d="M3 12 L8 7 H17 L21 12 L17 17 H8 Z"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21 C4 16 8 14 12 14 C16 14 20 16 20 21"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11 V17 M12 7 V8"/>',
  warning: '<path d="M12 3 L22 20 H2 Z"/><path d="M12 10 V14 M12 17 V17.5"/>',
  star: '<path d="M12 3 L14.6 9 L21 9.5 L16 13.7 L17.6 20 L12 16.6 L6.4 20 L8 13.7 L3 9.5 L9.4 9 Z"/>',
  reroll: '<path d="M20 12 A8 8 0 1 1 17.66 6.34"/><path d="M20 3 V8 H15"/>',
  close: '<path d="M6 6 L18 18 M18 6 L6 18"/>',
  lock: '<rect x="5" y="11" width="14" height="10"/><path d="M8 11 V7 C8 4.8 9.8 3 12 3 C14.2 3 16 4.8 16 7 V11"/>',
  back: '<path d="M15 4 L7 12 L15 20"/>',
  enter: '<path d="M3 12 H15 M11 7 L16 12 L11 17 M19 5 V19"/>',
  hull: '<path d="M12 20 C6 15.5 3 12.5 3 8.5 C3 6 5 4 7.5 4 C9.4 4 11 5.2 12 6.8 C13 5.2 14.6 4 16.5 4 C19 4 21 6 21 8.5 C21 12.5 18 15.5 12 20 Z"/><path d="M7 11 H10 L11.5 8.5 L13 13 L14.5 11 H17"/>',
  missile: '<path d="M13 4 H20 V11 L10 21 L3 14 Z"/><path d="M3 21 L7 17"/><path d="M10 10 L14 14" stroke-opacity="0.5"/>',
  turret: '<rect x="4" y="9" width="9" height="7"/><path d="M13 11 H21 M13 14 H19"/><path d="M3 20 L6 16 H11 L14 20 Z"/>',
  crew: '<circle cx="10" cy="8" r="4"/><path d="M3 21 C3 16 6.5 14 10 14 C13.5 14 17 16 17 21"/><path d="M19 7 V13 M16 10 H22"/>',
  scrap: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9"/>',
  reactor: '<path d="M13 2 L5 14 H11 L10 22 L19 9 H13 Z"/>',
};
const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${P[name] ?? P.lock}</svg>`;

// ---------- sounds (Web Audio, made in code; follows the SOUND/VOLUME setting of the game + the boot screen's SOUND) ----------

// ---------- screen ----------
type ErrState =
  | { kind: 'diff'; id: string }
  | { kind: 'mod'; id: string; reason: 'locked' | 'limit' }
  | { kind: 'start'; field: 'ship' | 'captain' }
  | null;

export function mountNewRun(screen: HTMLElement, hud: HTMLElement): void {
  const sfx = new TermSfx();
  const fresh = (): NewRunSettings => ({ ...defaultSettings(), captainName: sanitizeName(loadRun().captainName) });
  let s: NewRunSettings = fresh();
  let dHover: string | null = null;
  let mHover: string | null = null;
  let lastMod: string | null = null;
  let err: ErrState = null;
  let started = true; // true while the screen is not live (boot screen / switching off): blocks all input
  let errTimer = 0;
  let offTimers: number[] = [];
  const max = NEW_RUN.name_max_length;

  const root = document.createElement('div');
  root.id = 'game'; // greyscale check targets #game
  root.className = 'nr';
  root.innerHTML = `
    <div class="nr-scroll" data-ref="scroll">
    <div class="nr-crt">
      <div class="nr-wrap">
        <div class="nr-row top bt2 d38">
          <button type="button" class="nr-back g" data-ref="back">${icon('back')}<span>[ESC] BACK</span></button>
        </div>
        <section class="nr-panel bt" aria-label="RUN SETTINGS">
          <div class="nr-hd g">${icon('ship')}<span>SHIP NAME</span></div>
          <div class="nr-line">
            <input class="nr-in" data-ref="ship" type="text" maxlength="${max}" placeholder="NAME YOUR SHIP" aria-label="SHIP NAME"
              autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" />
            <button type="button" class="nr-sq" data-ref="reroll" aria-label="NEXT SHIP NAME">${icon('reroll')}</button>
            <button type="button" class="nr-sq" data-ref="clearShip" aria-label="CLEAR SHIP NAME">${icon('close')}</button>
          </div>
          <div class="nr-hd cap g">${icon('person')}<span>CAPTAIN NAME</span>
            <span class="x hint">${icon('info')}<span>SHOWN ON THE LEADERBOARD</span></span></div>
          <div class="nr-line">
            <input class="nr-in" data-ref="captain" type="text" maxlength="${max}" placeholder="ENTER YOUR NAME" aria-label="CAPTAIN NAME"
              autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" />
            <button type="button" class="nr-sq" data-ref="clearCaptain" aria-label="CLEAR CAPTAIN NAME">${icon('close')}</button>
          </div>
          <div class="nr-hd g">${icon('warning')}<span>DIFFICULTY</span></div>
          <div class="nr-diffs" data-ref="diffs"></div>
          <div class="nr-info" data-ref="dInfo" aria-live="polite"><span class="t1 g"></span><span class="t2"></span></div>
          <div class="nr-hd g">${icon('star')}<span>BONUS MODIFIERS</span><span class="x" data-ref="count"></span></div>
          <div class="nr-mods" data-ref="mods"></div>
          <div class="nr-info mod" data-ref="mInfo" aria-live="polite"><span class="t1 g"></span><span class="t2"></span></div>
        </section>
        <div class="nr-row act bt2 d50" data-ref="actions">
          <button type="button" class="nr-start" data-ref="start"><span data-ref="startLbl"></span>${icon('enter')}</button>
        </div>
      </div>
    </div>
    </div>
    <div class="nr-fx" aria-hidden="true">
      <div class="lines"></div>
      <svg class="grain" xmlns="http://www.w3.org/2000/svg">
        <filter id="nr-gr" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 .8  0 0 0 0 .85  0 0 0 0 .8  0 0 0 1.6 -1.18" /></filter>
        <filter id="nr-du" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="3" seed="3" result="m" />
          <feColorMatrix in="m" type="matrix" values="0 0 0 0 .75  0 0 0 0 .8  0 0 0 0 .75  0 0 0 1.2 -.62" /></filter>
        <rect width="100%" height="100%" filter="url(#nr-gr)" opacity="0.35" />
        <rect width="100%" height="100%" filter="url(#nr-du)" opacity="0.12" />
      </svg>
      <div class="glare"></div>
      <div class="roll"></div>
    </div>
    <div class="nr-errscreen" data-ref="errscreen"></div>
    <div class="nr-dot" data-ref="dot"></div>`;
  screen.appendChild(root);
  const $ = <T extends HTMLElement = HTMLElement>(ref: string) => root.querySelector<T>(`[data-ref="${ref}"]`)!;
  const crt = root.querySelector<HTMLElement>('.nr-crt')!;
  const shipIn = $<HTMLInputElement>('ship');
  const capIn = $<HTMLInputElement>('captain');
  const startBtn = $<HTMLButtonElement>('start');
  const actions = $('actions');
  shipIn.value = s.shipName;
  capIn.value = s.captainName;

  // difficulty buttons
  const diffBtns = NEW_RUN.difficulties.map((d, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nr-diff';
    b.setAttribute('aria-label', d.label + (d.locked ? ' (locked)' : ''));
    const pips = Array.from({ length: 5 }, (_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('');
    b.innerHTML = `<span class="nr-pips">${pips}</span>${d.locked ? icon('lock') : ''}<span class="lbl">${d.label}</span>`;
    b.addEventListener('click', () => {
      if (started) return;
      const r = selectDifficulty(s, d.id);
      if (r.denied) return trigErr({ kind: 'diff', id: d.id });
      sfx.play(s.difficulty === d.id ? 'click' : 'add');
      s = r.settings;
      clearErr();
      render();
    });
    hoverable(b, () => (dHover = d.id), () => dHover === d.id && (dHover = null));
    $('diffs').appendChild(b);
    return b;
  });

  // modifier cells
  const modBtns = NEW_RUN.modifiers.map((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nr-mod';
    b.setAttribute('aria-label', `${m.name}: ${m.text}`);
    b.innerHTML = icon(m.locked ? 'lock' : m.icon);
    b.addEventListener('click', () => {
      if (started) return;
      mHover = m.id; // a tap shows its description (touch has no hover)
      const r = toggleModifier(s, m.id);
      if (r.denied === 'locked' || r.denied === 'limit') return trigErr({ kind: 'mod', id: m.id, reason: r.denied });
      const on = r.settings.modifiers.includes(m.id);
      sfx.play(on ? 'add' : 'sub');
      if (on) lastMod = m.id;
      s = r.settings;
      clearErr();
      render();
    });
    hoverable(b, () => (mHover = m.id), () => mHover === m.id && (mHover = null));
    $('mods').appendChild(b);
    return b;
  });

  /** Mouse hover / keyboard focus previews the info line (touch: the tap itself shows it). */
  function hoverable(el: HTMLElement, enter: () => void, leave: () => void) {
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      enter();
      sfx.play('hover');
      render();
    });
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      leave();
      render();
    });
    el.addEventListener('focus', () => {
      enter();
      render();
    });
    el.addEventListener('blur', () => {
      leave();
      render();
    });
  }

  // names
  const onType = (input: HTMLInputElement, key: 'shipName' | 'captainName') => {
    input.addEventListener('input', () => {
      const pos = input.selectionStart;
      const v = sanitizeName(input.value);
      if (v !== input.value) {
        input.value = v;
        if (pos !== null) input.setSelectionRange(Math.min(pos, v.length), Math.min(pos, v.length));
      }
      s = { ...s, [key]: v };
      sfx.play('hover');
      render();
    });
  };
  onType(shipIn, 'shipName');
  onType(capIn, 'captainName');
  $('reroll').addEventListener('click', () => {
    if (started) return;
    sfx.play('add');
    s = nextShipName(s);
    shipIn.value = s.shipName;
    render();
  });
  const clear = (input: HTMLInputElement, key: 'shipName' | 'captainName') => {
    if (started) return;
    sfx.play(s[key] ? 'sub' : 'click');
    s = { ...s, [key]: '' };
    input.value = '';
    render();
  };
  $('clearShip').addEventListener('click', () => clear(shipIn, 'shipName'));
  $('clearCaptain').addEventListener('click', () => clear(capIn, 'captainName'));

  // errors: short red shake + flash, gone after 1.2 s
  function clearErr() {
    window.clearTimeout(errTimer);
    if (err) {
      err = null;
      render();
    }
  }
  function trigErr(e: ErrState) {
    sfx.play('error');
    clearErr();
    errTimer = window.setTimeout(() => {
      err = e;
      render();
      errTimer = window.setTimeout(() => {
        err = null;
        render();
      }, 1200);
    }, 30);
  }

  // start / back
  function start() {
    if (started) return;
    const block = startBlock(s);
    if (block) {
      const field = block === 'no_ship_name' ? 'ship' : 'captain';
      (field === 'ship' ? shipIn : capIn).focus();
      return trigErr({ kind: 'start', field });
    }
    started = true;
    clearErr();
    (document.activeElement as HTMLElement | null)?.blur?.();
    saveRun(buildRun(s));
    sfx.play('confirm');
    $('actions').innerHTML = `<div class="nr-init g">&gt; INITIALIZING RUN<span class="nr-blink">_</span></div>`;
    window.setTimeout(() => sfx.play('done'), 550);
    powerOff(1100, 1600, () => location.assign(GAME_URL));
  }
  function back() {
    if (started) return;
    started = true;
    clearErr();
    (document.activeElement as HTMLElement | null)?.blur?.();
    sfx.play('click');
    powerOff(120, 620, () => boot.show('REBOOT')); // screen dark → options + REBOOT (the page stays)
  }
  function powerOff(offAt: number, darkAt: number, then: () => void) {
    offTimers.forEach((t) => window.clearTimeout(t));
    offTimers = [
      window.setTimeout(() => {
        crt.classList.add('off');
        sfx.play('off');
      }, offAt),
      window.setTimeout(() => {
        root.classList.remove('live'); // roll band stops, afterglow dot
        $('dot').classList.remove('on');
        void $('dot').offsetWidth;
        $('dot').classList.add('on');
        then();
      }, darkAt),
    ];
  }
  /** POWER ON / REBOOT: fresh screen, CRT-on + glitch-in (the animations restart when the screen is shown again). */
  function powerOn() {
    offTimers.forEach((t) => window.clearTimeout(t));
    window.clearTimeout(errTimer);
    s = fresh();
    dHover = mHover = lastMod = null;
    err = null;
    shipIn.value = s.shipName;
    capIn.value = s.captainName;
    actions.replaceChildren(startBtn);
    crt.classList.remove('off');
    $('dot').classList.remove('on');
    $('scroll').scrollTop = 0;
    boot.hide();
    root.classList.add('live');
    started = false;
    sfx.play('boot');
    render();
  }
  startBtn.addEventListener('click', start);
  $('back').addEventListener('click', back);
  let tabbing = false; // keyboard navigation in use (TAB) – then ENTER presses the focused button
  window.addEventListener('pointerdown', () => (tabbing = false));
  window.addEventListener('keydown', (e) => {
    if (!root.classList.contains('live')) return; // boot screen: keys keep their normal meaning
    if (e.key === 'Escape') {
      e.preventDefault();
      back();
    } else if (e.key === 'Tab') {
      tabbing = true;
    } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement && tabbing)) {
      // (a button reached with TAB keeps its own ENTER)
      e.preventDefault();
      start();
    }
  });
  // coming back with the browser's back button: show a fresh, switched-on screen
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) location.reload();
  });

  function info(el: HTMLElement, t1: string, t2: string, cls: string[]) {
    el.querySelector('.t1')!.textContent = t1;
    el.querySelector('.t2')!.textContent = t2;
    el.classList.toggle('dim', cls.includes('dim'));
    el.classList.toggle('bad', cls.includes('bad'));
  }

  function render() {
    // difficulty
    NEW_RUN.difficulties.forEach((d, i) => {
      const b = diffBtns[i]!;
      b.classList.toggle('sel', s.difficulty === d.id);
      b.classList.toggle('locked', d.locked);
      b.setAttribute('aria-pressed', String(s.difficulty === d.id));
      b.classList.toggle('err', err?.kind === 'diff' && err.id === d.id);
    });
    const dErrId = err?.kind === 'diff' ? err.id : null;
    const dErr = NEW_RUN.difficulties.find((d) => d.id === dErrId);
    const shown = NEW_RUN.difficulties[difficultyIndex(dHover ?? s.difficulty)] ?? NEW_RUN.difficulties[0]!;
    if (dErr) info($('dInfo'), `> ACCESS DENIED // ${dErr.label}`, dErr.text, ['bad']);
    else info($('dInfo'), `> ${shown.label}`, shown.text, shown.locked ? ['dim'] : []);

    // modifiers
    NEW_RUN.modifiers.forEach((m, i) => {
      const b = modBtns[i]!;
      const on = s.modifiers.includes(m.id);
      b.classList.toggle('on', on);
      b.classList.toggle('locked', m.locked);
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('err', err?.kind === 'mod' && err.id === m.id);
    });
    $('count').textContent = `${s.modifiers.length} / ${NEW_RUN.max_active_modifiers} ACTIVE`;
    if (err?.kind === 'mod') {
      if (err.reason === 'locked') info($('mInfo'), '> ACCESS DENIED // MODIFIER LOCKED', '[UNLOCK CONDITION]', ['bad']);
      else info($('mInfo'), '> ACCESS DENIED // MODIFIER LIMIT REACHED', `MAX ${NEW_RUN.max_active_modifiers} MODIFIERS PER RUN. DESELECT ONE FIRST.`, ['bad']);
    } else {
      const id = mHover ?? lastMod ?? NEW_RUN.modifiers[0]!.id;
      const m = NEW_RUN.modifiers.find((x) => x.id === id) ?? NEW_RUN.modifiers[0]!;
      info($('mInfo'), `> ${m.name}${s.modifiers.includes(m.id) ? ' [ACTIVE]' : ''}`, m.text, []);
    }

    // names + start
    shipIn.classList.toggle('err', err?.kind === 'start' && err.field === 'ship');
    capIn.classList.toggle('err', err?.kind === 'start' && err.field === 'captain');
    if (!started) {
      const ok = canStart(s);
      startBtn.classList.toggle('dis', !ok);
      startBtn.setAttribute('aria-disabled', String(!ok));
      startBtn.classList.toggle('err', err?.kind === 'start');
      $('startLbl').textContent = startLabel(s);
    }
    $('errscreen').classList.toggle('on', err !== null);
  }

  mountMenu(hud, 'NEW RUN', [
    { label: 'GAME', href: GAME_URL },
    { label: 'SHIP UPGRADES', href: '/upgrades/' },
    greyscaleItem(),
    { label: 'FULLSCREEN', onClick: () => void toggleFullscreen() },
  ]);
  // boot screen (POWER ON / REBOOT + OPTIONS: SOUND, GLASS, BLOOM, FULLSCREEN) – shared with the other terminal pages
  const boot = mountBootScreen(root, root, powerOn, (on) => {
    sfx.setOn(on);
    if (on) sfx.play('click');
  });
  // as in the mockup: SOUND + GLASS in one row, BLOOM, then FULLSCREEN on its own (lit while full screen)
  const bootEl = root.querySelector<HTMLElement>('.boot-screen')!;
  const full = bootEl.querySelector<HTMLElement>('[data-ref="full"]');
  const bloomRow = bootEl.querySelector<HTMLElement>('.boot-bloom');
  if (full && bloomRow) {
    bloomRow.after(full);
    const fsPaint = () => {
      const on = !!document.fullscreenElement;
      full.textContent = on ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
      full.classList.toggle('on', on);
    };
    document.addEventListener('fullscreenchange', fsPaint);
    fsPaint();
  }
  bootEl.querySelector('input[type="range"]')?.setAttribute('aria-label', 'BLOOM');
  boot.show('POWER ON');

  applyGreyscale();
  render();
}
