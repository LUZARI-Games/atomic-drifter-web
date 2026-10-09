// Terminal screens (New Run, Ship Upgrades, Salvage): shared POWER ON / REBOOT boot screen with OPTIONS
// (SOUND, GLASS, BLOOM 0–200 %, FULLSCREEN), as in the owner's mockups. Options are remembered per browser and apply
// to every terminal page: --bloom (glow multiplier) + bloom post filter, glass layer (rolling band, grain, glare).
import { toggleFullscreen } from './menu';

const KEYS = { sound: 'adw.sound', glass: 'adw.glass', bloom: 'adw.bloom' };
const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* not remembered */
  }
};

export interface TerminalOptions {
  sound: boolean; // same switch as the game's SOUND: ON/OFF
  glass: boolean;
  bloom: number; // 0…200 (%)
}

export function loadOptions(): TerminalOptions {
  const b = Number(read(KEYS.bloom));
  return {
    sound: read(KEYS.sound) !== '0',
    glass: read(KEYS.glass) !== '0',
    bloom: Number.isFinite(b) && read(KEYS.bloom) !== null ? Math.max(0, Math.min(200, b)) : 100,
  };
}

export function saveOptions(o: TerminalOptions): void {
  write(KEYS.sound, o.sound ? '1' : '0');
  write(KEYS.glass, o.glass ? '1' : '0');
  write(KEYS.bloom, String(o.bloom));
}

const POWER_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v8"/><path d="M6.3 7.2a8 8 0 1 0 11.4 0"/></svg>';

/**
 * Apply the options to a terminal page: `--bloom` on <html> (glow radii use calc(Npx * var(--bloom))),
 * class `glass-on` on <html> (pages show their glass layer only then), and the bloom post filter on `target`
 * (SVG blur, stdDev 3 + 5v, gain 0.75v, screen-blended; v = bloom / 100; none at 0).
 */
export function applyOptions(o: TerminalOptions, target: HTMLElement): void {
  const v = o.bloom / 100;
  document.documentElement.style.setProperty('--bloom', String(v));
  document.documentElement.classList.toggle('glass-on', o.glass);
  let svg = document.getElementById('adw-bloom-svg') as Element | null;
  if (!svg) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg = s;
    s.id = 'adw-bloom-svg';
    s.setAttribute('width', '0');
    s.setAttribute('height', '0');
    s.setAttribute('style', 'position:absolute');
    s.innerHTML = `<filter id="adw-bloom" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="b"/>
      <feComponentTransfer in="b" result="g"><feFuncR type="linear" slope="0.75"/><feFuncG type="linear" slope="0.75"/><feFuncB type="linear" slope="0.75"/></feComponentTransfer>
      <feBlend in="SourceGraphic" in2="g" mode="screen"/></filter>`;
    document.body.appendChild(s);
  }
  svg.querySelector('feGaussianBlur')!.setAttribute('stdDeviation', String(3 + v * 5));
  svg.querySelectorAll('feFuncR,feFuncG,feFuncB').forEach((f) => f.setAttribute('slope', String(v * 0.75)));
  target.style.filter = v > 0 ? 'url(#adw-bloom)' : '';
}

export interface BootScreen {
  /** Show the boot screen (label POWER ON before the first boot, REBOOT after). */
  show(label?: 'POWER ON' | 'REBOOT'): void;
  hide(): void;
  options(): TerminalOptions;
  /** Extra controls (e.g. Salvage line-ups) go into this box, under the standard options. */
  extra: HTMLElement;
}

/**
 * The boot screen: big POWER ON / REBOOT button, OPTIONS caption, SOUND + GLASS toggles, BLOOM slider, FULLSCREEN,
 * then `extra`. `onPower` runs when the button is pressed (the page boots its screen with the CRT-on animation).
 * `onSound(on)` lets the page mute / unmute its own sounds.
 */
export function mountBootScreen(root: HTMLElement, filterTarget: HTMLElement, onPower: () => void, onSound?: (on: boolean) => void): BootScreen {
  let opts = loadOptions();
  applyOptions(opts, filterTarget);
  const el = document.createElement('div');
  el.className = 'boot-screen';
  el.innerHTML = `
    <button type="button" class="boot-power g" data-ref="power">${POWER_ICON}<span data-ref="label">POWER ON</span></button>
    <div class="boot-cap">OPTIONS</div>
    <div class="boot-row">
      <button type="button" class="boot-tog" data-ref="sound"></button>
      <button type="button" class="boot-tog" data-ref="glass"></button>
      <button type="button" class="boot-tog dim" data-ref="full">FULLSCREEN</button>
    </div>
    <label class="boot-bloom"><span>BLOOM</span><input type="range" min="0" max="200" step="10" data-ref="bloom"><b data-ref="bloomv"></b></label>
    <div class="boot-extra" data-ref="extra"></div>`;
  root.appendChild(el);
  const $ = (r: string) => el.querySelector(`[data-ref="${r}"]`) as HTMLElement;
  const bloom = $('bloom') as HTMLInputElement;
  const paint = () => {
    $('sound').textContent = `SOUND: ${opts.sound ? 'ON' : 'OFF'}`;
    $('glass').textContent = `GLASS: ${opts.glass ? 'ON' : 'OFF'}`;
    $('sound').classList.toggle('on', opts.sound);
    $('glass').classList.toggle('on', opts.glass);
    bloom.value = String(opts.bloom);
    $('bloomv').textContent = `${opts.bloom} %`;
  };
  const set = (patch: Partial<TerminalOptions>) => {
    opts = { ...opts, ...patch };
    saveOptions(opts);
    applyOptions(opts, filterTarget);
    paint();
  };
  $('sound').addEventListener('click', () => {
    set({ sound: !opts.sound });
    onSound?.(opts.sound);
  });
  $('glass').addEventListener('click', () => set({ glass: !opts.glass }));
  $('full').addEventListener('click', () => void toggleFullscreen());
  if (!document.fullscreenEnabled) $('full').remove();
  bloom.addEventListener('input', () => set({ bloom: Number(bloom.value) }));
  $('power').addEventListener('click', () => onPower());
  paint();
  return {
    show: (label = 'POWER ON') => {
      $('label').textContent = label;
      el.classList.remove('hidden');
    },
    hide: () => el.classList.add('hidden'),
    options: () => opts,
    extra: $('extra'),
  };
}
