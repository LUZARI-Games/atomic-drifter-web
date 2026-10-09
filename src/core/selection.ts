// Pure game rules for room selection. No Phaser, no DOM.
import type { RoomDef, ShipLayout, ShipState } from './types';

export function createShipState(layout: ShipLayout): ShipState {
  return { layout, selectedRoomId: null };
}

/** Select a room by id. Unknown ids leave the state unchanged. */
export function selectRoom(state: ShipState, roomId: string): ShipState {
  if (!state.layout.rooms.some((r) => r.id === roomId)) return state;
  return { ...state, selectedRoomId: roomId };
}

export function clearSelection(state: ShipState): ShipState {
  return state.selectedRoomId === null ? state : { ...state, selectedRoomId: null };
}

/** Room at a grid cell, or null for empty space. */
export function roomAtCell(layout: ShipLayout, col: number, row: number): RoomDef | null {
  return (
    layout.rooms.find((r) => col >= r.x && col < r.x + r.w && row >= r.y && row < r.y + r.h) ??
    null
  );
}

/** Tap handling: tap a room selects it, tap empty space clears the selection. */
export function tapCell(state: ShipState, col: number, row: number): ShipState {
  const room = roomAtCell(state.layout, col, row);
  return room ? selectRoom(state, room.id) : clearSelection(state);
}

export function getSelectedRoom(state: ShipState): RoomDef | null {
  return state.layout.rooms.find((r) => r.id === state.selectedRoomId) ?? null;
}
