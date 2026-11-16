import type { BrickBoxInstance, BrickBoxOptions, Control } from './types';
import { classify, clipOutline, clipToBox, colorAt, fitRadii, flatten, inShape, outline, parseGradient, simplify } from './geometry';
import { parseShadow, polysToPath, pressRatio, shadowMatrix, shadowVector } from './parse';
import type { Pt } from './geometry';
import { ATTR, STYLES } from './structure';

declare const process: { env: { NODE_ENV?: string } } | undefined;

const LIGHT: Record<string, number> = {
  top: 0, 'top-right': 45, right: 90, 'bottom-right': 135, bottom: 180, 'bottom-left': 225, left: 270, 'top-left': 315,
};
const IGNORE_ATTR = '[data-brickbox-ignore]';
const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
const isDev = () => typeof process !== 'undefined' && !!process.env && process.env.NODE_ENV !== 'production';
const warned = new Set<string>();
/** A development-only warning, shown once per message. */
export const devWarn = (msg: string) => { if (isDev() && !warned.has(msg)) { warned.add(msg); console.warn(`[brickbox] ${msg}`); } };
const EDITABLE = 'input,textarea,select,[contenteditable]';
let shadowUid = 0;

let registered = false;
function registerProps() {
  if (registered || typeof CSS === 'undefined' || !CSS.registerProperty) return;
  registered = true;
  try { CSS.registerProperty({ name: '--bb-p', syntax: '<number>', inherits: true, initialValue: '1' }); } catch { /* already registered */ }
}

interface Resolved {
  depth: number | string; control: Control; tx: number; ty: number; max: number;
  springBack: boolean; springDur: number; pressSink?: number | string; pressDur: number; shadow?: string; lift?: number | string;
  side: string; shading: boolean; light: number; persp: number; edge: string; edgeW: number;
  touchScroll: boolean; disabled: boolean; reverseHover: boolean; reverseDrag: boolean; ignore?: string;
  tol: number; sens: number; bounce: number; cull: boolean; track: boolean;
}

function resolve(o: BrickBoxOptions): Resolved {
  const a = o.advanced || {};
  if ((o as { pressDepth?: unknown }).pressDepth !== undefined) devWarn('pressDepth was renamed to pressSink in 0.3.0. It is now a percent of depth (0 to 99) and pressDepth is ignored.');
  const side = (o.sideColor ?? 'match').trim();
  return {
    depth: o.depth ?? 24, control: o.control ?? 'hover',
    tx: o.tilt?.x ?? 14, ty: o.tilt?.y ?? 22, max: o.maxAngle ?? 60,
    springBack: o.springBack ?? true, springDur: o.springDuration ?? 700,
    pressSink: o.pressSink, pressDur: o.pressDuration ?? 150, shadow: o.shadow, lift: o.lift,
    side, shading: o.shading ?? side === 'match',
    light: typeof o.light === 'number' ? o.light : LIGHT[o.light ?? 'top-left'] ?? 315,
    persp: o.perspective ?? 1000, edge: o.edgeColor ?? 'none', edgeW: o.edgeWidth ?? 1,
    touchScroll: o.touchScroll ?? true, disabled: o.disabled ?? false,
    reverseHover: o.reverseHover ?? false, reverseDrag: o.reverseDrag ?? false, ignore: o.ignore || undefined,
    tol: a.tolerance ?? 0.25, sens: a.sensitivity ?? 0.5, bounce: a.bounce ?? 1, cull: a.cull ?? true, track: a.trackColor ?? true,
  };
}

/** Convert a number or CSS length string to px. Non-px units are measured with a hidden probe. */
function toPx(v: number | string, host: HTMLElement): number {
  if (typeof v === 'number') return v;
  if (/^\s*-?[\d.]+(px)?\s*$/.test(v)) return parseFloat(v);
  const p = document.createElement('div');
  p.style.cssText = `position:absolute;visibility:hidden;width:${v}`;
  host.appendChild(p);
  const w = p.getBoundingClientRect().width;
  p.remove();
  return w;
}

const pathCache = new Map<string, Pt[][]>();

/**
 * Sample an SVG path() into polygons. Extra subpaths must start with an absolute M.
 * Samples are spread out adaptively, and the result is cached, so many boxes sharing one path sample it once.
 */
