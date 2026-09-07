/**
 * PNG stills and WebM capture straight off the canvas.
 */
(function (RTG) {
  'use strict';

  var current = null;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
      '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  function save(blob, ext) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ripples-' + stamp() + '.' + ext;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function pickMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    var candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return '';
  }

  function finish(session, download) {
    if (session.finished) return;
    session.finished = true;
    var parts = session.parts;
    var type = ((session.recorder && session.recorder.mimeType) ||
      (parts.length && parts[0].type) || 'video/webm').split(';')[0];
    session.parts = [];
    if (session.stream) session.stream.getTracks().forEach(function (track) { track.stop(); });
    if (current === session) current = null;
    if (session.onEnd) session.onEnd();
    if (download) {
      if (parts.length) save(new Blob(parts, { type: type }), type.indexOf('mp4') >= 0 ? 'mp4' : 'webm');
      else window.alert('The recording did not produce any video. Please try again with the tab visible.');
    }
  }

  var Exporter = {
    png: function (canvas) {
      canvas.toBlob(function (blob) {
        if (blob) save(blob, 'png');
        else window.alert('Could not create the image. Try a smaller canvas size.');
      }, 'image/png');
    },

    isRecording: function () { return current !== null; },

    elapsed: function () {
      return current ? (performance.now() - current.startedAt) / 1000 : 0;
    },

    /** Returns true if recording started, false if it stopped or was unavailable. */
    toggle: function (canvas, onEnd) {
      if (current) {
        // Keep the size locked until the final data/stop events have arrived.
        if (current.recorder.state !== 'inactive') current.recorder.stop();
        return false;
      }

      if (!window.MediaRecorder || !canvas.captureStream) {
        window.alert('Video capture is not supported in this browser. Try Chrome or Edge.');
        return false;
      }

      var session = { stream: null, recorder: null, parts: [], startedAt: 0, finished: false, onEnd: onEnd };
      current = session;
      try {
        var mime = pickMime();
        var options = { videoBitsPerSecond: 16000000 };
        if (mime) options.mimeType = mime;
        session.stream = canvas.captureStream(60);
        session.recorder = new MediaRecorder(session.stream, options);
        session.recorder.ondataavailable = function (e) {
          if (!session.finished && e.data && e.data.size) session.parts.push(e.data);
        };
        session.recorder.onstop = function () { finish(session, true); };
        session.recorder.onerror = function (e) {
          finish(session, false);
          window.alert('Recording failed: ' + (e.error ? e.error.message : 'The browser could not encode the video.'));
        };
        session.recorder.start(1000);
        session.startedAt = performance.now();
        return true;
      } catch (error) {
        finish(session, false);
        window.alert('Could not start recording: ' + error.message);
        return false;
      }
    }
  };

  RTG.Exporter = Exporter;
})(window.RTG = window.RTG || {});
