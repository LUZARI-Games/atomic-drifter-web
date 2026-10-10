// The current run, saved in this browser (New Run -> game -> Ship Upgrades / Salvage all share it).
import { defaultRun, parseRun, type RunState } from '../core/run';

const KEY = 'adw.run';

export function loadRun(): RunState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseRun(JSON.parse(raw)) : defaultRun();
  } catch {
    return defaultRun();
  }
}

/** A run was started / saved in this browser (title screen: CONTINUE). */
export function hasSavedRun(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(run));
  } catch {
    /* storage blocked – the run lives only on this page */
  }
}
