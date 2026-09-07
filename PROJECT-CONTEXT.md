# Project context

Background notes for picking this project up again — on another machine, another
GitHub account, or in a fresh AI session. `README.md` covers *how to use* the app;
this file covers *why it is the way it is*.

## What it is

A kinetic typography toy. Droplets fall onto a tilted water plane, bloom into words
inside capsules, and emit expanding rings that interfere with one another. Inspired by
the Space Type Generator, but the simulation, styling and controls are original.

Plain HTML, CSS and JavaScript. No build step, no dependencies, no framework, no
package manager. Open `index.html` through a local web server and it runs.

## Architecture

Ten small modules on a shared `window.RTG` namespace, loaded as classic `<script>`
tags. **Script order in `index.html` matters** — each module attaches itself to `RTG`
and later modules read earlier ones.

| Module | Responsibility |
| --- | --- |
| `camera.js` | Tilted-plane projection: maps plane coordinates to screen |
| `grain.js` | Reusable film-grain tile |
| `field.js` | Wave field — ring positions, amplitude, interference sampling |
| `ripple.js` | Source lifecycle, plus `RTG.Type` (faces, measuring, drawing, lazy font loading) |
| `droplet.js` | Falling droplet physics up to the moment of impact |
| `blur.js` | Separable box blur used by the glow and diffusion finishes |
| `render.js` | All compositing: rings, capsules, words, glow, diffusion, grain |
| `export.js` | PNG stills and WebM recording |
| `controls.js` | Parameter state, presets, panel wiring, UI theming |
| `main.js` | Frame loop, resize, click-to-drop, export triggers |

Rendering is event driven. `main.js` keeps a `dirty` flag; `controls.js` calls a
`renderChange` hook on every input. A paused or backgrounded tab stops scheduling
frames entirely, so an idle tab costs nothing.

## Decisions worth preserving

**Ring breaks must be a pure function of `(seed, ring)`.** An early version derived
them from elapsed progress, which made the gaps visibly crawl around each ring. They
have to be stable per ring for the whole life of a ripple.

**Sharp text is composited separately from blurred artwork.** The "keep words sharp"
option exists because blurring the whole frame made the type illegible. Strokes and
glyphs render at full export resolution even when the artwork layer does not.

**The artwork layer renders at reduced DPR when the result is blurred anyway.** This
was the single biggest performance win — glow went from ~41 ms to ~24 ms per frame at
1920×1440 with no perceptible difference (no colour channel differed by more than 10%).
Do not "fix" this by restoring full-resolution blur; it is deliberate.

**Optional web fonts load on demand.** Nothing external is fetched at startup.
`RTG.Type.loadFace(key)` injects a stylesheet the first time a face is selected and
caches the promise. MS Sans Serif is bundled locally and always available.

**Recording locks canvas resolution.** While a recording is running, resizing the
window only scales the preview — otherwise the encoder receives a changing frame size
and the file is corrupt. Use `recorder.mimeType` (not the requested type) to pick the
file extension.

## Approved defaults

These were chosen by eye and signed off. Changing them changes the app's identity, so
treat them as fixed unless deliberately redesigning. They live in `DEFAULT_ARTWORK` in
`js/controls.js`, and the control values in `index.html` must be kept in step.

Words `Anchored / Arduos / Ageless / Abiding` · font `win98` · background `#c5dc4d` ·
ink `#00a943` · finish `glow` · line weight 2 · tilt 11.5 · type size 1.32 ·
type tilt 0.19 · kerning −0.07 · text glow 0.25 · glow 0.08 · soften 0.21 ·
grain 0.085 · drop rate 1.5 · fall speed 2.05 · ripple speed 1.16 · ink blur 0.2 ·
ink spread 0.04 · sharp type on · text blur 0.15.

The Windows 98 interface palette is `UI_COLORS` in the same file: face `#ffccf1`,
title `#800064` → `#ffc7f0`, text `#35112d`, highlight `#ffffff`,
edge light `#fff0fa`, shadow `#d69abc`, edge dark `#800064`, desktop `#edddea`.

## Tests

`tests/rendering.html` runs 40 in-browser checks — the app is injected into a fixture
and asserted against. There is no Node test runner; the code needs a real canvas.

```
python3 -m http.server 8777
open http://127.0.0.1:8777/tests/rendering.html
```

The page title becomes `N/N rendering checks passed`. All 40 should pass.

Scripts are loaded with `?v=` cache-busting query strings. **Bump them in both
`index.html` and `tests/rendering.html` after editing a module**, or the browser will
happily serve you a stale file and you will debug a bug you already fixed.

## Removed features

A YouTube/lyrics mode existed briefly and was taken out. A test asserts it stays gone,
so don't be surprised by a check referring to it.

## Credits and licensing

Designed and coded by Eemon Roy.

The MS Sans Serif webfont is by **lou**, CC BY-SA 3.0, taken from the 98.css project.
Licences and attribution are kept in `assets/fonts/ms-sans-serif/` and must travel with
any copy of this project. No licence has been chosen for the application code itself —
pick one before publishing widely.
