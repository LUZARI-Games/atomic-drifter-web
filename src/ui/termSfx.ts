// Terminal page sounds (New Run, Ship Upgrades, Salvage boot + options): lo-fi "Pip-Boy speaker" blips from the owner's
// mockups. Sound ids = `term_<name>` (src/data/sounds.json); the owner's file public/sfx/term_<name>.ogg wins.
import { playFile } from './sfxFiles';

export type TermSound = 'hover' | 'click' | 'add' | 'sub' | 'confirm' | 'tick' | 'done' | 'error' | 'boot' | 'off';

export class TermSfx {
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
  setOn(on: boolean): void {
    this.on = on;
    if (!on && this.ac && this.ac.state === 'running') void this.ac.suspend();
  }
  /** Create / resume audio from a tap (browser rule); resolves once it runs. */
  unlock(): Promise<void> {
    const ac = this.audio();
    return ac && ac.state !== 'running' ? ac.resume().catch(() => undefined) : Promise.resolve();
  }
  private audio(): AudioContext | null {
    if (!this.on) return null;
    if (!this.ac) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const ac = new AC();
      this.ac = ac;
      this.master = ac.createGain();
      this.master.gain.value = 0.6 * this.vol * 1.6;
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
      this.master.connect(shaper).connect(hp).connect(lp).connect(ac.destination);
    }
    if (this.ac.state === 'suspended') void this.ac.resume();
    return this.ac;
  }
  private tone(freq: number, dur: number, o: { type?: OscillatorType; vol?: number; slide?: number; delay?: number } = {}) {
    const ac = this.audio();
    if (!ac || !this.master) return;
    const t = ac.currentTime + (o.delay ?? 0);
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = o.type ?? 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol ?? 0.06, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }
  private noise(dur: number, vol: number, o: { bp?: number; q?: number; delay?: number } = {}) {
    const ac = this.audio();
    if (!ac || !this.master) return;
    const t = ac.currentTime + (o.delay ?? 0);
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let k = 0; k < len; k++) d[k] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = o.bp ?? 1500;
    f.Q.value = o.q ?? 1;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
  play(name: TermSound, a = 0, b = 1): void {
    if (playFile(`term_${name}`)) return;
    switch (name) {
      case 'hover':
        this.noise(0.012, 0.06, { bp: 2600, q: 2 });
        this.tone(1150, 0.018, { vol: 0.012 });
        break;
      case 'click':
        this.noise(0.02, 0.1, { bp: 1800, q: 1.5 });
        this.tone(70, 0.05, { type: 'sine', vol: 0.08 });
        break;
      case 'add':
        this.noise(0.012, 0.08, { bp: 3000, q: 2 });
        this.tone(880, 0.045, { vol: 0.04, delay: 0.008 });
        break;
      case 'sub':
        this.noise(0.012, 0.08, { bp: 2100, q: 2 });
        this.tone(560, 0.05, { vol: 0.04, delay: 0.008 });
        break;
      case 'confirm':
        this.noise(0.06, 0.16, { bp: 900, q: 1 });
        this.tone(55, 0.2, { type: 'sine', vol: 0.12 });
        this.tone(180, 0.45, { type: 'sawtooth', vol: 0.025, slide: 900, delay: 0.05 });
        break;
      case 'tick': // installing a level: relay clunk + a note rising with the level (a) + crackle (b)
        this.noise(0.025, 0.14, { bp: 2000, q: 1.2 });
        this.tone(80, 0.07, { type: 'sine', vol: 0.1 });
        this.tone(Math.min(600 * Math.pow(2, a / 12), 1600), 0.06, { vol: 0.035, delay: 0.012 });
        for (let k = 0; k < 2 + b; k++) this.noise(0.004, 0.09, { bp: 4000, q: 3, delay: 0.02 + Math.random() * 0.09 });
        break;
      case 'done':
        for (const [fq, d] of [[1046, 0], [1046, 0.09], [1568, 0.18]] as const) this.tone(fq, 0.07, { vol: 0.045, delay: d });
        this.noise(0.35, 0.04, { bp: 1500, q: 0.6, delay: 0.25 });
        this.tone(523, 0.5, { type: 'triangle', vol: 0.035, delay: 0.27 });
        break;
      case 'error':
        this.tone(110, 0.13, { vol: 0.07 });
        this.tone(117, 0.13, { vol: 0.03 });
        this.tone(110, 0.18, { vol: 0.07, delay: 0.16 });
        this.tone(117, 0.18, { vol: 0.03, delay: 0.16 });
        this.noise(0.32, 0.05, { bp: 1200, q: 0.5 });
        break;
      case 'boot': // tube warm-up thump + rising whine
        this.tone(60, 0.22, { type: 'sine', vol: 0.12 });
        this.noise(0.05, 0.14, { bp: 900, q: 1 });
        this.tone(140, 0.45, { type: 'sawtooth', vol: 0.02, slide: 1500, delay: 0.04 });
        break;
      case 'off':
        this.tone(1300, 0.4, { type: 'sawtooth', vol: 0.025, slide: 60 });
        this.noise(0.08, 0.12, { bp: 700, q: 1 });
        this.tone(48, 0.18, { type: 'sine', vol: 0.1, delay: 0.25 });
        break;
    }
  }
}
