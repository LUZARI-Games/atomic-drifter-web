import { describe, expect, it } from 'vitest';
import shipData from '../data/ship.json';
import { createGame } from './game';
import { clearSelection, initialSelection, isSelected, selectRoom } from './selection';
import type { ShipDef } from './ship';

const ship: ShipDef = shipData;

describe('room selection', () => {
  it('selects a room, switches to another, and clears', () => {
    let s = selectRoom(initialSelection, ship, 'engine');
    expect(s.selectedRoomId).toBe('engine');
    expect(isSelected(s, 'engine')).toBe(true);

    s = selectRoom(s, ship, 'cockpit');
    expect(s.selectedRoomId).toBe('cockpit');
    expect(isSelected(s, 'engine')).toBe(false);

    s = clearSelection(s);
    expect(s.selectedRoomId).toBeNull();
  });

  it('ignores unknown room ids', () => {
    const s = selectRoom(initialSelection, ship, 'reactor');
    expect(s).toBe(initialSelection);
  });

  it('notifies subscribers only when selection changes', () => {
    const game = createGame(ship);
    const seen: (string | null)[] = [];
    game.subscribe((st) => seen.push(st.selection.selectedRoomId));

    game.dispatch({ type: 'selectRoom', roomId: 'weapons' });
    game.dispatch({ type: 'selectRoom', roomId: 'weapons' });
    game.dispatch({ type: 'clearSelection' });

    expect(seen).toEqual([null, 'weapons', null]);
  });
});
