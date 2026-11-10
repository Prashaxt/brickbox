import { describe, it, expect } from 'vitest';
import { area, classify, clipOutline, clipToBox, fitRadii, inShape, orient, outline, pointInPoly, simplify } from '../src/geometry';

const sq = (a: number, b: number): [number, number][] => [[a, a], [b, a], [b, b], [a, b]];

describe('winding and hit tests', () => {
  it('outline() has negative area and orient() matches it', () => {
    const r = outline(100, 50, [0, 0, 0, 0], 0.25);
    expect(area(r)).toBeLessThan(0);
    expect(area(orient(sq(0, 10), -1))).toBeLessThan(0);
    expect(area(orient(sq(0, 10), 1))).toBeGreaterThan(0);
  });
  it('tests points against a polygon', () => {
    expect(pointInPoly(sq(0, 100), 50, 50)).toBe(true);
    expect(pointInPoly(sq(0, 100), 150, 50)).toBe(false);
  });
  it('treats an inner polygon as a hole', () => {
    const polys = [sq(0, 100), sq(25, 75)];
    expect(inShape(polys, 10, 10)).toBe(true);
    expect(inShape(polys, 50, 50)).toBe(false);
  });
  it('classify() winds holes the opposite way to the outer shape', () => {
    const [outer, hole] = classify([sq(0, 100), sq(25, 75)]);
    expect(area(outer)).toBeLessThan(0);
    expect(area(hole)).toBeGreaterThan(0);
  });
});

describe('nested shapes', () => {
  it('winds three concentric polygons solid, hole, solid', () => {
    const [a, b, c] = classify([sq(0, 100), sq(20, 80), sq(40, 60)]);
    expect(area(a)).toBeLessThan(0);
    expect(area(b)).toBeGreaterThan(0);
    expect(area(c)).toBeLessThan(0);
  });
  it('keeps two separate islands solid', () => {
    const [a, b] = classify([sq(0, 40), sq(60, 100)]);
    expect(area(a)).toBeLessThan(0);
    expect(area(b)).toBeLessThan(0);
  });
});

describe('simplify', () => {
  it('drops collinear points and keeps the corners', () => {
    const P: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 3], [0, 3]];
    expect(simplify(P, 0.01)).toEqual([[0, 0], [3, 0], [3, 3], [0, 3]]);
  });
});

describe('elliptical corners', () => {
  it('fits radii to the box like CSS', () => {
    const [rx, ry] = fitRadii([100, 100, 100, 100], [10, 10, 10, 10], 100, 100);
    expect(rx).toEqual([50, 50, 50, 50]);
    expect(ry).toEqual([5, 5, 5, 5]);
  });
  it('builds an outline with elliptical corners that stays inside the box', () => {
    const P = outline(200, 100, [100, 100, 100, 100], 0.25, [50, 50, 50, 50]);
    expect(P.length).toBeGreaterThan(8);
    for (const [x, y] of P) {
      expect(x).toBeGreaterThanOrEqual(-1e-6); expect(x).toBeLessThanOrEqual(200 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(-1e-6); expect(y).toBeLessThanOrEqual(100 + 1e-6);
    }
  });
});

describe('clipOutline', () => {
  it('reads a polygon with mixed % and px', () => {
    expect(clipOutline('polygon(50% 0px, 100% 50%, 50% 100%, 0% 50%)', 200, 100, 0.25)).toEqual([[[100, 0], [200, 50], [100, 100], [0, 50]]]);
  });
  it('skips a leading fill rule', () => {
    expect(clipOutline('polygon(evenodd, 0px 0px, 10px 0px, 10px 10px)', 100, 100, 0.25)![0]).toHaveLength(3);
  });
  it('rejects calc(), unknown functions and too few points', () => {
    expect(clipOutline('polygon(calc(50% + 10px) 0px, 100% 0%, 0% 100%)', 100, 100, 0.25)).toBeNull();
    expect(clipOutline('url(#clip)', 100, 100, 0.25)).toBeNull();
    expect(clipOutline('polygon(0px 0px, 10px 10px)', 100, 100, 0.25)).toBeNull();
  });
  it('reads a circle, with % relative to the box diagonal', () => {
    const P = clipOutline('circle(50% at 50% 50%)', 100, 100, 0.25)![0];
    expect(P.length).toBeGreaterThanOrEqual(12);
    for (const [x, y] of P) expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(50, 5);
  });
  it('reads an ellipse and its keywords', () => {
    const P = clipOutline('ellipse(50% 25% at 50% 50%)', 200, 100, 0.25)![0];
    for (const [x, y] of P) expect(((x - 100) / 100) ** 2 + ((y - 50) / 25) ** 2).toBeCloseTo(1, 5);
    const Q = clipOutline('circle(closest-side at center)', 100, 60, 0.25)![0];
    for (const [x, y] of Q) expect(Math.hypot(x - 50, y - 30)).toBeCloseTo(30, 5);
  });
  it('reads an inset with rounded corners', () => {
    const P = clipOutline('inset(10px round 20px)', 200, 100, 0.25)![0];
    const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(10); expect(Math.max(...xs)).toBeCloseTo(190);
    expect(Math.min(...ys)).toBeCloseTo(10); expect(Math.max(...ys)).toBeCloseTo(90);
  });
  it('rejects an inset that leaves no box', () => {
    expect(clipOutline('inset(60px 60px 60px 60px)', 100, 100, 0.25)).toBeNull();
  });
});

describe('clipToBox', () => {
  it('leaves a polygon that is already inside the box alone', () => {
    const P = sq(10, 90);
    expect(clipToBox(P, 100, 100)).toBe(P);
  });
  it('cuts a polygon that spills past the box down to the box', () => {
    const P = clipToBox(sq(-50, 150), 100, 100);
    expect(Math.abs(area(P))).toBeCloseTo(10000);
    for (const [x, y] of P) {
      expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(100 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(-1e-9); expect(y).toBeLessThanOrEqual(100 + 1e-9);
    }
  });
  it('flattens a round bottom that runs past the box edge', () => {
    const blob: [number, number][] = [[0, 0], [140, 0], [140, 60], [70, 120], [0, 60]];
    const P = clipToBox(blob, 140, 90);
    expect(Math.max(...P.map((p) => p[1]))).toBeCloseTo(90);
  });
  it('returns nothing when the polygon is entirely outside', () => {
    expect(clipToBox(sq(200, 300), 100, 100)).toHaveLength(0);
  });
});
