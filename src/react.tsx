import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { CSSProperties, ElementType, HTMLAttributes, ReactElement } from 'react';
import { brickbox } from './core';
import { ATTR, STYLES } from './structure';
import type { BrickBoxInstance, BrickBoxOptions } from './types';

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface BrickBoxProps extends BrickBoxOptions, Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** Element type of the outer wrapper. Layout props (flex, grid, margin) belong here. @default "div" */
  as?: ElementType;
  /** Exactly one element: the front face. */
  children: ReactElement;
}

/**
 * Gives its single child real 3D depth.
 * Layout on the wrapper (className, style), looks on the child.
 */
export const BrickBox = forwardRef<HTMLElement, BrickBoxProps>(function BrickBox(props, ref) {
  const {
    as, children, depth, control, tilt, maxAngle, springBack, springDuration, pressDepth, pressDuration,
    sideColor, shading, light, perspective, edgeColor, edgeWidth, touchScroll, disabled, advanced, reverseHover, reverseDrag, ignore, ...rest
  } = props;
  const Tag = (as || 'div') as ElementType;
  const options: BrickBoxOptions = {
    depth, control, tilt, maxAngle, springBack, springDuration, pressDepth, pressDuration,
    sideColor, shading, light, perspective, edgeColor, edgeWidth, touchScroll, disabled, advanced, reverseHover, reverseDrag, ignore,
  };
  const key = JSON.stringify(options);
  const local = useRef<HTMLElement | null>(null);
  const inst = useRef<BrickBoxInstance | null>(null);
  const latest = useRef(options);
  const first = useRef(true);
  latest.current = options;

  const setRefs = useCallback((el: HTMLElement | null) => {
    local.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as { current: HTMLElement | null }).current = el;
  }, [ref]);

  useIsoLayoutEffect(() => {
    inst.current = brickbox(local.current!, latest.current);
    return () => { inst.current?.destroy(); inst.current = null; };
  }, []);
  useIsoLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    inst.current?.update(latest.current);
  }, [key]);

  return (
    <Tag {...rest} ref={setRefs} suppressHydrationWarning>
      <div {...{ [ATTR]: 'persp' }} style={STYLES.persp as CSSProperties}>
        <div {...{ [ATTR]: 'obj' }} style={STYLES.obj as CSSProperties}>
          <div {...{ [ATTR]: 'sink' }} style={STYLES.sink as CSSProperties}>
            {children}
            <div {...{ [ATTR]: 'walls' }} aria-hidden="true" style={STYLES.walls as CSSProperties} />
          </div>
        </div>
      </div>
    </Tag>
  );
});
