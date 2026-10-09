// Pure game rules for room selection. No Phaser, no DOM.
import { getRoom, roomAtPoint } from './ship';
import type { GameState, Point, Ship, ShipRoom } from './types';

export function createGameState(ship: Ship): GameState {
  return { ship, selectedRoomId: null };
}

/** Select a room by id. Unknown ids leave the state unchanged. */
export function selectRoom(state: GameState, roomId: string): GameState {
  if (!state.ship.rooms.some((r) => r.id === roomId)) return state;
  return state.selectedRoomId === roomId ? state : { ...state, selectedRoomId: roomId };
}

export function clearSelection(state: GameState): GameState {
  return state.selectedRoomId === null ? state : { ...state, selectedRoomId: null };
}

/** Tap at a ship point (meters): a room selects it, empty space clears the selection. */
export function tapPoint(state: GameState, p: Point): GameState {
  const id = roomAtPoint(state.ship, p);
  return id ? selectRoom(state, id) : clearSelection(state);
}

export function getSelectedRoom(state: GameState): ShipRoom | null {
  return getRoom(state.ship, state.selectedRoomId);
}
