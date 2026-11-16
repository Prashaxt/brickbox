import { describe, it, expect } from 'vitest';
import { shadowMatrix } from '../src/parse';

type V3 = [number, number, number];
const rx = (a: number) => (p: V3): V3 => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
const ry = (a: number) => (p: V3): V3 => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
const rad = (d: number) => (d * Math.PI) / 180;

/** The long way round: rotate a face point exactly as CSS rotateX(tx) rotateY(-ty) does, then project it along the light. */
function brute(tx: number, ty: number, hPivot: number, zFace: number, vx: number, vy: number, k: number, u: number, v: number) {
  const q = rx(rad(tx))(ry(rad(-ty))([u, v, zFace]));
  const h = hPivot + q[2];
  return [q[0] + k * vx * h, q[1] + k * vy * h];
}
const apply = (m: number[], u: number, v: number) => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]];

describe('shadowMatrix', () => {
  it('at rest is a plain offset of k times the depth, away from the light', () => {
    const d = 40, m = shadowMatrix(0, 0, d / 2, d / 2, 0.6, 0.8);
    expect(m[0]).toBeCloseTo(1); expect(m[1]).toBeCloseTo(0); expect(m[2]).toBeCloseTo(0); expect(m[3]).toBeCloseTo(1);
    expect(m[4]).toBeCloseTo(0.6 * 0.6 * d); expect(m[5]).toBeCloseTo(0.6 * 0.8 * d);
  });

  it('matches projecting rotated 3D points the long way, at many tilts, lights and points', () => {
    for (const [tx, ty] of [[0, 0], [14, -20], [-30, 25], [45, 10], [-10, -55], [60, 60]]) {
      for (const [vx, vy] of [[0, 1], [0.707, 0.707], [-1, 0], [0.5, -0.866]]) {
        for (const [d, p] of [[40, 1], [40, 0.3], [12, 0.01]]) {
          const hPivot = d / 2, zFace = d * (p - 0.5), m = shadowMatrix(tx, ty, hPivot, zFace, vx, vy);
          for (const [u, v] of [[0, 0], [100, 0], [-100, 30], [20, -60], [90, 70]]) {
            const a = apply(m, u, v), b = brute(tx, ty, hPivot, zFace, vx, vy, 0.6, u, v);
            expect(a[0]).toBeCloseTo(b[0], 8); expect(a[1]).toBeCloseTo(b[1], 8);
          }
        }
      }
    }
  });

  it('tightens as the box is pressed in', () => {
    const d = 40, dist = (p: number) => Math.hypot(...(shadowMatrix(0, 0, d / 2, d * (p - 0.5), 0, 1).slice(4) as [number, number]));
    expect(dist(1)).toBeCloseTo(0.6 * d);
    expect(dist(0.5)).toBeCloseTo(0.6 * d * 0.5);
    expect(dist(0.01)).toBeCloseTo(0.6 * d * 0.01);
  });

  it('casts a longer shadow from the side that lifts toward the viewer', () => {
    // tilt so the right side of the face comes toward the viewer (positive ty), light from above so the shadow falls down
    const m = shadowMatrix(0, 30, 20, 20, 0, 1), right = apply(m, 100, 0), left = apply(m, -100, 0);
    expect(right[1]).toBeGreaterThan(left[1]);
  });

  it('stays finite at steep angles', () => {
    for (const a of [60, 75, 85]) for (const n of shadowMatrix(a, -a, 20, 20, 0.7, 0.7)) expect(Number.isFinite(n)).toBe(true);
  });
});
