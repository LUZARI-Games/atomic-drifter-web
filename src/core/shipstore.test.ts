import { describe, expect, it } from 'vitest';
import demo from '../data/demo_ship.json';
import { shipIdOf, shipStoreProblem } from './shipstore';

describe('ships on the server', () => {
  it('id from the name, only valid planner exports are stored', () => {
    expect(shipIdOf('Iron Maiden II')).toBe('iron_maiden_ii');
    expect(shipStoreProblem(JSON.stringify(demo))).toBeNull();
    expect(shipStoreProblem('{oops')).toBe('not JSON');
    expect(shipStoreProblem(JSON.stringify({ format: 'other' }))).not.toBeNull();
    expect(shipStoreProblem('x'.repeat(600 * 1024))).toMatch(/512/);
  });
});
