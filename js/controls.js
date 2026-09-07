/**
 * Parameter state and panel wiring.
 */
(function (RTG) {
  'use strict';

  var DEFAULT_ARTWORK = {
    words: ['Anchored', 'Arduos', 'Ageless', 'Abiding'],
    dropRate: 1.5,
    fallSpeed: 2.05,
    rippleSpeed: 1.16,
    rippleSpread: 1,
    ringCount: 4,
    lineWeight: 2,
    breaks: 0.25,
    interference: 1,
    tilt: 11.5,
    bow: 0.72,
    typeSize: 1.32,
    typeTilt: 0.19,
    font: 'win98',
    finish: 'glow',
    inkBlur: 0.2,
    inkSpread: 0.04,
    sharpType: true,
    textBlur: 0.15,
    textGlow: 0.25,
    kerning: -0.07,
    glow: 0.08,
    soften: 0.21,
    grain: 0.085,
    bg: '#c5dc4d',
    ink: '#00a943'
  };

  var state = Object.assign({}, DEFAULT_ARTWORK, {
    words: DEFAULT_ARTWORK.words.slice(),
    pageMode: 'fit',
    pageWidth: 1920,
    pageHeight: 1080,
    paused: false
  });

  var PRESETS = {
    default: { bg: DEFAULT_ARTWORK.bg, ink: DEFAULT_ARTWORK.ink, finish: DEFAULT_ARTWORK.finish, settings: DEFAULT_ARTWORK },
    reference: { bg: '#5e9de0', ink: '#f0f5fd' },
    cobalt: { bg: '#f4f5f2', ink: '#2454f5', finish: 'diffuse', inkBlur: 0.4, inkSpread: 0.3, grain: 0.16 },
    midnight: { bg: '#0e1930', ink: '#7fa9f0' },
    ink: { bg: '#efe7d8', ink: '#1d1c1a' },
    acid: { bg: '#c9f24a', ink: '#152210' },
    rust: { bg: '#bf4f2b', ink: '#ffe7d4' }
  };

  var UI_COLORS = {
    uiFace: { value: '#ffccf1', css: '--ui-face' },
    uiTitle: { value: '#800064', css: '--ui-title' },
    uiTitleEnd: { value: '#ffc7f0', css: '--ui-title-end' },
    uiTitleText: { value: '#ffffff', css: '--ui-title-text' },
    uiText: { value: '#35112d', css: '--ui-text' },
    uiHighlight: { value: '#ffffff', css: '--ui-highlight' },
    uiEdgeLight: { value: '#fff0fa', css: '--ui-edge-light' },
    uiShadow: { value: '#d69abc', css: '--ui-shadow' },
    uiEdgeDark: { value: '#800064', css: '--ui-edge-dark' },
    uiDesktop: { value: '#edddea', css: '--ui-desktop' }
  };

  var FORMAT = {
    dropRate: function (v) { return v.toFixed(2) + 's'; },
    ringCount: function (v) { return v.toFixed(0); },
    lineWeight: function (v) { return v.toFixed(2) + 'x'; },
    tilt: function (v) { return v.toFixed(0) + '\u00B0'; },
    grain: function (v) { return (v * 100).toFixed(1); },
    breaks: function (v) { return (v * 100).toFixed(0) + '%'; },
    typeTilt: function (v) { return (v * 100).toFixed(0) + '%'; }
  };
  FORMAT.inkBlur = FORMAT.breaks;
  FORMAT.inkSpread = FORMAT.breaks;
  FORMAT.textBlur = FORMAT.breaks;
  FORMAT.textGlow = FORMAT.breaks;
  FORMAT.kerning = function (v) { return (v > 0 ? '+' : '') + v.toFixed(2) + 'em'; };

  function $(id) { return document.getElementById(id); }

  function parseWords(raw) {
    var parts = raw.split(/[\n,]+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var w = parts[i].trim();
      if (w) out.push(w);
    }
    return out;
  }

  var rail, panel, toggle, recDot, recTime, btnRec, btnPause;
  var layoutChange;
  var renderChange;
  var pageDirty = false;

  var PAGE_PRESETS = {
    '16:9': [1920, 1080],
    '9:16': [1080, 1920],
    '4:4': [1080, 1080],
    '18:9': [2160, 1080]
  };

  function formatClock(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var s = Math.floor(sec);
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  function changed() {
    if (renderChange) renderChange();
  }

  function bindRange(id, key, onChange) {
    var el = $(id);
    var out = el.parentNode.querySelector('output');
    var fmt = FORMAT[id] || function (v) { return v.toFixed(2); };
    el.defaultValue = state[key];
    el.value = state[key];

    function sync() {
      var v = parseFloat(el.value);
      state[key] = v;
      if (out) out.textContent = fmt(v);
      el.setAttribute('aria-valuetext', fmt(v));
      if (onChange) onChange();
      changed();
    }

    el.addEventListener('input', sync);
    sync();
  }

  function applyColours() {
    $('stage').style.background = state.bg;
  }

  function syncUiColor(id) {
    state[id] = $(id).value;
    document.documentElement.style.setProperty(UI_COLORS[id].css, state[id]);
  }

  function applyPageSize() {
    if (RTG.Exporter.isRecording()) {
      $('captureStatus').textContent = 'Stop recording to resize';
      return;
    }
    if (!$('pageSizeForm').reportValidity()) return;
    state.pageMode = 'fixed';
    state.pageWidth = Number($('pageWidth').value);
    state.pageHeight = Number($('pageHeight').value);
    pageDirty = false;
    if (layoutChange) layoutChange();
  }

  function initPageSize() {
    $('pageSizeForm').addEventListener('submit', function (e) {
      e.preventDefault();
      applyPageSize();
    });
    ['pageWidth', 'pageHeight'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        pageDirty = true;
        $('pageRatio').value = 'custom';
      });
    });
    $('pageRatio').addEventListener('change', function (e) {
      if (RTG.Exporter.isRecording()) {
        $('captureStatus').textContent = 'Stop recording to resize';
        return;
      }
      var preset = e.target.value;
      if (preset === 'fit') {
        state.pageMode = 'fit';
        pageDirty = false;
        if (layoutChange) layoutChange();
      } else if (PAGE_PRESETS[preset]) {
        $('pageWidth').value = PAGE_PRESETS[preset][0];
        $('pageHeight').value = PAGE_PRESETS[preset][1];
        applyPageSize();
      } else {
        pageDirty = true;
        $('pageWidth').focus();
      }
    });
  }

  function syncFinish() {
    state.finish = $('finish').value;
    var diffuse = state.finish === 'diffuse';
    $('glowControls').hidden = diffuse;
    $('inkControls').hidden = !diffuse;
    changed();
  }

  function syncTextBlur() {
    state.sharpType = $('sharpType').checked;
    $('textBlur').disabled = state.sharpType;
    $('textBlur').closest('.slider').classList.toggle('is-disabled', state.sharpType);
    changed();
  }

  function setRange(id, value) {
    var input = $(id);
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function applyFace(key) {
    RTG.Type.setFace(key);
    state.font = key;
    changed();
    $('fontStatus').textContent = 'Loading typeface...';
    RTG.Type.loadFace(key).then(function () {
      if (state.font === key) $('fontStatus').textContent = '';
      changed();
    }, function (error) {
      if (state.font === key) $('fontStatus').textContent = 'Web font unavailable. Using the fallback typeface.';
      console.warn('The selected web font could not load.', error);
      changed();
    });
  }

  function setPanel(open) {
    var moveFocus = !open && panel.contains(document.activeElement);
    rail.classList.toggle('collapsed', !open);
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Collapse controls' : 'Expand controls');
    toggle.title = (open ? 'Collapse' : 'Expand') + ' controls (H)';
    if (moveFocus) toggle.focus({ preventScroll: true });
    if (layoutChange) layoutChange();
  }

  function initWelcome() {
    var dialog = $('welcomeDialog');
    $('btnWelcome').addEventListener('click', function () {
      if (!dialog.open) dialog.showModal();
    });
    $('welcomeClose').addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('cancel', function (e) {
      e.preventDefault();
      dialog.close();
    });
    dialog.showModal();
  }

  var Controls = {
    state: state,

    init: function (hooks) {
      rail = $('controlRail');
      panel = $('panel');
      toggle = $('panelToggle');
      recDot = $('recDot');
      recTime = $('recTime');
      btnRec = $('btnRec');
      btnPause = $('btnPause');
      layoutChange = hooks.onLayoutChange;
      renderChange = hooks.onChange;
      initPageSize();

      var camChange = hooks.onCameraChange;

      bindRange('dropRate', 'dropRate');
      bindRange('fallSpeed', 'fallSpeed');
      bindRange('rippleSpeed', 'rippleSpeed');
      bindRange('rippleSpread', 'rippleSpread');
      bindRange('ringCount', 'ringCount');
      bindRange('lineWeight', 'lineWeight');
      bindRange('breaks', 'breaks');
      bindRange('interference', 'interference');
      bindRange('tilt', 'tilt', camChange);
      bindRange('bow', 'bow', camChange);
      bindRange('typeSize', 'typeSize');
      bindRange('typeTilt', 'typeTilt');
      bindRange('glow', 'glow');
      bindRange('soften', 'soften');
      bindRange('inkBlur', 'inkBlur');
      bindRange('inkSpread', 'inkSpread');
      bindRange('textBlur', 'textBlur');
      bindRange('textGlow', 'textGlow');
      bindRange('kerning', 'kerning');
      bindRange('grain', 'grain');

      Object.keys(UI_COLORS).forEach(function (id) {
        $(id).defaultValue = UI_COLORS[id].value;
        $(id).value = UI_COLORS[id].value;
        $(id).addEventListener('input', function () { syncUiColor(id); });
        syncUiColor(id);
      });
      $('btnUiReset').addEventListener('click', function () {
        Object.keys(UI_COLORS).forEach(function (id) {
          $(id).value = UI_COLORS[id].value;
          syncUiColor(id);
        });
      });
      document.querySelectorAll('[data-command]').forEach(function (button) {
        button.addEventListener('click', function () { $(button.dataset.command).click(); });
      });

      $('finish').addEventListener('change', syncFinish);
      $('finish').value = state.finish;
      syncFinish();
      $('sharpType').addEventListener('change', syncTextBlur);
      $('sharpType').checked = state.sharpType;
      syncTextBlur();

      var fontSel = $('fontFace');
      fontSel.addEventListener('change', function () { applyFace(fontSel.value); });
      fontSel.value = state.font;
      applyFace(fontSel.value);

      var words = $('words');
      words.defaultValue = state.words.join('\n');
      words.value = words.defaultValue;
      function syncWords() {
        state.words = parseWords(words.value);
        changed();
      }
      words.addEventListener('input', syncWords);
      syncWords();

      var bg = $('bgColor');
      var ink = $('inkColor');
      bg.defaultValue = bg.value = state.bg;
      ink.defaultValue = ink.value = state.ink;
      bg.addEventListener('input', function () { state.bg = bg.value; applyColours(); changed(); });
      ink.addEventListener('input', function () { state.ink = ink.value; changed(); });

      $('preset').addEventListener('change', function (e) {
        var p = PRESETS[e.target.value];
        if (!p) return;
        state.bg = p.bg;
        state.ink = p.ink;
        bg.value = p.bg;
        ink.value = p.ink;
        $('finish').value = p.finish || 'glow';
        syncFinish();
        if (p.settings) {
          Object.keys(p.settings).forEach(function (key) {
            var input = $(key);
            if (input && input.type === 'range') setRange(key, p.settings[key]);
          });
          words.value = p.settings.words.join('\n');
          syncWords();
          fontSel.value = p.settings.font;
          applyFace(fontSel.value);
          $('sharpType').checked = p.settings.sharpType;
          syncTextBlur();
        } else if (p.finish === 'diffuse') {
          setRange('inkBlur', p.inkBlur);
          setRange('inkSpread', p.inkSpread);
          setRange('grain', p.grain);
        }
        applyColours();
        changed();
      });

      $('btnDrop').addEventListener('click', hooks.onDrop);
      $('btnClear').addEventListener('click', hooks.onClear);
      $('btnPng').addEventListener('click', hooks.onPng);
      $('btnRec').addEventListener('click', hooks.onRecord);

      btnPause.addEventListener('click', function () {
        state.paused = !state.paused;
        btnPause.textContent = state.paused ? 'Play' : 'Pause';
        btnPause.classList.toggle('active', state.paused);
        btnPause.setAttribute('aria-pressed', String(state.paused));
        changed();
      });

      toggle.addEventListener('click', function () { setPanel(panel.hidden); });
      setPanel(!window.matchMedia('(max-width: 600px)').matches);

      document.addEventListener('keydown', function (e) {
        if ($('welcomeDialog').open) return;
        if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === 'Escape') {
          if (!panel.hidden) { e.preventDefault(); setPanel(false); }
          return;
        }
        if (e.target instanceof Element && e.target.closest('input, textarea, select, button, summary, [contenteditable="true"]')) return;
        var k = e.key.toLowerCase();
        if (k === 'h') { e.preventDefault(); setPanel(panel.hidden); }
        else if (k === 'd') { e.preventDefault(); hooks.onDrop(); }
        else if (k === 'c') { e.preventDefault(); hooks.onClear(); }
        else if (e.code === 'Space') { e.preventDefault(); btnPause.click(); }
      });

      applyColours();
      initWelcome();
    },

    setCanvasSize: function (width, height) {
      $('canvasDimensions').textContent = width + ' x ' + height + ' px';
      if (!pageDirty) {
        $('pageWidth').value = width;
        $('pageHeight').value = height;
      }
    },

    setRecording: function (on) {
      btnRec.textContent = on ? 'Stop recording' : 'Record video';
      btnRec.classList.toggle('active', on);
      btnRec.setAttribute('aria-pressed', String(on));
      recDot.hidden = !on;
      $('appWindow').classList.toggle('is-recording', on);
      $('recordingStatus').textContent = on ? 'Recording this canvas' : 'Recording area';
      $('captureStatus').textContent = on ? 'Recording' : 'Ready';
      $('pageSizeControls').disabled = on;
      $('btnWelcome').disabled = on;
    },

    /** Refreshes the recording read-out once per frame. */
    tick: function () {
      if (RTG.Exporter.isRecording()) {
        var e = Math.floor(RTG.Exporter.elapsed());
        var time = formatClock(e);
        if (recTime.textContent !== time) recTime.textContent = time;
      }
    }
  };

  RTG.Controls = Controls;
})(window.RTG = window.RTG || {});
