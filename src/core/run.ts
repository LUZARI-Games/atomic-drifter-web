// One run (campaign): names, difficulty, modifiers, resources, system levels, reactor, owned turrets.
// Shared by the New Run / Ship Upgrades / Salvage screens and the game HUD. Pure data + rules (engine-neutral);
// saving/loading lives in src/ui/runStore.ts.
import START from '../data/run_start.json';
import type { ShipStatus } from './status';

export interface RunState {
  version: 1;
  shipName: string;
  captainName: string;
  difficulty: string; // id from the New Run data
  modifiers: string[]; // active bonus modifier ids
  scrap: number;
  ammo: number;
  ammoMax: number;
  hull: number;
  hullMax: number;
  evasion: number; // 0…1
  /** System id (systems.json keys: engine, shields, …) -> installed level (main systems: level = power). */
  systems: Record<string, number>;
  reactor: number; // reactor bars
  turrets: string[]; // owned turret item ids (salvage)
  briefed: boolean; // the run's intro log was shown (core/story.ts)
}

export function defaultRun(): RunState {
  return {
    version: 1,
    shipName: 'FRONTIER',
    captainName: '',
    difficulty: 'normal',
    modifiers: [],
    scrap: START.scrap,
    ammo: START.ammo,
    ammoMax: START.ammo_max,
    hull: START.hull,
    hullMax: START.hull_max,
    evasion: START.evasion,
    systems: {},
    reactor: 0,
    turrets: [],
    briefed: false,
  };
}

/** Accepts whatever was saved (older / damaged saves fall back to defaults field by field). */
export function parseRun(raw: unknown): RunState {
  const d = defaultRun();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Partial<RunState>;
  const num = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
  const str = (v: unknown, f: string) => (typeof v === 'string' ? v : f);
  return {
    version: 1,
    shipName: str(o.shipName, d.shipName),
    captainName: str(o.captainName, d.captainName),
    difficulty: str(o.difficulty, d.difficulty),
    modifiers: Array.isArray(o.modifiers) ? o.modifiers.filter((m): m is string => typeof m === 'string') : d.modifiers,
    scrap: Math.max(0, num(o.scrap, d.scrap)),
    ammo: Math.max(0, num(o.ammo, d.ammo)),
    ammoMax: num(o.ammoMax, d.ammoMax),
    hull: num(o.hull, d.hull),
    hullMax: num(o.hullMax, d.hullMax),
    evasion: num(o.evasion, d.evasion),
    systems: o.systems && typeof o.systems === 'object' ? Object.fromEntries(Object.entries(o.systems).filter(([, v]) => typeof v === 'number')) : {},
    reactor: num(o.reactor, d.reactor),
    turrets: Array.isArray(o.turrets) ? o.turrets.filter((t): t is string => typeof t === 'string') : [],
    briefed: o.briefed === true,
  };
}

/** HUD status from the run: shield layers follow the shields level (FTL: every 2 levels = 1 layer). */
export function statusFromRun(run: RunState): ShipStatus {
  const shieldLevel = run.systems.shields ?? 2;
  return {
    hull: run.hull,
    hullMax: run.hullMax,
    shieldLayers: Math.floor(shieldLevel / 2),
    shieldMax: 4,
    shieldCharge: 0,
    evasion: run.evasion,
    ammo: run.ammo,
    ammoMax: run.ammoMax,
    scrap: run.scrap,
  };
}
