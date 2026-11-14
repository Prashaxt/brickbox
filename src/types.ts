export type Control = 'hover' | 'drag' | 'both' | 'static';
export type LightWord = 'top' | 'top-right' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left' | 'top-left';

/** Resting angle in degrees. Positive x shows the bottom wall, positive y shows the right wall. */
export interface Tilt { x: number; y: number }

export interface Advanced {
  /** Max distance (px) between a curved wall and the true curve. Lower is smoother and heavier. @default 0.25 */
  tolerance?: number;
  /** Degrees of tilt per pixel of drag. @default 0.5 */
  sensitivity?: number;
  /** 0 is a plain ease, 1 is the default springy overshoot. @default 1 */
  bounce?: number;
  /** Hide back-facing walls to halve wall painting. @default true */
  cull?: boolean;
}

export type ShadowMode = 'none' | 'followLight' | 'bottom';
/**
 * A shadow mode, optionally followed by `blur spread color` like CSS box-shadow, for example
 * `"followLight 12px 2px rgba(0,0,0,.4)"`. Anything you leave out is chosen from `depth`.
 */
export type Shadow = ShadowMode | `${Exclude<ShadowMode, 'none'>} ${string}`;

export interface BrickBoxOptions {
  /** Extrusion length. A number is px, a string is any CSS length. @default 24 */
  depth?: number | string;
  /**
   * How the box reacts to the pointer. "both" tilts on hover until you grab it, drag takes over while held,
   * then hover resumes. On touch, "hover" and "both" behave as drag. @default "hover"
   */
  control?: Control;
  /** Resting angle in degrees. @default { x: 14, y: 22 } */
  tilt?: Tilt;
  /** Largest angle hover and drag may reach, in degrees. @default 60 */
  maxAngle?: number;
  /** Return to the resting tilt after release or leave. @default true */
  springBack?: boolean;
  /** Length of the return animation in ms. @default 700 */
  springDuration?: number;
  /**
   * How far the box sinks when pressed, as a percent of `depth`: 0 is no press, 99 is almost flat.
   * A number or a string such as "80%". Above 99 is treated as 99. Unset means no press.
   */
  pressSink?: number | string;
  /** Length of the press transition in ms. @default 150 */
  pressDuration?: number;
  /** "match" follows the element's background, or pass one CSS colour. @default "match" */
  sideColor?: 'match' | (string & {});
  /** Lighting on the walls. @default true for "match", false for an explicit colour */
  shading?: boolean;
  /** Where the light comes from: a word, or degrees (0 is top, clockwise). @default "top-left" */
  light?: LightWord | number;
  /**
   * A soft shadow of the box's real silhouette. "followLight" casts it away from `light` (any direction),
   * "bottom" casts it straight down, "none" turns it off. Add `blur spread color` after the mode to tune it.
   * The distance comes from `depth`. @default "none"
   */
  shadow?: Shadow;
  /** Perspective distance in px. @default 1000 */
  perspective?: number;
  /** Lines on the back rim and sharp corners. "auto" is a darker line. @default "none" */
  edgeColor?: 'none' | 'auto' | (string & {});
  /** Edge line width in px. @default 1 */
  edgeWidth?: number;
  /** Flip the hover tilt direction. @default false */
  reverseHover?: boolean;
  /** Flip the drag direction. @default false */
  reverseDrag?: boolean;
  /**
   * CSS selector for areas inside the element that ignore hover, drag and press, such as a knob.
   * Elements with a data-brickbox-ignore attribute are ignored too.
   */
  ignore?: string;
  /** Touch only: true lets vertical swipes scroll the page (only horizontal drags tilt). @default true */
  touchScroll?: boolean;
  /** Render the child normally with no 3D. @default false */
  disabled?: boolean;
  advanced?: Advanced;
}

export interface BrickBoxInstance {
  /** Merge new options and rebuild. Keys set to undefined reset to their default. */
  update(options: BrickBoxOptions): void;
  destroy(): void;
}
