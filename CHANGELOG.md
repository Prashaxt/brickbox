# Changelog

## 0.1.0

Release Date: 19 November 2026

New:

- Nesting. Give a box a `lift` and it becomes a part standing on its parent brickbox, in the same 3D scene, so a button can stand out from a tilting panel. `lift` is how high the part's base sits above the parent's face (0 sits on it), and `depth` is the part's height. A nested box is static, untilted and shaded by default, and it uses its parent's `light`. It uses the browser's own hit test, so it works inside a rotated parent. Pressing it presses only it and the parent does not start a drag, while hovering over it still tilts the parent. Its shadow falls on the parent's face. A box without `lift` is untouched, so nothing changes for existing pages. In development, brickbox names any element between the part and its parent that flattens the 3D scene (`overflow`, `opacity`, `filter`, `clip-path`, `mask`, `isolation`, `mix-blend-mode`, `contain: paint`).
- `sideColor: "none"` (or `"transparent"`) builds no walls at all, which suits a box that only tilts its children.
- `advanced.trackColor` (default on) turns the colour and shape tracking below off.

Changed:

- The walls follow the face as its colour or shape changes, with no call to `update()`. brickbox re-reads the face after pointer, focus, class, style and theme changes, and frame by frame only while a colour or shape transition or a finite animation runs. Nothing runs while the box is idle. A colour-only change repaints the existing wall strips without rebuilding them. `update({})` still refreshes the walls.
- The shadow follows the box as it tilts, hovers, drags and presses. It is now the box's face projected along the light onto a plane behind it, in the same 3D scene, so it gets the same perspective. A pressed box casts a tighter shadow.
- `clip-path` accepts `calc()`, `min()`, `max()`, `clamp()` and units such as `rem` and `vw` in `polygon()`, `inset()`, `circle()` and `ellipse()`. The browser evaluates them. `url()` and `shape()` are still not supported.
- The depth warning in development is shown once.
- The core grows by about 2.2 KB gzipped.

## 0.3.0

Breaking:

- `pressDepth` is replaced by `pressSink`: how far the box sinks when pressed, as a percent of `depth`. It takes a number or a string such as `"80%"`, from 0 to 99 (anything higher counts as 99). Unset means no press, so nothing sinks unless you ask. The custom element attribute is now `press-sink`, and `press-depth` is gone. Projects that stay on 0.2.x keep `pressDepth` and see no change. In development, passing `pressDepth` logs a warning that points here.

New:

- `shadow`: a soft shadow of the box's real silhouette, holes included. `"followLight"` casts it away from `light` in any direction, `"bottom"` casts it straight down, and `"none"` (the default) turns it off. Add `blur spread color` after the mode, like `box-shadow` without the offsets, for example `"followLight 12px 2px rgba(0,0,0,.4)"`. What you leave out is chosen from `depth`, and the distance always comes from `depth`.

Fixed:

- Dragging in `drag` and `both` mode no longer selects text or scrolls the page along with the selection. Text selection is switched off only while a drag is in progress, and never when you press on an input, textarea, select or editable element.

Faster (measured in headless Chromium):

- `path()` sampling is adaptive and cached. It takes about a half to a third of the samples, and many boxes that share one path sample it once. Thirty identical donuts took about 2.6 s to build in 0.2.0 and about 0.03 s now. A single donut went from about 90 ms to about 45 ms.
- A rebuild that changes nothing visible is skipped. `update({})`, a `depth` change and the second build at startup now do almost no work. `update({})` still re-reads the face colour, so it stays the way to refresh the walls after a colour change.
- A box more than about 300 px outside the viewport waits to build its walls until it scrolls close.
- The core grows by about 1.7 KB gzipped.

## 0.2.0

- Any shape: walls follow `clip-path` (`polygon()`, `circle()`, `ellipse()`, `inset()`, `path()`) and elliptical `border-radius`. Hover and drag follow the real silhouette.
- `control: "both"`: hover tilts until you grab it, drag takes over while held, then hover resumes.
- `reverseHover` and `reverseDrag` switch the direction of each independently.
- `ignore` option and `data-brickbox-ignore` attribute: areas that do not trigger hover, drag or press.
- Walls follow only the visible part of a clip-path, so a path that spills past the element's box no longer leaves round walls under a flat face.
- The core grows by about 2 KB gzipped.

## 0.1.0

First public release.

- Framework-free core: `brickbox(el, options)`.
- React wrapper: `brickbox/react`.
- Custom element: `brickbox/element` (`<brick-box>`).
- Strip-based side walls that follow rounded corners and continue gradient backgrounds.
- Hover, drag and static control; press-to-sink; optional edge lines.
