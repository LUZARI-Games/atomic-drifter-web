// Pure game rules for room selection. No Phaser, no DOM.
import { sendSelected } from './crewmove';
import { getRoom, roomAtPoint } from './ship';
import type { GameState, Point, Ship, ShipRoom } from './types';

export function createGameState(ship: Ship): GameState {
  return { ship, selectedRoomId: null, openDoors: [], crew: [], selectedCrewId: null };
}

/** Door under a ship point (within `radius` meters of its centre), or -1. */
export function doorAt(ship: Ship, p: Point, radius = 0.6): number {
  let best = -1;
  let bestD = radius;
  ship.doors.forEach((d, i) => {
    const dist = Math.hypot(d.center[0] - p[0], d.center[1] - p[1]);
    if (dist <= bestD) {
      best = i;
      bestD = dist;
    }
  });
  return best;
}

/** Open a closed door / close an open one. Unknown indices leave the state unchanged. */
export function toggleDoor(state: GameState, index: number): GameState {
  if (index < 0 || index >= state.ship.doors.length) return state;
  const open = state.openDoors.includes(index);
  return { ...state, openDoors: open ? state.openDoors.filter((i) => i !== index) : [...state.openDoors, index] };
}

/** Select a room by id. Unknown ids leave the state unchanged. */
export function selectRoom(state: GameState, roomId: string): GameState {
  if (!state.ship.rooms.some((r) => r.id === roomId)) return state;
  return state.selectedRoomId === roomId ? state : { ...state, selectedRoomId: roomId };
}

export function clearSelection(state: GameState): GameState {
  return state.selectedRoomId === null ? state : { ...state, selectedRoomId: null };
}

/**
 * Tap at a ship point (meters). With a crew member selected: send them there (deck tile or vehicle seat).
 * Otherwise: a door opens/closes, a room is selected, empty space clears the selection.
 */
export function tapPoint(state: GameState, p: Point): GameState {
  const sent = sendSelected(state, p);
  if (sent) return sent;
  if (state.selectedCrewId) state = { ...state, selectedCrewId: null }; // tapped into the void: let go of the crew member
  const door = doorAt(state.ship, p);
  if (door >= 0) return toggleDoor(state, door);
  const id = roomAtPoint(state.ship, p);
  return id ? selectRoom(state, id) : clearSelection(state);
}

export function getSelectedRoom(state: GameState): ShipRoom | null {
  return getRoom(state.ship, state.selectedRoomId);
}
