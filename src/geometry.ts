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

/** Shoelace area with y down. Outlines from outline() have negative area. */
export function area(P: Pt[]): number {
  let s = 0;
  for (let i = 0; i < P.length; i++) {
    const [a, b] = P[i], [c, d] = P[(i + 1) % P.length];
    s += a * d - c * b;
  }
  return s / 2;
}

/** Wind a polygon the way outline() does (want -1) or the opposite way (want 1). */
export function orient(P: Pt[], want: 1 | -1 = -1): Pt[] {
  const a = area(P);
  return a === 0 || Math.sign(a) === want ? P : [...P].reverse();
}

export function pointInPoly(P: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd hit test across several polygons, so holes work. */
export function inShape(polys: Pt[][], x: number, y: number): boolean {
  let r = false;
  for (const P of polys) if (pointInPoly(P, x, y)) r = !r;
  return r;
}

function lineDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  if (!l) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / Math.sqrt(l);
}

/** Douglas-Peucker for a closed polygon: drop points that deviate less than tol from the line between neighbours. */
export function simplify(P: Pt[], tol: number): Pt[] {
  const n = P.length;
  if (n < 4) return P;
  let far = 0, fd = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1]);
    if (d > fd) { fd = d; far = i; }
  }
  const keep = new Array<boolean>(n).fill(false);
  keep[0] = keep[far] = true;
  const chain = [...P, P[0]];
  const stack: [number, number][] = [[0, far], [far, n]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = lineDist(chain[i], chain[a], chain[b]);
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keep[mi] = true; stack.push([a, mi], [mi, b]); }
  }
  return P.filter((_, i) => keep[i]);
}

/** Fit elliptical corner radii to the box, as CSS does. Order: TL, TR, BR, BL. */
export function fitRadii(Rx: number[], Ry: number[], w: number, h: number): [number[], number[]] {
  const f = Math.min(1, w / (Rx[0] + Rx[1]), w / (Rx[3] + Rx[2]), h / (Ry[0] + Ry[3]), h / (Ry[1] + Ry[2]));
  return [Rx.map((r) => r * f), Ry.map((r) => r * f)];
}

/**
 * Outline of a rounded rectangle as a closed polygon, counter-clockwise on screen (y down),
 * so each wall strip faces outward. Radii order: TL, TR, BR, BL. Ry defaults to Rx (circular corners).
 */
