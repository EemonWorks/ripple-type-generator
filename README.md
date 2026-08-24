# Ripple Type Generator

A kinetic type generator. White droplets fall onto blue water, each impact blooms a word
inside an expanding set of ripple rings, and rings from different words genuinely
interfere with one another.

Plain HTML, CSS and Canvas 2D. No build step, no dependencies.

## Running it

Open `index.html`. That is the whole thing — double-clicking the file works, because the
scripts are classic `<script>` tags rather than ES modules (`file://` blocks module
imports).

For development with live reload of edits, any static server will do:

```sh
python3 -m http.server 8777
# then visit http://127.0.0.1:8777/
```

## Controls

Click anywhere on the water to place a drop by hand.

| Key | Action |
|---|---|
| `H` | show/hide the panel |
| `D` | drop now |
| `C` | clear |
| `Space` | pause |

**Words** — one per line, or comma separated. They cycle in order, one per droplet.

**Lyrics** — play a track and let its words fall in time with it. See below.

**Water** — drop rate, fall speed, ripple speed, ripple spread, rings per drop,
**breaks** (frays the rings into open arcs), and **interference**.

**Type** — typeface, size, and **lay flat**, which tips the word from upright into the
plane of the water.

**Camera** — tilt, bow, grain.

**Export** — `PNG` saves a still. `Record` captures WebM (or MP4 in browsers that only
support it) via `MediaRecorder`.

## Lyrics mode

Paste a YouTube link and press **Load**, then supply a caption file — drop a `.srt`,
`.vtt` or `.lrc` anywhere on the page, or use the file picker. Press **Play** and each
word falls in time with the track. Dropping an audio file (`.mp3`, `.m4a`, `.wav`, …)
plays that locally instead of YouTube.

**Captions have to be supplied; they cannot be fetched.** There is no way for a web page
to read a YouTube video's caption text:

- the IFrame Player API exposes no caption methods at all,
- the undocumented `/api/timedtext` endpoint sends no CORS headers, so the browser
  blocks it,
- and the official Captions API only covers videos you own.

Any automatic fetch would need a server-side proxy, which would mean this stopped being
a static page you can open from disk. So the track plays from YouTube and the words come
from a file you provide.

Supported formats, auto-detected:

| Format | Notes |
|---|---|
| SubRip `.srt` | words spread evenly across each cue |
| WebVTT `.vtt` | karaoke cues with inline `<00:00:12.500>` marks give true per-word timing |
| LRC `.lrc` | `[mm:ss.xx]` line tags |
| plain text | untimed — words spread evenly across the track's duration |

**Drop as** switches between one word per ripple and short phrases, which stays readable
when a song moves faster than a ripple can bloom.

A droplet takes time to fall, so each word is released early by exactly the fall
duration and back-dated by however late the current frame is. The word therefore *lands*
on its timestamp rather than starting to fall on it. Scrubbing the player resyncs
instead of dumping the backlog on screen, dense passages are rate-limited so they cannot
flood the canvas, and words the scheduler is hopelessly late on are discarded.

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

### Other details

- Word capsules never expand, so words stay legible at any ripple setting. They are
  filled with water before stroking, which hides sub-capsule rings and lets a nearer
  capsule correctly mask the ripples behind it.
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

## Layout

```
index.html      markup and the control panel
styles.css      panel styling
js/camera.js    the water plane and its projection
js/field.js     shared wave-height field
js/ripple.js    sources, ring lifecycle, typefaces
js/droplet.js   falling droplets and their strobe trails
js/render.js    drawing, ring breaks, interference smoothing
js/grain.js      riso grain
js/controls.js   parameter state and panel wiring
js/export.js     PNG and WebM capture
js/player.js     YouTube embed and local audio playback
js/lyrics.js     caption parsing and drop scheduling
js/main.js       boot, resize, scheduling, animation loop
```
