/**
 * PNG stills and WebM capture straight off the canvas.
 */
(function (RTG) {
  'use strict';

  var recorder = null;
  var chunks = [];
  var startedAt = 0;

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

  var Exporter = {
    png: function (canvas) {
      if (canvas.toBlob) {
        canvas.toBlob(function (b) { if (b) save(b, 'png'); }, 'image/png');
      } else {
        var a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = 'ripples-' + stamp() + '.png';
        a.click();
      }
    },

    isRecording: function () { return !!recorder; },

    elapsed: function () {
      return recorder ? (performance.now() - startedAt) / 1000 : 0;
    },

    /** Returns true if recording started, false if it stopped or was unavailable. */
    toggle: function (canvas, onEnd) {
      if (recorder) {
        recorder.stop();
        return false;
      }

      if (!window.MediaRecorder || !canvas.captureStream) {
        window.alert('Video capture is not supported in this browser. Try Chrome or Edge.');
        return false;
      }

      var mime = pickMime();
      var stream = canvas.captureStream(60);
      var opts = { videoBitsPerSecond: 16000000 };
      if (mime) opts.mimeType = mime;

      try {
        recorder = new MediaRecorder(stream, opts);
      } catch (e) {
        try {
          recorder = new MediaRecorder(stream);
        } catch (e2) {
          window.alert('Could not start recording: ' + e2.message);
          recorder = null;
          return false;
        }
      }

      chunks = [];
      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      recorder.onstop = function () {
        var type = (mime || 'video/webm').split(';')[0];
        if (chunks.length) save(new Blob(chunks, { type: type }), type.indexOf('mp4') >= 0 ? 'mp4' : 'webm');
        chunks = [];
        recorder = null;
        if (onEnd) onEnd();
      };

      recorder.start();
      startedAt = performance.now();
      return true;
    }
  };

  RTG.Exporter = Exporter;
})(window.RTG = window.RTG || {});
