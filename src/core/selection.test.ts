import { describe, expect, it } from 'vitest';
import demo from '../data/demo_ship.json';
import { clearSelection, createGameState, getSelectedRoom, selectRoom, tapPoint } from './selection';
import { parseShip, pointInPolygon, roomAtPoint, roomCenter, roomOutline, shipBounds } from './ship';
import { Store } from './store';
import type { Point } from './types';

const { ship } = parseShip(demo);
if (!ship) throw new Error('demo ship must parse');

describe('ship loading', () => {
  it('accepts the planner Godot export format', () => {
    expect(parseShip(demo).problems).toEqual([]);
    expect(ship.rooms.length).toBe(4);
  });

  it('rejects other files with a readable problem', () => {
    expect(parseShip({ format: 'something-else', tiles: [] }).ship).toBeNull();
    expect(parseShip(null).problems).toEqual(['NOT A SHIP FILE']);
  });

  it('computes bounds and room centres in meters', () => {
    expect(shipBounds(ship)).toEqual({ minX: -2, maxX: 2, minZ: -4, maxZ: 4 });
    expect(roomCenter(ship, 'piloting')).toEqual([0, -3]);
  });

  it('outlines a room without its inner tile seams', () => {
    // cockpit = 2 tiles of 2x2 m side by side -> 6 outer edges, the shared middle edge is dropped
    expect(roomOutline(ship, 'piloting').length).toBe(6);
    expect(roomOutline(ship, 'nope').length).toBe(0);
  });
});

describe('room selection', () => {
  const sq: Point[] = [[0, 0], [2, 0], [2, 2], [0, 2]];

  it('point-in-polygon works', () => {
    expect(pointInPolygon([1, 1], sq)).toBe(true);
    expect(pointInPolygon([3, 1], sq)).toBe(false);
  });

  it('finds rooms by point (bow = -z)', () => {
    expect(roomAtPoint(ship, [0.5, -3.5])).toBe('piloting');
    expect(roomAtPoint(ship, [-1, 3])).toBe('engines');
    expect(roomAtPoint(ship, [9, 9])).toBeNull();
  });

  it('tapping a room selects it, tapping empty space clears it', () => {
    let s = tapPoint(createGameState(ship), [1, 0]);
    expect(getSelectedRoom(s)?.label).toBe('SHIELDS');
    s = tapPoint(s, [-1, 0]);
    expect(s.selectedRoomId).toBe('weapons');
    s = tapPoint(s, [20, 0]);
    expect(s.selectedRoomId).toBeNull();
    expect(clearSelection(s)).toBe(s);
  });

  it('ignores unknown room ids; store notifies only on change', () => {
    const store = new Store(createGameState(ship));
    let calls = 0;
    store.subscribe(() => calls++);
    store.update((s) => selectRoom(s, 'engines'));
    store.update((s) => selectRoom(s, 'engines'));
    store.update((s) => selectRoom(s, 'nope'));
    expect(calls).toBe(1);
  });
});
