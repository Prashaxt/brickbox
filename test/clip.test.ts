import { describe, it, expect } from 'vitest';
import { clipOutline, splitWs } from '../src/geometry';

/** A stand-in for the browser: understands only `calc(100% - Npx)` and `min(50%, Npx)`. */
const resolve = (t: string, ref: number): number => {
  let m = t.match(/^calc\(100% - (\d+(?:\.\d+)?)px\)$/);
  if (m) return ref - parseFloat(m[1]);
  m = t.match(/^min\(50%, (\d+(?:\.\d+)?)px\)$/);
  if (m) return Math.min(ref / 2, parseFloat(m[1]));
  return NaN;
};

describe('splitWs', () => {
  it('splits on spaces but keeps a function call whole', () => {
    expect(splitWs('calc(100% - 10px) 0')).toEqual(['calc(100% - 10px)', '0']);
    expect(splitWs('  10px   20%  ')).toEqual(['10px', '20%']);
    expect(splitWs('min(50%, 40px) calc(10px + (2 * 3px))')).toEqual(['min(50%, 40px)', 'calc(10px + (2 * 3px))']);
    expect(splitWs('')).toEqual([]);
  });
});

describe('clipOutline with a length resolver', () => {
  it('still reads plain px and % without one', () => {
    expect(clipOutline('polygon(0px 0px, 50% 0px, 100% 100%)', 100, 50, 0.25)).toEqual([[[0, 0], [50, 0], [100, 50]]]);
  });
  it('rejects calc() when nothing can resolve it', () => {
    expect(clipOutline('polygon(0 0, calc(100% - 10px) 0, 100% 100%)', 100, 50, 0.25)).toBeNull();
  });
  it('resolves calc() in a polygon, against width for x and height for y', () => {
    const P = clipOutline('polygon(0px 0px, calc(100% - 10px) 0px, 100% calc(100% - 5px), 0px 100%)', 100, 50, 0.25, resolve)!;
    expect(P[0]).toEqual([[0, 0], [90, 0], [100, 45], [0, 50]]);
  });
  it('resolves values inside inset() and its round radii', () => {
    const P = clipOutline('inset(min(50%, 8px) 0px 0px 0px round min(50%, 6px))', 100, 40, 0.25, resolve)!;
    expect(Math.min(...P[0].map((p) => p[1]))).toBeCloseTo(8); // the top edge starts 8px down
    expect(P[0].length).toBeGreaterThan(4);                  // and its corners are rounded
  });
  it('resolves a circle radius and centre', () => {
    const P = clipOutline('circle(calc(100% - 60px) at calc(100% - 50px) 50%)', 100, 100, 0.25, resolve)!;
    // radius is a percent of sqrt((w^2+h^2)/2), which is 100 here, so 40 after the calc
    const xs = P[0].map((p) => p[0]), cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    expect(cx).toBeCloseTo(50, 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(80, 0);
  });
  it('returns null when the resolver cannot make sense of a value', () => {
    expect(clipOutline('polygon(0 0, calc(nonsense) 0, 100% 100%)', 100, 50, 0.25, resolve)).toBeNull();
  });
});
