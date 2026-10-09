import { describe, expect, it } from 'vitest';
import { defaultRun, parseRun, statusFromRun } from './run';

describe('run', () => {
  it('damaged or old saves fall back to defaults field by field', () => {
    expect(parseRun(null)).toEqual(defaultRun());
    const r = parseRun({ scrap: -5, shipName: 'X', turrets: ['a', 3], systems: { shields: 4, bad: 'x' } });
    expect(r.scrap).toBe(0);
    expect(r.shipName).toBe('X');
    expect(r.turrets).toEqual(['a']);
    expect(r.systems).toEqual({ shields: 4 });
  });

  it('HUD status follows the run (2 shield levels = 1 layer)', () => {
    const s = statusFromRun({ ...defaultRun(), systems: { shields: 5 }, scrap: 7 });
    expect(s.shieldLayers).toBe(2);
    expect(s.scrap).toBe(7);
  });
});
