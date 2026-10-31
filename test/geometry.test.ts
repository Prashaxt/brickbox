import { describe, it, expect } from 'vitest';
import { colorAt, outline, parseGradient, scaleRadii, splitTop } from '../src/geometry';

describe('outline', () => {
  it('gives four corner points for a sharp rectangle, counter-clockwise from top-left', () => {
    expect(outline(100, 50, [0, 0, 0, 0], 0.25)).toEqual([[0, 0], [0, 50], [100, 50], [100, 0]]);
  });

  it('keeps curved walls within the tolerance of the true arc', () => {
    const r = 28, tol = 0.25, w = 300, h = 190;
    const P = outline(w, h, [r, r, r, r], tol);
    expect(P.length).toBeGreaterThan(4 * 3);
    // top-left corner arc centre is (r, r); midpoints of arc chords must be within tol of the circle
    const arc = P.filter(([x, y]) => x <= r + 1e-6 && y <= r + 1e-6);
    for (let i = 0; i < arc.length - 1; i++) {
      const mx = (arc[i][0] + arc[i + 1][0]) / 2 - r, my = (arc[i][1] + arc[i + 1][1]) / 2 - r;
      const dist = Math.hypot(mx, my);
      expect(dist).toBeLessThanOrEqual(r + 1e-6);
      expect(dist).toBeGreaterThanOrEqual(r - tol - 1e-6);
    }
  });

  it('uses more segments for a bigger radius at the same tolerance', () => {
    const small = outline(300, 300, [10, 10, 10, 10], 0.25).length;
    const big = outline(300, 300, [140, 140, 140, 140], 0.25).length;
    expect(big).toBeGreaterThan(small);
  });

  it('stays inside the box', () => {
    for (const [x, y] of outline(230, 230, [115, 115, 115, 115], 0.25)) {
      expect(x).toBeGreaterThanOrEqual(-1e-6);
      expect(x).toBeLessThanOrEqual(230 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(-1e-6);
      expect(y).toBeLessThanOrEqual(230 + 1e-6);
    }
  });
});

describe('scaleRadii', () => {
  it('shrinks a pill so adjacent radii fit the side', () => {
    expect(scaleRadii([100, 100, 100, 100], 300, 100)).toEqual([50, 50, 50, 50]);
  });
  it('leaves radii that already fit', () => {
    expect(scaleRadii([10, 20, 30, 40], 300, 200)).toEqual([10, 20, 30, 40]);
  });
});

describe('gradient parsing', () => {
  const g = 'linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255))';
  it('splits on top-level commas only', () => {
    expect(splitTop('90deg, rgb(1, 2, 3), rgb(4, 5, 6)')).toEqual(['90deg', 'rgb(1, 2, 3)', 'rgb(4, 5, 6)']);
  });
  it('parses angle and stops', () => {
    const p = parseGradient(g)!;
    expect(p.ang).toBe(90);
    expect(p.st.map((s) => s.t)).toEqual([0, 1]);
  });
  it('fills in missing stop positions evenly', () => {
    const p = parseGradient('linear-gradient(0deg, rgb(0, 0, 0), rgb(10, 10, 10), rgb(20, 20, 20))')!;
    expect(p.st.map((s) => s.t)).toEqual([0, 0.5, 1]);
  });
  it('maps "to" keywords to angles and defaults to 180', () => {
    expect(parseGradient('linear-gradient(to right, rgb(0, 0, 0), rgb(1, 1, 1))')!.ang).toBe(90);
    expect(parseGradient('linear-gradient(to bottom right, rgb(0, 0, 0), rgb(1, 1, 1))')!.ang).toBe(135);
    expect(parseGradient('linear-gradient(rgb(0, 0, 0), rgb(1, 1, 1))')!.ang).toBe(180);
  });
  it('rejects px stops, multiple layers and non-rgb colours', () => {
    expect(parseGradient('linear-gradient(90deg, rgb(0, 0, 0) 10px, rgb(1, 1, 1))')).toBeNull();
    expect(parseGradient(`${g}, ${g}`)).toBeNull();
    expect(parseGradient('linear-gradient(90deg, red, blue)')).toBeNull();
  });
  it('samples colours along a 90deg gradient', () => {
    const p = parseGradient(g)!;
    expect(colorAt(p, 0, 10, 200, 100)).toBe('rgba(255,0,0,1)');
    expect(colorAt(p, 200, 10, 200, 100)).toBe('rgba(0,0,255,1)');
    expect(colorAt(p, 100, 10, 200, 100)).toBe('rgba(127.5,0,127.5,1)');
  });
  it('samples a vertical gradient by y', () => {
    const p = parseGradient('linear-gradient(180deg, rgb(0, 0, 0), rgb(100, 100, 100))')!;
    expect(colorAt(p, 50, 0, 100, 100)).toBe('rgba(0,0,0,1)');
    expect(colorAt(p, 50, 100, 100, 100)).toBe('rgba(100,100,100,1)');
  });
});
