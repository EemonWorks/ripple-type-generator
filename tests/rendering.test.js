(function () {
  'use strict';

  var results = [];
  var output = document.getElementById('results');
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

  async function loadApp() {
    var url = new URL('../index.html', location.href);
    var response = await fetch(url);
    if (!response.ok) throw new Error('Could not load generator: HTTP ' + response.status);
    var page = new DOMParser().parseFromString(await response.text(), 'text/html');
    var fixture = document.createElement('div');
    fixture.className = 'fixture';
    Array.from(page.body.children).forEach(function (child) {
      if (child.tagName !== 'SCRIPT') fixture.appendChild(document.importNode(child, true));
    });
    document.body.appendChild(fixture);
    var scripts = Array.from(page.querySelectorAll('script[src]'));
    for (var i = 0; i < scripts.length; i++) {
      await new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = new URL(scripts[i].getAttribute('src'), url);
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

    test('Segmented sliders and sharp-text checkbox update live state', function () {
      ['inkBlur', 'inkSpread', 'lineWeight', 'textBlur'].forEach(function (id) {
        var el = doc.getElementById(id);
        var values = [+el.min, +el.max, +el.defaultValue];
        values.forEach(function (value) {
          el.value = value;
          el.dispatchEvent(new Event('input'));
          assert(R.Controls.state[id] === value, 'Unwired slider: ' + id);
          var expected = 100 * (value - +el.min) / (+el.max - +el.min);
          assert(Math.abs(parseFloat(el.style.getPropertyValue('--range-fill')) - expected) < 0.01,
            'Segmented track fill is stale: ' + id);
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

    var W = 640, H = 800;
    R.Camera.configure(W, H, 15, 0.02 + 0.55 * Math.pow(1 - 0.72, 2.5));
    R.Ripples.clear();
    R.Droplets.clear();
    var params = Object.assign({}, R.Controls.state, { grain: 0, interference: 1 });
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
    output.textContent = results.map(function (r) {
      return (r.passed ? 'PASS ' : 'FAIL ') + r.name + (r.error ? ': ' + r.error : '');
    }).join('\n');
    document.title = results.filter(function (r) { return r.passed; }).length + '/' + results.length + ' rendering checks passed';
  }

  run().catch(function (error) {
    results.push({ name: 'Rendering checks', passed: false, error: error.message });
    window.renderingResults.done = true;
    output.textContent = 'FAIL: ' + error.message;
  });
})();
