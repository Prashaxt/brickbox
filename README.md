# brickbox

Wrap any element and give it real 3D depth. The element stays real DOM (selectable, accessible, styled by you), and brickbox draws the side walls behind it. Rounded corners and gradient backgrounds carry through.

## Install

```
npm i brickbox
```

Status: early release (v0.1.0). Expect small API changes before 1.0.

## Use

```tsx
import { BrickBox } from 'brickbox/react';

<BrickBox depth={24} control="hover" tilt={{ x: 14, y: 22 }}>
  <div className="rectangle">this is a rectangle</div>
</BrickBox>
```

```html
<brick-box depth="24" control="hover" tilt="14 22">
  <div class="rectangle">this is a rectangle</div>
</brick-box>
<script type="module">
  import { defineBrickBox } from 'brickbox/element';
  defineBrickBox();
</script>
```

```js
import { brickbox } from 'brickbox';
const box = brickbox(wrapperEl, { depth: 24 }); // wrapperEl contains exactly one element child
box.update({ depth: 40 });
box.destroy();
```

Layout on the wrapper, looks on the child: flex, grid, margins and position belong on the wrapper (`className`/`style`, or the `<brick-box>` element). Background, radius and padding stay on the child. Put opacity, filter and overflow on the wrapper, never on the 3D layer.

## Options

| Option | Default | Notes |
|---|---|---|
| `depth` | `24` | number (px) or CSS length |
| `control` | `"hover"` | `"hover"`, `"drag"`, `"static"`. On touch, `"hover"` behaves as drag |
| `tilt` | `{ x: 14, y: 22 }` | degrees. +x shows the bottom wall, +y the right wall |
| `maxAngle` | `60` | clamp for hover and drag |
| `springBack` | `true` | |
| `springDuration` | `700` | ms |
| `pressDepth` | same as `depth` | smaller value makes it sink on press |
| `pressDuration` | `150` | ms |
| `sideColor` | `"match"` | follows the element's background, or any CSS colour |
| `shading` | on for `"match"` | lighting on the walls |
| `light` | `"top-left"` | word or degrees (0 top, clockwise) |
| `perspective` | `1000` | px |
| `edgeColor` | `"none"` | `"none"`, `"auto"` or a CSS colour |
| `edgeWidth` | `1` | px |
| `touchScroll` | `true` | touch only: vertical swipes scroll the page |
| `disabled` | `false` | |
| `advanced` | | `tolerance` (0.25), `sensitivity` (0.5), `bounce` (1), `cull` (true) |

## Limitations

- Rectangles with uniform or per-corner radii (pills and circles included). Clip-path shapes, blobs and elliptical radii are not supported yet.
- Walls follow the child's background colour, or a single linear gradient with `rgb()` stops. Images and other backgrounds fall back to a solid colour. Wall colours are read when the walls are built, so they do not follow a later colour change.
- The element's own `box-shadow` and `outline` are not extruded, and borders stay on the front face.
- Depth beyond about half of `perspective` can clip or distort (a warning is logged in development).
- Tested by the author on desktop and phone browsers. Safari, Firefox and older mobile browsers have not been verified yet.

## Develop

```
npm install
npm run typecheck && npm test && npm run build && npm run size
```