export function outline(w: number, h: number, Rx: number[], tol: number, Ry: number[] = Rx): Pt[] {
  const P: Pt[] = [];
  const corners: [number, number, number, number, number, number][] = [
    [1, w - Rx[1], Ry[1], -90, w, 0],
    [2, w - Rx[2], h - Ry[2], 0, w, h],
    [3, Rx[3], h - Ry[3], 90, 0, h],
    [0, Rx[0], Ry[0], 180, 0, 0],
  ];
  for (const [i, cx, cy, a0, px, py] of corners) {
    const rx = Rx[i], ry = Ry[i], r = Math.max(rx, ry);
    const n = r > 0.5 ? Math.max(1, Math.ceil(Math.PI / 2 / (2 * Math.acos(Math.max(0, 1 - tol / r))))) : 0;
    if (!n) P.push([px, py]);
    else for (let k = 0; k <= n; k++) {
      const a = ((a0 + (90 * k) / n) * Math.PI) / 180;
      P.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
  }
  return P.reverse();
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number, tol: number): Pt[] {
  const r = Math.max(rx, ry, tol);
  const n = Math.max(12, Math.ceil(Math.PI / Math.acos(Math.max(0, 1 - tol / r))));
  const P: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    P.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return P;
}

const len = (t: string | undefined, ref: number): number => {
  if (t == null) return NaN;
  if (/^-?[\d.]+(px)?$/.test(t)) return parseFloat(t);
  if (/^-?[\d.]+%$/.test(t)) return (parseFloat(t) / 100) * ref;
  return NaN;
};
const POS: Record<string, string> = { left: '0%', top: '0%', center: '50%', right: '100%', bottom: '100%' };
function exp4<T>(a: T[]): T[] {
  return a.length === 1 ? [a[0], a[0], a[0], a[0]] : a.length === 2 ? [a[0], a[1], a[0], a[1]] : a.length === 3 ? [a[0], a[1], a[2], a[1]] : a;
}

/**
 * Turn a computed clip-path (polygon, circle, ellipse or inset) into polygons in the element's box.
 * Returns null for anything unsupported, such as calc(), url() or shape(). path() is handled in core.
 */
export function clipOutline(clip: string, w: number, h: number, tol: number): Pt[][] | null {
  const m = clip.trim().match(/^(polygon|circle|ellipse|inset)\(([\s\S]*)\)$/);
  if (!m) return null;
  const arg = m[2].trim();
  if (m[1] === 'polygon') {
    const parts = splitTop(arg);
    if (/^(nonzero|evenodd)$/.test(parts[0])) parts.shift();
    const P: Pt[] = [];
    for (const p of parts) {
      const xy = p.trim().split(/\s+/), x = len(xy[0], w), y = len(xy[1], h);
      if (xy.length !== 2 || isNaN(x) || isNaN(y)) return null;
      P.push([x, y]);
    }
    return P.length >= 3 ? [P] : null;
  }
  if (m[1] === 'inset') {
    const [box, round] = arg.split(/\s+round\s+/);
    const iv = box.trim().split(/\s+/);
    if (iv.length > 4) return null;
    const e = exp4(iv), top = len(e[0], h), right = len(e[1], w), bottom = len(e[2], h), left = len(e[3], w);
    const iw = w - left - right, ih = h - top - bottom;
    if ([top, right, bottom, left].some(isNaN) || !(iw > 0) || !(ih > 0)) return null;
    let Rx = [0, 0, 0, 0], Ry = [0, 0, 0, 0];
    if (round) {
      const [hs, vs] = round.split('/');
      const hx = hs.trim().split(/\s+/), vy = (vs ?? hs).trim().split(/\s+/);
      if (hx.length > 4 || vy.length > 4) return null;
      Rx = exp4(hx).map((t) => len(t, iw));
      Ry = exp4(vy).map((t) => len(t, ih));
      if ([...Rx, ...Ry].some(isNaN)) return null;
    }
    const [fx, fy] = fitRadii(Rx, Ry, iw, ih);
    return [outline(iw, ih, fx, tol, fy).map(([x, y]): Pt => [x + left, y + top])];
  }
  const [shape, pos] = arg.split(/\s+at\s+/);
  const c = (pos || 'center center').trim().split(/\s+/).map((t) => POS[t] ?? t);
  const cx = len(c[0], w), cy = len(c[1] ?? '50%', h), t = shape.trim();
  if (isNaN(cx) || isNaN(cy)) return null;
  if (m[1] === 'circle') {
    const r = t === '' || t === 'closest-side' ? Math.min(cx, w - cx, cy, h - cy)
      : t === 'farthest-side' ? Math.max(cx, w - cx, cy, h - cy)
      : len(t, Math.sqrt((w * w + h * h) / 2));
    return r > 0 ? [ellipsePts(cx, cy, r, r, tol)] : null;
  }
  const [tx, ty] = t ? t.split(/\s+/) : ['closest-side', 'closest-side'];
  const rx = tx === 'closest-side' ? Math.min(cx, w - cx) : tx === 'farthest-side' ? Math.max(cx, w - cx) : len(tx, w);
  const ry = ty === 'closest-side' ? Math.min(cy, h - cy) : ty === 'farthest-side' ? Math.max(cy, h - cy) : len(ty, h);
  return rx > 0 && ry > 0 ? [ellipsePts(cx, cy, rx, ry, tol)] : null;
}

/**
 * Orient polygons for the walls using even-odd nesting: a polygon inside an odd number of others is a hole
 * (walls face into it), and one inside an even number is solid. Matches fill-rule evenodd, and nonzero with opposite windings.
 */
export function classify(polys: Pt[][]): Pt[][] {
  return polys.map((P, i) => {
    let depth = 0;
    polys.forEach((Q, j) => { if (j !== i && pointInPoly(Q, P[0][0], P[0][1])) depth++; });
    return orient(P, depth % 2 ? 1 : -1);
  });
}

/** Clip a polygon to the box 0,0 to w,h (Sutherland-Hodgman), so walls match the part of a clip-path that is visible. */
export function clipToBox(P: Pt[], w: number, h: number): Pt[] {
  if (P.every(([x, y]) => x >= 0 && x <= w && y >= 0 && y <= h)) return P;
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [(p) => p[0] >= 0, (a, b) => [0, a[1] + ((b[1] - a[1]) * (0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= w, (a, b) => [w, a[1] + ((b[1] - a[1]) * (w - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= 0, (a, b) => [a[0] + ((b[0] - a[0]) * (0 - a[1])) / (b[1] - a[1]), 0]],
    [(p) => p[1] <= h, (a, b) => [a[0] + ((b[0] - a[0]) * (h - a[1])) / (b[1] - a[1]), h]],
  ];
  let out = P;
  for (const [inside, cross] of edges) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      if (inside(cur)) { if (!inside(prev)) out.push(cross(prev, cur)); out.push(cur); }
      else if (inside(prev)) out.push(cross(prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}
