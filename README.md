# Ripple Type Generator

A kinetic type generator. White droplets fall onto blue water, each impact blooms a word
inside an expanding set of ripple rings, and rings from different words genuinely
interfere with one another.

Plain HTML, CSS and Canvas 2D. No build step, no dependencies.

## Running it

Open `index.html`. That is the whole thing — double-clicking the file works, because the
scripts are classic `<script>` tags rather than ES modules (`file://` blocks module
imports).

For development, any static server will do; refresh the browser after edits:

```sh
python3 -m http.server 8777
# then visit http://127.0.0.1:8777/
```

## Controls

The interface is styled as a pink-and-plum Windows 98 window, with layered
3D-beveled controls and a clearly framed canvas in the center. Click inside that canvas to place
a drop. Controls live in a collapsible rail on the left. Use its arrow or `H` to
collapse/expand it; `Escape` closes it. The narrow spine stays visible, and your settings are preserved.
On small screens the rail starts collapsed.

Words, finish/colour, rings, typography, and motion/camera are separate collapsible
sections. Labels and values sit above classic recessed slider tracks, with raised
handles and tick marks. Sliders support dragging, touch, and keyboard arrows.
Drop, pause and clear stay below the settings; Save image and Record video live
in the bottom status bar beside the page size.

The interface uses a bundled bitmap-style MS Sans Serif font rather than relying on
system fonts. Select **Windows bitmap** under Typography to use it for the artwork too.
Regular and bold 11px interface type keeps the bitmap grid consistent; the welcome
headline uses the same face at 22px.

The **Welcome** window opens on launch with a short introduction, recording guidance
and credits. Dismiss it with **Let's go**, its close button, or Escape. Reopen it from
the Welcome menu. Background keyboard shortcuts are ignored while it is open; the
Welcome menu is disabled during recording. The popup is never included in exports.

| Key | Action |
|---|---|
| `H` | expand/collapse the control rail |
| `Escape` | collapse the control rail |
| `D` | drop now |
| `C` | clear |
| `Space` | pause |

**Words** — one per line, or comma separated. They cycle in order, one per droplet.
Capitalization is preserved: `Rain`, `rain`, and `rAiN` remain different. Some display
fonts, such as Bebas Neue, use all-capital glyph designs regardless of input.

**Water** — drop rate, fall speed, ripple speed, ripple spread, rings per drop,
**line weight** (0.25x to 6x in either finish), **breaks** (frays the rings into open
arcs), and **interference**. Line weight affects the rings and word capsules, not
the font size or droplet diameter.

**Typography** — typeface, size, and **lay flat**, which tips the word from upright into
the plane of the water. **Keep words sharp** overrides text blur. Turn it off to enable
the separate **Text blur** slider, which works independently of ring blur in both
finishes. Zero gives crisp text; higher values soften only the words.
**Text glow** controls a separate halo in both finishes, even when Keep words sharp
is enabled. **Kerning** adjusts letter spacing in em relative to the selected font's
default tracking. It updates existing words and their capsule measurements without
restarting the ripples.

**Camera** — tilt and bow.

**Finish & colour** — choose **Glow & soft lines** or **Diffused ink**. The original
finish has **Glow** and **Ring blur** sliders. Diffused ink has **Ink blur** for the soft
edge and **Ink spread** for the width of the coloured bands. **Grain** controls texture.

Choose the **Cobalt paper — ink blur** preset for blue, softly diffused rings on
off-white paper. It sets the ink finish, blur, spread and grain together without
changing your words, camera, line weight or text blur settings. Higher spread/weight creates
denser overlapping ink; lower values keep more space between rings. Paper grain
stays stationary rather than flickering over the moving shapes.

**Export** — `PNG` saves a still. `Record` captures WebM (or MP4 in browsers that only
support it) via `MediaRecorder`.

**UI palette (temporary)** — change the window, title gradient endpoints, title text,
body text, and desktop colors while choosing the final palette. The defaults use
the supplied SVG's pink `#ffccf1` and plum-to-pink `#800064` / `#ffc7f0` title bar.
**Light edge**, **Inner light**, **Inner shadow**, and **Dark edge** independently
control the four-tone raised/recessed borders used by buttons, sliders, panels,
the recording frame and the welcome window. Restore reference colors resets only
the interface, not the water, ink, typography, or animation.

## Recording area

