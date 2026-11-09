# Contributing to brickbox

Thanks for wanting to help. brickbox gives any element real 3D depth, and we want it to stay small, predictable and kind to the pages it lives on. This guide explains how to propose changes and what we check before merging.

## House rules

Every change is checked against these six rules.

1. **The element stays real.** The user's element is the front face. We never clone, hide or rewrite their content. Text stays selectable, and links and buttons keep working.
2. **Tiny, with no dependencies.** No runtime dependencies and no stylesheet to import. The goal is to shrink the core (about 4.4 KB gzipped today, target 3 KB), so a change that adds more than about 0.3 KB gzipped needs a discussion first.
3. **Quiet at rest.** No timers, animation loops or listeners doing work while nobody is touching the element. Motion comes from CSS transitions, not per-frame JavaScript.
4. **Gentle with the page.** Wrapping an element must not change its layout. Walls are `aria-hidden` and ignore the pointer. `prefers-reduced-motion` is respected. Nothing touches the network or storage.
5. **Safe on the server.** No `window` or `document` access while rendering.
6. **Honest about limits.** If something does not work, the README says so. Do not hide a limitation behind a quiet fallback.

## Ways to help

- **Report a bug.** Please include the browser and version, your OS or device, a minimal example that reproduces it, what you expected, and a screenshot or short recording(if possible).
- **Test in more browsers.** Safari, Firefox and older mobile browsers have not been verified. Reports of what works and what breaks are very welcome.
- **Improve the docs and examples.**
- **Suggest a feature.** See the next section first.

## Before you write code

- **Bugs and small fixes:** open a pull request directly.
- **New options, changed defaults, new shapes or new behaviour:** open an issue first. The options are a public contract (names, defaults and units), and changing them later breaks people. Describe the problem, what you propose, and what it costs in size.

Already planned: a mode with no extra wrapper element, a fix for a press firing before a drag starts, and clip-path and polygon shapes.

Out of scope: WebGL or Three.js, 3D models, per-child depth, and built-in animation presets.

## Setup

```
git clone https://github.com/Prashaxt/brickbox.git
cd brickbox
npm install
npm run typecheck
npm test
npm run build
npm run size
```

To try the demo, build first, then serve the folder (`npx serve .`) and open `demo/index.html`. Browsers block module imports from `file://`.

Layout of the code:

- `src/core.ts`: the engine, `brickbox(el, options)`
- `src/geometry.ts`: outline sampling and gradient maths (pure, unit-tested)
- `src/structure.ts`: the inline styles shared by every entry point
- `src/react.tsx`: the React wrapper
- `src/element.ts`: the `<brick-box>` custom element
- `src/types.ts`: the public options, with doc comments

## Making a change

1. Fork the repo and branch from `main`, for example `fix/centered-resize`.
2. Keep the pull request focused on one idea.
3. Add or update tests for pure logic (geometry, parsing, option handling). The DOM engine needs a real browser, so check anything visual by hand and show it (see below).
4. Run `npm run typecheck`, `npm test`, `npm run build` and `npm run size`. All must pass.
5. Update the options table in the README and add a line under "Unreleased" in `CHANGELOG.md`.
6. Open the pull request using the template.

### Visual changes

Include a before and after screenshot or a short recording, and say which browsers you tried. Use Chrome plus at least one of Safari or Firefox. For touch or drag changes, test on a real phone.

### Code style

- TypeScript in strict mode, with small functions and comments that explain why rather than what.
- Public options carry a doc comment with `@default`.
- No new dependencies without discussion.

### Commit messages

Short and in the imperative, for example "Fix wall alignment after window resize". No prefixes are required.

## Reporting a security issue

Please do not open a public issue. Use "Report a vulnerability" in the repository's Security tab.

## Conduct

Be kind and patient. Assume good intent, critique code and not people, and no harassment of any kind. Maintainers may remove comments or contributions that break this and may block repeat offenders.

## License

By contributing, you agree that your contributions are licensed under the MIT license that covers the project.

## For maintainers: releasing

1. Update `version` in `package.json` and move the "Unreleased" notes into a new section of `CHANGELOG.md`. While the version is 0.x, minor releases may include breaking changes, and the changelog says so.
2. Run `npm publish`. It runs the typecheck, tests and build first.
3. Tag the published commit as `vX.Y.Z`, push the tag, and create a GitHub release with the changelog notes.

Published versions cannot be changed or reused, so check `npm publish --dry-run` first.
