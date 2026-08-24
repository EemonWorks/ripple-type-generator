/**
 * Risograph-style grain.
 *
 * The reference print has a luminance sigma of about 2.5 -- barely there, but it is
 * what stops the flat blue reading as vector art. A noise tile is rendered once and
 * composited as a repeating pattern, offset each frame so the grain shimmers instead
 * of sitting still.
 */
(function (RTG) {
  'use strict';

  var TILE = 256;
  var canvas = null;
  var pattern = null;

  function build() {
    canvas = document.createElement('canvas');
    canvas.width = TILE;
    canvas.height = TILE;

    var g = canvas.getContext('2d');
    var img = g.createImageData(TILE, TILE);
    var d = img.data;

    for (var i = 0; i < d.length; i += 4) {
      // Two-point speckle (light or dark) reads more like ink than a grey blur.
      var v = Math.random() < 0.5 ? 255 : 0;
      d[i] = v; d[i + 1] = v; d[i + 2] = v;

      // Skewed alpha: mostly faint, with a few pronounced specks.
      var a = Math.random();
      d[i + 3] = (a * a * 255) | 0;
    }

    g.putImageData(img, 0, 0);
  }

  var Grain = {
    /** W/H are device pixels: the grain is composited 1:1 regardless of DPR. */
    apply: function (ctx, W, H, amount) {
      if (amount <= 0.001) return;
      if (!canvas) build();
      if (!pattern) pattern = ctx.createPattern(canvas, 'repeat');
      if (!pattern) return;

      var ox = (Math.random() * TILE) | 0;
      var oy = (Math.random() * TILE) | 0;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = amount;
      ctx.translate(-ox, -oy);
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, W + TILE, H + TILE);
      ctx.restore();
    },

    /** The pattern is bound to a context, so drop it when the context is rebuilt. */
    invalidate: function () { pattern = null; }
  };

  RTG.Grain = Grain;
})(window.RTG = window.RTG || {});
