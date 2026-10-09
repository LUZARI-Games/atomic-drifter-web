import { describe, expect, it } from 'vitest';
import demo from '../data/demo_ship.json';
import { consoleOf, doorsInUse, generateCrew, navOf, placeCrew, selectCrew, tickCrew, walkFactor } from './crewmove';
import { consoleDesk } from './ship3d';
import { seatPose } from './exterior';
import { findPath, nodeAt } from './nav';
import { createGameState, tapPoint } from './selection';
import { parseShip } from './ship';
import type { GameState, Ship } from './types';

const ship = parseShip(demo).ship!;

// enclosed tile + balcony tile, bike docked at the balcony's outer railing (same layout as exterior.test.ts)
const tile = (x: number, z: number, room: string) => ({ room, shape: 'full', machinery: false, center: [x, z], polygon: [[x - 1, z - 1], [x + 1, z - 1], [x + 1, z + 1], [x - 1, z + 1]] });
const dockShip = parseShip({
  format: 'atomic-drifter-ship-godot', version: 1, name: 'D', tile_size: 2,
  rooms: [{ id: 'room', kind: 'room', system: null, label: 'R', color: null }, { id: 'deck', kind: 'balcony', system: null, label: '', color: null }],
  tiles: [tile(0, 0, 'room'), tile(2, 0, 'deck')],
  walls: [{ kind: 'interior', a: [1, -1], b: [1, -0.6] }, { kind: 'interior', a: [1, 0.6], b: [1, 1] }, { kind: 'railing', a: [3, -1], b: [3, 1] }],
  doors: [{ kind: 'door', center: [1, 0], axis: 'z', width: 1.2, rooms: ['room', 'deck'] }],
  vehicles: [{ type: 'bike', seats: 1, tiles: [tile(4, 0, '')], exits: [{ a: [3, -1], b: [3, 1] }] }],
}).ship as Ship;

describe('walking on the ship', () => {
  it('machinery is not walkable; rooms connect only through doors', () => {
    const nav = navOf(ship);
    expect([...nav.nodes.values()].filter((n) => n.id.startsWith('t')).every((n) => !ship.tiles[Number(n.id.slice(1))]!.machinery)).toBe(true);
    const from = nodeAt(ship, nav, [1, 3])!; // engines floor
    const to = nodeAt(ship, nav, [1, -3])!; // cockpit floor
    const way = findPath(nav, from, to)!;
    const doorCentres = ship.doors.map((d) => `${d.center}`);
    expect(way.points.some((p) => doorCentres.includes(`${p}`))).toBe(true);
  });

  it('a balcony leads over the railing into a docked vehicle', () => {
    const nav = navOf(dockShip);
    const way = findPath(nav, nodeAt(dockShip, nav, [0, 0])!, 'v0:0')!;
    expect(way.points).toContainEqual([1, 0]); // through the door
    expect(way.points).toContainEqual([3, 0]); // over the railing at the dock
    expect(way.nodes.at(-1)).toBe('v0:0');
  });
});

describe('crew', () => {
  const start = (s: Ship): GameState => ({ ...createGameState(s), crew: generateCrew(s) });

  it('random crew starts at the consoles, same ship -> same crew', () => {
    const crew = generateCrew(ship);
    expect(crew.length).toBeGreaterThan(0);
    expect(generateCrew(ship).map((c) => c.look.origin)).toEqual(crew.map((c) => c.look.origin));
    const consoles = ship.rooms.filter((r) => r.console).map((r) => nodeAt(ship, navOf(ship), r.console!.tile));
    expect(consoles).toContain(crew[0]!.node);
  });

  it('select a crew member, tap a far room: they walk there through a door that opens on the way', () => {
    let s = start(ship);
    const c = s.crew.find((m) => ship.tiles[Number(m.node.slice(1))]!.room === 'engines')!;
    s = selectCrew(s, c.id);
    s = tapPoint(s, [1, -3]); // cockpit floor
    expect(s.crew.find((m) => m.id === c.id)!.path.length).toBeGreaterThan(0);
    let sawDoor = false;
    for (let i = 0; i < 400; i++) {
      s = tickCrew(s, 0.05);
      if (doorsInUse(s).length) sawDoor = true;
    }
    const done = s.crew.find((m) => m.id === c.id)!;
    expect(done.path).toEqual([]);
    expect(ship.tiles[Number(done.node.slice(1))]!.room).toBe('piloting');
    expect(sawDoor).toBe(true);
  });

  it('send a crew member into the docked bike; the seat then counts as taken', () => {
    let s = start(dockShip);
    s = selectCrew(s, s.crew[0]!.id);
    s = tapPoint(s, [4, 0]);
    for (let i = 0; i < 200; i++) s = tickCrew(s, 0.05);
    expect(s.crew[0]!.node).toBe('v0:0');
  });

  it('tapping the void lets go of the crew member', () => {
    let s = selectCrew(start(ship), generateCrew(ship)[0]!.id);
    s = tapPoint(s, [40, 40]);
    expect(s.selectedCrewId).toBeNull();
  });
});

