// Salvage reward screen: CRT boots, loot counters run up, three turret cards are revealed one by one (rarer = bigger
// build-up), the player secures one turret or scraps all three, the screen powers off and the game continues.
// Look + timing from the owner's mockup Reward_r6. Rules (offer, pick, scrap all) live in src/core/salvage.ts.
import DATA from '../data/turrets.json';
import { CLASS_INFO, effectText, makeOffer, pick, RARITIES, scrapAll, scrapAllValue, type SalvageOffer, type Turret } from '../core/salvage';
import { loadRun, saveRun } from './runStore';

// ---------- icons (24×24, stroke only) ----------
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 `;
const ICONS: Record<string, string> = {
  damage: circle(12, 12, 8) + 'M12 1 V7 M12 17 V23 M1 12 H7 M17 12 H23 M12 11.5 V12.5',
  energy: 'M13 2 L4 14 H11 L10 22 L20 9 H13 Z',
  charge: circle(12, 14, 8) + 'M12 14 V9.5 M12 14 L15 16 M9 2 H15 M12 2 V6 M18.5 6.5 L20.5 4.5',
  ammo: 'M9 21 V10 C9 6 10.5 3.5 12 3 C13.5 3.5 15 6 15 10 V21 Z M9 17 H15',
  charges: 'M3 21 L15 9 M11 7 H17 V13 M15 9 L21 3',
  scrap: circle(12, 12, 3.5) + 'M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9',
  turret: 'M3 21 H21 M6 21 L8 16 H16 L18 21 M8 16 V10 H15 V16 M15 12 H22 M10 10 V8 H13 V10',
  CANNON: 'M3 10 H7 V15 H3 Z M7 11 H20 M7 14 H20 M20 10 V15 M22 12.5 H21',
  MULTISHOT: 'M3 10 H7 V15 H3 Z M7 12.5 L21 5 M7 12.5 H21 M7 12.5 L21 20',
  BEAM: 'M3 9 V16 M3 12.5 H21 M6 10.5 H19 M6 14.5 H19',
  LANCE: 'M3 21 L17 7 M12 5 H19 V12 M17 7 L21 3',
  MISSILE: 'M4 20 L8 16 M15 4 C18 4 20 6 20 9 L12 17 L7 12 Z M7 12 L4 13 L5 15 M12 17 L11 20 L9 19',
  ION: 'M7 7 H17 V17 H7 Z M9 4 V7 M12 4 V7 M15 4 V7 M9 17 V20 M12 17 V20 M15 17 V20 M4 9 H7 M4 12 H7 M4 15 H7 M17 9 H20 M17 12 H20 M17 15 H20 M3 21 L21 3',
  fire: 'M12 22 C7 22 5 18 6 14 C7 11 10 10 10 5 C14 7 17 11 16 15 C17 14 18 13 18 12 C20 17 17 22 12 22 Z',
  stun: 'M12 3 L14 9 H20 L15 13 L17 20 L12 16 L7 20 L9 13 L4 9 H10 Z',
  crew: circle(12, 7, 3.5) + 'M5 21 C5 15 19 15 19 21',
  breach: 'M4 4 L10 10 L7 13 L13 19 L11 22 M15 3 L13 8 M21 10 L16 12',
  rad: 'M12 12 L7.5 4.2 A9 9 0 0 1 16.5 4.2 Z M12 12 L21 12 A9 9 0 0 1 16.5 19.8 Z M12 12 L7.5 19.8 A9 9 0 0 1 3 12 Z',
  dot: circle(12, 12, 3),
};
const icon = (key: string, size: number, sw = 1.8) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[key] ?? ICONS.dot}"/></svg>`;
const SCRAP_TILE_ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9"/></svg>`;
const AMMO_TILE_ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M7 21 V10 C7 6 8.5 3.5 9.5 3 C10.5 3.5 12 6 12 10 V21 Z"/><path d="M7 17 H12"/><path d="M14 21 V12 C14 9 15 7 16 6.5 C17 7 18 9 18 12 V21 Z"/><path d="M14 18 H18"/></svg>`;