function samplePath(d: string, tol: number, host: HTMLElement): Pt[][] {
  const key = `${tol}|${d}`, hit = pathCache.get(key);
  if (hit) return hit.map((P) => P.slice());
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
  host.appendChild(svg);
  const out: Pt[][] = [];
  for (const sub of d.split(/(?=M)/)) {
    if (!sub.trim()) continue;
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', sub);
    svg.appendChild(p);
    let total = 0;
    try { total = p.getTotalLength(); } catch { /* invalid path data */ }
    if (!(total > 0)) continue;
    // Tolerance is shared out so the walls stay within `tol` of the curve in all: 0.15 for flattening
    // (half of the 0.3 given to it) and 0.85 for simplifying, which leaves the simplifier plenty of points to choose from.
    const P = simplify(flatten(total, (t) => { const q = p.getPointAtLength(t); return [q.x, q.y]; }, tol * 0.3), tol * 0.85);
    if (P.length >= 3) out.push(P);
  }
  svg.remove();
  if (pathCache.size >= 64) pathCache.delete(pathCache.keys().next().value as string);
  pathCache.set(key, out);
  return out.map((P) => P.slice());
}

/** The element's silhouette as polygons: its clip-path if it has a supported one, else its rounded corners. */
/** Lets the browser evaluate length expressions (calc, min, max, clamp, vw and so on) in a hidden probe. */
/** The light direction each box ended up with, so a nested box can use its parent's. */
const lights = new WeakMap<Element, number>();
let translateOk: boolean | undefined;
const canTranslate = () => translateOk ??= typeof CSS !== 'undefined' && !!CSS.supports && CSS.supports('translate', '0 0 1px');
const describeEl = (el: Element) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '');
/** Why an element would flatten the 3D scene beneath it, or null if it would not. */
function flattens(el: Element): string | null {
  const s = getComputedStyle(el);
  if (s.overflowX !== 'visible' && s.overflowX !== 'clip') return `overflow: ${s.overflowX}`;
  if (s.overflowY !== 'visible' && s.overflowY !== 'clip') return `overflow: ${s.overflowY}`;
  if (parseFloat(s.opacity) < 1) return `opacity: ${s.opacity}`;
  if (s.filter !== 'none') return 'a filter';
  if (s.clipPath !== 'none') return 'a clip-path';
  if (s.maskImage && s.maskImage !== 'none') return 'a mask';
  if (s.isolation === 'isolate') return 'isolation: isolate';
  if (s.mixBlendMode !== 'normal') return `mix-blend-mode: ${s.mixBlendMode}`;
  if (/paint|strict|content/.test(s.contain)) return `contain: ${s.contain}`;
  return null;
}

const themeWatchers = new Set<() => void>();
let themeObs: MutationObserver | null = null, themeMq: MediaQueryList | null = null;
const themeFire = () => themeWatchers.forEach((f) => f());
/** Calls `fn` when the page's theme may have changed: a class or attribute on <html> or <body>, or the colour scheme. */
function watchTheme(fn: () => void): () => void {
  if (!themeObs && typeof MutationObserver !== 'undefined') {
    themeObs = new MutationObserver(themeFire);
    themeObs.observe(document.documentElement, { attributes: true });
    if (document.body) themeObs.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    themeMq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    themeMq?.addEventListener?.('change', themeFire);
  }
  themeWatchers.add(fn);
  return () => {
    themeWatchers.delete(fn);
    if (!themeWatchers.size && themeObs) { themeObs.disconnect(); themeObs = null; themeMq?.removeEventListener?.('change', themeFire); themeMq = null; }
  };
}

function lengthProbe() {
  let box: HTMLElement | null = null, el: HTMLElement | null = null;
  const cache = new Map<string, number>();
  return {
    resolve(t: string, ref: number): number {
      const key = ref + '|' + t, hit = cache.get(key);
      if (hit !== undefined) return hit;
      if (!box || !el) {
        box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:0;top:-99999px;visibility:hidden;pointer-events:none;height:0';
        el = document.createElement('div');
        el.style.cssText = 'position:absolute;top:0;width:0;height:0';
        box.appendChild(el);
        (document.body || document.documentElement).appendChild(box);
      }
      box.style.width = ref + 'px';
      el.style.left = '';
      el.style.left = t;
      const v = el.style.left === '' ? NaN : el.getBoundingClientRect().left - box.getBoundingClientRect().left;
      cache.set(key, v);
      return v;
    },
    dispose() { box?.remove(); },
  };
}