// balcony of two tiles, a car docked along its railing: rows z<0 and z>0 walled apart, each row's door on the railing
const carShip = parseShip({
  format: 'atomic-drifter-ship-godot', version: 1, name: 'C', tile_size: 2,
  rooms: [{ id: 'deck', kind: 'balcony', system: null, label: '', color: null }],
  tiles: [tile(2, -1, 'deck'), tile(2, 1, 'deck')],
  walls: [{ kind: 'railing', a: [3, -2], b: [3, 0] }, { kind: 'railing', a: [3, 0], b: [3, 2] }],
  doors: [],
  vehicles: [{
    type: 'car', seats: 4,
    tiles: [tile(4, -1, ''), tile(6, -1, ''), tile(4, 1, ''), tile(6, 1, '')],
    exits: [{ a: [3, -2], b: [3, 0] }, { a: [3, 0], b: [3, 2] }],
    walls: [{ a: [3, 0], b: [5, 0] }, { a: [5, 0], b: [7, 0] }],
  }],
}).ship as Ship;

describe('car: front and back row', () => {
  it('rows are walled apart; seats in one row connect', () => {
    const nav = navOf(carShip);
    const linked = (a: string, b: string) => nav.links.get(a)!.some((l) => l.to === b);
    expect(linked('v0:0', 'v0:1')).toBe(true); // same row
    expect(linked('v0:0', 'v0:2')).toBe(false); // other row
    expect(linked('v0:1', 'v0:3')).toBe(false);
  });

  it('you get in at your own row: the far seat of the other row is reached over that row\'s dock', () => {
    const nav = navOf(carShip);
    const way = findPath(nav, nodeAt(carShip, nav, [2, -1])!, 'v0:3')!;
    expect(way.points).toContainEqual([3, 1]); // the dock of row z>0
    expect(way.points).not.toContainEqual([3, -1]);
    expect(way.nodes).toContain('v0:2');
  });

  it('seated crew face the driving direction; one driver at the wheel', () => {
    const poses = carShip.vehicles![0]!.tiles.map((_, t) => seatPose(carShip, 0, t));
    expect(poses.filter((p) => p.hands === 'wheel')).toHaveLength(1);
    expect(new Set(poses.map((p) => p.heading.toFixed(3))).size).toBe(1);
    expect(poses.every((p) => p.legsHidden)).toBe(true);
  });
});

describe('walking feel', () => {
  it('speeds up after the start, slows down before the end', () => {
    expect(walkFactor(0, 5)).toBeLessThan(0.5);
    expect(walkFactor(2, 5)).toBe(1);
    expect(walkFactor(2, 0.1)).toBeLessThan(0.5);
  });

  it('crew at a console stand in front of the desk and face it', () => {
    const crew = generateCrew(ship);
    for (const c of crew) {
      const desk = consoleOf(ship, c.node);
      if (!desk) continue;
      expect(c.heading).toBeCloseTo(Math.atan2(desk[1], desk[0]));
      const rm = ship.rooms.find((r) => r.console && nodeAt(ship, navOf(ship), r.console.tile) === c.node)!;
      const front = consoleDesk(rm.console!, ship.tile_size).footprint[0]!; // desk edge on the crew side
      const ahead = (p: [number, number]) => p[0] * desk[0] + p[1] * desk[1];
      expect(ahead(c.pos) + 0.3).toBeLessThan(ahead(front as [number, number])); // body (0.3 m) clear of the desk
    }
  });
});

describe('test scenes', () => {
  it('placeCrew puts someone straight into a seat; a taken seat stays with its owner', () => {
    let s: GameState = { ...createGameState(carShip), crew: generateCrew(ship, 2) }; // looks from the demo ship (the car ship has no indoor deck to start on)
    const [a, b] = s.crew;
    s = placeCrew(s, a!.id, [4, -1]);
    expect(s.crew[0]!.node).toBe('v0:0');
    expect(s.crew[0]!.path).toEqual([]);
    s = placeCrew(s, b!.id, [4, -1]);
    expect(s.crew[1]!.node).not.toBe('v0:0');
  });
});
