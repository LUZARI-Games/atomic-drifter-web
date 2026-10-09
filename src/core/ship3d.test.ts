import { describe, expect, it } from 'vitest';
import demo from '../data/demo_ship.json';
import { consoleDesk, doorEnds, doorFrame, doorLeaves, SHIP_HEIGHTS, segmentBox, shipSolids, wallHeight, wallPieces, wallSolid } from './ship3d';
import { parseShip } from './ship';

describe('ship heights', () => {
  it('walls are half walls (1 m), thickness from data, corners closed', () => {
    const s = wallSolid({ kind: 'interior', a: [0, 0], b: [0, 2] });
    expect(s.z1).toBe(1);
    const zs = s.footprint.map((p) => p[1]);
    expect(Math.min(...zs)).toBeCloseTo(-0.11);
    expect(Math.max(...zs)).toBeCloseTo(2.11);
  });

  it("the ship's own wall height from the planner wins, broken values fall back to 1 m", () => {
    expect(wallHeight({ wall_height: 1.4 })).toBe(1.4);
    expect(wallHeight({})).toBe(1);
    expect(wallHeight({ wall_height: -3 })).toBe(1);
  });

  it('long walls are cut into 1 m pieces that cover the same length', () => {
    const p = wallPieces(wallSolid({ kind: 'interior', a: [0, 0], b: [0, 4] }));
    expect(p).toHaveLength(4);
    const zs = p.flatMap((q) => q.footprint.map((pt) => pt[1]));
    expect(Math.min(...zs)).toBeCloseTo(-0.11);
    expect(Math.max(...zs)).toBeCloseTo(4.11);
    expect(p[0]!.first && p[3]!.last && !p[1]!.first).toBe(true);
  });

  it('segment box has the right width', () => {
    const b = segmentBox([0, 0], [4, 0], 0.5);
    expect(b.map((p) => p[1]).sort()).toEqual([-0.5, -0.5, 0.5, 0.5]);
  });

  it('door frame: just two posts at the opening ends (no top beam), a bit taller than the walls', () => {
    const d = { kind: 'door' as const, center: [-1, 2] as [number, number], axis: 'x' as const, width: 1.2, rooms: [] };
    expect(doorEnds(d)).toEqual([[-1.6, 2], [-0.4, 2]]);
    const f = doorFrame(d);
    expect(f).toHaveLength(2);
    expect(f.every((s) => s.kind === 'door_post' && s.z1 === SHIP_HEIGHTS.door_frame_height_m)).toBe(true);
    expect(SHIP_HEIGHTS.door_frame_height_m).toBeGreaterThan(SHIP_HEIGHTS.wall_height_m);
  });

  it('door leaves slide sideways into the walls', () => {
    const d = { kind: 'door' as const, center: [0, 0] as [number, number], axis: 'x' as const, width: 1.2, rooms: [] };
    const len = (s: { footprint: [number, number][] }) => Math.max(...s.footprint.map((p) => p[0])) - Math.min(...s.footprint.map((p) => p[0]));
    const closed = doorLeaves(d, 0);
    expect(closed).toHaveLength(2);
    expect(len(closed[0]!) + len(closed[1]!)).toBeCloseTo(1.2); // together they close the opening
    const half = doorLeaves(d, 0.5);
    expect(len(half[0]!)).toBeCloseTo(0.3);
    expect(Math.min(...half[0]!.footprint.map((p) => p[0]))).toBeCloseTo(-0.6); // still anchored at the wall end
    expect(doorLeaves(d, 1)).toHaveLength(0);
  });

  it('demo ship: one solid per wall + two posts per door + one console per system with a console', () => {
    const ship = parseShip(demo).ship!;
    const consoles = ship.rooms.filter((r) => r.console).length;
    expect(consoles).toBe(4);
    expect(shipSolids(ship)).toHaveLength(ship.walls.length + ship.doors.length * 2 + consoles);
  });

  it('console is a shelf on the block front: touches the block, overhangs the floor tile a little, lower than the block', () => {
    // crew tile centred at [0, 0], machinery to +x (tile edge at x = 1, block face at x = 1.32)
    const d = consoleDesk({ tile: [0, 0], facing: [1, 0] });
    const xs = d.footprint.map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(0.72); // only 0.28 m over the floor tile
    expect(Math.max(...xs)).toBeCloseTo(1.32); // ends exactly at the block face – never inside the block
    expect(d.height).toBeLessThan(SHIP_HEIGHTS.system_height_m);
  });
});
