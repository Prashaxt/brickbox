import { brickbox } from './core';
import type { BrickBoxInstance, BrickBoxOptions, Control, LightWord } from './types';

const ATTRS = [
  'depth', 'control', 'tilt', 'max-angle', 'spring-back', 'spring-duration', 'press-depth', 'press-duration',
  'side-color', 'shading', 'light', 'perspective', 'edge-color', 'edge-width', 'touch-scroll', 'disabled', 'tolerance',
];

function read(el: HTMLElement): BrickBoxOptions {
  const g = (n: string) => el.getAttribute(n);
  const num = (n: string) => { const v = g(n); return v == null || v === '' || isNaN(+v) ? undefined : +v; };
  const bool = (n: string) => { const v = g(n); return v == null ? undefined : v !== 'false'; };
  const len = (n: string) => { const v = g(n); return v == null ? undefined : v !== '' && !isNaN(+v) ? +v : v; };
  const t = g('tilt');
  let tilt: BrickBoxOptions['tilt'];
  if (t) { const [x, y] = t.split(/[ ,]+/).map(Number); tilt = { x, y }; }
  const l = g('light');
  return {
    depth: len('depth'), control: (g('control') as Control) || undefined, tilt, maxAngle: num('max-angle'),
    springBack: bool('spring-back'), springDuration: num('spring-duration'),
    pressDepth: len('press-depth'), pressDuration: num('press-duration'),
    sideColor: g('side-color') || undefined, shading: bool('shading'),
    light: l == null ? undefined : isNaN(+l) ? (l as LightWord) : +l,
    perspective: num('perspective'), edgeColor: g('edge-color') || undefined, edgeWidth: num('edge-width'),
    touchScroll: bool('touch-scroll'), disabled: bool('disabled'), advanced: { tolerance: num('tolerance') },
  };
}

/** `<brick-box>`: wrap exactly one element child. Define it after the page has parsed (module scripts do). */
export class BrickBoxElement extends HTMLElement {
  static observedAttributes = ATTRS;
  private inst?: BrickBoxInstance;
  connectedCallback() { if (!this.inst) this.inst = brickbox(this, read(this)); }
  attributeChangedCallback() { this.inst?.update(read(this)); }
  disconnectedCallback() { this.inst?.destroy(); this.inst = undefined; }
}

export function defineBrickBox(tag = 'brick-box') {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) customElements.define(tag, BrickBoxElement);
}
