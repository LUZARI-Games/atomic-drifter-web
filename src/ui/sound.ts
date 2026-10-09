// Sound effects, made in code with the browser's Web Audio (no sound files): retro blips for the terminal,
// metal footsteps, sliding doors, and a constant engine hum + wind while flying.
// Browsers only allow sound after the first tap/click – it starts by itself then.
import type { MenuItem } from './menu';

const ON_KEY = 'adw.sound';
const VOL_KEY = 'adw.volume';
const VOLUMES = [0.25, 0.5, 0.75, 1];

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* not remembered – still works for this page */
  }
};

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  on = read(ON_KEY) !== '0';
  volume = Number(read(VOL_KEY) ?? 0.5) || 0.5;

  constructor() {
    const unlock = () => {
      this.start();
      if (this.ctx?.state === 'running') for (const e of ['pointerdown', 'keydown']) window.removeEventListener(e, unlock);
    };
    for (const e of ['pointerdown', 'keydown']) window.addEventListener(e, unlock);
  }

  /** Create the audio graph (after a user gesture) and start the ambience. */
  private start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.applyVolume();
    // 2 s of white noise, reused by wind, steps and doors
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.ambience();
  }

  private applyVolume(): void {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.on ? this.volume * 0.6 : 0, this.ctx.currentTime, 0.05);
  }

  /** Engine hum (two detuned low saws, throbbing with the propellers) + wind (noise swelling slowly). */
  private ambience(): void {
    const ctx = this.ctx!;
    const hum = ctx.createGain();
    hum.gain.value = 0.07;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 160;
    low.connect(hum).connect(this.master!);
    for (const f of [52, 52.6, 104.3]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(low);
      o.start();
    }
    this.lfo(hum.gain, 3.1, 0.02); // propeller throb

    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.7;
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    wind.connect(band).connect(wg).connect(this.master!);
    wind.start();
    this.lfo(wg.gain, 0.09, 0.035); // gusts
    this.lfo(band.frequency, 0.05, 160);
  }

  private lfo(param: AudioParam, hz: number, depth: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start();
  }

  private ready(): AudioContext | null {
    return this.on && this.ctx && this.ctx.state === 'running' ? this.ctx : null;
  }

  /** Short tone with a quick fade (terminal blips). */
  private blip(freq: number, at: number, len: number, vol: number, type: OscillatorType = 'square'): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + len + 0.02);
  }

  /** Filtered noise burst, filter sweeping from f0 to f1. */
  private hiss(f0: number, f1: number, len: number, vol: number, q = 1.5): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.04, len / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 1.5);
    src.stop(t + len + 0.05);
  }

  select(): void {
    this.blip(1320, 0, 0.05, 0.08);
  }
  deselect(): void {
    this.blip(660, 0, 0.05, 0.06);
  }
  send(): void {
    this.blip(880, 0, 0.05, 0.07);
    this.blip(1320, 0.06, 0.07, 0.07);
  }
  /** Sliding door: hiss + a dull clunk when it hits the end. */
  door(open: boolean): void {
    this.hiss(open ? 700 : 1800, open ? 1800 : 700, 0.45, 0.18, 2);
    this.blip(open ? 90 : 75, 0.42, 0.12, 0.25, 'triangle');
  }
  /** Boot on a metal deck: short click + a faint ring, slightly different each time. */
  step(): void {
    const p = 0.85 + Math.random() * 0.3;
    this.hiss(2600 * p, 1400 * p, 0.05, 0.06, 4);
    this.blip(170 * p, 0, 0.05, 0.05, 'triangle');
  }

  setOn(on: boolean): void {
    this.on = on;
    write(ON_KEY, on ? '1' : '0');
    this.applyVolume();
  }

  /** Menu entries: SOUND ON/OFF and VOLUME (cycles 25 / 50 / 75 / 100 %). */
  menuItems(): MenuItem[] {
    const vol = () => `VOLUME: ${Math.round(this.volume * 100)}%`;
    return [
      { label: `SOUND: ${this.on ? 'ON' : 'OFF'}`, onClick: () => (this.setOn(!this.on), `SOUND: ${this.on ? 'ON' : 'OFF'}`) },
      {
        label: vol(),
        onClick: () => {
          const i = VOLUMES.findIndex((v) => Math.abs(v - this.volume) < 0.01);
          this.volume = VOLUMES[(i + 1) % VOLUMES.length]!;
          write(VOL_KEY, String(this.volume));
          this.applyVolume();
          this.send(); // hear the new level
          return vol();
        },
      },
    ];
  }
}
