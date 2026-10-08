// Game state container. Render and UI layers read state and send actions;
// they never mutate state directly.

import { clearSelection, initialSelection, selectRoom, type SelectionState } from './selection';
import type { RoomId, ShipDef } from './ship';

export interface GameState {
  ship: ShipDef;
  selection: SelectionState;
}

export type GameAction =
  | { type: 'selectRoom'; roomId: RoomId }
  | { type: 'clearSelection' };

export function reduce(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'selectRoom': {
      const selection = selectRoom(state.selection, state.ship, action.roomId);
      return selection === state.selection ? state : { ...state, selection };
    }
    case 'clearSelection': {
      const selection = clearSelection(state.selection);
      return selection === state.selection ? state : { ...state, selection };
    }
  }
}

export type Listener = (state: GameState) => void;

export interface Game {
  getState(): GameState;
  dispatch(action: GameAction): void;
  /** Calls `listener` immediately and on every change. Returns an unsubscribe fn. */
  subscribe(listener: Listener): () => void;
}

export function createGame(ship: ShipDef): Game {
  let state: GameState = { ship, selection: initialSelection };
  const listeners = new Set<Listener>();

  return {
    getState: () => state,
    dispatch(action) {
      const next = reduce(state, action);
      if (next === state) return;
      state = next;
      listeners.forEach((l) => l(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  };
}
