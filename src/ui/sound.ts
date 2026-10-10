// Game sounds. Every sound has an id (catalogue: src/data/sounds.json, page /sounds/). If the owner put a file
// public/sfx/<id>.ogg|mp3|wav, that file plays; otherwise a simple placeholder is synthesized with Web Audio.
// Ambience: engine hum (loop), rare soft wind gusts, a quiet hover hum while vehicles are docked.
// Browsers only allow sound after the first tap/click – it starts by itself then.
import type { MenuItem } from './menu';
import { loopFile, playFile } from './sfxFiles';
import { loadSoundPrefs, SOUND_ON_KEY, SOUND_VOL_KEY } from './soundPrefs';

const VOLUMES = [0.25, 0.5, 0.75, 1];
const write = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* not remembered – still works for this page */
  }
};

type Synth = (s: Sound) => void;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private loops: HTMLAudioElement[] = [];
  private hoverGain: GainNode | null = null;
  private hoverLoop: HTMLAudioElement | null = null;
  private vehicles = false;
  on = loadSoundPrefs().on;
  volume = loadSoundPrefs().volume;

  constructor(private readonly withAmbience = true) {
    const unlock = () => {
      this.start();
      if (this.ctx?.state === 'running') for (const e of ['pointerdown', 'keydown']) window.removeEventListener(e, unlock);
    };
    for (const e of ['pointerdown', 'keydown']) window.addEventListener(e, unlock);
  }

  /** Play a sound by its id (own file first, else the placeholder). Unknown ids are ignored. */
  play(id: string): void {
    if (playFile(id)) return;
    const synth = SYNTHS[id];
    if (synth && this.ready()) synth(this);
  }

  /** Docked vehicles hum quietly (hover drives). */
  setVehicles(on: boolean): void {
    this.vehicles = on;
    if (this.hoverGain && this.ctx) this.hoverGain.gain.setTargetAtTime(on ? 0.018 : 0, this.ctx.currentTime, 0.4);
    if (this.hoverLoop) {
      if (on && this.on) void this.hoverLoop.play().catch(() => undefined);
      else this.hoverLoop.pause();
    }
  }

  // ---- kept for the ShipSounds interface (src/render/ShipScene.ts) ----
  select(): void { this.play('select'); }
  deselect(): void { this.play('deselect'); }
  send(): void { this.play('send'); }
  door(open: boolean): void { this.play(open ? 'door_open' : 'door_close'); }
  step(): void { this.play('step'); }
  hit(): void { this.play('hit'); }
  die(): void { this.play('enemy_die'); }
  heal(): void { this.play('heal'); }

  /** Create the audio graph (after a user gesture) and start the ambience. */
  private start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      for (const l of this.loops) void l.play().catch(() => undefined);
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.applyVolume();
    // 2 s of white noise, reused by gusts, steps, doors, sparks
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (this.withAmbience) this.ambience();
  }

  private applyVolume(): void {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.on ? this.volume * 0.6 : 0, this.ctx.currentTime, 0.05);
    for (const l of this.loops) l.volume = this.on ? this.volume * 0.5 : 0;
  }

  /** Engine hum (own loop file or two detuned low saws) + hover hum + rare soft wind gusts. */
  private ambience(): void {
    const ctx = this.ctx!;
    const own = loopFile('engine_hum');
    if (own) {
      this.loops.push(own);
      this.applyVolume();
      void own.play().catch(() => undefined);
    } else {
      const hum = ctx.createGain();
      hum.gain.value = 0.06;
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 160;
      low.connect(hum).connect(this.master!);
      for (const f of [52, 52.6, 104.3]) this.osc('sawtooth', f, low);
      this.lfo(hum.gain, 1.7, 0.012); // throbs with the atomic drives
    }
    // hover drives of docked vehicles: own loop file, else a soft high hum
    this.hoverLoop = loopFile('hover_hum');
    if (this.hoverLoop) this.loops.push(this.hoverLoop);
    this.hoverGain = ctx.createGain();
    this.hoverGain.gain.value = 0;
    const hb = ctx.createBiquadFilter();
    hb.type = 'bandpass';
    hb.frequency.value = 330;
    hb.Q.value = 4;
    hb.connect(this.hoverGain).connect(this.master!);
    for (const f of [329, 331.5]) this.osc('triangle', f, hb);
    if (!this.hoverLoop) this.lfo(this.hoverGain.gain, 0.6, 0.004);
    else this.hoverGain.disconnect();
    this.setVehicles(this.vehicles);
    // wind: silence most of the time, a soft gust every 20–40 s
    const gust = () => {
      this.play('wind_gust');
      window.setTimeout(gust, 20000 + Math.random() * 20000);
    };
    window.setTimeout(gust, 8000 + Math.random() * 10000);
  }

  private osc(type: OscillatorType, f: number, to: AudioNode): void {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.connect(to);
    o.start();
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

  /** Short tone with a quick fade. */
  blip(freq: number, at: number, dur: number, vol: number, type: OscillatorType = 'square', slide?: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Filtered noise burst, filter sweeping from f0 to f1 (attack in seconds for soft swells). */
  hiss(f0: number, f1: number, dur: number, vol: number, q = 1, at = 0, attack = 0.01): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  setOn(on: boolean): void {
    this.on = on;
    write(SOUND_ON_KEY, on ? '1' : '0');
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
          write(SOUND_VOL_KEY, String(this.volume));
          this.applyVolume();
          this.send(); // hear the new level
          return vol();
        },
      },
    ];
  }
}