function holoSvg(img: string): string {
  const parts = ((DATA.drawings as unknown as Record<string, [string, Record<string, string | number>][]>)[img] ?? []).map(
    ([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`,
  );
  return `<svg class="holo" viewBox="0 0 320 170" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">${parts.join('')}</svg>`;
}

// ---------- text helpers ----------
const KEEP = new Set(['HP', 'DPS', 'ION', 'DMG']);
const SMALL = new Set(['TO', 'OF', 'ON', 'IN', 'VS', 'WITH', 'ALL', 'AND']);
/** Title Case like the mockup: abbreviations stay, small words lower case, unit S -> s. */
function tc(s: string): string {
  return s
    .split(' ')
    .map((w, i) => {
      const core = w.replace(/[^A-Z]/g, '');
      if (!core || KEEP.has(core)) return w;
      if (w === 'S') return 's';
      if (i > 0 && SMALL.has(w)) return w.toLowerCase();
      return w.charAt(0) + w.slice(1).toLowerCase();
    })
    .join(' ');
}
const GLYPH = '#%&@$/\\<>01=+*';
function scramble(txt: string, f: number): string {
  const n = Math.round(txt.length * f);
  let out = txt.slice(0, n);
  for (let k = n; k < txt.length; k++) out += txt[k] === ' ' ? ' ' : GLYPH[Math.floor(Math.random() * GLYPH.length)];
  return out;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const STAT_INFO = {
  energy: 'Reactor energy bars this turret needs while it is powered.',
  charge: 'Seconds the turret needs to charge before it fires the next volley.',
  ammo: 'Ammunition used for every volley. Without ammo this turret cannot fire.',
  charges: 'Shots per jump. Lances start every battle pre-charged and recharge only between jumps.',
  value: 'What you get when you scrap or sell it.',
  turret: 'Ship weapon. Goes into a weapons bay of your ship and runs on reactor energy.',
};
function damageInfo(t: Turret): string {
  if (t.ion)
    return 'Per projectile: locks that many energy bars of the hit system for 5 s each (stacks); the system cannot be powered or manned. No hull damage. Blocked by shields: removes 1 layer and ionizes the SHIELD system instead – the tool to break shields.';
  if (t.dmg === 0) return 'Deals no damage: this turret works only through its special effects.';
  if (t.cls === 'BEAM') return 'Per room the beam cuts through (× rooms): takes this much off the hull AND damages the system in that room.';
  return 'Per projectile (× projectiles): takes this much off the hull AND damages the system in the room it hits.';
}

// ---------- sound (Web Audio, made in code; same on/off + volume as the game: adw.sound / adw.volume) ----------
class Sfx {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private on = true;
  private vol = 0.5;
  constructor() {
    try {
      this.on = localStorage.getItem('adw.sound') !== '0';
      this.vol = Number(localStorage.getItem('adw.volume') ?? 0.5) || 0.5;
    } catch {
      /* defaults */
    }
  }
  /** Browsers allow audio only after a tap: called on every pointerdown. */
  unlock(): void {
    if (!this.on) return;
    if (!this.ac) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ac = (this.ac = new AC());
      this.master = ac.createGain();
      this.master.gain.value = 0.6 * this.vol;
      const shaper = ac.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let k = 0; k < 1024; k++) curve[k] = Math.tanh(2.2 * ((k * 2) / 1024 - 1));
      shaper.curve = curve;
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 280;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3600;
      lp.Q.value = 0.8;
      this.master.connect(shaper);
      shaper.connect(hp);
      hp.connect(lp);
      lp.connect(ac.destination);
    }
    if (this.ac.state === 'suspended') void this.ac.resume();
  }
  private ready(): AudioContext | null {
    return this.on && this.ac && this.master && this.ac.state === 'running' ? this.ac : null;
  }
  tone(freq: number, dur: number, o: { type?: OscillatorType; vol?: number; slide?: number; delay?: number } = {}): void {
    const ac = this.ready();
    if (!ac) return;
    const t = ac.currentTime + (o.delay ?? 0);
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = o.type ?? 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol ?? 0.06, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }
  noise(dur: number, vol: number, o: { bp?: number; q?: number; delay?: number } = {}): void {
    const ac = this.ready();
    if (!ac) return;
    const t = ac.currentTime + (o.delay ?? 0);
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let k = 0; k < len; k++) data[k] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const flt = ac.createBiquadFilter();
    if (o.bp) {
      flt.type = 'bandpass';
      flt.frequency.value = o.bp;
      flt.Q.value = o.q ?? 1;
    } else {
      flt.type = 'highpass';
      flt.frequency.value = 1500;
    }
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
  play(name: string, a = 0, b = 0): void {
    if (!this.ready()) return;
    switch (name) {
      case 'boot':
        this.tone(60, 0.22, { type: 'sine', vol: 0.12 });
        this.noise(0.05, 0.14, { bp: 900, q: 1 });
        this.tone(140, 0.45, { type: 'sawtooth', vol: 0.02, slide: 1500, delay: 0.04 });
        break;
      case 'coin': {
        const f = 990 * Math.pow(2, a / 18);
        this.tone(f, 0.08, { type: 'triangle', vol: 0.055 });
        this.tone(f * 2, 0.035, { vol: 0.012 });
        this.noise(0.008, 0.05, { bp: 5000, q: 3 });
        break;
      }
      case 'shell': {
        const f = 523 * Math.pow(2, ((a || 1) - 1) * 7 / 12);
        this.noise(0.03, 0.16, { bp: 1800, q: 1.2 });
        this.tone(80, 0.08, { type: 'sine', vol: 0.11 });
        this.tone(f, 0.12, { type: 'triangle', vol: 0.06, delay: 0.015 });
        break;
      }
      case 'lock':
        this.tone(1046, 0.07, { type: 'triangle', vol: 0.05 });
        this.tone(1569, 0.16, { type: 'triangle', vol: 0.05, delay: 0.06 });
        this.noise(0.18, 0.03, { bp: 2500, q: 0.7, delay: 0.06 });
        break;
      case 'scan':
        this.noise(0.24, 0.05, { bp: 2600, q: 0.7 });
        this.tone(260, 0.24, { type: 'sawtooth', vol: 0.018, slide: 1500 });
        break;
      case 'stripe': {
        const f = 660 * Math.pow(2, ((a || 1) - 1) * 4 / 12);
        this.noise(0.01, 0.07, { bp: 3200, q: 2 });
        this.tone(f, 0.06, { vol: 0.04 });
        break;
      }
      case 'plimp': {
        const R = b || 1;
        const f = [880, 988, 1175, 1397, 1760][R - 1]!;
        this.noise(0.012, 0.08, { bp: 4000, q: 2 });
        this.tone(f, 0.28 + R * 0.05, { type: 'sine', vol: 0.07 });
        this.tone(f * 2, 0.12, { type: 'triangle', vol: 0.02 });
        if (R >= 2) this.tone(f * 1.5, 0.22 + R * 0.04, { type: 'triangle', vol: 0.03, delay: 0.05 });
        if (R >= 3) this.tone(f * 2.52, 0.18, { type: 'sine', vol: 0.025, delay: 0.1 });
        break;
      }
      case 'fanfare': {
        const R = a || 3;
        const notes = [784, 1046, 1318, 1568, 2093, 2637].slice(0, R + (R === 5 ? 1 : 0));
        const step = R === 5 ? 0.075 : 0.065;
        notes.forEach((fq, k) => {
          const last = k === notes.length - 1;
          this.tone(fq, last ? 0.3 + (R - 3) * 0.2 : 0.07, { type: 'triangle', vol: 0.05, delay: k * step });
          if (last && R >= 4) this.tone(fq / 2, 0.5 + (R - 4) * 0.3, { type: 'square', vol: 0.015, delay: k * step });
        });
        this.noise(0.35 + (R - 3) * 0.2, 0.035, { bp: 1500, q: 0.6, delay: notes.length * step });
        break;
      }
      case 'charge': {
        const R = a || 4;
        const dur = b || 0.45;
        this.tone(110, dur, { type: 'sawtooth', vol: R === 5 ? 0.035 : 0.025, slide: R === 5 ? 1900 : 1200 });
        this.tone(55, dur, { type: 'square', vol: 0.02, slide: R === 5 ? 220 : 160 });
        const n = R === 5 ? 8 : 4;
        for (let k = 0; k < n; k++) this.noise(dur / n, 0.02 + k * (R === 5 ? 0.012 : 0.015), { bp: 1500 + k * 250, q: 0.8, delay: (k * dur) / n });
        if (R === 5) for (let k = 0; k < 4; k++) this.tone(62, 0.09, { type: 'square', vol: 0.05 + k * 0.015, delay: (k * dur) / 4 });
        break;
      }
      case 'burst': {
        const R = a || 4;
        this.tone(R === 5 ? 160 : 220, R === 5 ? 0.6 : 0.35, { type: 'square', vol: R === 5 ? 0.08 : 0.05, slide: 40 });
        this.noise(R === 5 ? 0.9 : 0.45, R === 5 ? 0.14 : 0.09, { bp: 1300, q: 0.4 });
        const chord = R === 5 ? [392, 523, 659, 784, 1046, 1318] : [523, 659, 784, 1046];
        chord.forEach((fq, k) => {
          this.tone(fq, R === 5 ? 1.0 : 0.55, { type: 'triangle', vol: 0.03, delay: 0.02 + k * 0.015 });
          if (R === 5) this.tone(fq * 1.006, 1.0, { type: 'triangle', vol: 0.02, delay: 0.03 + k * 0.015 });
        });
        break;
      }
      case 'select':
        this.noise(0.06, 0.16, { bp: 900, q: 1 });
        this.tone(55, 0.2, { type: 'sine', vol: 0.12 });
        this.tone(1046, 0.06, { vol: 0.04, delay: 0.03 });
        this.tone(1568, 0.1, { vol: 0.04, delay: 0.1 });
        break;
      case 'arm':
        this.tone(1046, 0.05, { vol: 0.035 });
        break;
      case 'finale':
        this.tone(70, 0.25, { type: 'sine', vol: 0.12 });
        this.noise(0.05, 0.1, { bp: 1200, q: 1 });
        [523, 659, 784, 1046].forEach((fq, k) => this.tone(fq, 0.09, { type: 'triangle', vol: 0.05, delay: 0.05 + k * 0.055 }));
        [1046, 1318, 1568, 2093].forEach((fq, k) => {
          this.tone(fq, 0.8, { type: 'triangle', vol: 0.03, delay: 0.28 + k * 0.012 });
          this.tone(fq * 1.005, 0.8, { type: 'sine', vol: 0.02, delay: 0.29 + k * 0.012 });
        });
        this.tone(262, 0.7, { type: 'square', vol: 0.018, delay: 0.28 });
        this.noise(0.6, 0.035, { bp: 6000, q: 0.5, delay: 0.3 });
        break;
      case 'off':
        this.tone(1300, 0.4, { type: 'sawtooth', vol: 0.025, slide: 60 });
        this.noise(0.08, 0.12, { bp: 700, q: 1 });
        this.tone(48, 0.18, { type: 'sine', vol: 0.1, delay: 0.25 });
        break;
    }
  }
}

// ---------- the screen ----------
interface CardRefs {
  t: Turret;
  slot: HTMLElement;
  wait: HTMLElement;
  card: HTMLElement | null;
  name: HTMLElement | null;
  sub: HTMLElement[];
  pips: HTMLElement[];
  holo: HTMLElement | null;
  rows: HTMLElement[]; // in fill order (stats, then effects); footer separately
  foot: HTMLElement[];
  ready: boolean;
  shown: boolean;
}

type Phase = 'live' | 'confirm' | 'off';

export interface SalvageOptions {
  seed: number;
  /** Called after the screen has powered off (default: back to the game). */
  onDone?: () => void;
}

export function mountSalvage(host: HTMLElement, opts: SalvageOptions): void {
  const offer: SalvageOffer = makeOffer(opts.seed);
  const sfx = new Sfx();
  const done = opts.onDone ?? (() => (location.href = '/'));
  const sum = scrapAllValue(offer);

  const root = document.createElement('div');
  root.id = 'game';
  root.className = 'sv-root';
  root.innerHTML = `
  <div class="sv-screen crt">
    <div class="sv-wrap">
      <div class="sv-top bt2" style="animation-delay:.12s">
        <div class="sv-flavor">
          <span class="sv-h g bt" style="animation-delay:.2s">&gt; SENTINEL VESSEL DESTROYED</span>
          <span class="sv-sub bt2" style="animation-delay:.3s">Congratulations, Captain. Salvage recovered:</span>
        </div>
        <div class="sv-loot">
          <div class="sv-tilebox bt" style="animation-delay:.34s">
            <div class="sv-tile" data-ref="stile">${SCRAP_TILE_ICON}<span class="sv-num g"><span data-ref="snum">+0</span></span><span class="sv-lbl">Scrap</span></div>
          </div>
          <div class="sv-tilebox bt2" style="animation-delay:.4s">
            <div class="sv-tile" data-ref="atile">${AMMO_TILE_ICON}<span class="sv-num am g"><span data-ref="anum">+0</span></span><span class="sv-lbl">Ammunition</span></div>
          </div>
        </div>
      </div>
      <div class="sv-pickline">
        <span class="sv-h g bt2" style="animation-delay:1.2s">&gt; WRECK BREAKING APART. PICK ONE OF THREE TURRETS.</span>
        <button type="button" class="sv-scrapall" data-ref="scrapall" style="visibility:hidden" tabindex="-1">${SCRAP_TILE_ICON}<span>Scrap all turrets → +${sum} Scrap</span></button>
      </div>
      <div class="sv-grid" data-ref="grid"></div>
    </div>
  </div>`;
  host.appendChild(root);
  const $ = <T extends HTMLElement = HTMLElement>(ref: string) => root.querySelector<T>(`[data-ref="${ref}"]`)!;
  const screen = root.querySelector<HTMLElement>('.sv-screen')!;
  const grid = $('grid');
  const scrapBtn = $<HTMLButtonElement>('scrapall');
  const stile = $('stile');
  const atile = $('atile');
  const snum = $('snum');
  const anum = $('anum');
  const narrow = () => window.innerWidth < 1100;

  // ----- state -----
  let phase: Phase = 'live';
  let allDone = false;
  let armed: number | null = null;
  let lastPointer = 'mouse';
  let userTouched = false;
  let sTick = 0;
  let aTick = 0;
  let timers: number[] = [];
  const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
  const stopSeq = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  const cards: CardRefs[] = offer.turrets.map((t) => {
    const slot = document.createElement('div');
    slot.className = 'sv-slot';
    slot.style.setProperty('--r', RARITIES[t.rarity - 1]!.color);
    const wait = document.createElement('div');
    wait.className = 'sv-wait';
    wait.innerHTML = `<span>&gt; INCOMING SIGNAL</span><span class="blink">_</span>`;
    slot.appendChild(wait);
    grid.appendChild(slot);
    return { t, slot, wait, card: null, name: null, sub: [], pips: [], holo: null, rows: [], foot: [], ready: false, shown: false };
  });

  // ----- loot counters -----
  const setNum = (el: HTMLElement, v: number, tick: number) => {
    el.textContent = `+${v}`;
    el.className = tick % 2 ? 'cntA' : 'cntB';
  };
  const flashTile = (el: HTMLElement, tick: number) => {
    el.classList.remove('tileA', 'tileB', 'lock');
    el.classList.add(tick % 2 ? 'tileA' : 'tileB');
  };
  const floatUp = (tile: HTMLElement, text: string) => {
    const f = document.createElement('span');
    f.className = 'floatup';
    f.textContent = text;
    tile.parentElement!.appendChild(f);
    window.setTimeout(() => f.remove(), 900);
  };
  let countersDone = false;
  const finishCounters = (withFx: boolean) => {
    if (countersDone) return;
    countersDone = true;
    snum.textContent = `+${offer.scrap}`;
    anum.textContent = `+${offer.ammo}`;
    for (const tile of [stile, atile]) {
      tile.classList.remove('tileA', 'tileB');
      tile.classList.add('lock');
    }
    if (withFx) {
      floatUp(stile, `+${offer.scrap} Scrap`);
      floatUp(atile, `+${offer.ammo} Ammunition`);
    }
  };

  // ----- tooltips -----
  const tip = document.createElement('div');
  tip.className = 'sv-tip';
  const showTip = (el: HTMLElement, docked: boolean) => {
    const title = el.dataset.tipTitle ?? '';
    tip.innerHTML = `<b class="g">${esc(title)}</b><br>${esc(el.dataset.info ?? '')}`;
    root.querySelectorAll('.tipon').forEach((x) => x.classList.remove('tipon'));
    if (docked) {
      tip.className = 'sv-tip dock';
      root.appendChild(tip);
    } else {
      tip.className = `sv-tip ${el.classList.contains('sv-row') ? 'up' : 'dn'}`;
      el.appendChild(tip);
    }
    if (el.classList.contains('sv-row')) el.classList.add('tipon');
  };
  const hideTip = () => {
    tip.remove();
    root.querySelectorAll('.tipon').forEach((x) => x.classList.remove('tipon'));
  };

  // ----- card building -----
  const row = (ic: string, label: string, value: string, info: string, cls = '') =>
    `<div class="sv-row sv-info ${cls}" data-info="${esc(info)}" data-tip-title="${esc(label)}">${icon(ic, 20)}<span class="l">${esc(label)}</span><span class="v">${esc(value)}</span></div>`;

  const subParts = (t: Turret) => [tc(RARITIES[t.rarity - 1]!.name), tc(t.cls), 'Turret'];

  function buildCard(c: CardRefs, i: number): void {
    const t = c.t;
    const R = t.rarity;
    const [rWord, clsWord, tail] = subParts(t);
    const stats: string[] = [];
    stats.push(
      row(t.ion ? 'ION' : 'damage', t.ion ? 'ION Damage' : 'Damage', t.dmg ? `${t.dmg}×${t.proj}` : 'No damage', damageInfo(t), t.ion ? 'ion' : ''),
      row('energy', 'Energy', String(t.energy), STAT_INFO.energy),
      row('charge', 'Charge', `${t.charge}s`, STAT_INFO.charge),
    );
    if (t.cls === 'MISSILE') stats.push(row('ammo', 'Ammo', String(t.ammo), STAT_INFO.ammo));
    if (t.cls === 'LANCE') stats.push(row('charges', 'Charges', String(t.charges), STAT_INFO.charges));
    const fx = t.fx.map((e) => {
      const x = effectText(e);
      return row(e[0], tc(x.name), x.value, x.info, 'fx');
    });
    const shell = document.createElement('div');
    shell.className = 'sv-shell shellon';
    shell.innerHTML = `
      <div class="sv-card${R >= 4 ? ' hi' : ''}" role="button" tabindex="0" aria-label="Secure ${esc(tc(t.name))}, ${esc(`${rWord} ${clsWord} ${tail}`.toLowerCase())}">
        <div class="sv-head">
          <div class="sv-head-l">
            <span class="sv-name">${esc(scramble(tc(t.name), 0))}</span>
            <div class="sv-subl">
              <div class="sv-chip rar sv-info" data-tip-title="${rWord}" data-info="${rWord} rarity (${R} of 5 stripes). Higher rarity = the same item with extra perks: more shots, more damage or another effect."><span>${rWord}</span></div>
              <div class="sv-chip sv-info" data-tip-title="${clsWord}" data-info="${esc(CLASS_INFO[t.cls] ?? '')}">${icon(t.cls, 18)}<span>${clsWord}</span></div>
              <div class="sv-chip sv-info" data-tip-title="${tail}" data-info="${esc(STAT_INFO.turret)}">${icon('turret', 18)}<span>${tail}</span></div>
            </div>
          </div>
          <div class="sv-pips" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        </div>
        <div class="sv-holo">
          <div class="noise"></div>
          <div class="scanin">${holoSvg(t.img)}</div>
          <div class="scanline"></div>
        </div>
        <div class="sv-rows">${stats.join('')}</div>
        ${fx.length ? `<div class="sv-rows fxr">${fx.join('')}</div>` : ''}
        <div class="sv-rows foot">${row('scrap', 'Value', String(t.sell), STAT_INFO.value, 'ft')}</div>
        <span class="sv-confirm">▶ TAP AGAIN TO SECURE</span>
      </div>`;
    c.wait.remove();
    c.slot.appendChild(shell);
    c.card = shell.querySelector<HTMLElement>('.sv-card')!;
    c.name = shell.querySelector<HTMLElement>('.sv-name')!;
    c.sub = [...shell.querySelectorAll<HTMLElement>('.sv-chip > span')];
    c.sub.forEach((s) => (s.textContent = scramble(s.textContent ?? '', 0)));
    c.pips = [...shell.querySelectorAll<HTMLElement>('.sv-pips i')];
    c.holo = shell.querySelector<HTMLElement>('.sv-holo')!;
    c.rows = [...shell.querySelectorAll<HTMLElement>('.sv-rows:not(.foot) .sv-row')];
    c.foot = [...shell.querySelectorAll<HTMLElement>('.sv-rows.foot .sv-row')];
    c.shown = true;
    const card = c.card;
    card.addEventListener('mouseenter', () => {
      if (lastPointer === 'mouse') setHover(i);
    });
    card.addEventListener('mouseleave', () => {
      if (lastPointer === 'mouse' && armed === i) setHover(null);
    });
    card.addEventListener('focus', () => {
      if (lastPointer === 'keyboard') setHover(i);
    });
    card.addEventListener('blur', () => {
      if (lastPointer === 'keyboard' && armed === i) setHover(null);
    });
    card.addEventListener('click', (e) => onCardClick(i, e));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        doPick(i);
      }
    });
    for (const el of card.querySelectorAll<HTMLElement>('.sv-info')) {
      el.addEventListener('mouseenter', () => {
        if (lastPointer === 'mouse' && infoReady(c, el)) showTip(el, false);
      });
      el.addEventListener('mouseleave', () => {
        if (lastPointer === 'mouse') hideTip();
      });
    }
  }
  const infoReady = (c: CardRefs, el: HTMLElement) => c.ready && el.classList.contains('sv-row') ? el.classList.contains('on') : c.ready;

  function setDecode(c: CardRefs, f: number): void {
    if (!c.name) return;
    c.name.textContent = f >= 1 ? tc(c.t.name) : scramble(tc(c.t.name), f);
    const parts = subParts(c.t);
    c.sub.forEach((s, k) => (s.textContent = f >= 1 ? parts[k]! : scramble(parts[k]!, f * 0.8)));
  }
  function setPips(c: CardRefs, n: number, pop: boolean): void {
    c.pips.forEach((p, k) => {
      p.classList.toggle('on', k < n);
      p.classList.toggle('rpop', pop && k === n - 1);
    });
  }
  function setFill(c: CardRefs, f: number): void {
    c.rows.forEach((r, j) => r.classList.toggle('on', f > j));
    c.foot.forEach((r) => r.classList.toggle('on', f >= 8));
  }
  function endScan(c: CardRefs): void {
    if (!c.holo) return;
    c.holo.querySelector('.noise')?.remove();
    c.holo.querySelector('.scanline')?.remove();
  }
  function rareRay(c: CardRefs): void {
    if (!c.holo || !c.card) return;
    const ray = document.createElement('div');
    ray.className = 'ray';
    c.holo.appendChild(ray);
    c.card.classList.remove('rare');
    void c.card.offsetWidth;
    c.card.classList.add('rare');
    window.setTimeout(() => ray.remove(), 900);
  }
  function burst(c: CardRefs): void {
    const R = c.t.rarity;
    const wrap = document.createElement('div');
    wrap.className = 'sv-fxwrap';
    wrap.innerHTML = `<div class="bloom"></div><div class="${R === 5 ? 'tear5' : 'tear4'}"></div>`;
    c.slot.appendChild(wrap);
    window.setTimeout(() => wrap.remove(), 1100);
    if (R === 5) {
      grid.classList.add('quake');
      window.setTimeout(() => grid.classList.remove('quake'), 450);
      const fl = document.createElement('div');
      fl.className = 'sv-flash';
      fl.style.background = `repeating-linear-gradient(0deg, rgba(255,255,255,.12) 0 1px, transparent 1px 3px), color-mix(in srgb, ${RARITIES[4]!.color} 28%, transparent)`;
      root.appendChild(fl);
      window.setTimeout(() => fl.remove(), 760);
    }
  }
  const follow = (c: CardRefs) => {
    if (narrow() && !userTouched) c.slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // ----- reveal timeline (mockup timing) -----
  function runSeq(): void {
    sfx.play('boot');
    const SN = 14;
    const A = offer.ammo;
    const s0 = 500;
    const span = 600;
    const ammoAt = Array.from({ length: A }, (_, k) => Math.round(((k + 1) * span) / A));
    for (let k = 1; k <= SN; k++) {
      const tk = Math.round((k * span) / SN);
      const clash = ammoAt.some((x) => Math.abs(x - tk) < 30);
      at(s0 + tk, () => {
        sTick++;
        setNum(snum, Math.round((offer.scrap * k) / SN), sTick);
        flashTile(stile, sTick);
        if (!clash) sfx.play('coin', k);
      });
    }
    ammoAt.forEach((x, k) =>
      at(s0 + x, () => {
        aTick++;
        setNum(anum, k + 1, aTick);
        flashTile(atile, aTick);
        sfx.play('shell', k + 1);
      }),
    );
    const cDone = s0 + span + 80;
    at(cDone, () => {
      finishCounters(true);
      sfx.play('lock');
    });
    let cur = cDone + 120;
    cards.forEach((c, i) => {
      const R = c.t.rarity;
      const build = R === 5 ? 800 : R === 4 ? 450 : 0;
      if (build)
        at(cur, () => {
          c.wait.classList.add(R === 5 ? 'charge5' : 'charge4');
          c.wait.firstElementChild!.textContent = R === 5 ? '> !! ANOMALOUS SIGNAL !!' : '> STRONG SIGNAL DETECTED';
          sfx.play('charge', R, build / 1000);
          follow(c);
        });
      const b = cur + build;
      at(b, () => {
        buildCard(c, i);
        follow(c);
        if (R >= 4) {
          burst(c);
          sfx.play('burst', R);
        } else sfx.play('scan');
      });
      at(b + 300, () => {
        c.ready = true;
        c.card?.classList.add('ready');
      });
      for (let d = 1; d <= 6; d++) at(b + d * 40, () => setDecode(c, d / 6));
      at(b + 260, () => endScan(c));
      const pip = R >= 4 ? 110 : 90;
      for (let r = 1; r <= R; r++)
        at(b + 240 + r * pip, () => {
          setPips(c, r, true);
          sfx.play(r === R ? 'plimp' : 'stripe', r, R);
        });
      for (let f = 1; f <= 8; f++) at(b + 260 + f * 22, () => setFill(c, f));
      if (R >= 3)
        at(b + 300 + R * pip, () => {
          rareRay(c);
          sfx.play('fanfare', R);
        });
      cur = b + 380 + (R === 5 ? 700 : R === 4 ? 420 : R === 3 ? 120 : 0);
    });
    at(cur, setAllDone);
    at(cur + 150, finale);
  }

  function setAllDone(): void {
    if (!allDone && phase === 'live') showScrapBtn(true);
    allDone = true;
  }

  /** The scrap-all button keeps its place while hidden (no layout jump on phones). */
  function showScrapBtn(on: boolean): void {
    scrapBtn.style.visibility = on ? 'visible' : 'hidden';
    scrapBtn.tabIndex = on ? 0 : -1;
    scrapBtn.classList.toggle('bt', on);
  }

  /** Jump to the end state of the reveal (tap on empty space, or before a pick). */
  function finishAll(): void {
    stopSeq();
    finishCounters(false);
    cards.forEach((c, i) => {
      if (!c.shown) buildCard(c, i);
      endScan(c);
      c.holo?.classList.add('done');
      setDecode(c, 1);
      setPips(c, c.t.rarity, false);
      setFill(c, 8);
      c.ready = true;
      c.card?.classList.add('ready');
    });
    root.querySelectorAll('.sv-fxwrap, .sv-flash').forEach((x) => x.remove());
    grid.classList.remove('quake');
    setAllDone();
  }

  function finale(): void {
    if (phase !== 'live') return;
    sfx.play('finale');
    cards.forEach((c, i) => {
      c.slot.style.animationDelay = `${(i * 0.09).toFixed(2)}s`;
      c.slot.classList.remove('fpulse');
      void c.slot.offsetWidth;
      c.slot.classList.add('fpulse');
      const wrap = document.createElement('div');
      wrap.className = 'sv-fxwrap';
      wrap.innerHTML = `<div class="fband" style="animation-delay:${(i * 0.09).toFixed(2)}s"></div>`;
      c.slot.appendChild(wrap);
      window.setTimeout(() => {
        wrap.remove();
        c.slot.classList.remove('fpulse');
      }, 1000);
    });
  }

  function setHover(i: number | null): void {
    if (phase !== 'live') return;
    armed = i !== null && cards[i]?.ready ? i : null;
    cards.forEach((c, k) => {
      c.card?.classList.toggle('hov', k === armed);
      c.card?.classList.toggle('armed', k === armed && lastPointer !== 'mouse' && lastPointer !== 'keyboard');
    });
  }

  function onCardClick(i: number, e: MouseEvent): void {
    e.stopPropagation();
    const c = cards[i]!;
    if (phase !== 'live' || !c.ready) return;
    const info = (e.target as HTMLElement).closest<HTMLElement>('.sv-info');
    if (lastPointer === 'mouse' || lastPointer === 'keyboard' || e.detail === 0) {
      // mouse / keyboard: like the mockup – one click secures, info words never pick
      if (!info) doPick(i);
      return;
    }
    // touch: first tap arms the card (and explains a tapped stat), the next tap secures it
    if (info) {
      showTip(info, true);
      if (armed !== i) {
        setHover(i);
        sfx.play('arm');
      }
      return;
    }
    hideTip();
    if (armed === i) doPick(i);
    else {
      setHover(i);
      sfx.play('arm');
    }
  }

  function powerOff(offAt: number, darkAt: number): void {
    window.setTimeout(() => {
      phase = 'off';
      screen.classList.add('off');
      sfx.play('off');
    }, offAt);
    window.setTimeout(() => {
      const dot = document.createElement('div');
      dot.className = 'sv-afterglow';
      root.appendChild(dot);
    }, darkAt);
    window.setTimeout(done, darkAt + 650);
  }

  function doPick(i: number): void {
    if (phase !== 'live' || !cards[i]?.ready) return;
    finishAll();
    hideTip();
    phase = 'confirm';
    showScrapBtn(false);
    saveRun(pick(loadRun(), offer, i));
    cards.forEach((c, k) => {
      const card = c.card!;
      card.classList.remove('rare', 'armed', 'hov');
      card.classList.add(k === i ? 'sel' : 'drop');
      if (k === i) {
        card.classList.add('pick');
        const st = document.createElement('div');
        st.className = 'sv-stamp';
        st.innerHTML = '<span class="g">SECURED</span>';
        card.appendChild(st);
      }
    });
    sfx.play('select');
    powerOff(260, 760);
  }

  function doScrapAll(): void {
    if (phase !== 'live' || !allDone) return;
    stopSeq();
    hideTip();
    phase = 'confirm';
    showScrapBtn(false);
    if (narrow()) root.scrollTo({ top: 0, behavior: 'smooth' });
    saveRun(scrapAll(loadRun(), offer));
    cards.forEach((c) => {
      c.card?.classList.remove('rare', 'armed', 'hov');
      c.card?.classList.add('drop');
    });
    sfx.play('select');
    const n = 6;
    for (let k = 1; k <= n; k++)
      window.setTimeout(() => {
        sTick++;
        setNum(snum, offer.scrap + Math.round((sum * k) / n), sTick);
        flashTile(stile, sTick);
        sfx.play('coin', 8 + k);
      }, k * 40);
    powerOff(420, 920);
  }

  // ----- input -----
  root.addEventListener('pointerdown', (e) => {
    lastPointer = e.pointerType || 'mouse';
    if (e.pointerType !== 'mouse') userTouched = true;
    sfx.unlock();
  });
  root.addEventListener('wheel', () => (userTouched = true), { passive: true });
  root.addEventListener('keydown', () => {
    lastPointer = 'keyboard';
    sfx.unlock();
  });
  scrapBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    doScrapAll();
  });
  root.addEventListener('click', (e) => {
    // tap on empty space: skip the rest of the reveal, let go of an armed card, close the info chip
    if ((e.target as HTMLElement).closest('button, .sv-card')) return;
    hideTip();
    if (phase !== 'live') return;
    if (!allDone) {
      finishAll();
      finale();
    } else setHover(null);
  });

  runSeq();
}
