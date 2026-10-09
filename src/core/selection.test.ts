import { describe, expect, it } from 'vitest';
import demo from '../data/demo_ship.json';
import { clearSelection, createGameState, doorAt, getSelectedRoom, selectRoom, tapPoint, toggleDoor } from './selection';
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

describe('doors', () => {
  it('a tap on a door opens it, a second tap closes it, the room selection stays', () => {
    const d = ship.doors[0]!;
    let s = selectRoom(createGameState(ship), 'engines');
    s = tapPoint(s, d.center);
    expect(s.openDoors).toEqual([0]);
    expect(s.selectedRoomId).toBe('engines');
    s = tapPoint(s, [d.center[0] + 0.2, d.center[1]]);
    expect(s.openDoors).toEqual([]);
  });

  it('finds the nearest door only close to it', () => {
    const d = ship.doors[1]!;
    expect(doorAt(ship, d.center)).toBe(1);
    expect(doorAt(ship, [d.center[0] + 3, d.center[1] + 3])).toBe(-1);
  });

  it('ignores unknown door numbers', () => {
    const s = createGameState(ship);
    expect(toggleDoor(s, 99)).toBe(s);
  });
});
