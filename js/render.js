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

      // Outer rings break up more than inner ones, which is how a real ripple frays.
      var breaks = p.breaks * (0.35 + 0.65 * prog);

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
    ctx.fillStyle = p.bg;
    ctx.fill();
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
      backdrop(ctx, W, H, p);

      RTG.Ripples.populateField(t);

      // Far to near, so nearer capsules mask the ripples behind them.
      var list = RTG.Ripples.list;
      var order = [];
      for (var i = 0; i < list.length; i++) order.push(i);
      order.sort(function (a, b) { return list[a].ay - list[b].ay; });

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = RTG.util.clamp(0.0024 * H, 1.25, 7);

      for (var j = 0; j < order.length; j++) {
        drawSource(ctx, list[order[j]], order[j], t, p);
      }

      drawDroplets(ctx, t, p);

      ctx.globalAlpha = 1;
      RTG.Grain.apply(ctx, devW, devH, p.grain);
    }
  };

  RTG.Render = Render;
})(window.RTG = window.RTG || {});
