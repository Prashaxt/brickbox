import type { Pt } from './geometry';

export type ShadowKind = 'followLight' | 'bottom';
export interface ShadowSpec { mode: ShadowKind; blur?: number; spread?: number; color?: string }

/** The share of its depth the box keeps while pressed (1 means no press). Takes 80 or "80%", clamped to 0..99. */
export function pressRatio(v: number | string | undefined): number {
  const p = typeof v === 'number' ? v : v == null ? 0 : parseFloat(v);
  return 1 - Math.min(99, Math.max(0, isNaN(p) ? 0 : p)) / 100;
}

/** Parse `none`, `followLight` or `bottom`, optionally followed by `blur spread color`. Returns null for no shadow. */
export function parseShadow(s: string | undefined | null): ShadowSpec | null {
  if (!s) return null;
  const m = s.trim().match(/^(\S+)\s*([\s\S]*)$/);
  if (!m) return null;
  const word = m[1].toLowerCase();
  const mode: ShadowKind | null = word === 'followlight' ? 'followLight' : word === 'bottom' ? 'bottom' : null;
  if (!mode) return null;
  let rest = m[2];
  const num = (): number | undefined => {
    const r = rest.match(/^\s*(-?(?:\d+\.?\d*|\.\d+))(?:px)?(?=\s|$)/);
    if (!r) return undefined;
    rest = rest.slice(r[0].length);
    return parseFloat(r[1]);
  };
  const blur = num();
  const spread = blur === undefined ? undefined : num();
  return { mode, blur: blur === undefined ? undefined : Math.max(0, blur), spread, color: rest.trim() || undefined };
}

/** Unit direction the shadow is cast, in screen coordinates (x right, y down). It points away from the light. */
export function shadowVector(mode: ShadowKind, lightDeg: number): [number, number] {
  if (mode === 'bottom') return [0, 1];
  const a = (lightDeg * Math.PI) / 180;
  return [-Math.sin(a), Math.cos(a)];
}

/** Polygons as one SVG path. Fill it with the even-odd rule so holes stay holes. */
export function polysToPath(polys: Pt[][]): string {
  return polys.map((P) => 'M' + P.map((p) => `${+p[0].toFixed(2)} ${+p[1].toFixed(2)}`).join('L') + 'Z').join('');
}

/**
 * Where the shadow falls, as a CSS matrix(a, b, c, d, e, f) applied about the centre of the face.
 *
 * The shadow is the front face projected along the light onto the page behind the box. A point that is `h` above
 * the page lands `k * h` away from where it appears, in the direction (vx, vy). Tilting the box lifts one side of
 * the face and lowers the other, so `h` depends on where the point is, and that makes the whole mapping affine.
 * Perspective is ignored.
 *
 * tx and ty are the box's tilt in degrees as given to setT, which applies rotateX(tx) then rotateY(-ty).
 * hPivot is how high the rotation pivot sits above the page, and zFace is how far in front of the pivot the face is.
 */
export function shadowMatrix(tx: number, ty: number, hPivot: number, zFace: number, vx: number, vy: number, k = 0.6): [number, number, number, number, number, number] {
  const th = (tx * Math.PI) / 180, ph = (-ty * Math.PI) / 180;
  const ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph), z = zFace;
  const h0 = hPivot + z * cp * ct;
  return [
    cp - k * vx * sp * ct,       // x from u
    sp * st - k * vy * sp * ct,  // y from u
    k * vx * st,                 // x from v
    ct + k * vy * st,            // y from v
    z * sp + k * vx * h0,
    -z * cp * st + k * vy * h0,
  ];
}
