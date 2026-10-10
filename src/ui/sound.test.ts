import { describe, expect, it } from 'vitest';
import SOUNDS from '../data/sounds.json';
import { SYNTHS } from './sound';

const ids = SOUNDS.groups.flatMap((g) => g.sounds);

describe('sound list', () => {
  it('ids are unique snake_case, every game sound has a placeholder', () => {
    expect(new Set(ids.map((s) => s.id)).size).toBe(ids.length);
    expect(ids.every((s) => /^[a-z0-9_]+$/.test(s.id))).toBe(true);
    for (const s of ids.filter((x) => x.synth === 'game')) expect(SYNTHS[s.id], s.id).toBeTypeOf('function');
  });
  it('every placeholder is listed (nothing the owner would miss)', () => {
    for (const id of Object.keys(SYNTHS)) expect(ids.some((s) => s.id === id), id).toBe(true);
  });
});
