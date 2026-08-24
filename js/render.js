/**
 * Drawing. The whole image is stroked polylines plus flat screen-space type.
 */
(function (RTG) {
  'use strict';

  var TWO_PI = Math.PI * 2;
  var pt = { x: 0, y: 0, ok: true };
  var box = { x0: 0, y0: 0, x1: 0, y1: 0, cx: 0, cy: 0, w: 0, h: 0, ok: false };

  var vx = new Float64Array(256);
  var vy = new Float64Array(256);
  var vok = new Uint8Array(256);
  var d0 = new Float64Array(256);
  var d1 = new Float64Array(256);

  function ensure(n) {
    if (vx.length >= n) return;
    vx = new Float64Array(n);
    vy = new Float64Array(n);
    vok = new Uint8Array(n);
    d0 = new Float64Array(n);
    d1 = new Float64Array(n);
  }

  /** Circular box blur with a running sum: O(n) regardless of window size. */
  function boxSmooth(src, dst, n, b) {
    var win = 2 * b + 1;
    var inv = 1 / win;
    var sum = 0;
    var j;

    for (j = -b; j <= b; j++) sum += src[(j % n + n) % n];
    for (var i = 0; i < n; i++) {
      dst[i] = sum * inv;
      sum += src[(i + b + 1) % n] - src[(i - b + n) % n];
    }
  }

  /* ---------------- ring breaks ---------------- */

  var gapBuf = new Float64Array(16);

  /**
   * Deterministic hash. Gaps must be a pure function of (source, ring) so they stay
   * anchored to the ring as it expands; anything frame-dependent would make the breaks
   * crawl and shimmer.
   */
  function hashUnit(seed, i) {
    var h = Math.imul(seed ^ Math.imul(i, 0x9e3779b1), 2654435761);
    h ^= h >>> 15;
    h = Math.imul(h, 2246822519);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }

  function buildGaps(seed, ring, amount) {
    if (amount <= 0.002 || ring < 0) return 0;

    var n = Math.min(6, Math.round(amount * 3 + hashUnit(seed, ring * 17 + 1) * 1.6));
    for (var g = 0; g < n; g++) {
      gapBuf[g * 2] = hashUnit(seed, ring * 53 + g * 7) * TWO_PI;
      gapBuf[g * 2 + 1] = (0.03 + hashUnit(seed, ring * 53 + g * 7 + 3) * 0.05) * TWO_PI * amount * 0.5;
    }
    return n;
  }

  function inGap(th, n) {
    for (var g = 0; g < n; g++) {
      var dd = th - gapBuf[g * 2];
      dd -= TWO_PI * Math.round(dd / TWO_PI);
      if (dd < 0) dd = -dd;
      if (dd < gapBuf[g * 2 + 1]) return true;
    }
    return false;
  }

  /**
   * Projects one ring into the vertex buffers, displacing each vertex radially by the
   * interference field of every other source. Returns the vertex count.
   *
   * The raw field is far steeper in angle than a polyline can carry: a ring crossing a
   * neighbour picks up a dozen or more fringes, and the radius can swing by most of a
   * segment length between adjacent vertices, which shows up as a staircase. Two box
   * passes over the displacement remove that. It is not only a sampling fix -- real
   * water damps short wavelengths the same way, so the surviving bend is the broad one.
   */
  function buildRing(src, si, R, disp, ring, breaks) {
    var cam = RTG.Camera;
    var Field = RTG.Field;

    var k = cam.cosPhi * cam.s0 / cam.P;
    var m = Math.min(0.97, R * k);
    var rPx = R / Math.sqrt(1 - m * m);

    var N = Math.round(RTG.util.clamp(rPx * 0.8, 64, 420));
    ensure(N + 1);

    var i, th;

    if (disp !== 0) {
      for (i = 0; i < N; i++) {
        th = (i / N) * TWO_PI;
        d0[i] = Field.sample(src.u + R * Math.cos(th), src.v + R * Math.sin(th), si);
      }
      var b = Math.max(1, Math.round(N / 26));
      boxSmooth(d0, d1, N, b);
      boxSmooth(d1, d0, N, b);
    }

    var nGaps = buildGaps(src.seed, ring, breaks);
    var lo = R * 0.25;
    var hi = cam.dvLimit * 0.88;

    for (i = 0; i <= N; i++) {
      th = (i / N) * TWO_PI;

      var rr = R;
      if (disp !== 0) {
        rr += disp * d0[i === N ? 0 : i];
        if (rr < lo) rr = lo;
        else if (rr > hi) rr = hi;
      }

      cam.project(src.ax, src.ay, rr * Math.cos(th), rr * Math.sin(th), pt);
      vx[i] = pt.x;
      vy[i] = pt.y;
      vok[i] = (pt.ok && !(nGaps && inGap(th, nGaps))) ? 1 : 0;
    }

    return N + 1;
  }

  /** Traces buffered vertices, breaking wherever the ring left the frustum. */
  function trace(ctx, n) {
    ctx.beginPath();
    var open = false;
    for (var i = 0; i < n; i++) {
      if (!vok[i]) { open = false; continue; }
      if (open) ctx.lineTo(vx[i], vy[i]);
      else { ctx.moveTo(vx[i], vy[i]); open = true; }
    }
  }

  function bounds(n) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
    for (var i = 0; i < n; i++) {
      if (!vok[i]) continue;
      any = true;
      if (vx[i] < x0) x0 = vx[i];
      if (vx[i] > x1) x1 = vx[i];
      if (vy[i] < y0) y0 = vy[i];
      if (vy[i] > y1) y1 = vy[i];
    }
    box.ok = any;
    if (!any) return box;
    box.x0 = x0; box.y0 = y0; box.x1 = x1; box.y1 = y1;
    box.cx = (x0 + x1) * 0.5;
    box.cy = (y0 + y1) * 0.5;
    box.w = x1 - x0;
    box.h = y1 - y0;
    return box;
  }

  /* ---------------- glow layers ---------------- */

  var art = null, artCtx = null;
  var blur = null, blurCtx = null;

  /** Canvas filters are widely but not universally supported; downscaling is the fallback. */
  var canFilter = (function () {
    try {
      var probe = document.createElement('canvas').getContext('2d');
      probe.filter = 'blur(2px)';
      return probe.filter === 'blur(2px)';
    } catch (e) {
      return false;
    }
  })();

  function ensureArt(W, H, devW, devH, dpr) {
    if (!art) {
      art = document.createElement('canvas');
      artCtx = art.getContext('2d');
    }
    if (art.width !== devW || art.height !== devH) {
      art.width = devW;
      art.height = devH;
    }
    artCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    artCtx.clearRect(0, 0, W, H);
    return art;
  }

  function ensureBlur(w, h) {
    if (!blur) {
      blur = document.createElement('canvas');
      blurCtx = blur.getContext('2d');
    }
    if (blur.width !== w || blur.height !== h) {
      blur.width = w;
      blur.height = h;
    }
    blurCtx.setTransform(1, 0, 0, 1, 0, 0);
    blurCtx.clearRect(0, 0, w, h);
    return blur;
  }

  function luminance(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return 0.5;
    return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
  }

  /**
   * Additive bloom. The art is reduced before blurring, which is both much cheaper than
   * blurring at full resolution and most of the blur itself. Two octaves are summed: a
   * tight halo that hugs the stroke, and a wide one for the soft falloff.
   *
   * Light ink on dark water blooms additively. Dark ink on a pale preset has to darken
   * instead, or `lighter` would wash the glow out to nothing.
   */
  function drawGlow(ctx, source, devW, devH, amount, p) {
    // Three octaves: a tight halo hugging the stroke, a mid spread, and a wide soft
    // wash. Summing widely separated radii is what gives a bloom its long falloff --
    // a single blur just looks like a thicker line.
    var octaves = [
      { scale: 0.25, radius: devH * 0.008, weight: 1 },
      { scale: 0.10, radius: devH * 0.016, weight: 0.7 },
      { scale: 0.04, radius: devH * 0.030, weight: 0.45 }
    ];

    ctx.globalCompositeOperation = luminance(p.ink) >= luminance(p.bg) ? 'lighter' : 'multiply';

    for (var i = 0; i < octaves.length; i++) {
      var o = octaves[i];
      var w = Math.max(1, Math.round(devW * o.scale));
      var h = Math.max(1, Math.round(devH * o.scale));

      var b = ensureBlur(w, h);
      blurCtx.filter = canFilter ? 'blur(' + (o.radius * o.scale).toFixed(2) + 'px)' : 'none';
      blurCtx.drawImage(source, 0, 0, w, h);
      blurCtx.filter = 'none';

      ctx.globalAlpha = amount * o.weight;
      ctx.drawImage(b, 0, 0, devW, devH);
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /** Lays the art down, optionally softened. */
  function drawArtLayer(ctx, source, devW, devH, radius) {
    ctx.globalAlpha = 1;

    if (radius < 0.4) {
      ctx.drawImage(source, 0, 0, devW, devH);
      return;
    }

    if (canFilter) {
      ctx.filter = 'blur(' + radius.toFixed(2) + 'px)';
      ctx.drawImage(source, 0, 0, devW, devH);
      ctx.filter = 'none';
      return;
    }

    // Without canvas filters, a round trip through a smaller canvas softens the edges.
    var f = 1 / (1 + radius * 0.6);
    var w = Math.max(1, Math.round(devW * f));
    var h = Math.max(1, Math.round(devH * f));
    var b = ensureBlur(w, h);
    blurCtx.drawImage(source, 0, 0, w, h);
    ctx.drawImage(b, 0, 0, devW, devH);
  }

  function drawSource(ctx, src, si, t, p) {
    // Displacement is scaled by this ripple's own ring spacing so the interference
    // stays proportionate whether the ripple is large or small. The angular smoothing
    // in buildRing costs amplitude, so this is larger than the raw field would need.
    var disp = p.interference * 0.7 * src.spacing;

    for (var k = 0; k < src.ringCount; k++) {
      var prog = src.progressOf(k, t);
      if (prog <= 0 || prog >= 1) continue;

      var a = src.ringAlpha(prog);
      if (a <= 0.012) continue;

      // Breakage is fixed per ring, never a function of how far the ring has expanded.
      // Scaling it by progress re-rolled the gap count and widened the gaps every
      // frame, so the breaks crawled and popped instead of sitting still. Holding it
      // constant means a gap keeps its angle and simply stretches with the wavefront,
      // which is what a real break in a ripple does.
      var breaks = p.breaks * (0.65 + 0.35 * hashUnit(src.seed, k * 911 + 5));

      var n = buildRing(src, si, src.radiusAt(prog), disp, k, breaks);
      ctx.globalAlpha = a;
      trace(ctx, n);
      ctx.stroke();
    }

    if (!src.word || src.capR <= 0) return;

    var wa = src.wordAlpha(t);
    if (wa <= 0.012) return;

    // The capsule is never broken -- it has to stay closed around the word.
    var cn = buildRing(src, si, src.capR, 0, -1, 0);
    var b = bounds(cn);
    if (!b.ok) return;

    ctx.globalAlpha = wa;
    trace(ctx, cn);
    ctx.closePath();

    // Punching a hole rather than filling with the water colour keeps the art layer
    // free of background-coloured blobs, which would otherwise bloom as coloured
    // smudges in the glow pass. The backdrop shows through the hole either way.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.stroke();

    var Type = RTG.Type;
    var fs = src.fsPx;
    var room = b.w - src.fsPx * 0.85;
    var tw = Type.measure(ctx, src.word, fs);
    if (room > 4 && tw > room) fs *= room / tw;

    ctx.fillStyle = p.ink;

    if (src.typeSquash < 0.999) {
      // Squashing vertically lays the word down into the water plane.
      ctx.save();
      ctx.translate(b.cx, b.cy);
      ctx.scale(1, src.typeSquash);
      Type.draw(ctx, src.word, fs, 0, 0);
      ctx.restore();
    } else {
      Type.draw(ctx, src.word, fs, b.cx, b.cy);
    }
  }

  function drawDroplets(ctx, t, p) {
    var list = RTG.Droplets.list;
    if (!list.length) return;

    var trail = RTG.Droplets.TRAIL;
    ctx.fillStyle = p.ink;

    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      var age = t - d.t0;

      for (var s = 0; s < trail; s++) {
        var a = age - s * d.strobe;
        if (a <= 0) continue;

        var y = d.yAt(a);
        if (y > d.ay) continue;

        ctx.globalAlpha = s === 0 ? 1 : (1 - s / trail) * 0.85;
        ctx.beginPath();
        ctx.arc(d.ax, y, d.r * (0.78 + 0.22 * (a / d.fall)) * (s === 0 ? 1 : 0.9), 0, TWO_PI);
        ctx.fill();
      }
    }
  }

  function backdrop(ctx, W, H, p) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, W, H);

    // The reference print has a faint brighter column down the middle.
    var g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  var Render = {
    frame: function (ctx, W, H, t, p, devW, devH) {
      var dpr = devW / W;

      backdrop(ctx, W, H, p);

      RTG.Ripples.populateField(t);

      // The line art is always composed on its own transparent layer, so the capsule
      // masks can cut holes and the glow pass has clean ink to work from.
      ensureArt(W, H, devW, devH, dpr);
      var a = artCtx;

      // Far to near, so nearer capsules mask the ripples behind them.
      var list = RTG.Ripples.list;
      var order = [];
      for (var i = 0; i < list.length; i++) order.push(i);
      order.sort(function (x, y) { return list[x].ay - list[y].ay; });

      a.lineJoin = 'round';
      a.lineCap = 'round';
      a.strokeStyle = p.ink;
      a.lineWidth = RTG.util.clamp(0.0024 * H, 1.25, 7);

      for (var j = 0; j < order.length; j++) {
        drawSource(a, list[order[j]], order[j], t, p);
      }

      drawDroplets(a, t, p);

      // Composite in device pixels so blur radii mean the same thing at any DPR.
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if ((p.glow || 0) > 0.01) drawGlow(ctx, art, devW, devH, p.glow, p);
      drawArtLayer(ctx, art, devW, devH, (p.soften || 0) * 0.018 * devH);
      ctx.restore();

      ctx.globalAlpha = 1;
      RTG.Grain.apply(ctx, devW, devH, p.grain);
    }
  };

  RTG.Render = Render;
})(window.RTG = window.RTG || {});
