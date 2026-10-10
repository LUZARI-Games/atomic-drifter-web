// Salvage page sounds (from the owner's mockup). Sound ids: salvage_<name>, boot/off = term_boot/term_off
// (src/data/sounds.json); the owner's file public/sfx/<id>.ogg wins.
import { playFile } from './sfxFiles';

// ---------- sound (Web Audio, made in code; same on/off + volume as the game: adw.sound / adw.volume) ----------
export class SalvageSfx {
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
  /** SOUND option on the boot screen. */
  setOn(on: boolean): void {
    this.on = on;
    if (on) void this.unlock();
  }
  /** Browsers allow audio only after a tap: called on every pointerdown. Resolves once audio runs (or never will). */
  unlock(): Promise<void> {
    if (!this.on) return Promise.resolve();
    if (!this.ac) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return Promise.resolve();
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
    if (this.ac.state === 'suspended') return this.ac.resume().catch(() => undefined);
    return Promise.resolve();
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
    if (playFile(name === 'boot' || name === 'off' ? `term_${name}` : `salvage_${name}`)) return;
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
