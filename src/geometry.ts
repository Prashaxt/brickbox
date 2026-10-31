export type Pt = [number, number];
export interface Stop { raw: string; c: number[]; t: number }
export interface Gradient { ang: number; st: Stop[] }

/** Split on commas that are not inside parentheses. */
export function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, buf = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && !depth) { out.push(buf.trim()); buf = ''; } else buf += ch;
  }
  out.push(buf.trim());
  return out;
}

/** Parse a computed single-layer linear-gradient with rgb()/rgba() stops. Returns null for anything else. */
export function parseGradient(s: string): Gradient | null {
  if ((s.match(/gradient\(/g) || []).length !== 1) return null;
  const p = splitTop(s.slice(s.indexOf('(') + 1, s.lastIndexOf(')')));
  let ang = 180;
  if (/^to /.test(p[0]) || /deg$/.test(p[0])) {
    const a = p.shift()!;
    if (/deg$/.test(a)) ang = parseFloat(a);
    else {
      const t = /top/.test(a), b = /bottom/.test(a), l = /left/.test(a), r = /right/.test(a);
      ang = t && r ? 45 : b && r ? 135 : b && l ? 225 : t && l ? 315 : r ? 90 : l ? 270 : t ? 0 : 180;
    }
  }
  const st: { raw: string; c: number[]; t: number | null }[] = [];
  for (const x of p) {
    const m = x.match(/^(rgba?\([^)]*\))\s*([\d.]+)?%?$/);
    if (!m || /px|em/.test(x)) return null;
    const c = m[1].match(/[\d.]+/g)!.map(Number);
    if (c.length < 4) c.push(1);
    st.push({ raw: x, c, t: m[2] == null ? null : +m[2] / 100 });
  }
  if (st.length < 2) return null;
  if (st[0].t == null) st[0].t = 0;
  if (st[st.length - 1].t == null) st[st.length - 1].t = 1;
  for (let i = 1; i < st.length; i++) {
    if (st[i].t != null) continue;
    let j = i;
    while (st[j].t == null) j++;
    const a = st[i - 1].t!, b = st[j].t!;
    for (let k = i; k < j; k++) st[k].t = a + ((b - a) * (k - i + 1)) / (j - i + 1);
  }
  return { ang, st: st as Stop[] };
}

/** Colour of the gradient at point (x, y) inside a w by h box. */
export function colorAt(g: Gradient, x: number, y: number, w: number, h: number): string {
  const a = (g.ang * Math.PI) / 180;
  const L = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
  const t = ((x - w / 2) * Math.sin(a) - (y - h / 2) * Math.cos(a)) / L + 0.5;
  const s = g.st;
  if (t <= s[0].t) return `rgba(${s[0].c})`;
  for (let i = 1; i < s.length; i++) {
    if (t <= s[i].t) {
      const u = (t - s[i - 1].t) / (s[i].t - s[i - 1].t || 1);
      const A = s[i - 1].c, B = s[i].c;
      return `rgba(${A.map((v, k) => +(v + (B[k] - v) * u).toFixed(2))})`;
    }
  }
  return `rgba(${s[s.length - 1].c})`;
}

/** CSS overflow rule: shrink all radii proportionally when adjacent ones exceed a side. Order: TL, TR, BR, BL. */
export function scaleRadii(R: number[], w: number, h: number): number[] {
  const f = Math.min(1, w / (R[0] + R[1]), w / (R[3] + R[2]), h / (R[0] + R[3]), h / (R[1] + R[2]));
  return R.map((r) => r * f);
}

/**
 * Outline of a rounded rectangle as a closed polygon, counter-clockwise on screen (y down),
 * so each wall strip faces outward. Radii order: TL, TR, BR, BL.
 */
export function outline(w: number, h: number, R: number[], tol: number): Pt[] {
  const P: Pt[] = [];
  const corners: [number, number, number, number, number, number][] = [
    [1, w - R[1], R[1], -90, w, 0],
    [2, w - R[2], h - R[2], 0, w, h],
    [3, R[3], h - R[3], 90, 0, h],
    [0, R[0], R[0], 180, 0, 0],
  ];
  for (const [i, cx, cy, a0, px, py] of corners) {
    const r = R[i];
    const n = r > 0.5 ? Math.max(1, Math.ceil(Math.PI / 2 / (2 * Math.acos(Math.max(0, 1 - tol / r))))) : 0;
    if (!n) P.push([px, py]);
    else for (let k = 0; k <= n; k++) {
      const a = ((a0 + (90 * k) / n) * Math.PI) / 180;
      P.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return P.reverse();
}
