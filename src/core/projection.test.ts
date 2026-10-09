import { describe, expect, it } from 'vitest';
import { convexHull, depth, makeView, project } from './projection';

describe('look-down projection', () => {
  it('90° is plain top-down: height disappears', () => {
    const v = makeView(90);
    const [x, y] = project(v, [1, 2, 5]);
    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(2);
  });

  it('45° squashes the floor and lifts heights by the same factor', () => {
    const v = makeView(45);
    expect(project(v, [0, 1, 0])[1]).toBeCloseTo(Math.SQRT1_2);
    expect(project(v, [0, 0, 1])[1]).toBeCloseTo(-Math.SQRT1_2); // up = up on screen
    expect(project(v, [3, 0, 0])[0]).toBe(3); // no perspective: x unchanged
  });

  it('nearer and higher things are drawn later', () => {
    const v = makeView(45);
    expect(depth(v, [0, 1, 0])).toBeGreaterThan(depth(v, [0, 0, 0]));
    expect(depth(v, [0, 0, 1])).toBeGreaterThan(depth(v, [0, 0, 0]));
  });

  it('hull keeps only the outline', () => {
    const h = convexHull([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1]]);
    expect(h).toHaveLength(4);
    expect(h).not.toContainEqual([1, 1]);
  });
});
