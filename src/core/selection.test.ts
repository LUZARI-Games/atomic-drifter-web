import { describe, expect, it } from 'vitest';
import layout from '../data/ship_layout.json';
import {
  clearSelection,
  createShipState,
  getSelectedRoom,
  roomAtCell,
  selectRoom,
  tapCell,
} from './selection';
import { Store } from './store';
import type { ShipLayout } from './types';

const ship = layout as ShipLayout;

describe('room selection', () => {
  it('starts with nothing selected', () => {
    expect(getSelectedRoom(createShipState(ship))).toBeNull();
  });

  it('selects a room by id and ignores unknown ids', () => {
    const s = selectRoom(createShipState(ship), 'shields');
    expect(getSelectedRoom(s)?.name).toBe('Shields');
    expect(selectRoom(s, 'does_not_exist')).toBe(s);
  });

  it('finds rooms by grid cell, including multi-cell rooms', () => {
    expect(roomAtCell(ship, 0, 1)?.id).toBe('engine');
    expect(roomAtCell(ship, 2, 0)?.id).toBe('weapons');
    expect(roomAtCell(ship, 9, 9)).toBeNull();
  });

  it('tapping a room selects it, tapping empty space clears it', () => {
    let s = tapCell(createShipState(ship), 3, 1);
    expect(s.selectedRoomId).toBe('cockpit');
    s = tapCell(s, 2, 1);
    expect(s.selectedRoomId).toBe('shields');
    s = tapCell(s, -1, 0);
    expect(s.selectedRoomId).toBeNull();
    expect(clearSelection(s)).toBe(s);
  });

  it('store notifies listeners only on change', () => {
    const store = new Store(createShipState(ship));
    let calls = 0;
    store.subscribe(() => calls++);
    store.update((s) => selectRoom(s, 'engine'));
    store.update((s) => selectRoom(s, 'nope'));
    expect(calls).toBe(1);
    expect(store.get().selectedRoomId).toBe('engine');
  });
});
