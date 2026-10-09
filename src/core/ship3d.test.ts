import { describe, expect, it } from 'vitest';
import demo from '../data/demo_ship.json';
import { doorEnds, doorFrame, SHIP_HEIGHTS, segmentBox, shipSolids, wallSolid } from './ship3d';
import { parseShip } from './ship';

describe('ship heights', () => {
  it('walls are half walls (1 m), thickness from data, corners closed', () => {
    const s = wallSolid({ kind: 'interior', a: [0, 0], b: [0, 2] });
    expect(s.z1).toBe(1);
    const zs = s.footprint.map((p) => p[1]);
    expect(Math.min(...zs)).toBeCloseTo(-0.11);
    expect(Math.max(...zs)).toBeCloseTo(2.11);
  });

  it('segment box has the right width', () => {
    const b = segmentBox([0, 0], [4, 0], 0.5);
    expect(b.map((p) => p[1]).sort()).toEqual([-0.5, -0.5, 0.5, 0.5]);
  });

  it('door frame: two posts at the opening ends + lintel, taller than the walls', () => {
    const d = { kind: 'door' as const, center: [-1, 2] as [number, number], axis: 'x' as const, width: 1.2, rooms: [] };
    expect(doorEnds(d)).toEqual([[-1.6, 2], [-0.4, 2]]);
    const f = doorFrame(d);
    expect(f.filter((s) => s.kind === 'door_post')).toHaveLength(2);
    expect(f.every((s) => s.z1 === SHIP_HEIGHTS.door_frame_height_m)).toBe(true);
    expect(SHIP_HEIGHTS.door_frame_height_m).toBeGreaterThan(SHIP_HEIGHTS.wall_height_m);
  });

  it('demo ship: one solid per wall + three per door', () => {
    const ship = parseShip(demo).ship!;
    expect(shipSolids(ship)).toHaveLength(ship.walls.length + ship.doors.length * 3);
  });
});
