import { describe, expect, it } from 'vitest';
import demo from '../data/demo_ship.json';
import { spawnEnemy } from './combat';
import { generateCrew } from './crewmove';
import { moodEvents, orderRefused, stateEvents } from './events';
import { selectCrew } from './crewmove';
import { tapPoint } from './selection';
import { createGameState } from './selection';
import { parseShip } from './ship';
import type { GameState } from './types';

const ship = parseShip(demo).ship!;
const base = (): GameState => ({ ...createGameState(ship), crew: generateCrew(ship, 2), systemBars: { weapons: 2 } });

describe('state events (sounds)', () => {
  it('boarders arriving, fight won', () => {
    const s = base();
    const boarded = spawnEnemy(s, [3, 1]);
    expect(stateEvents(s, boarded)).toContain('boarder_alarm');
    expect(stateEvents(boarded, s)).toContain('fight_won');
    expect(stateEvents(s, s)).toEqual([]);
  });

  it('knock-out and waking up', () => {
    const s = base();
    const ko: GameState = { ...s, crew: s.crew.map((c, i) => (i === 0 ? { ...c, hp: 0, ko: 0 } : c)) };
    expect(stateEvents(s, ko)).toEqual(['crew_ko']);
    expect(stateEvents(ko, s)).toEqual(['crew_wake']);
  });

  it('system wrecked / repaired', () => {
    const s = base();
    const wrecked = { ...s, systemDamage: { weapons: 2 } };
    expect(stateEvents({ ...s, systemDamage: { weapons: 1.9 } }, wrecked)).toEqual(['system_wrecked']);
    expect(stateEvents({ ...s, systemDamage: { weapons: 0.1 } }, s)).toEqual(['system_repaired']);
  });

  it('getting into / out of a vehicle', () => {
    const s = base();
    const seated: GameState = { ...s, crew: s.crew.map((c, i) => (i === 0 ? { ...c, node: 'v0:0' } : c)) };
    expect(stateEvents(s, seated)).toEqual(['vehicle_enter']);
    expect(stateEvents(seated, s)).toEqual(['vehicle_exit']);
  });

  it('order refused: tapping another room that cannot take them', () => {
    let s: GameState = { ...createGameState(ship), crew: generateCrew(ship, 2) };
    s = selectCrew(s, s.crew[1]!.id);
    // crew 0 operates the engines console: the engines room (1 tile) is full
    const engines = s.crew[0]!.pos;
    const full = tapPoint(s, [1, 3]);
    expect(engines).toBeDefined();
    expect(orderRefused(s, full, [1, 3])).toBe(true);
    const ok = tapPoint(s, [3, 1]); // balcony has room
    expect(orderRefused(s, ok, [3, 1])).toBe(false);
  });

  it('moods start', () => {
    const none = new Map();
    expect(moodEvents(none, new Map([['a', { kind: 'chat', role: 'teller', partner: 'b' } as const]]))).toEqual(['mood_chat']);
    expect(moodEvents(none, new Map([['a', { kind: 'wary', other: 'b' } as const]]))).toEqual(['mood_wary']);
    expect(moodEvents(none, new Map([['a', { kind: 'bored', sit: 0.5 } as const]]))).toEqual([]);
    expect(moodEvents(none, new Map([['a', { kind: 'bored', sit: 1 } as const]]))).toEqual(['mood_bored']);
  });
});