function shapePolys(cs: CSSStyleDeclaration, w: number, h: number, tol: number, host: HTMLElement): Pt[][] {
  const clip = (cs.getPropertyValue('clip-path') || cs.getPropertyValue('-webkit-clip-path') || '').trim().replace(/\s+border-box$/, '');
  if (clip && clip !== 'none') {
    const pm = clip.match(/^path\(\s*(?:(?:evenodd|nonzero)\s*,\s*)?["']([^"']*)["']\s*\)$/);
    const probe = lengthProbe();
    let polys: Pt[][] | null;
    try { polys = pm ? samplePath(pm[1], tol, host) : clipOutline(clip, w, h, tol, probe.resolve); } finally { probe.dispose(); }
    // Content only exists inside the box, so walls follow the visible part of the clip-path.
    const vis = (polys || []).map((P) => clipToBox(P, w, h)).filter((P) => P.length >= 3);
    if (vis.length) return classify(vis);
    if (isDev()) console.warn(`[brickbox] clip-path "${clip}" is not supported (url() and shape() are not), so the walls use the rounded rectangle instead.`);
  }
  const rx: number[] = [], ry: number[] = [];
  const f = (v: string, ref: number) => (v.endsWith('%') ? (parseFloat(v) / 100) * ref : parseFloat(v) || 0);
  for (const k of ['top-left', 'top-right', 'bottom-right', 'bottom-left']) {
    const t = cs.getPropertyValue(`border-${k}-radius`).trim().split(/\s+/);
    rx.push(f(t[0] || '0', w));
    ry.push(f(t[1] ?? t[0] ?? '0', h));
  }
  const [fx, fy] = fitRadii(rx, ry, w, h);
  return [outline(w, h, fx, tol, fy)];
}

interface Structure { persp: HTMLElement; obj: HTMLElement; sink: HTMLElement; walls: HTMLElement; child: HTMLElement; built: boolean }

/** Use the structure React rendered, or build it around the root's single element child. */
function ensureStructure(root: HTMLElement): Structure {
  const q = (n: string) => root.querySelector<HTMLElement>(`[${ATTR}="${n}"]`);
  const existing = q('persp');
  if (existing) {
    const sink = q('sink')!;
    return { persp: existing, obj: q('obj')!, sink, walls: q('walls')!, child: sink.firstElementChild as HTMLElement, built: false };
  }
  const child = root.firstElementChild as HTMLElement | null;
  if (!child) throw new Error('brickbox: the root needs one element child');
  const mk = (n: keyof typeof STYLES) => {
    const e = document.createElement('div');
    e.setAttribute(ATTR, n);
    Object.assign(e.style, STYLES[n]);
    return e;
  };
  const persp = mk('persp'), obj = mk('obj'), sink = mk('sink'), walls = mk('walls');
  walls.setAttribute('aria-hidden', 'true');
  root.append(persp);
  persp.append(obj);
  obj.append(sink);
  sink.append(child, walls);
  return { persp, obj, sink, walls, child, built: true };
}

interface Drag { x: number; y: number; tx: number; ty: number; moved: boolean; dragging: boolean; touch: boolean }

