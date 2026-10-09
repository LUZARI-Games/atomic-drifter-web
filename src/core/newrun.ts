// New Run screen rules: names, difficulty, bonus modifiers, start check, and the run they produce.
// Pure functions, engine-neutral (no DOM). Content lives in src/data/new_run.json.
import DATA from '../data/new_run.json';
import { defaultRun, type RunState } from './run';

export interface Difficulty {
  id: string;
  label: string;
  text: string;
  locked: boolean;
}

/** What a modifier changes at the start of a run (all optional; unknown keys are ignored). */
export interface ModifierEffect {
  hull_max?: number; // + max hull (and current hull)
  ammo?: number; // + missiles (and missile capacity)
  scrap?: number;
  reactor?: number; // + reactor bars
  turret?: string; // extra owned turret item id
  crew?: number; // extra crew – RunState has no crew list yet, so not applied
}

export interface Modifier {
  id: string;
  icon: string;
  name: string;
  text: string;
  locked: boolean;
  effect: ModifierEffect;
}

export interface NewRunData {
  name_max_length: number;
  max_active_modifiers: number;
  default_ship_name: string;
  ship_names: string[];
  default_difficulty: string;
  difficulties: Difficulty[];
  modifiers: Modifier[];
}

export const NEW_RUN: NewRunData = DATA as NewRunData;

export interface NewRunSettings {
  shipName: string;
  captainName: string;
  difficulty: string;
  modifiers: string[]; // active modifier ids, in the order they were switched on
  nameIdx: number; // position in the ship name list (reroll)
}

/** Why a tap was refused (the screen shows ACCESS DENIED). */
export type Denied = 'locked' | 'limit' | 'unknown';

export interface Outcome {
  settings: NewRunSettings;
  denied?: Denied;
}

export function defaultSettings(data: NewRunData = NEW_RUN): NewRunSettings {
  return { shipName: data.default_ship_name, captainName: '', difficulty: data.default_difficulty, modifiers: [], nameIdx: 0 };
}

/** Text as typed: forced to UPPERCASE, cut to the max length (spaces kept so typing feels normal). */
export function sanitizeName(raw: string, data: NewRunData = NEW_RUN): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').toUpperCase().slice(0, data.name_max_length);
}

/** Final name: sanitized, trimmed, inner runs of spaces collapsed. */
export function cleanName(raw: string, data: NewRunData = NEW_RUN): string {
  return sanitizeName(raw, data).trim().replace(/\s+/g, ' ');
}

/** Reroll: next name from the list (cycles; the first press after the start gives the 2nd name). */
export function nextShipName(s: NewRunSettings, data: NewRunData = NEW_RUN): NewRunSettings {
  const n = data.ship_names.length;
  if (n === 0) return s;
  const nameIdx = (s.nameIdx + 1) % n;
  return { ...s, nameIdx, shipName: data.ship_names[nameIdx]! };
}

export function difficultyIndex(id: string, data: NewRunData = NEW_RUN): number {
  return data.difficulties.findIndex((d) => d.id === id);
}

export function selectDifficulty(s: NewRunSettings, id: string, data: NewRunData = NEW_RUN): Outcome {
  const d = data.difficulties.find((x) => x.id === id);
  if (!d) return { settings: s, denied: 'unknown' };
  if (d.locked) return { settings: s, denied: 'locked' };
  return { settings: { ...s, difficulty: id } };
}

/** Switch a modifier on/off. Locked ones and a switch-on past the limit are refused. */
export function toggleModifier(s: NewRunSettings, id: string, data: NewRunData = NEW_RUN): Outcome {
  const m = data.modifiers.find((x) => x.id === id);
  if (!m) return { settings: s, denied: 'unknown' };
  if (m.locked) return { settings: s, denied: 'locked' };
  if (s.modifiers.includes(id)) return { settings: { ...s, modifiers: s.modifiers.filter((x) => x !== id) } };
  if (s.modifiers.length >= data.max_active_modifiers) return { settings: s, denied: 'limit' };
  return { settings: { ...s, modifiers: [...s.modifiers, id] } };
}

export type StartBlock = 'no_ship_name' | 'no_captain_name' | null;

/** Can the run start? Reason in priority order: ship name first, then captain. */
export function startBlock(s: NewRunSettings, data: NewRunData = NEW_RUN): StartBlock {
  if (!cleanName(s.shipName, data)) return 'no_ship_name';
  if (!cleanName(s.captainName, data)) return 'no_captain_name';
  return null;
}

export function canStart(s: NewRunSettings, data: NewRunData = NEW_RUN): boolean {
  return startBlock(s, data) === null;
}

/** Label of the START button for the current settings. */
export function startLabel(s: NewRunSettings, data: NewRunData = NEW_RUN): string {
  const b = startBlock(s, data);
  return b === 'no_ship_name' ? 'NAME YOUR SHIP' : b === 'no_captain_name' ? 'ENTER CAPTAIN' : '[ENTER] START RUN';
}

/** The new run: default start values + names, difficulty and every active modifier's effect. */
export function buildRun(s: NewRunSettings, data: NewRunData = NEW_RUN): RunState {
  const run = defaultRun();
  run.shipName = cleanName(s.shipName, data);
  run.captainName = cleanName(s.captainName, data);
  const diff = data.difficulties.find((d) => d.id === s.difficulty && !d.locked);
  run.difficulty = diff ? diff.id : data.default_difficulty;
  const active = data.modifiers.filter((m) => !m.locked && s.modifiers.includes(m.id)).slice(0, data.max_active_modifiers);
  run.modifiers = active.map((m) => m.id);
  for (const { effect: e } of active) {
    if (e.hull_max) {
      run.hullMax += e.hull_max;
      run.hull += e.hull_max;
    }
    if (e.ammo) {
      run.ammoMax += e.ammo;
      run.ammo += e.ammo;
    }
    if (e.scrap) run.scrap += e.scrap;
    if (e.reactor) run.reactor += e.reactor;
    if (e.turret) run.turrets.push(e.turret);
  }
  return run;
}
