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
    font: 'inter',
    glow: 0.45,
    soften: 0.12,
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
  var lyricStatus, btnPlay, ytHost;
  var captionSource = '';
  var lastShownSecond = -1;

  function formatClock(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var s = Math.floor(sec);
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  function setStatus(msg, bad) {
    lyricStatus.textContent = msg;
    lyricStatus.classList.toggle('bad', !!bad);
    lastShownSecond = -1;
  }

  function describeLyrics() {
    var bits = [];

    if (RTG.Lyrics.hasWords()) {
      bits.push(RTG.Lyrics.count() + (RTG.Lyrics.isTimed()
        ? ' timed words'
        : ' words, untimed \u2014 spread across the track'));
    }
    if (RTG.Player.isReady()) {
      bits.push(RTG.Player.mode() === 'yt' ? 'YouTube ready' : 'audio ready');
    }

    if (!bits.length) return 'Drop a caption or audio file anywhere on the page.';
    if (RTG.Lyrics.hasWords() && RTG.Player.isReady()) return bits.join(' \u00b7 ') + '. Press Play.';
    return bits.join(' \u00b7 ') + '.';
  }

  function readCaptions(file) {
    var reader = new FileReader();

    reader.onload = function () {
      captionSource = String(reader.result);
      var res = RTG.Lyrics.load(captionSource, $('lyricGrain').value);
      if (!res.ok) {
        captionSource = '';
        setStatus(res.error, true);
        return;
      }
      RTG.Lyrics.rewind();
      setStatus(describeLyrics());
    };

    reader.onerror = function () { setStatus('Could not read that file.', true); };
    reader.readAsText(file);
  }

  function isAudio(file) {
    return /^audio\//.test(file.type) || /\.(mp3|m4a|wav|ogg|oga|flac|aac|opus)$/i.test(file.name);
  }

  function acceptFile(file) {
    if (!file) return;

    if (isAudio(file)) {
      setStatus('Loading audio\u2026');
      RTG.Player.loadAudio(file, function (err) {
        if (err) { setStatus(err.message, true); return; }
        ytHost.classList.remove('on');
        setStatus(describeLyrics());
      });
      return;
    }
    readCaptions(file);
  }

  function initLyrics() {
    lyricStatus = $('lyricStatus');
    btnPlay = $('btnPlay');
    ytHost = $('ytHost');

    $('btnLoadYt').addEventListener('click', function () {
      setStatus('Loading player\u2026');
      RTG.Player.loadYouTube($('ytUrl').value, ytHost, function (err) {
        if (err) { ytHost.classList.remove('on'); setStatus(err.message, true); return; }
        ytHost.classList.add('on');
        setStatus(describeLyrics());
      });
    });

    $('capFile').addEventListener('change', function (e) {
      acceptFile(e.target.files && e.target.files[0]);
    });

    // Re-parsing from the original text is what lets granularity change after loading.
    $('lyricGrain').addEventListener('change', function (e) {
      RTG.Lyrics.grain = e.target.value;
      if (!captionSource) return;
      RTG.Lyrics.load(captionSource, e.target.value);
      RTG.Lyrics.rewind();
      setStatus(describeLyrics());
    });

    btnPlay.addEventListener('click', function () {
      if (!RTG.Player.isReady()) {
        setStatus('Load a YouTube link, or drop an audio file, first.', true);
        return;
      }
      RTG.Player.toggle();
    });

    $('btnLyricsClear').addEventListener('click', function () {
      RTG.Lyrics.clear();
      RTG.Player.unload();
      captionSource = '';
      ytHost.classList.remove('on');
      ytHost.innerHTML = '';
      $('capFile').value = '';
      setStatus('Unloaded. Back to the word list.');
    });

    RTG.Player.onChange(function () {
      var playing = RTG.Player.playing();
      btnPlay.textContent = playing ? 'Pause' : 'Play';
      btnPlay.classList.toggle('active', playing);

      // Starting the track while the canvas is frozen would silently drop nothing.
      if (playing && state.paused) $('btnPause').click();
    });

    ['dragenter', 'dragover'].forEach(function (type) {
      window.addEventListener(type, function (e) {
        e.preventDefault();
        document.body.classList.add('dragging');
      });
    });

    window.addEventListener('dragleave', function (e) {
      if (!e.relatedTarget) document.body.classList.remove('dragging');
    });

    window.addEventListener('drop', function (e) {
      e.preventDefault();
      document.body.classList.remove('dragging');
      acceptFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });
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
      bindRange('glow', 'glow');
      bindRange('soften', 'soften');
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
      initLyrics();
    },

    setRecording: function (on) {
      btnRec.textContent = on ? 'Stop' : 'Record';
      btnRec.classList.toggle('active', on);
      recDot.hidden = !on;
    },

    /** Refreshes the recording read-out and the playback clock once per frame. */
    tick: function () {
      if (RTG.Exporter.isRecording()) {
        var e = Math.floor(RTG.Exporter.elapsed());
        recTime.textContent = formatClock(e);
      }

      if (RTG.Player.isReady() && RTG.Player.playing()) {
        var sec = Math.floor(RTG.Player.time());
        if (sec !== lastShownSecond) {
          lastShownSecond = sec;
          lyricStatus.classList.remove('bad');
          lyricStatus.textContent = formatClock(sec) + ' / ' + formatClock(RTG.Player.duration());
        }
      }
    }
  };

  RTG.Controls = Controls;
})(window.RTG = window.RTG || {});
