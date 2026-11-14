import { describe, it, expect } from 'vitest';
import { area, flatten } from '../src/geometry';
import type { Pt } from '../src/geometry';

/** A circle as a function of distance along it, with a counter for how many times it is asked. */
function circle(r: number, cx = 0, cy = 0) {
  const calls = { n: 0 };
  const at = (t: number): Pt => { calls.n++; return [cx + r * Math.cos(t / r), cy + r * Math.sin(t / r)]; };
  return { total: 2 * Math.PI * r, at, calls };
}

describe('flatten', () => {
  it('keeps a gentle curve within the tolerance with far fewer samples than one per pixel', () => {
    const tol = 0.25, r = 80, { total, at, calls } = circle(r);
    const P = flatten(total, at, tol);
    // every vertex is on the circle, so the worst error is the sagitta of the longest chord
    let worst = 0;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      worst = Math.max(worst, r - Math.sqrt(Math.max(0, r * r - (len / 2) ** 2)));
    }
    expect(worst).toBeLessThanOrEqual(tol);
    expect(calls.n).toBeLessThan(total / 3); // the old sampler used about one call per pixel
  });

  it('adds samples where the curve bends harder', () => {
    const tol = 0.25, loose = circle(80), tight = circle(12);
    const a = flatten(loose.total, loose.at, tol).length / loose.total;
    const b = flatten(tight.total, tight.at, tol).length / tight.total;
    expect(b).toBeGreaterThan(a); // vertices per px of edge: a small circle needs more
  });

  it('keeps every corner of a square even though samples are coarse', () => {
    const S = 100, tol = 0.25, total = 4 * S;
    const at = (t: number): Pt => {
      const u = ((t % total) + total) % total;
      if (u < S) return [u, 0];
      if (u < 2 * S) return [S, u - S];
      if (u < 3 * S) return [S - (u - 2 * S), S];
      return [0, S - (u - 3 * S)];
    };
    const P = flatten(total, at, tol);
    for (const corner of [[0, 0], [S, 0], [S, S], [0, S]]) {
      const near = Math.min(...P.map((p) => Math.hypot(p[0] - corner[0], p[1] - corner[1])));
      expect(near).toBeLessThanOrEqual(tol);
    }
    expect(Math.abs(Math.abs(area(P)) - S * S)).toBeLessThan(total * tol); // area matches the true square
  });

  it('still works on a tiny path', () => {
    const { total, at } = circle(2);
    expect(flatten(total, at, 0.25).length).toBeGreaterThanOrEqual(8);
  });
});
