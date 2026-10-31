/** Inline styles for the 3D structure, shared by the vanilla builder and the React wrapper so no stylesheet is needed. */
export const STYLES: Record<'persp' | 'obj' | 'sink' | 'walls', Record<string, string>> = {
  persp: { display: 'grid', width: '100%', height: '100%' },
  obj: { display: 'grid', width: '100%', height: '100%', transformStyle: 'preserve-3d', willChange: 'transform' },
  sink: { display: 'grid', width: '100%', height: '100%', position: 'relative', transformStyle: 'preserve-3d' },
  walls: { position: 'absolute', transformStyle: 'preserve-3d', pointerEvents: 'none' },
};
export const ATTR = 'data-bb';