Only the canvas inside the beveled center frame is captured. The title bar, control
rail, border, and recording indicators are not included in PNGs or videos. The status
bar shows the actual export resolution in pixels.

Choose **Fit window** to size the canvas to the workspace, or pick a page preset:
**16:9** (1920 x 1080), **9:16** (1080 x 1920), **4:4** (1080 x 1080), or **18:9**
(2160 x 1080). Edit W and H and press **Apply** for a custom size, from 64 to 4096
pixels on each axis. These are exact export dimensions, independent of screen DPI.
The preview fits the available space without stretching.

Existing drops and ripples keep their relative positions when the page changes size.
During recording, the size controls are disabled,
the backing resolution stays fixed and the preview fits proportionally inside the
workspace. Clicks are mapped back to that recording rectangle so drops still land
where you click.

## How it works

### The projection is not one camera

The obvious approach — a single pinhole camera looking at a tilted plane — cannot
produce this image, and measuring the reference art shows why. Within a *single* ripple
the ring squash rises from 0.29 on the word capsule to 0.46 on the outer ring, which
demands strong perspective. But separate ripples half a frame apart keep comparable
squash, which demands weak perspective. With one camera those are contradictory: the
focal length needed for the within-ripple variation drives the squash past 1.0 — rings
taller than wide — by the bottom of the frame.

| focal | sy=0.30H | sy=0.50H | sy=0.75H | sy=0.90H |
|---|---|---|---|---|
| 0.30·H | — | 0.454 | 1.196 | 1.642 |
| 2.20·H | 0.373 | 0.454 | 0.555 | 0.616 |

So `camera.js` uses a *shift-invariant* projector instead: every ripple is projected
with the identical mapping, translated to its own anchor, as though the camera were
aimed at each one in turn. Because the mapping differs only by translation, ripples stay
geometrically consistent with each other — which is what lets a shared interference
field line up with what is actually drawn.

Two spaces are in play:

- **map** `(u, v) = (screenX, screenY / s0)` — ripples are true circles here, so
  distances are Euclidean and the interference field is exact.
- **screen** — the map squashed by `s0` and bowed by the local perspective.

`s0` is the water's foreshortening and equals `sin(tilt)`. `P` is the perspective length
in pixels: small `P` bows the rings hard, large `P` approaches a flat affine squash.
Both reduce to `sx = ax + dx, sy = ay + dv·s0` for small offsets, so a tiny ring is
exactly an ellipse of squash `s0` sitting on its anchor.

The projection has a closed form, which the code uses for sizing rather than sampling.
For a ring of map radius `R`, with `m = R·cosφ·s0/P`:

```
rx     = R / sqrt(1 - m²)
ry     = s0·R / (1 - m²)
cy     = s0·R·m / (1 - m²)
squash = s0 / sqrt(1 - m²)
```

`m` is the fraction of the way to the camera, and it is why rings get rounder and sit
lower as they grow. It is capped at 0.86, since the projection diverges as `m → 1`.

Sizes are authored as the *drawn* radius and inverted back to `R` through
`R = rx / sqrt(1 + rx²k²)`. Comparing sizes in map units instead is a trap: the
map-to-screen relation is non-linear, so a ratio that holds in one space does not hold
in the other.

### Interference

Every live ring contributes a localised signed wavelet to a shared height field:

```
pulse(d, r) = cos(π·(d - r)/w) · exp(-0.5·((d - r)/w)²)
```

a crest sitting exactly on the ring with shallow troughs either side. Each ring vertex
is then displaced radially by the summed field of all *other* sources, so rings bulge
outward crossing a neighbour's crest and pull inward in its troughs.

Two things matter for this to look right rather than broken:

- **The wavelet is about as wide as the gap between rings.** Narrower, and the field
  oscillates faster than a ring is sampled.
- **The displacement is low-pass filtered around the ring.** A ring crossing a neighbour
  picks up a dozen or more fringes, and the raw radius can swing by most of a segment
  length between adjacent vertices — a visible staircase. Resolving that by brute force
  would need over 1100 vertices per ring. Two box passes remove it for free, and this is
  not only a sampling fix: real water damps short wavelengths the same way, so what
  survives is the broad bend.

Placement matters too. Screen y is divided by `s0` to reach map space, so two ripples a
modest gap apart on screen are an enormous distance apart on the water and would never
touch. Clustering offsets are therefore taken in map space, which is what makes the
overlaps in the reference reproducible. In a typical run a little over half of all
frames have at least two ripples genuinely overlapping.

