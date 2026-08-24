/**
 * Ripple sources: a word in a capsule, with rings expanding away from it.
 *
 * Everything is authored in screen pixels. Ring radii live in map space (see camera.js)
 * where ripples are true circles, so the interference field can work in plain Euclidean
 * distance. Because the projection bows a ring outward, a ring of map radius R draws at
 * screen half-width R / sqrt(1 - m^2); sizes are therefore specified as the *drawn*
 * radius and inverted back to R.
 */
(function (RTG) {
  'use strict';

  var measureCtx = document.createElement('canvas').getContext('2d');

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function smoothstep(e0, e1, x) {
    var t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /* ---------------- type ---------------- */

  /**
   * Each face carries its own tracking, because letter spacing that flatters a
   * geometric sans looks wrong on a condensed or a serif.
   */
  var FACES = {
    inter: { family: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif', weight: 500, tracking: 0.045 },
    poppins: { family: '"Poppins", "Century Gothic", "Avenir Next", system-ui, sans-serif', weight: 500, tracking: 0.075 },
    grotesk: { family: '"Space Grotesk", "Avenir Next", system-ui, sans-serif', weight: 500, tracking: 0.055 },
    bebas: { family: '"Bebas Neue", "Haettenschweiler", Impact, sans-serif', weight: 400, tracking: 0.12 },
    anton: { family: '"Anton", Impact, "Arial Black", sans-serif', weight: 400, tracking: 0.05 },
    plexmono: { family: '"IBM Plex Mono", ui-monospace, SFMono-Regular, monospace', weight: 500, tracking: 0.06 },
    playfair: { family: '"Playfair Display", Georgia, "Times New Roman", serif', weight: 600, tracking: 0.055 }
  };

  var Type = {
    faces: FACES,
    family: FACES.poppins.family,
    weight: FACES.poppins.weight,
    tracking: FACES.poppins.tracking,

    setFace: function (key) {
      var f = FACES[key] || FACES.poppins;
      this.family = f.family;
      this.weight = f.weight;
      this.tracking = f.tracking;
      return f;
    },

    font: function (px) { return this.weight + ' ' + px.toFixed(2) + 'px ' + this.family; },

    /**
     * Advance widths are summed per glyph because the text is also drawn per glyph, to
     * apply tracking identically everywhere (canvas letterSpacing is not dependable).
     */
    measure: function (ctx, text, px) {
      ctx.font = this.font(px);
      var w = 0;
      for (var i = 0; i < text.length; i++) w += ctx.measureText(text[i]).width;
      if (text.length > 1) w += this.tracking * px * (text.length - 1);
      return w;
    },

    capHeight: function (ctx, text, px) {
      ctx.font = this.font(px);
      var m = ctx.measureText(text || 'H');
      if (m.actualBoundingBoxAscent > 0) {
        return m.actualBoundingBoxAscent + Math.max(0, m.actualBoundingBoxDescent || 0);
      }
      return px * 0.72;
    },

    draw: function (ctx, text, px, cx, cy) {
      ctx.font = this.font(px);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      var x = cx - this.measure(ctx, text, px) * 0.5;
      for (var i = 0; i < text.length; i++) {
        ctx.fillText(text[i], x, cy);
        x += ctx.measureText(text[i]).width + this.tracking * px;
      }
    }
  };

  /* ---------------- source ---------------- */

  /** Inverts rx = R / sqrt(1 - (R k)^2) to recover the map radius from a drawn radius. */
  function radiusForDrawn(rx, k) {
    return rx / Math.sqrt(1 + rx * rx * k * k);
  }

  function Source(ax, ay, word, t0, p) {
    var cam = RTG.Camera;
    var k = cam.cosPhi * cam.s0 / cam.P;

    this.ax = ax;
    this.ay = ay;
    this.u = ax;
    this.v = cam.toMapY(ay);
    this.word = word;
    this.t0 = t0;

    // Higher on screen reads as further away, so it is drawn smaller. This is the only
    // depth cue, since the projection itself is deliberately shift invariant.
    var depth = 0.62 + 0.5 * clamp(ay / cam.H, 0, 1);
    this.depth = depth;

    var fsPx = p.typeSize * 0.046 * cam.H * depth * (0.93 + Math.random() * 0.14);
    this.fsPx = fsPx;

    // Gaps in the rings are keyed off this, so a ring's breaks stay put as it expands
    // instead of crawling around it every frame.
    this.seed = (Math.random() * 0x7ffffff) | 0;

    // typeTilt 0 leaves the word upright as in the reference; 1 lays it flat into the
    // water, matching the plane's own foreshortening.
    this.typeSquash = 1 - clamp(p.typeTilt || 0, 0, 1) * (1 - cam.s0);

    var textW = word ? Type.measure(measureCtx, word, fsPx) : 0;
    var capH = Type.capHeight(measureCtx, word || 'H', fsPx);

    // The capsule must clear the word on both axes. Being foreshortened, a short word
    // needs a disproportionately wide capsule just to stay tall enough for the type.
    // A laid-flat word is shorter on screen, so it needs less of that compensation.
    var byWidth = textW * 0.5 + fsPx * 0.62;
    var byHeight = (capH * this.typeSquash * 0.5 + fsPx * 0.34) / cam.s0;
    var capDrawn = Math.max(byWidth, byHeight);

    // Sizes are compared in *drawn* pixels, never in map units: the map-to-screen
    // relation is non-linear, so a ratio that holds in one space does not hold in the
    // other. Getting this wrong lets the capsule floor push maxR past the camera.
    var drawnRx = p.rippleSpread * 0.26 * cam.H * depth * (0.85 + Math.random() * 0.35);
    if (word) drawnRx = Math.max(drawnRx, capDrawn * 2.2);

    this.maxR = Math.min(radiusForDrawn(drawnRx, k), cam.maxSafeRadius());
    this.capR = word ? Math.min(radiusForDrawn(capDrawn, k), this.maxR / 1.6) : 0;

    // Drawn capsule half-extents, used to keep ripples from landing on top of one
    // another. Kept here so placement never has to redo the projection maths.
    var mc = this.capR * k;
    var wc = Math.sqrt(1 - mc * mc);
    this.capPx = this.capR / wc;
    this.capPy = this.capPx * cam.s0 / wc;

    // rippleSpeed sets how long the ripple takes to play out, whatever its size.
    this.expand = 2.6 / Math.max(0.05, p.rippleSpeed);
    this.ringCount = Math.max(1, Math.round(p.ringCount));
    this.ringInterval = this.expand / (this.ringCount + 0.6);

    // Rings run from the capsule rim out to maxR rather than from zero. The capsule can
    // occupy well over half the map radius, so starting at zero would hide most rings
    // inside it and leave a single lonely ring on screen.
    this.span = Math.max(1, this.maxR - this.capR);
    this.spacing = this.span / (this.ringCount + 0.6);
    this.life = (this.ringCount - 1) * this.ringInterval + this.expand;
  }

  /** Fraction of the way from the capsule rim to the outer limit. */
  Source.prototype.progressOf = function (k, t) {
    return (t - this.t0 - k * this.ringInterval) / this.expand;
  };

  Source.prototype.radiusAt = function (prog) {
    return this.capR + this.span * prog;
  };

  Source.prototype.ringAlpha = function (prog) {
    var fadeIn = prog < 0.05 ? prog / 0.05 : 1;
    return fadeIn * (1 - smoothstep(0.78, 1, prog));
  };

  Source.prototype.wordAlpha = function (t) {
    var age = t - this.t0;
    if (age < 0) return 0;
    return smoothstep(0, 0.22, age) * (1 - smoothstep(this.life * 0.86, this.life, age));
  };

  /* ---------------- manager ---------------- */

  var Ripples = {
    list: [],

    spawn: function (ax, ay, word, t, p) {
      var s = new Source(ax, ay, word, t, p);
      this.list.push(s);
      return s;
    },

    update: function (t) {
      var list = this.list;
      for (var i = list.length - 1; i >= 0; i--) {
        if (t - list[i].t0 > list[i].life) list.splice(i, 1);
      }
    },

    /** Publishes every live ring into the shared interference field. */
    populateField: function (t) {
      var Field = RTG.Field;
      Field.begin();

      for (var i = 0; i < this.list.length; i++) {
        var s = this.list[i];

        // The wavelet is about as wide as the gap between rings. Narrower than that and
        // the field oscillates faster than a ring is sampled, which aliases the smooth
        // bend into jagged spikes.
        var w = s.spacing * 0.85;

        for (var k = 0; k < s.ringCount; k++) {
          var prog = s.progressOf(k, t);
          if (prog <= 0 || prog >= 1) continue;
          var a = s.ringAlpha(prog);
          if (a <= 0.01) continue;
          Field.add(i, s.u, s.v, s.radiusAt(prog), a, w);
        }
      }
    },

    clear: function () { this.list.length = 0; },

    /**
     * Typical drawn extents for a ripple anchored at screen y, in screen pixels.
     * Placement needs this to keep ripples on frame: the anchor alone says nothing,
     * because a bowed ripple reaches far more below its anchor than above it.
     */
    estimate: function (ay, p) {
      var cam = RTG.Camera;
      var k = cam.cosPhi * cam.s0 / cam.P;
      var depth = 0.62 + 0.5 * clamp(ay / cam.H, 0, 1);

      var drawnRx = p.rippleSpread * 0.26 * cam.H * depth * 1.1;
      var R = Math.min(drawnRx / Math.sqrt(1 + drawnRx * drawnRx * k * k), cam.maxSafeRadius());
      var m = R * k;

      return {
        rx: R / Math.sqrt(1 - m * m),
        up: cam.s0 * R / (1 + m),
        down: cam.s0 * R / (1 - m)
      };
    }
  };

  RTG.Type = Type;
  RTG.Ripples = Ripples;
  RTG.util = { clamp: clamp, smoothstep: smoothstep };
})(window.RTG = window.RTG || {});