/** Placeholder sounds by id (ids + descriptions: src/data/sounds.json). */
export const SYNTHS: Record<string, Synth> = {
  // crew orders
  select: (s) => s.blip(1320, 0, 0.05, 0.06),
  deselect: (s) => s.blip(660, 0, 0.05, 0.06),
  send: (s) => {
    s.blip(880, 0, 0.05, 0.07);
    s.blip(1320, 0.06, 0.07, 0.07);
  },
  order_refused: (s) => {
    s.blip(220, 0, 0.09, 0.07);
    s.blip(185, 0.1, 0.14, 0.07);
  },
  step: (s) => {
    const p = 0.85 + Math.random() * 0.3;
    s.hiss(2600 * p, 1400 * p, 0.05, 0.06, 4);
    s.blip(170 * p, 0, 0.05, 0.05, 'triangle');
  },
  door_open: (s) => {
    s.hiss(700, 1800, 0.45, 0.18, 2);
    s.blip(90, 0.42, 0.12, 0.25, 'triangle');
  },
  door_close: (s) => {
    s.hiss(1800, 700, 0.45, 0.18, 2);
    s.blip(75, 0.42, 0.12, 0.25, 'triangle');
  },
  vehicle_enter: (s) => {
    s.blip(140, 0, 0.12, 0.12, 'triangle');
    s.hiss(500, 1200, 0.25, 0.06, 2, 0.05);
  },
  vehicle_exit: (s) => {
    s.hiss(1200, 500, 0.25, 0.06, 2);
    s.blip(120, 0.18, 0.12, 0.12, 'triangle');
  },
  // moods
  mood_chat: (s) => [0, 0.11, 0.22].forEach((t, i) => s.blip(520 + i * 70 + Math.random() * 40, t, 0.07, 0.035, 'triangle')),
  mood_wary: (s) => s.blip(300, 0, 0.3, 0.04, 'triangle', 240),
  mood_bored: (s) => s.hiss(900, 300, 0.7, 0.03, 0.8, 0, 0.25),
  // combat
  boarder_alarm: (s) => [0, 0.32, 0.64].forEach((t) => s.blip(620, t, 0.26, 0.05, 'sawtooth', 860)),
  hit: (s) => {
    s.hiss(900, 200, 0.12, 0.22, 1);
    s.blip(70 + Math.random() * 20, 0, 0.14, 0.3, 'triangle');
  },
  enemy_die: (s) => s.blip(220, 0, 0.8, 0.1, 'sawtooth', 40),
  crew_ko: (s) => {
    s.blip(330, 0, 0.5, 0.08, 'triangle', 90);
    s.blip(60, 0.4, 0.2, 0.2, 'triangle');
  },
  crew_wake: (s) => {
    s.blip(392, 0, 0.12, 0.05, 'triangle');
    s.blip(523, 0.12, 0.2, 0.05, 'triangle');
  },
  fight_won: (s) => [523, 659, 784, 1046].forEach((f, i) => s.blip(f, i * 0.1, i === 3 ? 0.4 : 0.1, 0.05, 'square')),
  heal: (s) => {
    s.blip(660, 0, 0.09, 0.05, 'sine');
    s.blip(990, 0.08, 0.14, 0.05, 'sine');
  },
  // systems
  sabotage_hit: (s) => {
    s.blip(180 + Math.random() * 60, 0, 0.06, 0.12, 'square');
    s.hiss(3000, 1500, 0.08, 0.08, 3);
  },
  repair_weld: (s) => s.hiss(4200, 3000 + Math.random() * 800, 0.18, 0.04, 6),
  system_wrecked: (s) => {
    s.hiss(1200, 150, 0.9, 0.18, 0.7);
    s.blip(90, 0, 0.6, 0.15, 'sawtooth', 35);
  },
  system_repaired: (s) => {
    s.blip(440, 0, 0.08, 0.05);
    s.blip(880, 0.09, 0.16, 0.05);
  },
  // weapons
  turret_on: (s) => {
    s.blip(180, 0, 0.35, 0.06, 'sawtooth', 520);
    s.blip(880, 0.36, 0.06, 0.05);
  },
  turret_off: (s) => s.blip(520, 0, 0.4, 0.05, 'sawtooth', 140),
  turret_fire: (s) => {
    s.hiss(2400, 600, 0.07, 0.16, 0.8);
    s.blip(95 + Math.random() * 25, 0, 0.06, 0.18, 'square', 50);
  },
  turret_hit: (s) => {
    s.hiss(1400, 200, 0.18, 0.12, 0.9);
    s.blip(70, 0, 0.12, 0.15, 'triangle', 40);
  },
  foe_arrives: (s) => {
    s.blip(90, 0, 1.2, 0.12, 'sawtooth', 140);
    [0, 0.45, 0.9].forEach((t) => s.blip(440, t, 0.3, 0.05, 'square', 660));
  },
  foe_lock: (s) => [0, 0.12, 0.24, 0.36].forEach((t) => s.blip(1250, t, 0.07, 0.05, 'square')),
  pause_on: (s) => {
    s.blip(880, 0, 0.5, 0.07, 'sine', 110);
    s.hiss(3000, 400, 0.4, 0.05, 0.4);
  },
  pause_off: (s) => s.blip(110, 0, 0.35, 0.07, 'sine', 880),
  // ambience (engine / hover hum loop in the game; these are 2 s previews for the /sounds/ page)
  engine_hum: (s) => [52, 52.6, 104.3].forEach((f) => s.blip(f, 0, 2, 0.06, 'sawtooth')),
  hover_hum: (s) => [329, 331.5].forEach((f) => s.blip(f, 0, 2, 0.02, 'triangle')),
  wind_gust: (s) => s.hiss(260 + Math.random() * 120, 520, 3.5 + Math.random() * 2, 0.025, 0.7, 0, 1.4),
};