export function brickbox(root: HTMLElement, options: BrickBoxOptions = {}): BrickBoxInstance {
  registerProps();
  const st = ensureStructure(root);
  const { persp, obj, sink, walls, child } = st;
  const reduce = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let opts = options, o = resolve(opts);
  let m = { w: 0, h: 0, ox: 0, oy: 0, pp: 1 }, shape: Pt[][] = [];
  // What the walls and shadow were last built from, so a rebuild that changes nothing visible costs almost nothing.
  let wallKey = '', shadowKey = '', shadowEl: HTMLElement | null = null, selPrev: [string, string] | null = null;
  let shadowGeo: { v: [number, number]; d: number; lift: number } | null = null, pressed = 1;
  let nested = false, liftPx = 0, touched: { el: HTMLElement; prev: string }[] = [];
  const parentSink = () => root.parentElement?.closest<HTMLElement>('[data-bb=sink]') ?? null;
  let strips: { el: HTMLElement; x0: number; y0: number; x1: number; y1: number; a: number }[] = [], paintKey = '';
  // Boxes far from the screen wait to build their walls until they are close.
  const near = () => { const r = root.getBoundingClientRect(), M = 300; return r.bottom > -M && r.top < innerHeight + M && r.right > -M && r.left < innerWidth + M; };
  let visible = near();
  let cx = o.tx, cy = o.ty, hover = false, drag: Drag | null = null, suppress = false, setDisplay = false;

  // Inline-level children (buttons, links) make the root inline-block, unless the user set a display.
  if (!root.style.display) {
    const prev = sink.style.display;
    sink.style.display = 'block';
    const inline = /^inline/.test(getComputedStyle(child).display);
    sink.style.display = prev;
    root.style.display = inline ? 'inline-block' : 'block';
    setDisplay = true;
  }

  const hoverOn = () => o.control === 'hover' || o.control === 'both';
  const dragOn = () => o.control === 'drag' || o.control === 'both';
  /** Put the shadow where it belongs for the current tilt and press, using the same transition as the box. */
  const placeShadow = (tr?: string) => {
    if (!shadowEl || !shadowGeo) return;
    const { v, d, lift } = shadowGeo;
    shadowEl.style.transition = tr || 'none';
    // The shadow lies on a plane behind the box, in the same 3D scene, so it gets the same perspective as the box.
    // A nested box casts it onto its parent's face, a hair above it so the two do not fight over the same plane.
    const z = -(d + lift) + (nested ? 0.5 : 0);
    shadowEl.style.transform = `translateZ(${z}px) matrix(${shadowMatrix(cx, cy, lift + d / 2, d * (pressed - 0.5), v[0], v[1]).map((n) => +n.toFixed(4)).join(',')})`;
  };
  const setT = (x: number, y: number, tr?: string) => {
    cx = x; cy = y;
    obj.style.transition = tr || 'none';
    obj.style.transform = `rotateX(${x}deg) rotateY(${-y}deg)`;
    placeShadow(tr);
  };
  const spring = () => (reduce?.matches ? 'none' : `transform ${o.springDur}ms cubic-bezier(.2,${1 + 0.5 * o.bounce},.4,1)`);
  const rest = () => setT(o.tx, o.ty, spring());
  const press = (on: boolean) => {
    pressed = on && m.pp < 1 ? m.pp : 1;
    sink.style.setProperty('--bb-p', String(pressed));
    placeShadow(reduce?.matches ? 'none' : `transform ${o.pressDur}ms ease`);
  };

  const dropShadow = () => { if (shadowEl) { shadowEl.remove(); shadowEl = null; } shadowKey = ''; shadowGeo = null; };

  const undoNesting = () => {
    if (!nested && !touched.length) return;
    nested = false;
    root.removeAttribute('data-bb-nested');
    root.style.translate = '';
    if (!canTranslate()) root.style.transform = '';
    root.style.transformStyle = '';
    persp.style.transformStyle = '';
    touched.forEach((t) => { t.el.style.transformStyle = t.prev; });
    touched = [];
  };

  /** Join the parent's 3D scene: stand on its face `lift` above it, with no perspective of our own. */
  function applyNesting(pf: HTMLElement, d: number) {
    nested = true;
    liftPx = toPx(o.lift as number | string, root);
    const z = liftPx + d;
    if (canTranslate()) root.style.translate = `0 0 ${z}px`; else root.style.transform = `translateZ(${z}px)`;
    root.style.transformStyle = 'preserve-3d';
    persp.style.transformStyle = 'preserve-3d';
    root.setAttribute('data-bb-nested', '');
    // Every element between here and the parent's face has to pass the 3D scene down.
    for (let el: HTMLElement | null = root.parentElement; el; el = el.parentElement) {
      if (el.style.transformStyle !== 'preserve-3d') { touched.push({ el, prev: el.style.transformStyle }); el.style.transformStyle = 'preserve-3d'; }
      if (isDev()) { const why = flattens(el); if (why) devWarn(`${describeEl(el)} has ${why}, which flattens the 3D scene, so a nested box (lift) inside it can't stand out from its parent.`); }
      if (el === pf || el.dataset.bb === 'sink') break;
    }
  }

  function build() {
    o = resolve(opts);
    const pSink = o.lift !== undefined ? parentSink() : null, pf = (pSink?.firstElementChild as HTMLElement | null) ?? null;
    if (o.lift !== undefined && !pf) devWarn('lift needs the box to sit inside another brickbox, so it is ignored here.');
    if (pf) {
      // A nested box is a part standing on its parent: the parent does the tilting.
      if (opts.control !== undefined && opts.control !== 'static') devWarn(`control "${opts.control}" is not supported together with lift. A nested box is always static.`);
      o.control = 'static';
      if (opts.tilt === undefined) { o.tx = 0; o.ty = 0; }
      if (opts.shading === undefined) o.shading = true;
      if (opts.light === undefined) o.light = lights.get(pSink as Element) ?? o.light;
    }
    const w = child.offsetWidth, h = child.offsetHeight, ox = child.offsetLeft, oy = child.offsetTop;
    const d = Math.max(0, toPx(o.depth, root));
    if (isDev() && d > o.persp * 0.5) {
      devWarn(`depth ${d}px is more than half of perspective (${o.persp}px); the box may clip or distort.`);
    }
    m = { w, h, ox, oy, pp: pressRatio(o.pressSink) };
    const rm = !!reduce?.matches;
    walls.hidden = o.disabled;
    Object.assign(walls.style, { left: ox + 'px', top: oy + 'px', width: w + 'px', height: h + 'px' });
    // Depth and press only change these properties: the wall strips read them, so they are not rebuilt.
    sink.style.setProperty('--bb-d', d + 'px');
    sink.style.transform = 'translateZ(calc(var(--bb-d) * (var(--bb-p) - 1)))';
    sink.style.transition = `--bb-p ${rm ? 0 : o.pressDur}ms ease`;
    persp.style.perspective = pf ? 'none' : o.persp + 'px';
    if (pf) applyNesting(pf, d); else undoNesting();
    obj.style.transformOrigin = `${ox + w / 2}px ${oy + h / 2}px ${-d / 2}px`;
    root.style.touchAction = dragOn() || (o.control === 'hover' && !o.touchScroll) ? 'none' : o.control === 'hover' ? 'pan-y' : 'auto';
    root.style.cursor = dragOn() ? 'grab' : '';
    if (o.disabled || !w || !h) {
      shape = []; wallKey = ''; paintKey = ''; strips = []; walls.innerHTML = ''; dropShadow();
      obj.style.transform = 'none';
      return;
    }
    if (visible) buildWalls(w, h, d, ox, oy);
    lights.set(sink, o.light);
    if (!drag && !hover) setT(o.tx, o.ty);
  }

  /** What the walls' shape depends on, and separately what their colours depend on, read from the face's computed style. */
  const wallKeys = (cs: CSSStyleDeclaration, w: number, h: number) => ({
    geo: [
      w, h, o.tol, cs.getPropertyValue('clip-path') || cs.getPropertyValue('-webkit-clip-path'),
      ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((k) => cs.getPropertyValue(`border-${k}-radius`)).join(' '),
      o.edge, o.edgeW, o.cull, o.side === 'none' || o.side === 'transparent',
    ].join('|'),
    paint: [cs.backgroundImage, cs.backgroundColor, o.side, o.shading, o.light].join('|'),
  });

  /** Colour every strip. This is all that changes when only the face's colour does, so the strips are not rebuilt. */
  function paintWalls(cs: CSSStyleDeclaration, w: number, h: number) {
    const bi = cs.backgroundImage, G = bi.startsWith('linear-gradient') ? parseGradient(bi) : null;
    let solid = cs.backgroundColor;
    if (solid === 'rgba(0, 0, 0, 0)' || solid === 'transparent') solid = 'rgb(120,120,130)';
    const match = o.side === 'match', col = match ? solid : o.side;
    const ph = (o.light * Math.PI) / 180, Lx = Math.sin(ph), Ly = -Math.cos(ph);
    for (const s of strips) {
      const lit = (-Math.sin(s.a) * Lx + Math.cos(s.a) * Ly + 1) / 2, a0 = 0.08 + 0.3 * (1 - lit), a1 = a0 + 0.28;
      const base = match && G ? `linear-gradient(90deg,${colorAt(G, s.x0, s.y0, w, h)},${colorAt(G, s.x1, s.y1, w, h)})` : `linear-gradient(${col},${col})`;
      s.el.style.background = (o.shading ? `linear-gradient(rgba(0,0,0,${a0.toFixed(2)}),rgba(0,0,0,${a1.toFixed(2)})),` : '') + base;
    }
  }

  function buildWalls(w: number, h: number, d: number, ox: number, oy: number) {
    const cs = getComputedStyle(child), keys = wallKeys(cs, w, h);
    if (keys.geo !== wallKey) {
      wallKey = keys.geo;
      paintKey = '';
      shape = shapePolys(cs, w, h, o.tol, root);
      strips = [];
      const frag = document.createDocumentFragment();
      if (o.side !== 'none' && o.side !== 'transparent') {
        const ec = o.edge === 'none' || o.edge === '' ? null : o.edge === 'auto' ? 'rgba(0,0,0,.5)' : o.edge;
        for (const P of shape) {
          const n = P.length;
          const S = P.map((p, i) => { const q = P[(i + 1) % n]; return { a: Math.atan2(q[1] - p[1], q[0] - p[0]), len: Math.hypot(q[0] - p[0], q[1] - p[1]) }; });
          for (let i = 0; i < n; i++) {
            if (S[i].len < 0.01) continue;
            let j = (i + n - 1) % n;
            while (S[j].len < 0.01 && j !== i) j = (j + n - 1) % n;
            let tn = Math.abs(S[i].a - S[j].a);
            tn = Math.min(tn, 2 * Math.PI - tn);
            const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % n], a = S[i].a;
            const edge = ec ? `border-bottom:${o.edgeW}px solid ${ec};${tn > 0.9 ? `border-left:${o.edgeW}px solid ${ec};` : ''}` : '';
            const e = document.createElement('i');
            e.style.cssText =
              `position:absolute;left:0;top:0;box-sizing:border-box;height:var(--bb-d);transform-origin:0 0;${o.cull ? 'backface-visibility:hidden;' : ''}` +
              `width:${S[i].len + 0.5}px;${edge}` +
              `transform:translate(${x0}px,${y0}px) rotate(${(a * 180) / Math.PI}deg) rotateX(-90deg) scaleY(var(--bb-p))`;
            strips.push({ el: e, x0, y0, x1, y1, a });
            frag.appendChild(e);
          }
        }
      }
      walls.innerHTML = '';
      walls.appendChild(frag);
    }
    if (keys.paint !== paintKey) { paintKey = keys.paint; paintWalls(cs, w, h); }
    buildShadow(w, h, d, ox, oy);
  }

  /** A soft shadow of the silhouette behind the box. It sits outside the rotating object, so it stays flat on the page. */
  function buildShadow(w: number, h: number, d: number, ox: number, oy: number) {
    const S = parseShadow(o.shadow);
    if (!S || !shape.length) { dropShadow(); return; }
    const el = shadowEl || (shadowEl = document.createElement('div'));
    if (!el.parentNode) {
      el.setAttribute(ATTR, 'shadow');
      el.setAttribute('aria-hidden', 'true');
      persp.insertBefore(el, obj);
    }
    Object.assign(el.style, { position: 'absolute', left: ox + 'px', top: oy + 'px', width: w + 'px', height: h + 'px', pointerEvents: 'none', transformOrigin: '50% 50%', willChange: 'transform' });
    const blur = S.blur ?? d, spread = S.spread ?? 0, color = S.color ?? 'rgba(0,0,0,.35)';
    shadowGeo = { v: shadowVector(S.mode, o.light), d, lift: nested ? liftPx : 0 };
    const key = [wallKey, S.mode, blur, spread, color, d, o.light, nested ? liftPx : -1].join('|');
    if (key === shadowKey) { placeShadow(); return; }
    shadowKey = key;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible';
    const g = document.createElementNS(NS, 'g');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', polysToPath(shape));
    path.setAttribute('fill', color);
    path.setAttribute('fill-rule', 'evenodd');
    el.style.filter = '';
    if (spread) {
      // Spread grows or shrinks the silhouette with an SVG filter, which keeps holes correct.
      const id = `bb-s${++shadowUid}`, pad = Math.abs(spread) + blur * 1.5 + 2;
      const defs = document.createElementNS(NS, 'defs'), f = document.createElementNS(NS, 'filter');
      f.setAttribute('id', id);
      f.setAttribute('filterUnits', 'userSpaceOnUse');
      f.setAttribute('x', String(-pad)); f.setAttribute('y', String(-pad));
      f.setAttribute('width', String(w + 2 * pad)); f.setAttribute('height', String(h + 2 * pad));
      const mo = document.createElementNS(NS, 'feMorphology');
      mo.setAttribute('operator', spread > 0 ? 'dilate' : 'erode');
      mo.setAttribute('radius', String(Math.abs(spread)));
      f.appendChild(mo);
      if (blur > 0) { const gb = document.createElementNS(NS, 'feGaussianBlur'); gb.setAttribute('stdDeviation', String(blur / 2)); f.appendChild(gb); }
      defs.appendChild(f);
      svg.appendChild(defs);
      path.setAttribute('filter', `url(#${id})`);
    } else if (blur > 0) {
      el.style.filter = `blur(${blur / 2}px)`;
    }
    g.appendChild(path);
    svg.appendChild(g);
    el.textContent = '';
    el.appendChild(svg);
    placeShadow();
  }

  const local = (e: PointerEvent): Pt => {
    const r = root.getBoundingClientRect();
    return [e.clientX - r.left - m.ox, e.clientY - r.top - m.oy];
  };
  /** True when the pointer is over the element's real silhouette, not just its box. */
  const inside = (e: PointerEvent) => {
    // Inside a tilted parent the box's own rectangle no longer maps to the pointer, so trust the browser's hit test.
    if (nested) return child.contains(e.target as Node);
    const [x, y] = local(e);
    if (x < 0 || y < 0 || x > m.w || y > m.h) return false;
    return shape.length ? inShape(shape, x, y) : true;
  };
  /** True when the event came from an area marked to ignore hover, drag and press. */
  const ignored = (e: Event) => {
    const t = e.target as Element | null;
    if (!t || !t.closest) return false;
    try {
      const hit = t.closest(o.ignore ? `${IGNORE_ATTR},${o.ignore}` : IGNORE_ATTR);
      return !!hit && child.contains(hit);
    } catch { return false; }
  };
  /** True when the press landed on a nested box. That box takes it, and the parent stays put. Hover is unaffected. */
  const inNested = (e: Event) => {
    const n = (e.target as Element | null)?.closest?.('[data-bb-nested]');
    return !!n && n !== root && child.contains(n);
  };
  const hoverAt = (e: PointerEvent) => {
    const [lx, ly] = local(e);
    const nz = (v: number, s: number) => Math.max(-1, Math.min(1, (v - s / 2) / (s / 2)));
    const nx = nz(lx, m.w), ny = nz(ly, m.h), s = o.reverseHover ? -1 : 1;
    hover = true;
    setT(clamp(o.tx * 0.3 - s * ny * o.max * 0.7, o.max), clamp(o.ty * 0.3 - s * nx * o.max * 0.7, o.max), 'transform .15s ease-out');
  };
  const leave = () => { hover = false; if (o.springBack) rest(); };

  const onMove = (e: PointerEvent) => {
    if (o.disabled || drag || !hoverOn() || e.pointerType === 'touch' || reduce?.matches) return;
    if (!inside(e)) { if (hover) leave(); return; }
    if (ignored(e)) return; // hold still while over an ignored area
    hoverAt(e);
  };
  const onLeave = () => { if (hover) leave(); };
  const onDown = (e: PointerEvent) => {
    if (o.disabled || !inside(e) || ignored(e) || inNested(e)) return;
    const touch = e.pointerType === 'touch';
    const d: Drag = { x: e.clientX, y: e.clientY, tx: cx, ty: cy, moved: false, touch, dragging: dragOn() || (hoverOn() && touch) };
    drag = d;
    // Stop the browser selecting text (and scrolling the page to follow the selection) while the box is being turned.
    if (d.dragging && !(e.target as Element | null)?.closest?.(EDITABLE)) lockSelect(true);
    press(true);
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
      if (!d.moved) { if (Math.hypot(dx, dy) < 5) return; d.moved = true; press(false); }
      if (!d.dragging) return;
      const s = o.reverseDrag ? -1 : 1;
      const vy = d.touch && o.control === 'hover' && o.touchScroll ? 0 : dy;
      setT(clamp(d.tx - s * vy * o.sens, o.max), clamp(d.ty - s * dx * o.sens, o.max));
    };
    const up = (ev: PointerEvent) => {
      removeEventListener('pointermove', mv);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      drag = null;
      lockSelect(false);
      press(false);
      suppress = d.moved && d.dragging;
      if (!suppress) return;
      // Hover resumes right away if the pointer is still over the element, otherwise spring back.
      if (hoverOn() && !d.touch && inside(ev) && !ignored(ev)) hoverAt(ev);
      else { hover = false; if (o.springBack) rest(); }
    };
    addEventListener('pointermove', mv);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };
  const lockSelect = (on: boolean) => {
    const st = root.style;
    if (on) { selPrev = [st.userSelect, st.webkitUserSelect]; st.userSelect = 'none'; st.webkitUserSelect = 'none'; }
    else if (selPrev) { st.userSelect = selPrev[0]; st.webkitUserSelect = selPrev[1]; selPrev = null; }
  };
  const onClick = (e: Event) => { if (suppress) { e.stopPropagation(); e.preventDefault(); suppress = false; } };


  // Follow the face as its colour or shape changes. Nothing runs while it is idle: we re-read after an event that
  // can change the style, and frame by frame only while a transition or a finite animation is running.
  let colourRaf = 0, loopRaf = 0, running = 0;
  const recolour = () => {
    if (!visible || !shape.length || !o.track || o.disabled) return;
    const cs = getComputedStyle(child), keys = wallKeys(cs, m.w, m.h);
    if (keys.geo !== wallKey) build();
    else if (o.side === 'match' && keys.paint !== paintKey) { paintKey = keys.paint; paintWalls(cs, m.w, m.h); }
  };
  const queue = () => { if (!colourRaf) colourRaf = requestAnimationFrame(() => { colourRaf = 0; recolour(); }); };
  const loop = () => { recolour(); loopRaf = running > 0 ? requestAnimationFrame(loop) : 0; };
  const watching = /^(background|border|clip)/;
  const onRun = (e: Event) => {
    if (e.target !== child) return;
    if (e.type === 'transitionrun') { if (!watching.test((e as TransitionEvent).propertyName)) return; }
    else if (getComputedStyle(child).animationIterationCount.includes('infinite')) return;
    running++;
    if (!loopRaf) loopRaf = requestAnimationFrame(loop);
  };
  const onEnd = (e: Event) => {
    if (e.target !== child) return;
    if (e.type === 'transitionend' || e.type === 'transitioncancel') { if (!watching.test((e as TransitionEvent).propertyName)) return; }
    running = Math.max(0, running - 1);
    queue();
  };
  const cues = ['pointerenter', 'pointerleave', 'pointerdown', 'pointerup', 'focusin', 'focusout'];
  cues.forEach((t) => root.addEventListener(t, queue, { passive: true }));
  root.addEventListener('transitionrun', onRun);
  root.addEventListener('animationstart', onRun);
  ['transitionend', 'transitioncancel', 'animationend', 'animationcancel'].forEach((t) => root.addEventListener(t, onEnd));
  const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(queue);
  mo?.observe(child, { attributes: true, attributeFilter: ['class', 'style'] });
  const unwatchTheme = watchTheme(queue);

  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerleave', onLeave);
  root.addEventListener('pointerdown', onDown);
  child.addEventListener('click', onClick, true);
  // Observe the sink too: a wrapper resize can move a centred child without resizing it.
  const ro = new ResizeObserver(build);
  ro.observe(child);
  ro.observe(sink);
  const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((es) => {
    const v = es[es.length - 1].isIntersecting;
    if (v && !visible) { visible = true; build(); } else if (!v) visible = false;
  }, { rootMargin: '300px' });
  io?.observe(root);
  build();

  return {
    update(next) {
      opts = { ...opts, ...next, advanced: { ...opts.advanced, ...next.advanced } };
      build();
    },
    destroy() {
      ro.disconnect();
      io?.disconnect();
      mo?.disconnect();
      unwatchTheme();
      undoNesting();
      cancelAnimationFrame(colourRaf);
      cancelAnimationFrame(loopRaf);
      cues.forEach((t) => root.removeEventListener(t, queue));
      root.removeEventListener('transitionrun', onRun);
      root.removeEventListener('animationstart', onRun);
      ['transitionend', 'transitioncancel', 'animationend', 'animationcancel'].forEach((t) => root.removeEventListener(t, onEnd));
      lockSelect(false);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('pointerdown', onDown);
      child.removeEventListener('click', onClick, true);
      root.style.touchAction = '';
      root.style.cursor = '';
      if (setDisplay) root.style.display = '';
      if (st.built) { root.insertBefore(child, persp); persp.remove(); }
    },
  };
}
