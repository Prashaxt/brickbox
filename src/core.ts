import type { BrickBoxInstance, BrickBoxOptions, Control } from './types';
import { colorAt, outline, parseGradient, scaleRadii } from './geometry';
import { ATTR, STYLES } from './structure';

declare const process: { env: { NODE_ENV?: string } } | undefined;

const LIGHT: Record<string, number> = {
  top: 0, 'top-right': 45, right: 90, 'bottom-right': 135, bottom: 180, 'bottom-left': 225, left: 270, 'top-left': 315,
};
const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
const isDev = () => typeof process !== 'undefined' && !!process.env && process.env.NODE_ENV !== 'production';

let registered = false;
function registerProps() {
  if (registered || typeof CSS === 'undefined' || !CSS.registerProperty) return;
  registered = true;
  try { CSS.registerProperty({ name: '--bb-p', syntax: '<number>', inherits: true, initialValue: '1' }); } catch { /* already registered */ }
}

interface Resolved {
  depth: number | string; control: Control; tx: number; ty: number; max: number;
  springBack: boolean; springDur: number; pressDepth?: number | string; pressDur: number;
  side: string; shading: boolean; light: number; persp: number; edge: string; edgeW: number;
  touchScroll: boolean; disabled: boolean; tol: number; sens: number; bounce: number; cull: boolean;
}

