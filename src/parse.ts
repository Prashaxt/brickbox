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
