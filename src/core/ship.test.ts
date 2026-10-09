import { describe, expect, it } from 'vitest';
import demo from '../data/demo_ship.json';
import { parseConsole, parseShip } from './ship';

describe('ship file', () => {
  it('reads console spots and normalises the facing', () => {
    expect(parseConsole({ tile: [1, 2], facing: [0, -2] })).toEqual({ tile: [1, 2], facing: [0, -1] });
  });

  it('older exports without consoles still load (console = null)', () => {
    expect(parseConsole(undefined)).toBeNull();
    expect(parseConsole({ tile: [1, 2] })).toBeNull();
    expect(parseConsole({ tile: [1, 2], facing: [0, 0] })).toBeNull();
    const old = { ...demo, rooms: demo.rooms.map(({ console: _c, ...r }) => r) };
    const ship = parseShip(old).ship!;
    expect(ship.rooms.every((r) => r.console === null)).toBe(true);
  });

  it('demo ship has a console spot in every system room', () => {
    const ship = parseShip(demo).ship!;
    expect(ship.rooms.filter((r) => r.kind === 'system').every((r) => r.console)).toBe(true);
  });
});