function resolve(o: BrickBoxOptions): Resolved {
  const a = o.advanced || {};
  const side = (o.sideColor ?? 'match').trim();
  return {
    depth: o.depth ?? 24, control: o.control ?? 'hover',
    tx: o.tilt?.x ?? 14, ty: o.tilt?.y ?? 22, max: o.maxAngle ?? 60,
    springBack: o.springBack ?? true, springDur: o.springDuration ?? 700,
    pressDepth: o.pressDepth, pressDur: o.pressDuration ?? 150,
    side, shading: o.shading ?? side === 'match',
    light: typeof o.light === 'number' ? o.light : LIGHT[o.light ?? 'top-left'] ?? 315,
    persp: o.perspective ?? 1000, edge: o.edgeColor ?? 'none', edgeW: o.edgeWidth ?? 1,
    touchScroll: o.touchScroll ?? true, disabled: o.disabled ?? false,
    tol: a.tolerance ?? 0.25, sens: a.sensitivity ?? 0.5, bounce: a.bounce ?? 1, cull: a.cull ?? true,
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
  let m = { w: 0, h: 0, ox: 0, oy: 0, pp: 1 };
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

  const setT = (x: number, y: number, tr?: string) => {
    cx = x; cy = y;
    obj.style.transition = tr || 'none';
    obj.style.transform = `rotateX(${x}deg) rotateY(${-y}deg)`;
  };
  const spring = () => (reduce?.matches ? 'none' : `transform ${o.springDur}ms cubic-bezier(.2,${1 + 0.5 * o.bounce},.4,1)`);
  const rest = () => setT(o.tx, o.ty, spring());
  const press = (on: boolean) => sink.style.setProperty('--bb-p', String(on && m.pp < 1 ? m.pp : 1));

  function build() {
    o = resolve(opts);
    const w = child.offsetWidth, h = child.offsetHeight, ox = child.offsetLeft, oy = child.offsetTop;
    const d = Math.max(0, toPx(o.depth, root));
    if (isDev() && d > o.persp * 0.5) {
      console.warn(`[brickbox] depth ${d}px is more than half of perspective (${o.persp}px); the box may clip or distort.`);
    }
    const pp = o.pressDepth == null ? 1 : Math.min(1, Math.max(0, toPx(o.pressDepth, root) / (d || 1)));
    m = { w, h, ox, oy, pp };
    const rm = !!reduce?.matches;
    walls.innerHTML = '';
    walls.hidden = o.disabled;
    Object.assign(walls.style, { left: ox + 'px', top: oy + 'px', width: w + 'px', height: h + 'px' });
    sink.style.setProperty('--bb-d', d + 'px');
    sink.style.transform = 'translateZ(calc(var(--bb-d) * (var(--bb-p) - 1)))';
    sink.style.transition = `--bb-p ${rm ? 0 : o.pressDur}ms ease`;
    persp.style.perspective = o.persp + 'px';
    obj.style.transformOrigin = `${ox + w / 2}px ${oy + h / 2}px ${-d / 2}px`;
    root.style.touchAction = o.control === 'drag' || (o.control === 'hover' && !o.touchScroll) ? 'none' : o.control === 'hover' ? 'pan-y' : 'auto';
    root.style.cursor = o.control === 'drag' ? 'grab' : '';
    if (o.disabled || !w || !h) { obj.style.transform = 'none'; return; }

    const cs = getComputedStyle(child);
    const R = scaleRadii(
      ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((k) => {
        const v = cs.getPropertyValue(`border-${k}-radius`).split(' ')[0];
        return v.endsWith('%') ? (parseFloat(v) / 100) * w : parseFloat(v) || 0;
      }),
      w, h,
    );
    const bi = cs.backgroundImage;
    const G = bi.startsWith('linear-gradient') ? parseGradient(bi) : null;
    let solid = cs.backgroundColor;
    if (solid === 'rgba(0, 0, 0, 0)' || solid === 'transparent') solid = 'rgb(120,120,130)';
    const match = o.side === 'match';
    const col = match ? solid : o.side;
    const ph = (o.light * Math.PI) / 180, Lx = Math.sin(ph), Ly = -Math.cos(ph);
    const P = outline(w, h, R, o.tol), n = P.length;
    const seg = (i: number) => { const q = P[(i + 1) % n]; return { a: Math.atan2(q[1] - P[i][1], q[0] - P[i][0]), len: Math.hypot(q[0] - P[i][0], q[1] - P[i][1]) }; };
    const S = P.map((_, i) => seg(i));
    const ec = o.edge === 'none' || o.edge === '' ? null : o.edge === 'auto' ? 'rgba(0,0,0,.5)' : o.edge;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      if (S[i].len < 0.01) continue;
      let j = (i + n - 1) % n;
      while (S[j].len < 0.01 && j !== i) j = (j + n - 1) % n;
      let tn = Math.abs(S[i].a - S[j].a);
      tn = Math.min(tn, 2 * Math.PI - tn);
      const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % n], a = S[i].a;
      const lit = (-Math.sin(a) * Lx + Math.cos(a) * Ly + 1) / 2, a0 = 0.08 + 0.3 * (1 - lit), a1 = a0 + 0.28;
      const base = match && G
        ? `linear-gradient(90deg,${colorAt(G, x0, y0, w, h)},${colorAt(G, x1, y1, w, h)})`
        : `linear-gradient(${col},${col})`;
      const shade = o.shading ? `linear-gradient(rgba(0,0,0,${a0.toFixed(2)}),rgba(0,0,0,${a1.toFixed(2)})),` : '';
      const edge = ec ? `border-bottom:${o.edgeW}px solid ${ec};${tn > 0.9 ? `border-left:${o.edgeW}px solid ${ec};` : ''}` : '';
      const e = document.createElement('i');
      e.style.cssText =
        `position:absolute;left:0;top:0;box-sizing:border-box;height:var(--bb-d);transform-origin:0 0;${o.cull ? 'backface-visibility:hidden;' : ''}` +
        `width:${S[i].len + 0.5}px;${edge}background:${shade}${base};` +
        `transform:translate(${x0}px,${y0}px) rotate(${(a * 180) / Math.PI}deg) rotateX(-90deg) scaleY(var(--bb-p))`;
      frag.appendChild(e);
    }
    walls.appendChild(frag);
    if (!drag && !hover) setT(o.tx, o.ty);
  }

  const inChild = (e: PointerEvent) => {
    const r = root.getBoundingClientRect(), l = r.left + m.ox, t = r.top + m.oy;
    return e.clientX >= l && e.clientX <= l + m.w && e.clientY >= t && e.clientY <= t + m.h;
  };
  const leave = () => { hover = false; if (o.springBack) rest(); };

  const onMove = (e: PointerEvent) => {
    if (o.disabled || drag || o.control !== 'hover' || e.pointerType === 'touch' || reduce?.matches) return;
    if (!inChild(e)) { if (hover) leave(); return; }
    const r = root.getBoundingClientRect();
    const nz = (v: number, a: number, s: number) => Math.max(-1, Math.min(1, (v - a - s / 2) / (s / 2)));
    const nx = nz(e.clientX, r.left + m.ox, m.w), ny = nz(e.clientY, r.top + m.oy, m.h);
    hover = true;
    setT(clamp(o.tx * 0.3 - ny * o.max * 0.7, o.max), clamp(o.ty * 0.3 - nx * o.max * 0.7, o.max), 'transform .15s ease-out');
  };
  const onLeave = () => { if (hover) leave(); };
  const onDown = (e: PointerEvent) => {
    if (o.disabled || !inChild(e)) return;
    const d: Drag = {
      x: e.clientX, y: e.clientY, tx: cx, ty: cy, moved: false, touch: e.pointerType === 'touch',
      dragging: o.control === 'drag' || (o.control === 'hover' && e.pointerType === 'touch'),
    };
    drag = d;
    press(true);
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
      if (!d.moved) { if (Math.hypot(dx, dy) < 5) return; d.moved = true; press(false); }
      if (!d.dragging) return;
      const vy = d.touch && o.control === 'hover' && o.touchScroll ? 0 : dy;
      setT(clamp(d.tx - vy * o.sens, o.max), clamp(d.ty - dx * o.sens, o.max));
    };
    const up = () => {
      removeEventListener('pointermove', mv);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      drag = null;
      press(false);
      suppress = d.moved && d.dragging;
      if (suppress && o.springBack) rest();
    };
    addEventListener('pointermove', mv);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };
  const onClick = (e: Event) => { if (suppress) { e.stopPropagation(); e.preventDefault(); suppress = false; } };

  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerleave', onLeave);
  root.addEventListener('pointerdown', onDown);
  child.addEventListener('click', onClick, true);
  // Observe the sink too: a wrapper resize can move a centred child without resizing it.
  const ro = new ResizeObserver(build);
  ro.observe(child);
  ro.observe(sink);
  build();

  return {
    update(next) {
      opts = { ...opts, ...next, advanced: { ...opts.advanced, ...next.advanced } };
      build();
    },
    destroy() {
      ro.disconnect();
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
