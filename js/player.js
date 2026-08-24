/**
 * Media playback: a YouTube embed, or a local audio file.
 *
 * Only playback lives here. Caption text cannot come from YouTube: the IFrame Player
 * API exposes no caption methods, the undocumented /api/timedtext endpoint sends no
 * CORS headers so the browser blocks it, and the official Captions API only covers
 * videos you own. Fetching lyrics automatically would need a server-side proxy, which
 * this project deliberately does not have -- so captions are supplied by the user and
 * parsed in lyrics.js.
 */
(function (RTG) {
  'use strict';

  var VIDEO_ID = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/|\/v\/)([\w-]{11})/;
  var FRAME_ID = 'rtg-yt-frame';

  var yt = null;
  var audio = null;
  var mode = 'none';
  var ready = false;

  var listeners = [];
  var apiPending = [];
  var apiLoading = false;

  function emit() {
    for (var i = 0; i < listeners.length; i++) listeners[i]();
  }

  function videoId(url) {
    var s = String(url || '').trim();
    if (!s) return '';
    if (/^[\w-]{11}$/.test(s)) return s;
    var m = s.match(VIDEO_ID);
    return m ? m[1] : '';
  }

  /** Loads the IFrame API once, queueing callers that arrive while it is in flight. */
  function loadApi(cb) {
    if (window.YT && window.YT.Player) { cb(null); return; }

    apiPending.push(cb);
    if (apiLoading) return;
    apiLoading = true;

    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === 'function') prev();
      var queue = apiPending;
      apiPending = [];
      for (var i = 0; i < queue.length; i++) queue[i](null);
    };

    var s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = function () {
      apiLoading = false;
      var queue = apiPending;
      apiPending = [];
      var err = new Error('Could not reach YouTube. Check your connection, and note that YouTube embeds do not work from a file:// page.');
      for (var i = 0; i < queue.length; i++) queue[i](err);
    };
    document.head.appendChild(s);
  }

  var Player = {
    onChange: function (fn) { listeners.push(fn); },
    mode: function () { return mode; },
    isReady: function () { return ready; },

    loadYouTube: function (url, host, done) {
      var id = videoId(url);
      if (!id) { done(new Error('That does not look like a YouTube link or video ID.')); return; }

      this.unload();

      loadApi(function (err) {
        if (err) { done(err); return; }

        host.innerHTML = '<div id="' + FRAME_ID + '"></div>';
        try {
          yt = new YT.Player(FRAME_ID, {
            videoId: id,
            width: '100%',
            height: '100%',
            playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
            events: {
              onReady: function () { mode = 'yt'; ready = true; emit(); done(null); },
              onStateChange: emit,
              onError: function (e) { done(new Error('YouTube would not play that video (code ' + e.data + ').')); }
            }
          });
        } catch (e) {
          done(e);
        }
      });
    },

    loadAudio: function (file, done) {
      this.unload();

      audio = new Audio();
      audio.src = URL.createObjectURL(file);
      audio.addEventListener('play', emit);
      audio.addEventListener('pause', emit);
      audio.addEventListener('ended', emit);
      audio.addEventListener('loadedmetadata', function () {
        mode = 'audio';
        ready = true;
        emit();
        done(null);
      });
      audio.addEventListener('error', function () {
        done(new Error('Could not decode that audio file.'));
      });
      audio.load();
    },

    unload: function () {
      if (yt) {
        try { yt.destroy(); } catch (e) { /* already gone */ }
        yt = null;
      }
      if (audio) {
        try { audio.pause(); URL.revokeObjectURL(audio.src); } catch (e) { /* already gone */ }
        audio = null;
      }
      mode = 'none';
      ready = false;
      emit();
    },

    time: function () {
      if (mode === 'yt' && yt && yt.getCurrentTime) return yt.getCurrentTime() || 0;
      if (mode === 'audio' && audio) return audio.currentTime || 0;
      return 0;
    },

    duration: function () {
      if (mode === 'yt' && yt && yt.getDuration) return yt.getDuration() || 0;
      if (mode === 'audio' && audio) return audio.duration || 0;
      return 0;
    },

    playing: function () {
      if (mode === 'yt' && yt && yt.getPlayerState) return yt.getPlayerState() === 1;
      if (mode === 'audio' && audio) return !audio.paused && !audio.ended;
      return false;
    },

    play: function () {
      if (mode === 'yt' && yt) yt.playVideo();
      else if (mode === 'audio' && audio) audio.play();
    },

    pause: function () {
      if (mode === 'yt' && yt) yt.pauseVideo();
      else if (mode === 'audio' && audio) audio.pause();
    },

    toggle: function () {
      if (this.playing()) this.pause();
      else this.play();
    }
  };

  RTG.Player = Player;
})(window.RTG = window.RTG || {});
