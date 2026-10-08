// Room selection rules. Pure functions over plain state.

import { findRoom, type RoomId, type ShipDef } from './ship';

export interface SelectionState {
  selectedRoomId: RoomId | null;
}

export const initialSelection: SelectionState = { selectedRoomId: null };

/** Select a room. Unknown ids leave the state unchanged. */
export function selectRoom(state: SelectionState, ship: ShipDef, roomId: RoomId): SelectionState {
  if (!findRoom(ship, roomId)) return state;
  if (state.selectedRoomId === roomId) return state;
  return { ...state, selectedRoomId: roomId };
}

export function clearSelection(state: SelectionState): SelectionState {
  return state.selectedRoomId === null ? state : { ...state, selectedRoomId: null };
}

export function isSelected(state: SelectionState, roomId: RoomId): boolean {
  return state.selectedRoomId === roomId;
}
