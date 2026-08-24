/**
 * Caption parsing and drop scheduling.
 *
 * Accepts SubRip (.srt), WebVTT (.vtt) and LRC, auto-detected. Whatever the format, the
 * result is a flat, time-sorted list of {t, word} events.
 *
 * Sync detail worth knowing: a droplet takes time to fall, so an event is released
 * early by exactly the fall duration, and back-dated by however late this frame is.
 * The word therefore *lands* on its timestamp rather than starting to fall on it.
 */
(function (RTG) {
  'use strict';

  var events = [];
  var untimed = [];
  var cursor = 0;
  var lastTime = -1;
  var lastSpawn = -1e9;
  var timed = false;
  var built = false;

  var MIN_GAP = 0.16;      // seconds between drops, so dense lyrics cannot flood
  var MAX_LIVE = 9;        // concurrent ripples before words are skipped
  var BEHIND = 0.7;        // discard events we are more than this far late on

  /* ---------------- parsing ---------------- */

  /** hh:mm:ss,mmm | hh:mm:ss.mmm | mm:ss.xx */
  function parseTime(str) {
    var m = String(str).trim().match(/^(?:(\d+):)?(\d+):(\d+)(?:[.,](\d{1,3}))?$/);
    if (!m) return null;
    var frac = m[4] ? parseInt((m[4] + '00').slice(0, 3), 10) / 1000 : 0;
    return (m[1] ? +m[1] * 3600 : 0) + (+m[2]) * 60 + (+m[3]) + frac;
  }

  function words(str) {
    return String(str)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&#39;|&apos;/gi, "'")
      .split(/\s+/)
      .map(function (w) { return w.replace(/^[^\w'\u2019-]+|[^\w'\u2019-]+$/g, '').toUpperCase(); })
      .filter(function (w) { return w.length > 0 && w !== '-'; });
  }

  /** SRT and VTT share the `start --> end` cue shape. */
  function parseCues(text) {
    var cues = [];
    var blocks = text.split(/\n{2,}/);

    for (var b = 0; b < blocks.length; b++) {
      var lines = blocks[b].split('\n');
      var ti = -1;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('-->') >= 0) { ti = i; break; }
      }
      if (ti < 0) continue;

      var parts = lines[ti].split('-->');
      var start = parseTime(parts[0]);
      if (start === null) continue;
      var end = parseTime(String(parts[1] || '').trim().split(/\s+/)[0]);

      var body = lines.slice(ti + 1).join(' ').trim();
      if (!body) continue;

      cues.push({ start: start, end: end === null ? start + 2.5 : end, text: body });
    }
    return cues;
  }

  function parseLrc(text) {
    var lines = text.split('\n');
    var cues = [];

    for (var i = 0; i < lines.length; i++) {
      var tags = lines[i].match(/\[\d+:\d+(?:[.:]\d+)?\]/g);
      if (!tags) continue;
      var body = lines[i].replace(/\[[^\]]*\]/g, '').trim();
      if (!body) continue;

      for (var j = 0; j < tags.length; j++) {
        var t = parseTime(tags[j].slice(1, -1));
        if (t !== null) cues.push({ start: t, end: t + 3, text: body });
      }
    }

    cues.sort(function (a, b) { return a.start - b.start; });
    for (var k = 0; k < cues.length; k++) {
      var next = k + 1 < cues.length ? cues[k + 1].start : cues[k].start + 3;
      cues[k].end = Math.min(cues[k].start + 6, Math.max(cues[k].start + 0.5, next));
    }
    return cues;
  }

  /**
   * Expands a cue into word events. WebVTT karaoke cues carry inline `<00:00:12.500>`
   * marks, which give real per-word timing; without them the words are spread evenly
   * across the cue.
   */
  function expand(cue, grain, out) {
    var stamp = /<(\d+:\d+:\d+(?:[.,]\d{1,3})?)>/g;

    if (stamp.test(cue.text)) {
      stamp.lastIndex = 0;
      var pieces = cue.text.split(/<\d+:\d+:\d+(?:[.,]\d{1,3})?>/);
      var times = [];
      var m;
      while ((m = stamp.exec(cue.text)) !== null) times.push(parseTime(m[1]));

      emit(words(pieces[0]), cue.start, cue.start + 0.4, grain, out);
      for (var i = 0; i < times.length; i++) {
        emit(words(pieces[i + 1] || ''), times[i], times[i] + 0.4, grain, out);
      }
      return;
    }

    emit(words(cue.text), cue.start, cue.end, grain, out);
  }

  function emit(list, start, end, grain, out) {
    if (!list.length) return;

    // "phrase" keeps up to three words together, which stays readable when a song runs
    // faster than one ripple can bloom.
    var groups = [];
    if (grain === 'phrase') {
      for (var g = 0; g < list.length; g += 3) groups.push(list.slice(g, g + 3).join(' '));
    } else {
      groups = list;
    }

    var span = Math.max(0.2, end - start);
    var step = span / groups.length;
    for (var i = 0; i < groups.length; i++) out.push({ t: start + i * step, word: groups[i] });
  }

  /* ---------------- module ---------------- */

  function build(cues, grain) {
    var out = [];
    for (var i = 0; i < cues.length; i++) expand(cues[i], grain, out);
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  var Lyrics = {
    grain: 'word',

    /** @returns {{ok:boolean, timed:boolean, count:number, error:string}} */
    load: function (text, grain) {
      this.clear();
      this.grain = grain || this.grain;

      var body = String(text || '').replace(/\r/g, '').trim();
      if (!body) return { ok: false, error: 'That file was empty.' };

      var cues;
      if (body.indexOf('-->') >= 0) cues = parseCues(body);
      else if (/\[\d+:\d+/.test(body)) cues = parseLrc(body);
      else cues = null;

      if (cues) {
        if (!cues.length) return { ok: false, error: 'No cues found in that file.' };
        events = build(cues, this.grain);
        timed = true;
        built = true;
        return { ok: true, timed: true, count: events.length };
      }

      // Plain text: no timings, so hold the words until a duration is known and then
      // spread them across the track.
      untimed = words(body);
      if (!untimed.length) return { ok: false, error: 'No words found in that file.' };
      timed = false;
      built = false;
      return { ok: true, timed: false, count: untimed.length };
    },

    /** Spreads untimed words across the media duration, once the player reports one. */
    ensureBuilt: function () {
      if (built || timed || !untimed.length) return built;

      var dur = RTG.Player.duration();
      if (!dur || dur < 1) return false;

      var lead = 1.5;
      var span = Math.max(1, dur - lead * 2);
      var step = span / untimed.length;

      events = [];
      for (var i = 0; i < untimed.length; i++) {
        events.push({ t: lead + i * step, word: untimed[i] });
      }
      built = true;
      return true;
    },

    /** Rebuilds from the same source when word/phrase granularity changes. */
    hasWords: function () { return events.length > 0 || untimed.length > 0; },
    isTimed: function () { return timed; },
    count: function () { return events.length || untimed.length; },

    clear: function () {
      events = [];
      untimed = [];
      cursor = 0;
      lastTime = -1;
      lastSpawn = -1e9;
      timed = false;
      built = false;
    },

    rewind: function () { cursor = 0; lastSpawn = -1e9; },

    indexAt: function (t) {
      var i = 0;
      while (i < events.length && events[i].t < t) i++;
      return i;
    },

    /**
     * Releases any words that are due. `spawn(word, t0)` receives a back-dated spawn
     * time so the droplet lands exactly on the lyric's timestamp.
     */
    pump: function (clock, fall, spawn) {
      if (!RTG.Player.isReady()) return;
      if (!this.ensureBuilt()) return;
      if (!events.length) return;

      var now = RTG.Player.time();

      // A jump means the user scrubbed: resync instead of firing the whole backlog.
      if (lastTime >= 0 && Math.abs(now - lastTime) > 1) {
        cursor = this.indexAt(now);
        lastSpawn = -1e9;
      }
      lastTime = now;

      if (!RTG.Player.playing()) return;

      var horizon = now + fall;

      while (cursor < events.length && events[cursor].t <= horizon) {
        if (clock - lastSpawn < MIN_GAP) break;
        if (RTG.Ripples.list.length >= MAX_LIVE) break;

        var e = events[cursor++];
        var late = horizon - e.t;
        if (late > fall) late = fall * 0.95;

        spawn(e.word, clock - late);
        lastSpawn = clock;
      }

      // Anything we are hopelessly late on is dropped rather than dumped on screen.
      while (cursor < events.length && events[cursor].t < now - BEHIND) cursor++;
    }
  };

  RTG.Lyrics = Lyrics;
})(window.RTG = window.RTG || {});
