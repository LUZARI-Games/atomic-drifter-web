import { describe, expect, it } from 'vitest';
import { convexHull, depth, drawOrder, makeView, project } from './projection';

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

  it('isometric: turned 45° sideways, a floor square becomes a diamond', () => {
    const v = makeView(30, 45);
    const right = project(v, [1, 0, 0]);
    const down = project(v, [0, 1, 0]);
    expect(right[0]).toBeCloseTo(Math.SQRT1_2);
    expect(down[0]).toBeCloseTo(-Math.SQRT1_2);
    expect(right[1]).toBeCloseTo(down[1]); // both edges go down by the same amount
    expect(Math.abs(right[0] / right[1])).toBeCloseTo(2); // classic 2:1 pixel iso at 30°
  });

  it('isometric depth: the corner nearest the viewer is drawn last', () => {
    const v = makeView(30, 45);
    expect(depth(v, [1, 1, 0])).toBeGreaterThan(depth(v, [1, 0, 0]));
    expect(depth(v, [1, 0, 0])).toBeGreaterThan(depth(v, [0, 0, 0]));
  });

  it('draw order: a long wall behind a block comes first even if its far end is "nearer"', () => {
    const v = makeView(30, 45);
    const wall = { minX: 0, maxX: 4, minY: -0.1, maxY: 0.1 }; // long wall along x, behind
    const block = { minX: 0.3, maxX: 1.7, minY: 0.3, maxY: 1.7 }; // in front of the wall
    const nearest = (b: typeof wall) => depth(v, [b.maxX, b.maxY, 0]);
    expect(nearest(wall)).toBeGreaterThan(nearest(block)); // the naive key would draw the wall over the block
    expect(drawOrder(v, [block, wall], [nearest(block), nearest(wall)])).toEqual([1, 0]);
  });

  it('draw order: fixed pairs win (a symbol after its block, even when it would be ready first)', () => {
    const v = makeView(90);
    const wall = { minX: 0, maxX: 1, minY: 0, maxY: 0.2 };
    const block = { minX: 0, maxX: 1, minY: 0.5, maxY: 1 };
    const symbol = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    // keys would put the symbol before the block; the block waits for the wall behind it
    expect(drawOrder(v, [wall, block, symbol], [0, 0.5, 0.1], [[1, 2]])).toEqual([0, 1, 2]);
  });

  it('hull keeps only the outline', () => {
    const h = convexHull([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1]]);
    expect(h).toHaveLength(4);
    expect(h).not.toContainEqual([1, 1]);
  });
});
