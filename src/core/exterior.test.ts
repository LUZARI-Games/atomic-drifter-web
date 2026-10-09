import { describe, expect, it } from 'vitest';
import { dockArms, dockEdges, isDock, railingParts, vehicleFrame } from './exterior';
import { airshipHull } from './hull';
import { parseShip, parseVehicles } from './ship';
import type { Ship } from './types';

// 2 enclosed tiles + 1 balcony tile hanging out to starboard (+x), a bike docked at its outer railing
const tile = (x: number, z: number, room: string) => ({ room, shape: 'full', machinery: false, center: [x, z], polygon: [[x - 1, z - 1], [x + 1, z - 1], [x + 1, z + 1], [x - 1, z + 1]] });
const raw = {
  format: 'atomic-drifter-ship-godot', version: 1, name: 'T', tile_size: 2,
  rooms: [{ id: 'room', kind: 'room', system: null, label: 'R', color: null }, { id: 'deck', kind: 'balcony', system: null, label: '', color: null }],
  tiles: [tile(0, 0, 'room'), tile(0, 2, 'room'), tile(2, 0, 'deck')],
  walls: [{ kind: 'railing', a: [3, -1], b: [3, 1] }, { kind: 'railing', a: [1, -1], b: [3, -1] }],
  doors: [],
  vehicles: [{ type: 'bike', seats: 1, tiles: [tile(4, 0, '')], exits: [{ a: [3, -1], b: [3, 1] }, { a: [5, -1], b: [5, 1] }] }],
};
const ship = parseShip(raw).ship as Ship;

describe('balconies + vehicles', () => {
  it('reads vehicles; older exports have none', () => {
    expect(ship.vehicles).toHaveLength(1);
    expect(parseVehicles(undefined)).toEqual([]);
    expect(parseVehicles([{ type: 'bike', tiles: [] }])).toEqual([]);
  });

  it('the hull is built around the enclosed deck only – the balcony hangs out of it', () => {
    const maxX = Math.max(...airshipHull(ship).outline.map((p) => p[0]));
    expect(maxX).toBeLessThan(3); // balcony edge is at x = 3
    expect(maxX).toBeGreaterThan(1); // enclosed deck edge is at x = 1
  });

  it('a railing edge with a vehicle exit is a dock', () => {
    expect(dockEdges(ship).size).toBe(1);
    expect(isDock(ship, ship.walls[0]!)).toBe(true);
    expect(isDock(ship, ship.walls[1]!)).toBe(false);
  });

  it('railing = posts at least every metre + top and middle rail', () => {
    const parts = railingParts({ kind: 'railing', a: [0, 0], b: [2, 0] }, 1);
    expect(parts.filter((p) => !p.segment)).toHaveLength(3); // posts at 0, 1, 2 m
    expect(parts.filter((p) => p.segment).map((p) => p.z1)).toEqual([1, 0.535]);
  });

  it('a docked vehicle lies along the railing, on the outside', () => {
    const f = vehicleFrame(ship, ship.vehicles![0]!);
    expect(Math.abs(f.u[1])).toBeCloseTo(1); // dock edge runs along z
    expect(f.w[0]).toBeCloseTo(1); // away from the ship = +x
  });

  it('two docking arms reach from the railing to the bike body (railing stays closed)', () => {
    const arms = dockArms(ship, ship.vehicles![0]!);
    expect(arms).toHaveLength(2);
    const xs = arms[0]!.footprint.map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(3); // starts at the railing (x = 3)
    expect(Math.max(...xs)).toBeCloseTo(3.8); // ends at the bike body (centre x = 4, half width 0.2)
  });
});
