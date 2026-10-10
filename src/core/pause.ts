// P.A.U.S.E. (Prometheus Atomic Universal Stasis Engine): stops time during a fight, like V.A.T.S. While it runs
// nothing moves, shoots or reloads (the renderer skips the rule ticks), but orders can still be given: crew get
// their walking orders, guns get switched and retargeted – everything happens once time runs again.
import type { GameState } from './types';

const up = (c: { dying?: number; ko?: number; hp: number }) => c.dying === undefined && c.ko === undefined && c.hp > 0;

/** A fight is on: an enemy ship with someone aboard, or boarders on our ship. */
export function inFight(state: GameState): boolean {
  return !!state.foe?.crew.some(up) || state.crew.some((c) => c.side === 'enemy' && up(c));
}

/** Switch P.A.U.S.E. on / off. It only starts during a fight; switching off always works. */
export function togglePause(state: GameState): GameState {
  if (state.paused) return { ...state, paused: false };
  return inFight(state) ? { ...state, paused: true } : state;
}
