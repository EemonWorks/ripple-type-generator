(function () {
  'use strict';

  var results = [];
  var output = document.getElementById('results');
  var frameDriver;
  window.renderingResults = { done: false, results: results };

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function test(name, run) {
    try {
      run();
      results.push({ name: name, passed: true });
    } catch (error) {
      results.push({ name: name, passed: false, error: error.message });
    }
  }

  function canvas(width, height) {
    var c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }

  function pixel(c, x, y) {
    return c.getContext('2d').getImageData(x, y, 1, 1).data;
  }

  function pixels(c) {
    return c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  }

  function identical(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function installFrameDriver() {
    var request = window.requestAnimationFrame;
    var cancel = window.cancelAnimationFrame;
    var descriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    var queue = new Map(), nextId = 0, now = 0, hidden = false;
    window.requestAnimationFrame = function (callback) {
      queue.set(++nextId, callback);
      return nextId;
    };
    window.cancelAnimationFrame = function (id) { queue.delete(id); };
    Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return hidden; } });
    return {
      pending: function () { return queue.size; },
      step: function () {
        var callbacks = Array.from(queue.values());
        queue.clear();
        now += 1000 / 60;
        callbacks.forEach(function (callback) { callback(now); });
      },
      setHidden: function (value) {
        hidden = value;
        document.dispatchEvent(new Event('visibilitychange'));
      },
      restore: function () {
        if (window.RTG && RTG.Controls) {
          RTG.Controls.state.paused = true;
          this.step();
        }
        queue.clear();
        window.requestAnimationFrame = request;
        window.cancelAnimationFrame = cancel;
        if (descriptor) Object.defineProperty(document, 'hidden', descriptor);
        else delete document.hidden;
      }
    };
  }

  async function loadApp() {
    var url = new URL('../index.html', location.href);
    var response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load generator: HTTP ' + response.status);
    var page = new DOMParser().parseFromString(await response.text(), 'text/html');
    var fixture = document.createElement('div');
    fixture.className = 'fixture';
    Array.from(page.body.children).forEach(function (child) {
      if (child.tagName !== 'SCRIPT') fixture.appendChild(document.importNode(child, true));
    });
    document.body.appendChild(fixture);
    frameDriver = installFrameDriver();
    var scripts = Array.from(page.querySelectorAll('script[src]'));
    for (var i = 0; i < scripts.length; i++) {
      await new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        var scriptUrl = new URL(scripts[i].getAttribute('src'), url);
        scriptUrl.searchParams.set('check', Date.now());
        script.src = scriptUrl;
        script.onload = resolve;
        script.onerror = function () { reject(new Error('Could not load ' + script.src)); };
        document.head.appendChild(script);
      });
    }
  }

  async function run() {
    await loadApp();
    var R = window.RTG;
    if (!R || !R.Blur) {
      output.textContent = 'FAIL: generator or blur module failed to load.';
      window.renderingResults.done = true;
      results.push({ name: 'App boot', passed: false, error: output.textContent });
      return;
    }
    R.Controls.state.paused = true;
    var doc = document;

    function select(id, value) {
      var input = doc.getElementById(id);
      input.value = value;
      input.dispatchEvent(new Event('change'));
    }

    var approved = {
      words: ['Anchored', 'Arduos', 'Ageless', 'Abiding'],
      dropRate: 1.5, fallSpeed: 2.05, rippleSpeed: 1.16, rippleSpread: 1,
      ringCount: 4, lineWeight: 2, breaks: 0.25, interference: 1,
      tilt: 11.5, bow: 0.72, typeSize: 1.32, typeTilt: 0.19,
      font: 'win98', finish: 'glow', inkBlur: 0.2, inkSpread: 0.04,
      sharpType: true, textBlur: 0.15, textGlow: 0.25, kerning: -0.07,
      glow: 0.08, soften: 0.21, grain: 0.085, bg: '#c5dc4d', ink: '#00a943',
      uiFace: '#ffccf1', uiTitle: '#800064', uiTitleEnd: '#ffc7f0',
      uiTitleText: '#ffffff', uiText: '#35112d', uiHighlight: '#ffffff',
      uiEdgeLight: '#fff0fa', uiShadow: '#d69abc', uiEdgeDark: '#800064', uiDesktop: '#edddea'
    };

    function assertApproved() {
      Object.keys(approved).forEach(function (key) {
        assert(JSON.stringify(R.Controls.state[key]) === JSON.stringify(approved[key]), 'Approved setting differs: ' + key);
        var input = doc.getElementById(key);
        if (input && input.type === 'range') assert(+input.value === approved[key], 'Default slider is out of sync: ' + key);
      });
      assert(doc.getElementById('fontFace').value === 'win98', 'Default typeface selection differs');
      assert(doc.getElementById('words').value === approved.words.join('\n'), 'Default words differ');
      assert(doc.getElementById('bgColor').value === approved.bg &&
        doc.getElementById('inkColor').value === approved.ink, 'Default color pickers differ');
    }

    test('Startup matches the approved preview settings and palette', function () {
      assertApproved();
      assert(doc.getElementById('preset').value === 'default', 'Default artwork is not selected');
      assert(R.Controls.state.pageMode === 'fit', 'Page should still fit the window');
      assert(!doc.querySelector('link[href*="fonts.googleapis.com"]'), 'Startup eagerly loads optional web fonts');
    });

    test('Welcome opens with a labelled dialog and a focused start button', function () {
      var welcome = doc.getElementById('welcomeDialog');
      assert(welcome.open, 'Welcome did not open on launch');
      assert(welcome.getAttribute('aria-labelledby') === 'welcomeTitle', 'Welcome title is not labelled');
      assert(welcome.contains(doc.activeElement), 'Keyboard focus is outside the modal');
      assert(doc.getElementById('welcomeDescription').textContent.indexOf('canvas') >= 0, 'Welcome is missing usage guidance');
      assert(welcome.querySelector('.welcome-byline').textContent === 'Designed and Coded by Eemon Roy', 'Welcome credit is incorrect');
      assert(!welcome.textContent.includes('A kinetic type experiment inspired by Space Type Generator.'), 'Removed byline is still present');
      var instructions = doc.getElementById('welcomeInstructions');
      assert(instructions.querySelectorAll('p').length === 2 &&
        instructions.contains(doc.getElementById('welcomeDescription')) &&
        instructions.contains(welcome.querySelector('.welcome-note')), 'The instructions are not in a single box');
    });
    doc.getElementById('welcomeStart').click();

    test('Welcome can reopen, dismiss and block background shortcuts without changing settings', function () {
      var welcome = doc.getElementById('welcomeDialog');
      var opener = doc.getElementById('btnWelcome');
      assert(!welcome.open, 'Start button did not dismiss welcome');
      var words = R.Controls.state.words.join('|');
      var paused = R.Controls.state.paused;
      var railHidden = doc.getElementById('panel').hidden;
      var drops = R.Droplets.list.length;
      opener.focus();
      opener.click();
      assert(welcome.open, 'Welcome menu did not reopen the dialog');
      ['h', 'd', 'c', ' '].forEach(function (key) {
        doc.dispatchEvent(new KeyboardEvent('keydown', { key: key, code: key === ' ' ? 'Space' : '', bubbles: true }));
      });
      assert(R.Controls.state.paused === paused && R.Droplets.list.length === drops &&
        doc.getElementById('panel').hidden === railHidden, 'A modal shortcut changed the background app');
      welcome.dispatchEvent(new Event('cancel', { cancelable: true }));
      assert(!welcome.open, 'Escape/cancel did not dismiss welcome');
      assert(doc.activeElement === opener, 'Focus did not return to the welcome menu');
      opener.click();
      doc.getElementById('welcomeClose').click();
      assert(!welcome.open && R.Controls.state.words.join('|') === words, 'Close reset the words or left the modal open');
    });
    if (doc.getElementById('welcomeDialog').open) doc.getElementById('welcomeDialog').close();

    test('Welcome stays available when the control rail is collapsed', function () {
      var dialog = doc.getElementById('welcomeDialog');
      var panel = doc.getElementById('panel');
      var toggle = doc.getElementById('panelToggle');
      var wasOpen = !panel.hidden;
      if (wasOpen) toggle.click();
      try {
        doc.getElementById('btnWelcome').click();
        assert(dialog.open && !dialog.closest('[hidden]'), 'Welcome is inside hidden controls');
        assert(!dialog.closest('#controlRail'), 'Welcome is coupled to the rail layout');
        assert(dialog.getBoundingClientRect().width > 0, 'Collapsed rail hides welcome');
      } finally {
        dialog.close();
        if (wasOpen) toggle.click();
      }
    });

    var ink = '#2454f5';
    var source = canvas(256, 256);
    var sourceCtx = source.getContext('2d');
    sourceCtx.fillStyle = ink;
    sourceCtx.fillRect(120, 32, 16, 192);
    var blur = R.Blur.create();

    function blurred(radius) {
      var c = canvas(256, 256);
      c.getContext('2d').drawImage(blur.render(source, 256, 256, radius, ink), 0, 0, 256, 256);
      return c;
    }

    test('Zero blur preserves the original stroke exactly', function () {
      assert(identical(pixels(source), pixels(blurred(0))), 'Zero blur changed pixels');
    });

    test('Blur spreads coverage beyond the stroke and preserves ink colour', function () {
      var p = pixel(blurred(12), 110, 128);
      assert(pixel(source, 110, 128)[3] === 0 && p[3] > 12, 'No actual blur outside the source');
      assert(Math.abs(p[0] - 36) < 5 && Math.abs(p[1] - 84) < 5 && p[2] > 240,
        'Blur introduced a black or white fringe');
    });

    test('A larger blur broadens the edge and lowers the peak', function () {
      var narrow = blurred(4);
      var wide = blurred(16);
      assert(pixel(wide, 100, 128)[3] > pixel(narrow, 100, 128)[3] + 5, 'Blur radius has no effect');
      assert(pixel(wide, 128, 128)[3] < pixel(narrow, 128, 128)[3] - 40, 'Sharp core is still present');
    });

    test('Blur is symmetric and falls off smoothly', function () {
      var c = blurred(12);
      var previous = 255;
      for (var x = 128; x <= 180; x++) {
        var alpha = pixel(c, x, 128)[3];
        assert(alpha <= previous + 2, 'Blur edge has a bright discontinuity');
        assert(Math.abs(alpha - pixel(c, 255 - x, 128)[3]) <= 5, 'Blur is off-centre');
        previous = alpha;
      }
    });

    test('Resizing and clearing a blur layer leaves no previous ink behind', function () {
      var empty = canvas(173, 81);
      var c = blur.render(empty, 173, 81, 20, ink);
      var data = pixels(c);
      for (var i = 3; i < data.length; i += 4) assert(data[i] === 0, 'Stale alpha survived a resize');
      assert(pixel(blurred(12), 110, 128)[3] > 12, 'Blur did not recover after resizing');
    });

    test('Cobalt paper preset synchronizes controls without changing words', function () {
      var before = R.Controls.state.words.join('|');
      select('preset', 'cobalt');
      assert(R.Controls.state.finish === 'diffuse' && R.Controls.state.ink === ink, 'Preset was not applied');
      assert(doc.getElementById('glowControls').hidden && !doc.getElementById('inkControls').hidden,
        'Wrong controls shown');
      ['inkBlur', 'inkSpread', 'grain'].forEach(function (id) {
        assert(+doc.getElementById(id).value === R.Controls.state[id], 'Slider out of sync: ' + id);
      });
      assert(R.Controls.state.words.join('|') === before, 'Preset changed the word list');
    });

    test('Default artwork restores the complete approved creative settings', function () {
      select('fontFace', 'inter');
      doc.getElementById('words').value = 'Different words';
      doc.getElementById('words').dispatchEvent(new Event('input'));
      doc.getElementById('lineWeight').value = '5';
      doc.getElementById('lineWeight').dispatchEvent(new Event('input'));
      select('preset', 'default');
      assertApproved();
    });

    test('Paused rendering is idle and setting changes coalesce into one frame', function () {
      frameDriver.step();
      var originalFrame = R.Render.frame;
      var originalPng = R.Exporter.png;
      var input = doc.getElementById('glow'), value = input.value;
      var paints = 0;
      R.Render.frame = function () { paints++; return originalFrame.apply(this, arguments); };
      try {
        assert(frameDriver.pending() === 0, 'Paused animation keeps scheduling frames');
        input.value = '0.3';
        input.dispatchEvent(new Event('input'));
        input.value = '0.4';
        input.dispatchEvent(new Event('input'));
        assert(frameDriver.pending() === 1, 'Rapid controls queued multiple frames');
        frameDriver.step();
        assert(paints === 1 && frameDriver.pending() === 0, 'Paused control change did not draw once');
        input.value = '0.5';
        input.dispatchEvent(new Event('input'));
        R.Exporter.png = function () {
          assert(paints === 2 && R.Controls.state.glow === 0.5, 'PNG did not flush the latest settings');
        };
        doc.getElementById('btnPng').click();
        frameDriver.step();
        assert(paints === 2, 'An already-flushed frame was rendered again');
        doc.getElementById('btnPause').click();
        frameDriver.step();
        assert(frameDriver.pending() === 1, 'Play did not restart animation');
        doc.getElementById('btnPause').click();
        frameDriver.step();
        assert(frameDriver.pending() === 0, 'Pause did not return to idle');
      } finally {
        R.Controls.state.paused = true;
        R.Render.frame = originalFrame;
        R.Exporter.png = originalPng;
        input.value = value;
        input.dispatchEvent(new Event('input'));
        frameDriver.step();
      }
    });

    test('Hidden tabs defer paint work until visible again', function () {
      var original = R.Render.frame;
      var input = doc.getElementById('glow'), value = input.value;
      var paints = 0;
      R.Render.frame = function () { paints++; return original.apply(this, arguments); };
      try {
        frameDriver.setHidden(true);
        input.value = '0.6';
        input.dispatchEvent(new Event('input'));
        frameDriver.step();
        assert(paints === 0 && frameDriver.pending() === 0, 'Hidden page kept rendering');
        frameDriver.setHidden(false);
        frameDriver.step();
        assert(paints === 1 && frameDriver.pending() === 0, 'Visible paused page did not refresh');
      } finally {
        R.Render.frame = original;
        input.value = value;
        input.dispatchEvent(new Event('input'));
        frameDriver.step();
      }
    });

    test('Grouped wave sampling matches the direct field calculation', function () {
      var rings = [
        [0, 0, 0, 30, 1, 8], [0, 0, 0, 55, 0.7, 8],
        [1, 35, 20, 25, 0.9, 6], [1, 35, 20, 45, 0.5, 6]
      ];
      R.Field.begin();
      rings.forEach(function (r) { R.Field.add.apply(R.Field, r); });
      for (var x = -60; x <= 80; x += 7) {
        for (var y = -40; y <= 70; y += 9) {
          var expected = 0;
          rings.forEach(function (r) {
            if (r[0] === 0) return;
            var u = (Math.hypot(x - r[1], y - r[2]) - r[3]) / r[5];
            if (Math.abs(u) <= 2.5) expected += r[4] * Math.cos(Math.PI * u) * Math.exp(-0.5 * u * u);
          });
          assert(Math.abs(R.Field.sample(x, y, 0) - expected) < 1e-10, 'Optimized field changed wave heights');
        }
      }
      R.Field.begin();
    });

    test('Sliders and sharp-text checkbox update live state', function () {
      ['inkBlur', 'inkSpread', 'lineWeight', 'textBlur', 'textGlow', 'kerning'].forEach(function (id) {
        var el = doc.getElementById(id);
        var values = [+el.min, +el.max, +el.defaultValue];
        values.forEach(function (value) {
          el.value = value;
          el.dispatchEvent(new Event('input'));
          assert(R.Controls.state[id] === value, 'Unwired slider: ' + id);
          assert(el.getAttribute('aria-valuetext'), 'Slider is missing a readable value: ' + id);
        });
      });
      var checkbox = doc.getElementById('sharpType');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));
      assert(!R.Controls.state.sharpType, 'Sharp text cannot be switched off');
      assert(!doc.getElementById('textBlur').disabled, 'Text blur remains disabled');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
      assert(doc.getElementById('textBlur').disabled, 'Sharp text does not disable its blur slider');
    });

    test('Words retain capitalization and punctuation through parsing and drops', function () {
      var input = doc.getElementById('words');
      var original = input.value;
      input.value = 'Rain\nrAiN,STILL, iPhone, caf\u00e9, Ripple!';
      input.dispatchEvent(new Event('input'));
      assert(JSON.stringify(R.Controls.state.words) === JSON.stringify(['Rain', 'rAiN', 'STILL', 'iPhone', 'caf\u00e9', 'Ripple!']),
        'Input capitalization was changed');
      input.value = 'rIpPle!';
      input.dispatchEvent(new Event('input'));
      R.Droplets.clear();
      doc.getElementById('btnDrop').click();
      assert(R.Droplets.list[0].word === 'rIpPle!', 'Dropped word lost its case');
      var ctx = canvas(100, 100).getContext('2d');
      var drawn = '';
      ctx.fillText = function (text) { drawn += text; };
      R.Type.draw(ctx, 'rIpPle!', 20, 50, 50);
      assert(drawn === 'rIpPle!', 'Type renderer changed capitalization');
      R.Droplets.clear();
      input.value = original;
      input.dispatchEvent(new Event('input'));
    });

    test('Control rail collapses accessibly without losing settings', function () {
      var panel = doc.getElementById('panel');
      var toggle = doc.getElementById('panelToggle');
      var words = doc.getElementById('words');
      var value = words.value;
      if (panel.hidden) toggle.click();
      words.focus();
      toggle.click();
      assert(panel.hidden && toggle.getAttribute('aria-expanded') === 'false', 'Rail did not collapse');
      assert(doc.activeElement === toggle, 'Focus was stranded in hidden controls');
      toggle.click();
      assert(!panel.hidden && toggle.getAttribute('aria-expanded') === 'true', 'Rail did not expand');
      assert(words.value === value, 'Rail reset the words');
      words.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
      assert(!panel.hidden, 'Typing h in a textarea toggled the rail');
      var paused = R.Controls.state.paused;
      doc.getElementById('btnPause').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
      assert(R.Controls.state.paused === paused, 'Global Space handler intercepted a focused button');
      words.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert(panel.hidden, 'Escape did not close the rail');
      doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
      assert(!panel.hidden, 'H did not reopen the rail');
    });

    test('Removed media integration is not loaded or exposed in the UI', function () {
      assert(!R.Player && !R.Lyrics, 'Media modules are still loaded');
      assert(!doc.getElementById('ytUrl') && !doc.getElementById('capFile'), 'Media controls remain');
      assert(!Array.from(doc.scripts).some(function (s) { return /youtube|player\.js|lyrics\.js/.test(s.src); }),
        'A removed media script is still referenced');
    });

    test('Temporary UI colors are independent of the artwork and reset to the reference', function () {
      var bg = R.Controls.state.bg, inkColor = R.Controls.state.ink;
      var input = doc.getElementById('uiFace');
      input.value = '#b8e3dc';
      input.dispatchEvent(new Event('input'));
      assert(doc.documentElement.style.getPropertyValue('--ui-face') === '#b8e3dc', 'Window color did not change');
      assert(R.Controls.state.bg === bg && R.Controls.state.ink === inkColor, 'UI color changed the artwork palette');
      doc.getElementById('btnUiReset').click();
      assert(input.value === '#ffccf1' && doc.getElementById('uiTitle').value === '#800064',
        'Reference colors were not restored');
    });

    test('Each edge and title color has an independent, resettable UI control', function () {
      var colors = {
        uiHighlight: '--ui-highlight', uiEdgeLight: '--ui-edge-light',
        uiShadow: '--ui-shadow', uiEdgeDark: '--ui-edge-dark',
        uiTitleEnd: '--ui-title-end', uiTitleText: '--ui-title-text'
      };
      var artwork = R.Controls.state.bg + '|' + R.Controls.state.ink;
      Object.keys(colors).forEach(function (id, i) {
        var input = doc.getElementById(id);
        var value = '#12345' + i;
        input.value = value;
        input.dispatchEvent(new Event('input'));
        assert(R.Controls.state[id] === value && doc.documentElement.style.getPropertyValue(colors[id]) === value,
          'Unwired UI color: ' + id);
      });
      assert(artwork === R.Controls.state.bg + '|' + R.Controls.state.ink, 'Edge colors changed the artwork');
      doc.getElementById('btnUiReset').click();
      Object.keys(colors).forEach(function (id) {
        assert(doc.getElementById(id).value === doc.getElementById(id).defaultValue, 'Color did not reset: ' + id);
      });
    });

    test('Canvas backing size follows the framed area and existing drops survive resizing', function () {
      var viewport = doc.getElementById('canvasViewport');
      var width = viewport.style.width, height = viewport.style.height;
      var c = doc.getElementById('stage');
      var oldW = R.Camera.W, oldH = R.Camera.H;
      var source = R.Ripples.spawn(oldW * 0.4, oldH * 0.5, 'Still here', 0, R.Controls.state);
      var seed = source.seed;
      try {
        viewport.style.width = '420px';
        viewport.style.height = '460px';
        window.dispatchEvent(new Event('resize'));
        var dpr = Math.min(devicePixelRatio || 1, 2);
        assert(c.width === Math.round(R.Camera.W * dpr) && c.height === Math.round(R.Camera.H * dpr),
          'Export resolution differs from canvas dimensions');
        assert(R.Camera.W < oldW && R.Camera.H < oldH, 'Canvas did not resize with its frame');
        assert(Math.abs(source.ax / R.Camera.W - 0.4) < 0.0001 &&
          Math.abs(source.ay / R.Camera.H - 0.5) < 0.0001 && source.seed === seed,
          'Layout resize lost or moved the ripple composition');
        assert(doc.getElementById('canvasDimensions').textContent.indexOf(String(c.width)) >= 0,
          'Export size readout is stale');
      } finally {
        viewport.style.width = width;
        viewport.style.height = height;
        window.dispatchEvent(new Event('resize'));
      }
    });

    test('Recording keeps its resolution and maps clicks correctly in a fitted canvas', function () {
      var viewport = doc.getElementById('canvasViewport');
      var width = viewport.style.width, height = viewport.style.height;
      var c = doc.getElementById('stage');
      var backingW = c.width, backingH = c.height, worldW = R.Camera.W, worldH = R.Camera.H;
      var isRecording = R.Exporter.isRecording;
      try {
        R.Exporter.isRecording = function () { return true; };
        R.Controls.setRecording(true);
        viewport.style.width = '310px';
        viewport.style.height = '360px';
        window.dispatchEvent(new Event('resize'));
        assert(c.width === backingW && c.height === backingH, 'Recording resolution changed with the UI');
        var rect = c.getBoundingClientRect();
        assert(Math.abs(rect.width / rect.height - worldW / worldH) < 0.01, 'Recording preview is stretched');
        R.Droplets.clear();
        c.dispatchEvent(new PointerEvent('pointerdown', {
          clientX: rect.left + rect.width * 0.25, clientY: rect.top + rect.height * 0.75, bubbles: true
        }));
        assert(Math.abs(R.Droplets.list[0].ax - worldW * 0.25) < 0.01 &&
          Math.abs(R.Droplets.list[0].ay - worldH * 0.75) < 0.01, 'Click missed the fitted recording area');
        assert(doc.getElementById('appWindow').classList.contains('is-recording'), 'Recording frame is not marked');
        assert(doc.getElementById('pageSizeControls').disabled, 'Page size is editable during recording');
        assert(doc.getElementById('btnWelcome').disabled, 'Welcome can obscure recording controls');
        doc.getElementById('btnWelcome').click();
        assert(!doc.getElementById('welcomeDialog').open, 'Welcome opened during recording');
      } finally {
        R.Exporter.isRecording = isRecording;
        R.Controls.setRecording(false);
        R.Droplets.clear();
        viewport.style.width = width;
        viewport.style.height = height;
        window.dispatchEvent(new Event('resize'));
      }
    });

    test('Page ratio presets export the requested pixel dimensions', function () {
      var c = doc.getElementById('stage');
      var presets = [['16:9', 1920, 1080], ['9:16', 1080, 1920], ['4:4', 1080, 1080], ['18:9', 2160, 1080]];
      try {
        presets.forEach(function (p) {
          select('pageRatio', p[0]);
          assert(c.width === p[1] && c.height === p[2], 'Wrong backing dimensions for ' + p[0]);
          assert(R.Controls.state.pageMode === 'fixed', 'Preset is not fixed-size');
          var rect = c.getBoundingClientRect();
          assert(Math.abs(rect.width / rect.height - p[1] / p[2]) < 0.01, 'Preview aspect ratio differs from ' + p[0]);
        });
      } finally {
        select('pageRatio', 'fit');
      }
    });

    test('Custom width and height apply exactly and reject invalid values', function () {
      var c = doc.getElementById('stage');
      var form = doc.getElementById('pageSizeForm');
      var width = doc.getElementById('pageWidth'), height = doc.getElementById('pageHeight');
      var report = form.reportValidity;
      try {
        width.value = '1370';
        height.value = '850';
        width.dispatchEvent(new Event('input'));
        height.dispatchEvent(new Event('input'));
        assert(doc.getElementById('pageRatio').value === 'custom', 'Manual edit did not select Custom');
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        assert(c.width === 1370 && c.height === 850, 'Custom size was not applied');
        form.reportValidity = function () { return this.checkValidity(); };
        width.value = '20';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        assert(c.width === 1370 && R.Controls.state.pageWidth === 1370, 'Invalid size changed the recording canvas');
      } finally {
        form.reportValidity = report;
        select('pageRatio', 'fit');
      }
    });

    test('Image and video export actions are in the bottom status row only', function () {
      ['btnPng', 'btnRec'].forEach(function (id) {
        assert(doc.getElementById(id).closest('.status-bar'), id + ' is not in the bottom status bar');
        assert(!doc.querySelector('.menu-bar [data-command="' + id + '"]'), 'Duplicate export action remains in the top menu');
      });
    });

    test('Recording cleans up tracks and uses the actual video container', function () {
      var NativeRecorder = window.MediaRecorder;
      var alert = window.alert;
      var click = HTMLAnchorElement.prototype.click;
      var last, stopped = 0, ended = 0, filename = '', messages = [], failStart = false;
      function FakeRecorder() { this.state = 'inactive'; this.mimeType = 'video/mp4'; last = this; }
      FakeRecorder.isTypeSupported = function () { return true; };
      FakeRecorder.prototype.start = function () {
        if (failStart) throw new Error('Encoder unavailable');
        this.state = 'recording';
      };
      FakeRecorder.prototype.stop = function () {
        if (this.state === 'inactive') throw new Error('Already stopped');
        this.state = 'inactive';
      };
      var fakeCanvas = { captureStream: function () {
        return { getTracks: function () { return [{ stop: function () { stopped++; } }]; } };
      } };
      window.MediaRecorder = FakeRecorder;
      window.alert = function (message) { messages.push(message); };
      HTMLAnchorElement.prototype.click = function () { filename = this.download; };
      try {
        assert(R.Exporter.toggle(fakeCanvas, function () { ended++; }), 'Recording did not start');
        R.Exporter.toggle(fakeCanvas);
        R.Exporter.toggle(fakeCanvas);
        assert(R.Exporter.isRecording(), 'Size lock released before final data');
        last.ondataavailable({ data: new Blob(['video'], { type: 'video/mp4' }) });
        last.onstop();
        assert(stopped === 1 && ended === 1 && !R.Exporter.isRecording(), 'Recording resources were not released');
        assert(filename.endsWith('.mp4'), 'Video was labelled with the requested rather than actual container');
        failStart = true;
        assert(!R.Exporter.toggle(fakeCanvas, function () { ended++; }), 'Failed encoder reported success');
        assert(stopped === 2 && !R.Exporter.isRecording() && messages.length === 1, 'Start failure leaked a track or was silent');
        failStart = false;
        R.Exporter.toggle(fakeCanvas, function () { ended++; });
        last.onerror({ error: new Error('Encoding failed') });
        last.onstop();
        assert(stopped === 3 && ended === 3 && !R.Exporter.isRecording(), 'Error cleanup ran twice or leaked resources');
        R.Exporter.png({ toBlob: function (callback) { callback(null); } });
        assert(messages.length === 3, 'PNG failure was not surfaced');
      } finally {
        if (R.Exporter.isRecording() && last.onstop) last.onstop();
        window.MediaRecorder = NativeRecorder;
        window.alert = alert;
        HTMLAnchorElement.prototype.click = click;
      }
    });

    test('Kerning uses the same spacing for measurement and centered drawing', function () {
      var ctx = canvas(300, 100).getContext('2d');
      var text = 'AVera', size = 30;
      var normal = R.Type.measure(ctx, text, size, 0);
      var spaced = R.Type.measure(ctx, text, size, 0.2);
      assert(Math.abs(spaced - normal - (text.length - 1) * size * 0.2) < 0.001,
        'Measured spacing does not match the kerning control');
      var positions = [];
      ctx.fillText = function (glyph, x) { positions.push(x); };
      R.Type.draw(ctx, text, size, 150, 50, 0.2);
      assert(Math.abs(positions[0] - (150 - spaced / 2)) < 0.001, 'Kerned text is no longer centered');
    });

    var W = 640, H = 800;
    R.Camera.configure(W, H, 15, 0.02 + 0.55 * Math.pow(1 - 0.72, 2.5));
    R.Ripples.clear();
    R.Droplets.clear();
    // Keep rendering comparisons independent of changes to the approved launch look.
    var params = Object.assign({}, R.Controls.state, {
      finish: 'diffuse', bg: '#f4f5f2', ink: '#2454f5',
      inkBlur: 0.4, inkSpread: 0.3, lineWeight: 1, typeSize: 1, typeTilt: 0,
      kerning: 0, textGlow: 0, rippleSpeed: 1, glow: 0.45, soften: 0.12,
      grain: 0, interference: 1
    });
    R.Ripples.spawn(W * 0.38, H * 0.25, 'Ripple', 0, params);
    R.Ripples.spawn(W * 0.59, H * 0.67, 'water', -0.1, params);

    function render(overrides, dpr) {
      dpr = dpr || 1;
      var p = Object.assign({}, params, overrides);
      var c = canvas(W * dpr, H * dpr);
      var g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      R.Render.frame(g, W, H, 1.9, p, c.width, c.height);
      return c;
    }

    test('Diffusion replaces, rather than overlays, the sharp artwork', function () {
      var hard = pixels(render({ inkBlur: 0, sharpType: false }));
      var soft = pixels(render({ inkBlur: 0.55, sharpType: false }));
      var gained = 0, lowered = 0;
      for (var i = 0; i < hard.length; i += 4) {
        if (soft[i] < hard[i] - 8) gained++;
        if (soft[i] > hard[i] + 8) lowered++;
      }
      assert(gained > 2000 && lowered > 2000, 'Expected softened edges, not a sharp core plus halo');
    });

    test('Paper grain is visible, stationary and does not change the simulation', function () {
      var seeds = R.Ripples.list.map(function (s) { return s.seed; }).join();
      var a = pixels(render({ grain: 0.16 }));
      var b = pixels(render({ grain: 0.16 }));
      assert(identical(a, b), 'Paper texture flickers between identical frames');
      assert(!identical(a, pixels(render({ grain: 0 }))), 'Grain slider has no visible effect');
      assert(seeds === R.Ripples.list.map(function (s) { return s.seed; }).join(), 'Rendering changed ripple seeds');
    });

    test('Keep words sharp works in both finishes without changing distant rings', function () {
      ['glow', 'diffuse'].forEach(function (finish) {
        var sharp = pixels(render({ finish: finish, sharpType: true }));
        var soft = pixels(render({ finish: finish, sharpType: false }));
        assert(!identical(sharp, soft), 'Sharp-text toggle has no effect in ' + finish);
        var bottom = (Math.floor(H * 0.94) * W) * 4;
        assert(identical(sharp.slice(bottom), soft.slice(bottom)), 'Text toggle changed distant ring pixels');
      });
    });

    test('Text blur is independently adjustable in both finishes', function () {
      ['glow', 'diffuse'].forEach(function (finish) {
        var clear = pixels(render({ finish: finish, sharpType: false, textBlur: 0 }));
        var blurred = pixels(render({ finish: finish, sharpType: false, textBlur: 0.8 }));
        var locked = pixels(render({ finish: finish, sharpType: true, textBlur: 0.8 }));
        assert(!identical(clear, blurred), 'Text blur slider has no effect in ' + finish);
        assert(identical(clear, locked), 'Keep words sharp does not override text blur in ' + finish);
        var bottom = Math.floor(H * 0.94) * W * 4;
        assert(identical(clear.slice(bottom), blurred.slice(bottom)), 'Text blur changed distant rings');
      });
    });

    test('Text glow has its own amount in both finishes, including sharp words', function () {
      ['glow', 'diffuse'].forEach(function (finish) {
        var plain = pixels(render({ finish: finish, sharpType: true, textGlow: 0, glow: 0 }));
        var luminous = pixels(render({ finish: finish, sharpType: true, textGlow: 1, glow: 0 }));
        assert(!identical(plain, luminous), 'Text glow has no effect in ' + finish);
        var bottom = Math.floor(H * 0.94) * W * 4;
        assert(identical(plain.slice(bottom), luminous.slice(bottom)), 'Text glow altered distant rings');
      });
      assert(!doc.getElementById('textGlow').disabled, 'Keep words sharp incorrectly disables text glow');
    });

    test('Kerning reflows live words without respawning their ripples', function () {
      var source = R.Ripples.list[0], seed = source.seed, birth = source.t0;
      var normal = pixels(render({ kerning: 0 }));
      var key = source.typeKey;
      var spaced = pixels(render({ kerning: 0.3 }));
      assert(!identical(normal, spaced) && source.typeKey !== key, 'Live kerning did not update');
      assert(source.seed === seed && source.t0 === birth, 'Kerning restarted the ripple');
      render({ kerning: 0 });
    });

    test('UI palette changes never appear in the captured canvas', function () {
      var before = pixels(render({ grain: 0.16 }));
      var input = doc.getElementById('uiTitle');
      input.value = '#dbeed1';
      input.dispatchEvent(new Event('input'));
      assert(identical(before, pixels(render({ grain: 0.16 }))), 'Window tint leaked into the canvas');
      doc.getElementById('btnUiReset').click();
    });

    test('The welcome overlay is not part of the exported canvas', function () {
      var before = pixels(render({ grain: 0.16 }));
      doc.getElementById('btnWelcome').click();
      try {
        assert(doc.getElementById('welcomeDialog').open, 'Welcome did not open');
        assert(identical(before, pixels(render({ grain: 0.16 }))), 'Welcome changed canvas pixels');
      } finally {
        doc.getElementById('welcomeDialog').close();
      }
    });

    test('Line weight changes ring coverage in both finishes', function () {
      function coverage(c) {
        var data = pixels(c), sum = 0;
        for (var i = 0; i < data.length; i += 4) sum += 244 - data[i];
        return sum;
      }
      ['glow', 'diffuse'].forEach(function (finish) {
        var thin = render({ finish: finish, lineWeight: 0.5, glow: 0, soften: 0 });
        var thick = render({ finish: finish, lineWeight: 2, glow: 0, soften: 0 });
        assert(coverage(thick) > coverage(thin) * 1.4, 'Line weight has no effect in ' + finish);
      });
    });

    test('Output stays opaque at both 1x and 2x DPR', function () {
      [1, 2].forEach(function (dpr) {
        var data = pixels(render({}, dpr));
        for (var i = 3; i < data.length; i += 4) assert(data[i] === 255, 'Transparent hole in final output');
      });
      var one = pixels(render({ sharpType: false }, 1));
      var down = canvas(W, H);
      down.getContext('2d').drawImage(render({ sharpType: false }, 2), 0, 0, W, H);
      var two = pixels(down);
      var difference = 0;
      for (var p = 0; p < one.length; p++) difference += Math.abs(one[p] - two[p]);
      assert(difference / one.length < 2, 'Blur width changes with DPR');
    });

    test('Classic glow and dark-ink presets still render', function () {
      var dark = render({ finish: 'glow', bg: '#0e1930', ink: '#7fa9f0' });
      var pale = render({ finish: 'glow', bg: '#efe7d8', ink: '#1d1c1a' });
      assert(!identical(pixels(dark), pixels(pale)), 'Palettes did not render differently');
      select('preset', 'reference');
      assert(R.Controls.state.finish === 'glow' && !doc.getElementById('glowControls').hidden,
        'Cannot return to the classic finish');
      assert(!doc.getElementById('sharpType').closest('[hidden]'), 'Sharp-text control hidden in glow mode');
    });

    test('Click-to-drop and text settings survive a finish change', function () {
      R.Droplets.clear();
      var c = doc.getElementById('stage');
      var rect = c.getBoundingClientRect();
      c.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: rect.left + 120, clientY: rect.top + 180, bubbles: true
      }));
      assert(R.Droplets.list.length === 1, 'Click did not create a droplet');
      assert(R.Droplets.list[0].ax === 120 && R.Droplets.list[0].ay === 180, 'Drop moved away from click');
      var checkbox = doc.getElementById('sharpType');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));
      var textBlur = R.Controls.state.textBlur;
      select('preset', 'cobalt');
      assert(!R.Controls.state.sharpType && R.Controls.state.textBlur === textBlur,
        'Preset changed independent text settings');
      assert(R.Droplets.list.length === 1, 'Preset removed a live droplet');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
      R.Droplets.clear();
    });

    [
      { label: 'Cobalt paper: default diffusion', p: { grain: 0.16 } },
      { label: 'Denser, wider ink', p: { inkBlur: 0.55, inkSpread: 0.55, grain: 0.16 } },
      { label: 'Classic glow remains available', p: { finish: 'glow', bg: '#5e9de0', ink: '#f0f5fd', grain: 0.055 } }
    ].forEach(function (variant) {
      var figure = document.createElement('figure');
      var caption = document.createElement('figcaption');
      caption.textContent = variant.label;
      figure.appendChild(render(variant.p));
      figure.appendChild(caption);
      document.getElementById('previews').appendChild(figure);
    });

    try {
      var original = render({ grain: 0.16 });
      var blob = await new Promise(function (resolve) { original.toBlob(resolve, 'image/png'); });
      assert(blob && blob.size > 0, 'PNG snapshot is empty');
      var url = URL.createObjectURL(blob);
      try {
        var img = new Image();
        await new Promise(function (resolve, reject) {
          img.onload = resolve;
          img.onerror = function () { reject(new Error('PNG could not be decoded')); };
          img.src = url;
        });
        var decoded = canvas(W, H);
        decoded.getContext('2d').drawImage(img, 0, 0);
        assert(identical(pixels(original), pixels(decoded)), 'PNG does not contain the rendered effect');
        results.push({ name: 'PNG preserves blur and grain pixels', passed: true });
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      results.push({ name: 'PNG preserves blur and grain pixels', passed: false, error: error.message });
    }

    window.renderingResults.done = true;
    frameDriver.restore();
    output.textContent = results.map(function (r) {
      return (r.passed ? 'PASS ' : 'FAIL ') + r.name + (r.error ? ': ' + r.error : '');
    }).join('\n');
    document.title = results.filter(function (r) { return r.passed; }).length + '/' + results.length + ' rendering checks passed';
  }

  run().catch(function (error) {
    if (frameDriver) frameDriver.restore();
    results.push({ name: 'Rendering checks', passed: false, error: error.message });
    window.renderingResults.done = true;
    output.textContent = 'FAIL: ' + error.message;
  });
})();
