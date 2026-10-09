import { describe, expect, it } from 'vitest';
import demo from '../data/demo_ship.json';
import { airshipHull, blockPolygons, convexHull, systemBlocks, tilesOutline } from './hull';
import { parseShip, pointInPolygon, shipBounds } from './ship';
import type { Point, Ship, ShipTile } from './types';

const ship = parseShip(demo).ship!;
const sq = (x: number, z: number): ShipTile => ({
  room: 'r', shape: 'full', machinery: true, center: [x + 1, z + 1],
  polygon: [[x, z], [x + 2, z], [x + 2, z + 2], [x, z + 2]],
});

describe('hull geometry', () => {
  it('convex hull drops inner points', () => {
    const h = convexHull([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1]]);
    expect(h.length).toBe(4);
  });

  it('merges tiles into one outline', () => {
    // 2x1 block: 8 tile edges, 2 shared -> 6 outer edges
    expect(tilesOutline([sq(0, 0), sq(2, 0)]).length).toBe(6);
  });

  it('hull covers the whole deck, nose at the bow (-z), propellers at the stern (+z)', () => {
    const hull = airshipHull(ship);
    for (const t of ship.tiles) for (const p of t.polygon) expect(pointInPolygon(p, hull.outline)).toBe(true);
    const b = shipBounds(ship);
    const zs = hull.outline.map((p) => p[1]);
    expect(Math.min(...zs) < b.minZ - 2).toBe(true); // nose sticks out in front
    for (const [, z] of hull.propellers) expect(z > b.maxZ).toBe(true);
  });
});

describe('system blocks', () => {
  it('groups machinery tiles per room into one block', () => {
    const s: Ship = { ...ship, rooms: [{ id: 'r', kind: 'system', system: 'reactor', label: 'R', color: null }], tiles: [sq(0, 0), sq(2, 0), sq(0, 2)] };
    const blocks = systemBlocks(s);
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.system).toBe('reactor');
    expect(blocks[0]!.outline.length).toBe(8); // L-shape from 3 tiles
    expect(blocks[0]!.minSide).toBe(4);
    const c: Point = blocks[0]!.center;
    expect(c[0] > 0 && c[1] > 0).toBe(true);
  });

  it('demo ship has one block per system room', () => {
    expect(systemBlocks(ship).length).toBe(4);
  });
});

describe('block polygons', () => {
  it('shrinks only the outer sides of a block', () => {
    const s: Ship = { ...ship, rooms: [{ id: 'r', kind: 'system', system: 'reactor', label: 'R', color: null }], tiles: [sq(0, 0), sq(2, 0)] };
    const [a, b] = blockPolygons(systemBlocks(s)[0]!, 0.25);
    const xs = (p: Point[]) => p.map((q) => q[0]);
    const zs = (p: Point[]) => p.map((q) => q[1]);
    // left tile: left side moved in, shared right side (x = 2) untouched
    expect(Math.min(...xs(a!))).toBe(0.25);
    expect(Math.max(...xs(a!))).toBe(2);
    expect(Math.min(...xs(b!))).toBe(2);
    expect(Math.max(...xs(b!))).toBe(3.75);
    expect(Math.min(...zs(a!))).toBe(0.25);
    expect(Math.max(...zs(a!))).toBe(1.75);
  });
});

