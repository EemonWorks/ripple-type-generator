/**
 * Parameter state and panel wiring.
 */
(function (RTG) {
  'use strict';

  var state = {
    words: ['ERASE', 'EXPAND', 'ERUPT'],
    dropRate: 1.5,
    fallSpeed: 1,
    rippleSpeed: 1,
    rippleSpread: 1,
    ringCount: 4,
    lineWeight: 1,
    breaks: 0.25,
    interference: 1,
    tilt: 15,
    bow: 0.72,
    typeSize: 1,
    typeTilt: 0,
    font: 'inter',
    finish: 'glow',
    inkBlur: 0.4,
    inkSpread: 0.3,
    sharpType: true,
    textBlur: 0.15,
    glow: 0.45,
    soften: 0.12,
    grain: 0.055,
    bg: '#5e9de0',
    ink: '#f0f5fd',
    paused: false
  };

  var PRESETS = {
    reference: { bg: '#5e9de0', ink: '#f0f5fd' },
    cobalt: { bg: '#f4f5f2', ink: '#2454f5', finish: 'diffuse', inkBlur: 0.4, inkSpread: 0.3, grain: 0.16 },
    midnight: { bg: '#0e1930', ink: '#7fa9f0' },
    ink: { bg: '#efe7d8', ink: '#1d1c1a' },
    acid: { bg: '#c9f24a', ink: '#152210' },
    rust: { bg: '#bf4f2b', ink: '#ffe7d4' }
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

  function formatClock(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var s = Math.floor(sec);
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  function bindRange(id, key, onChange) {
    var el = $(id);
    if (!el) return;
    var out = el.parentNode.querySelector('output');
    var fmt = FORMAT[id] || function (v) { return v.toFixed(2); };

    function sync() {
      var v = parseFloat(el.value);
      state[key] = v;
      if (out) out.textContent = fmt(v);
      el.style.setProperty('--range-fill', (100 * (v - +el.min) / (+el.max - +el.min)) + '%');
      el.setAttribute('aria-valuetext', fmt(v));
      if (onChange) onChange();
    }

    el.addEventListener('input', sync);
    sync();
  }

  function applyColours() {
    document.body.style.background = state.bg;
    document.documentElement.style.background = state.bg;
  }

  function syncFinish() {
    state.finish = $('finish').value;
    var diffuse = state.finish === 'diffuse';
    $('glowControls').hidden = diffuse;
    $('inkControls').hidden = !diffuse;
  }

  function syncTextBlur() {
    state.sharpType = $('sharpType').checked;
    $('textBlur').disabled = state.sharpType;
    $('textBlur').closest('.slider').classList.toggle('is-disabled', state.sharpType);
  }

  function setRange(id, value) {
    var input = $(id);
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  /**
   * Switches the typeface. The font is requested explicitly because capsule sizes are
   * measured at spawn time -- if the face were still loading, every ripple created in
   * the meantime would be sized against the fallback and stay wrong for its whole life.
   */
  function applyFace(key) {
    var face = RTG.Type.setFace(key);
    state.font = key;

    if (document.fonts && document.fonts.load) {
      try { document.fonts.load(face.weight + ' 48px ' + face.family.split(',')[0]); }
      catch (e) { /* non-fatal: falls back to the stack in face.family */ }
    }
  }

  function setPanel(open) {
    var moveFocus = !open && panel.contains(document.activeElement);
    rail.classList.toggle('collapsed', !open);
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Collapse controls' : 'Expand controls');
    toggle.title = (open ? 'Collapse' : 'Expand') + ' controls (H)';
    if (moveFocus) toggle.focus({ preventScroll: true });
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
      bindRange('grain', 'grain');

      $('finish').addEventListener('change', syncFinish);
      syncFinish();
      $('sharpType').addEventListener('change', syncTextBlur);
      syncTextBlur();

      var fontSel = $('fontFace');
      fontSel.addEventListener('change', function () { applyFace(fontSel.value); });
      applyFace(fontSel.value);

      var words = $('words');
      function syncWords() { state.words = parseWords(words.value); }
      words.addEventListener('input', syncWords);
      syncWords();

      var bg = $('bgColor');
      var ink = $('inkColor');
      bg.addEventListener('input', function () { state.bg = bg.value; applyColours(); });
      ink.addEventListener('input', function () { state.ink = ink.value; });

      $('preset').addEventListener('change', function (e) {
        var p = PRESETS[e.target.value];
        if (!p) return;
        state.bg = p.bg;
        state.ink = p.ink;
        bg.value = p.bg;
        ink.value = p.ink;
        $('finish').value = p.finish || 'glow';
        syncFinish();
        if (p.finish === 'diffuse') {
          setRange('inkBlur', p.inkBlur);
          setRange('inkSpread', p.inkSpread);
          setRange('grain', p.grain);
        }
        applyColours();
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
      });

      toggle.addEventListener('click', function () { setPanel(panel.hidden); });
      setPanel(!window.matchMedia('(max-width: 600px)').matches);

      document.addEventListener('keydown', function (e) {
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
    },

    setRecording: function (on) {
      btnRec.textContent = on ? 'Stop recording' : 'Record video';
      btnRec.classList.toggle('active', on);
      btnRec.setAttribute('aria-pressed', String(on));
      recDot.hidden = !on;
    },

    /** Refreshes the recording read-out once per frame. */
    tick: function () {
      if (RTG.Exporter.isRecording()) {
        var e = Math.floor(RTG.Exporter.elapsed());
        recTime.textContent = formatClock(e);
      }
    }
  };

  RTG.Controls = Controls;
})(window.RTG = window.RTG || {});
