/**
 * Boot, resize, scheduling and the animation loop.
 */
(function (RTG) {
  'use strict';

  var canvas = document.getElementById('stage');
  var viewport = document.getElementById('canvasViewport');
  var frame = document.getElementById('recordingFrame');
  var ctx = canvas.getContext('2d');
  var state = RTG.Controls.state;

  var W = 0, H = 0, dpr = 1;
  var clock = 0, last = 0, nextDrop = 0.3, wordIndex = 0;

  function resize() {
    var chrome = getComputedStyle(frame);
    var insetX = parseFloat(chrome.paddingLeft) + parseFloat(chrome.paddingRight) +
      parseFloat(chrome.borderLeftWidth) + parseFloat(chrome.borderRightWidth);
    var insetY = parseFloat(chrome.paddingTop) + parseFloat(chrome.paddingBottom) +
      parseFloat(chrome.borderTopWidth) + parseFloat(chrome.borderBottomWidth);
    var availableW = Math.max(1, Math.floor(viewport.clientWidth - insetX));
    var availableH = Math.max(1, Math.floor(viewport.clientHeight - insetY));
    var fixedSize = state.pageMode === 'fixed';
    var nextW = fixedSize ? state.pageWidth : availableW;
    var nextH = fixedSize ? state.pageHeight : availableH;
    var nextDpr = fixedSize ? 1 : Math.min(window.devicePixelRatio || 1, 2);

    // A recording keeps a fixed backing resolution. Layout changes only fit that
    // rectangle on screen, so the border always describes the pixels being captured.
    if (!RTG.Exporter.isRecording() &&
        (nextW !== W || nextH !== H || nextDpr !== dpr)) {
      var oldW = W, oldH = H;
      W = nextW;
      H = nextH;
      dpr = nextDpr;
      if (oldW && oldH) {
        var sx = W / oldW, sy = H / oldH;
        RTG.Ripples.list.forEach(function (source) {
          source.ax *= sx;
          source.ay *= sy;
          source.baseFsPx *= sy;
          source.drawnRx *= sy;
        });
        RTG.Droplets.list.forEach(function (drop) {
          drop.ax *= sx;
          drop.ay *= sy;
          drop.y0 *= sy;
          drop.r *= sy;
        });
      }
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      RTG.Grain.invalidate();
      configureCamera();
    }

    var fit = Math.min(availableW / W, availableH / H);
    canvas.style.width = (W * fit) + 'px';
    canvas.style.height = (H * fit) + 'px';
    RTG.Controls.setCanvasSize(canvas.width, canvas.height);
    paint();
  }

  /**
   * `bow` runs 0 (nearly flat affine squash) to 1 (hard perspective). The camera wants
   * a perspective length, and the useful range is strongly non-linear -- the reference
   * sits near 0.04 -- so it is mapped with a curve rather than exposed raw.
   */
  function configureCamera() {
    var perspective = 0.02 + 0.55 * Math.pow(1 - state.bow, 2.5);
    RTG.Camera.configure(W, H, state.tilt, perspective);
    RTG.Ripples.list.forEach(function (source) {
      source.u = source.ax;
      source.v = RTG.Camera.toMapY(source.ay);
    });
  }

  function crowded(ax, ay) {
    var list = RTG.Ripples.list;

    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (Math.abs(s.ax - ax) < s.capPx * 2.6 &&
          Math.abs(s.ay - ay) < s.capPy * 2.6 + 0.026 * H) return true;
    }
    return false;
  }

  /**
   * Picks a landing point. Most drops are placed near recent activity, because ripples
   * that never meet never interfere -- and interference is the whole point.
   *
   * The clustering offset is taken in *map* space, not screen space. Screen y is
   * divided by s0 to reach the map, so two ripples a modest gap apart on screen are an
   * enormous distance apart on the water and would never touch. Offsetting by map
   * distance guarantees the rings genuinely overlap, and the range keeps the capsules
   * clear while bringing the rings well inside one another.
   *
   * The anchor is drawn from anywhere in the list rather than always the newest, which
   * would random-walk the whole composition into one corner.
   */
  function pickPoint() {
    var cam = RTG.Camera;
    var list = RTG.Ripples.list;
    var anchor = (list.length && Math.random() < 0.62)
      ? list[(Math.random() * list.length) | 0]
      : null;

    for (var i = 0; i < 44; i++) {
      var ax, ay;

      if (anchor) {
        var a = Math.random() * Math.PI * 2;
        var d = Math.max(anchor.capR * 2.5, anchor.maxR * (1.15 + Math.random() * 0.6));
        ax = anchor.u + Math.cos(a) * d;
        ay = cam.toScreenY(anchor.v + Math.sin(a) * d);
      } else {
        ax = (0.16 + Math.random() * 0.68) * W;
        ay = (0.08 + Math.random() * 0.68) * H;
      }

      // Keep the drawn ripple on frame. Some bleed off the edges is wanted -- the
      // reference lets EXPAND run off the right side -- but not half the ripple.
      var e = RTG.Ripples.estimate(ay, state);
      if (ax - e.rx * 0.55 < 0 || ax + e.rx * 0.55 > W) continue;
      if (ay - e.up < 0.03 * H || ay + e.down > H) continue;
      if (i < 28 && crowded(ax, ay)) continue;

      return { ax: ax, ay: ay };
    }

    return { ax: W * 0.5, ay: H * 0.36 };
  }

  function nextWord() {
    var words = state.words;
    return words.length ? words[wordIndex++ % words.length] : '';
  }

  function dropOne() {
    var g = pickPoint();
    RTG.Droplets.spawn(g.ax, g.ay, nextWord(), clock, state);
  }

  function onImpact(d, at) {
    RTG.Ripples.spawn(d.ax, d.ay, d.word, at, state);
  }

  /** Puts a few ripples mid-life on screen so the first frame is not empty. */
  function seed() {
    for (var i = 0; i < 3; i++) {
      var g = pickPoint();
      RTG.Ripples.spawn(g.ax, g.ay, nextWord(), clock - (2 - i) * 0.8, state);
    }
  }

  function loop(now) {
    requestAnimationFrame(loop);

    if (!last) last = now;
    var dt = (now - last) / 1000;
    last = now;
    if (dt > 0.06) dt = 0.06;

    if (!state.paused) {
      clock += dt;

      if (clock >= nextDrop) {
        dropOne();
        nextDrop = clock + state.dropRate * (0.75 + Math.random() * 0.5);
      }

      RTG.Droplets.update(clock, onImpact);
      RTG.Ripples.update(clock);
    }

    paint();
    RTG.Controls.tick();
  }

  function paint() {
    RTG.Render.frame(ctx, W, H, clock, state, canvas.width, canvas.height);
  }

  RTG.Controls.init({
    onCameraChange: configureCamera,
    onLayoutChange: resize,
    onDrop: dropOne,
    onClear: function () {
      RTG.Ripples.clear();
      RTG.Droplets.clear();
    },
    onPng: function () { RTG.Exporter.png(canvas); },
    onRecord: function () {
      var on = RTG.Exporter.toggle(canvas, function () {
        RTG.Controls.setRecording(false);
        resize();
      });
      RTG.Controls.setRecording(on);
      resize();
    }
  });

  canvas.addEventListener('pointerdown', function (e) {
    var rect = canvas.getBoundingClientRect();
    RTG.Droplets.spawn((e.clientX - rect.left) * W / rect.width,
      (e.clientY - rect.top) * H / rect.height, nextWord(), clock, state);
  });

  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(viewport);

  resize();
  seed();
  paint();
  requestAnimationFrame(loop);
})(window.RTG = window.RTG || {});
