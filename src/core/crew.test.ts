import { describe, expect, it } from 'vitest';
import LAB from '../data/crew_lab.json';
import LOOKS from '../data/crew_looks.json';
import { equip, facingFor, loopPose, parseCrewLook, turnTowards } from './crew';

describe('crew looks', () => {
  it('lab set covers every origin x build once', () => {
    const looks = LAB.map(parseCrewLook);
    expect(looks.every(Boolean)).toBe(true);
    const combos = new Set(looks.map((l) => `${l!.origin}/${l!.build}`));
    expect(combos.size).toBe(8);
  });

  it('rejects unknown origin / build / sex', () => {
    const ok = { id: 'a', name: 'A', species: 'human', sex: 'male', build: 'normal', origin: 'raider', skin: 0, hair: 0 };
    expect(parseCrewLook(ok)).not.toBeNull();
    expect(parseCrewLook({ ...ok, origin: 'vault' })).toBeNull();
    expect(parseCrewLook({ ...ok, build: 'scout' })).toBeNull();
    expect(parseCrewLook({ ...ok, sex: 'x' })).toBeNull();
  });

  it('wraps colour indices', () => {
    const l = parseCrewLook({ id: 'a', name: 'A', species: 'human', sex: 'male', build: 'normal', origin: 'raider', skin: 9, hair: -1 });
    expect(l!.skin).toBe(1);
    expect(l!.hair).toBe(3);
  });
});

describe('gear', () => {
  it('one item per slot: the new one replaces the old', () => {
    expect(equip(['helmet', 'backpack'], 'helmet')).toEqual(['backpack', 'helmet']);
    expect(equip(['helmet'], 'shoulder_plates')).toEqual(['helmet', 'shoulder_plates']);
  });

  it('parse drops unknown items and defaults to no gear', () => {
    const ok = { id: 'a', name: 'A', species: 'human', sex: 'male', build: 'normal', origin: 'raider', skin: 0, hair: 0 };
    expect(parseCrewLook(ok)!.gear).toEqual([]);
    expect(parseCrewLook({ ...ok, gear: ['helmet', 'laser_hat', 'backpack'] })!.gear).toEqual(['helmet', 'backpack']);
  });

  it('every origin has its own colour', () => {
    const cols = Object.values(LOOKS.origins).map((o) => o.color);
    expect(new Set(cols).size).toBe(cols.length);
  });
});

describe('facing', () => {
  it('faces the walking direction', () => {
    expect(facingFor(1, 0, 2)).toBeCloseTo(0);
    expect(facingFor(0, 1, 0)).toBeCloseTo(Math.PI / 2);
    expect(facingFor(-1, 0, 0)).toBeCloseTo(Math.PI);
  });

  it('keeps facing when standing still', () => {
    expect(facingFor(0, 0, 1.2)).toBe(1.2);
  });

  it('turns the short way round, limited per step', () => {
    expect(turnTowards(0.1, -0.1, 1)).toBeCloseTo(-0.1);
    expect(turnTowards(3, -3, 0.1)).toBeCloseTo(3.1); // across ±PI, not the long way
    expect(turnTowards(0, Math.PI / 2, 0.5)).toBeCloseTo(0.5);
  });

  it('walks a loop and faces each leg', () => {
    const sq: [number, number][] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    expect(loopPose(sq, 1)).toEqual({ pos: [1, 0], facing: 0 });
    const p = loopPose(sq, 3);
    expect(p.pos).toEqual([2, 1]);
    expect(p.facing).toBeCloseTo(Math.PI / 2);
    expect(loopPose(sq, 9).pos).toEqual([1, 0]); // wraps
  });
});
