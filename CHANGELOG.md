# Changelog

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
