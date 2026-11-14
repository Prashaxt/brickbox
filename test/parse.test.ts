import { describe, it, expect } from 'vitest';
import { parseShadow, polysToPath, pressRatio, shadowVector } from '../src/parse';

describe('pressRatio', () => {
  it('means no press when unset or 0', () => {
    expect(pressRatio(undefined)).toBe(1);
    expect(pressRatio(0)).toBe(1);
    expect(pressRatio('0%')).toBe(1);
  });
  it('reads a percent of depth from a number or a string', () => {
    expect(pressRatio(80)).toBeCloseTo(0.2);
    expect(pressRatio('80%')).toBeCloseTo(0.2);
    expect(pressRatio('10')).toBeCloseTo(0.9);
  });
  it('clamps at 99 so the walls never collapse to nothing', () => {
    expect(pressRatio(100)).toBeCloseTo(0.01);
    expect(pressRatio(250)).toBeCloseTo(0.01);
    expect(pressRatio(-5)).toBe(1);
    expect(pressRatio('nonsense')).toBe(1);
  });
});

describe('parseShadow', () => {
  it('returns null for none, unset and unknown words', () => {
    expect(parseShadow('none')).toBeNull();
    expect(parseShadow(undefined)).toBeNull();
    expect(parseShadow('')).toBeNull();
    expect(parseShadow('sideways')).toBeNull();
  });
  it('reads just a mode', () => {
    expect(parseShadow('followLight')).toEqual({ mode: 'followLight', blur: undefined, spread: undefined, color: undefined });
    expect(parseShadow('  BOTTOM ')?.mode).toBe('bottom');
  });
  it('reads blur, spread and color like box-shadow', () => {
    expect(parseShadow('followLight 12px 2px rgba(0,0,0,.4)')).toEqual({ mode: 'followLight', blur: 12, spread: 2, color: 'rgba(0,0,0,.4)' });
    expect(parseShadow('bottom 8px 0 #0003')).toEqual({ mode: 'bottom', blur: 8, spread: 0, color: '#0003' });
    expect(parseShadow('bottom 6 -3 red')).toEqual({ mode: 'bottom', blur: 6, spread: -3, color: 'red' });
  });
  it('lets you leave parts out', () => {
    expect(parseShadow('bottom rgba(0, 0, 0, .3)')).toEqual({ mode: 'bottom', blur: undefined, spread: undefined, color: 'rgba(0, 0, 0, .3)' });
    expect(parseShadow('followLight 10px')).toEqual({ mode: 'followLight', blur: 10, spread: undefined, color: undefined });
    expect(parseShadow('bottom 10px blue')).toEqual({ mode: 'bottom', blur: 10, spread: undefined, color: 'blue' });
  });
  it('never gives a negative blur', () => {
    expect(parseShadow('bottom -4px')?.blur).toBe(0);
  });
});

describe('shadowVector', () => {
  it('goes straight down for "bottom", whatever the light does', () => {
    expect(shadowVector('bottom', 315)).toEqual([0, 1]);
    expect(shadowVector('bottom', 90)).toEqual([0, 1]);
  });
  it('points away from the light', () => {
    const [tlx, tly] = shadowVector('followLight', 315); // light from the top-left
    expect(tlx).toBeCloseTo(Math.SQRT1_2); expect(tly).toBeCloseTo(Math.SQRT1_2);
    const [rx, ry] = shadowVector('followLight', 90);    // light from the right
    expect(rx).toBeCloseTo(-1); expect(ry).toBeCloseTo(0);
    const [tx, ty] = shadowVector('followLight', 0);     // light from the top
    expect(tx).toBeCloseTo(0); expect(ty).toBeCloseTo(1);
    const [bx, by] = shadowVector('followLight', 180);   // light from below
    expect(bx).toBeCloseTo(0); expect(by).toBeCloseTo(-1);
  });
  it('has length one at any angle', () => {
    for (const a of [0, 30, 137, 200, 359]) { const [x, y] = shadowVector('followLight', a); expect(Math.hypot(x, y)).toBeCloseTo(1); }
  });
});

describe('polysToPath', () => {
  it('writes one closed subpath per polygon, so holes can use even-odd fill', () => {
    expect(polysToPath([[[0, 0], [10, 0], [10, 10]], [[2, 2], [4, 2], [4, 4]]])).toBe('M0 0L10 0L10 10ZM2 2L4 2L4 4Z');
  });
  it('rounds long decimals', () => {
    expect(polysToPath([[[0.123456, 1], [2, 3.987654], [5, 5]]])).toBe('M0.12 1L2 3.99L5 5Z');
  });
});
