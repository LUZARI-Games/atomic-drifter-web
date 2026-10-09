// Ship status shown in the HUD: hull, shield layers (+ recharge), evasion, ammunition, scrap. Pure data + rules.
import START from '../data/run_start.json';
import type { GameState } from './types';

export interface ShipStatus {
  hull: number;
  hullMax: number;
  shieldLayers: number; // full layers
  shieldMax: number;
  shieldCharge: number; // 0…1 progress towards the next layer
  evasion: number; // 0…1 chance to dodge
  ammo: number;
  ammoMax: number;
  scrap: number;
}

export function startStatus(): ShipStatus {
  return {
    hull: START.hull,
    hullMax: START.hull_max,
    shieldLayers: START.shield_layers,
    shieldMax: START.shield_max,
    shieldCharge: 0,
    evasion: START.evasion,
    ammo: START.ammo,
    ammoMax: START.ammo_max,
    scrap: START.scrap,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Hull damage (negative = repair), kept within 0…hullMax. */
export function damageHull(state: GameState, amount: number): GameState {
  return { ...state, status: { ...state.status, hull: clamp(state.status.hull - amount, 0, state.status.hullMax) } };
}

/** Add (or spend, negative) scrap / ammo; never below 0, ammo never above its max. */
export function addScrap(state: GameState, amount: number): GameState {
  return { ...state, status: { ...state.status, scrap: Math.max(0, state.status.scrap + amount) } };
}
export function addAmmo(state: GameState, amount: number): GameState {
  return { ...state, status: { ...state.status, ammo: clamp(state.status.ammo + amount, 0, state.status.ammoMax) } };
}

/** Crew member health share 0…1 (for the portrait bars). */
export function crewHealth(state: GameState, id: string): number {
  const c = state.crew.find((m) => m.id === id);
  return c ? clamp(c.hp / c.hpMax, 0, 1) : 0;
}
