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
    breaks: 0.25,
    interference: 1,
    tilt: 15,
    bow: 0.72,
    typeSize: 1,
    typeTilt: 0,
    font: 'poppins',
    grain: 0.055,
    bg: '#5e9de0',
    ink: '#f0f5fd',
    paused: false
  };

  var PRESETS = {
    reference: { bg: '#5e9de0', ink: '#f0f5fd' },
    midnight: { bg: '#0e1930', ink: '#7fa9f0' },
    ink: { bg: '#efe7d8', ink: '#1d1c1a' },
    acid: { bg: '#c9f24a', ink: '#152210' },
    rust: { bg: '#bf4f2b', ink: '#ffe7d4' }
  };

  var FORMAT = {
    dropRate: function (v) { return v.toFixed(2) + 's'; },
    ringCount: function (v) { return v.toFixed(0); },
    tilt: function (v) { return v.toFixed(0) + '\u00B0'; },
    grain: function (v) { return (v * 100).toFixed(1); },
    breaks: function (v) { return (v * 100).toFixed(0) + '%'; },
    typeTilt: function (v) { return (v * 100).toFixed(0) + '%'; }
  };

  function $(id) { return document.getElementById(id); }

  function parseWords(raw) {
    var parts = raw.split(/[\n,]+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var w = parts[i].trim().toUpperCase();
      if (w) out.push(w);
    }
    return out;
  }

  var panel, toggle, recDot, recTime, btnRec, btnPause, stage;

  function bindRange(id, key, onChange) {
    var el = $(id);
    if (!el) return;
    var out = el.parentNode.querySelector('output');
    var fmt = FORMAT[id] || function (v) { return v.toFixed(2); };

    function sync() {
      var v = parseFloat(el.value);
      state[key] = v;
      if (out) out.textContent = fmt(v);
      if (onChange) onChange();
    }

    el.addEventListener('input', sync);
    sync();
  }

  function applyColours() {
    document.body.style.background = state.bg;
    document.documentElement.style.background = state.bg;
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
    panel.classList.toggle('collapsed', !open);
  }

  var Controls = {
    state: state,

    init: function (hooks) {
      panel = $('panel');
      toggle = $('panelToggle');
      recDot = $('recDot');
      recTime = $('recTime');
      btnRec = $('btnRec');
      btnPause = $('btnPause');
      stage = $('stage');

      var camChange = hooks.onCameraChange;

      bindRange('dropRate', 'dropRate');
      bindRange('fallSpeed', 'fallSpeed');
      bindRange('rippleSpeed', 'rippleSpeed');
      bindRange('rippleSpread', 'rippleSpread');
      bindRange('ringCount', 'ringCount');
      bindRange('breaks', 'breaks');
      bindRange('interference', 'interference');
      bindRange('tilt', 'tilt', camChange);
      bindRange('bow', 'bow', camChange);
      bindRange('typeSize', 'typeSize');
      bindRange('typeTilt', 'typeTilt');
      bindRange('grain', 'grain');

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
      });

      toggle.addEventListener('click', function () { setPanel(true); });
      $('panelClose').addEventListener('click', function () { setPanel(false); });

      document.addEventListener('keydown', function (e) {
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        var k = e.key.toLowerCase();
        if (k === 'h') { setPanel(panel.classList.contains('collapsed')); }
        else if (k === 'd') { hooks.onDrop(); }
        else if (k === 'c') { hooks.onClear(); }
        else if (e.code === 'Space') { e.preventDefault(); btnPause.click(); }
      });

      applyColours();
    },

    setRecording: function (on) {
      btnRec.textContent = on ? 'Stop' : 'Record';
      btnRec.classList.toggle('active', on);
      recDot.hidden = !on;
    },

    /** Refreshes the recording read-out once per frame. */
    tick: function () {
      if (!RTG.Exporter.isRecording()) return;
      var s = Math.floor(RTG.Exporter.elapsed());
      recTime.textContent = Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
    }
  };

  RTG.Controls = Controls;
})(window.RTG = window.RTG || {});