The field is `O(vertices × rings)`, kept cheap with a squared-distance reject before any
`sqrt`, `cos` or `exp`. A 26 second run at 1080×1350 measures 0.97 ms mean and 2.97 ms
worst-case per frame, against a 16.7 ms budget for 60 fps.

### Blur finishes

The line art is composed on its own transparent layer rather than straight onto the
water. Word capsules cut their hole with `destination-out` instead of filling with the
background colour — otherwise the glow pass would pick up background-coloured discs and
bloom them as coloured smudges.

Both finishes use `js/blur.js`: a reusable alpha-mask blur with three separable box
passes approximating a Gaussian. It blurs actual coverage, then tints that coverage
with the ink colour. This avoids dark transparent fringes and does not rely on
Canvas `filter` support. Assigning a filter string can appear to succeed in browsers
that merely store it as a JavaScript property without applying any blur.

Glow combines three blur radii with additive compositing for light ink and multiply
for dark ink. Diffused ink instead broadens the ring strokes and composites only
the blurred result with `source-over`. It does not put a crisp line or bright core
back on top, so the colour spreads like ink rather than neon light.

The blur runs on reduced-resolution coverage buffers, with enough samples to resolve
the kernel. Buffers are reused across frames and resized when needed. Radius and
line weight scale with the artwork, including high-DPI displays and exports.

Grain is applied after compositing, so it remains fine instead of being blurred
with the rings. It is stationary in the ink finish and whenever animation is paused.
Text always has a separate rendering pass so its blur and glow are independent of
the ring finish. **Keep words sharp** bypasses text blur, while its optional glow
remains adjustable. Word measurements and glyph advances use the same kerning value.

### Other details

- Word capsules never expand. They mask underlying rings before the finish is applied;
  the separate sharp-text pass keeps words readable without a glowing outline.
- Rings run from the capsule rim outward, not from zero — the capsule can occupy well
  over half the map radius, so starting at zero would hide most rings inside it.
- Word text is drawn flat in screen space by default, matching the reference, where the
  word is upright while its capsule is squashed. "Lay flat" tips it into the plane.
- Ring breaks are a pure function of `(source, ring)` — never of how far the ring has
  expanded. Scaling breakage by expansion re-rolled the gap count and widened the gaps
  every frame, so the breaks crawled and popped. Held constant, a gap keeps its angle
  and simply stretches with the wavefront, which is what a real break in a ripple does.
- Droplets are drawn as a strobe — the same droplet at several earlier moments. The fall
  is quadratic in time, so evenly spaced strobe intervals leave dots whose gaps widen
  toward the water.
- Grain is a noise tile composited at low alpha, matching the reference print's measured
  luminance sigma of about 2.5.

## Rendering checks

With the static server running, open `http://127.0.0.1:8777/tests/rendering.html`.
The dependency-free browser checks exercise real canvas pixels, blur falloff and
colour, stationary grain, line weight, sharp text in both finishes, controls,
high-DPI output, resizing, click-to-drop, mixed-case words, rail accessibility,
independent text blur/glow, kerning, UI palette isolation, fixed recording dimensions
and PNG round trips, including custom page sizes and the four aspect presets.
Welcome focus/dismissal, background shortcut isolation, recording restrictions
and the independent bevel colors are covered as well.
The page also displays example renders for visual comparison.

## Layout

```
index.html      markup and the control panel
styles.css      panel styling
js/camera.js    the water plane and its projection
js/field.js     shared wave-height field
js/ripple.js    sources, ring lifecycle, typefaces
js/droplet.js   falling droplets and their strobe trails
js/blur.js      reusable, browser-independent ink coverage blur
js/render.js    drawing, ring breaks, interference smoothing
js/grain.js      riso grain
js/controls.js   parameter state and panel wiring
js/export.js     PNG and WebM capture
js/main.js       boot, resize, scheduling, animation loop
tests/rendering.html   browser rendering checks and visual comparisons
```

The bundled UI fonts are MS Sans Serif and MS Sans Serif Bold by lou, provided
under CC BY-SA 3.0, with WOFF2 conversions from 98.css. Original fonts, licenses,
readmes and source attribution are in `assets/fonts/ms-sans-serif/`.
