(function (RTG) {
  'use strict';

  // All the artwork uses one ink colour. Blurring coverage rather than RGB avoids
  // dark transparent fringes and works even when CanvasRenderingContext2D.filter does not.
  function boxPass(src, dst, width, height, radius, vertical) {
    var length = vertical ? height : width;
    var lines = vertical ? width : height;
    var stride = vertical ? width : 1;
    var divisor = 2 * radius + 1;

    for (var line = 0; line < lines; line++) {
      var base = vertical ? line : line * width;
      var sum = 0;
      for (var j = 0; j <= Math.min(radius, length - 1); j++) {
        sum += src[base + j * stride];
      }
      for (var i = 0; i < length; i++) {
        dst[base + i * stride] = sum / divisor;
        var remove = i - radius;
        var add = i + radius + 1;
        if (remove >= 0) sum -= src[base + remove * stride];
        if (add < length) sum += src[base + add * stride];
      }
    }
  }

  function BlurLayer() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.alpha = new Float32Array(0);
    this.scratch = new Float32Array(0);
  }

  BlurLayer.prototype.render = function (source, width, height, radius, ink) {
    if (radius <= 0) return source;

    // Keep the kernel resolved at reduced resolution, rather than merely shrinking
    // and enlarging the artwork. Buffers are reused for every animation frame.
    var scale = Math.min(1, 512 / Math.max(width, height), 3 / radius);
    var w = Math.max(1, Math.round(width * scale));
    var h = Math.max(1, Math.round(height * scale));
    var count = w * h;
    var ctx = this.ctx;

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (this.alpha.length !== count) {
      this.alpha = new Float32Array(count);
      this.scratch = new Float32Array(count);
    }

    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    var image = ctx.getImageData(0, 0, w, h);
    var pixels = image.data;
    var i;
    for (i = 0; i < count; i++) this.alpha[i] = pixels[i * 4 + 3];

    // Three separable box passes approximate a Gaussian with the requested variance.
    var sigma = radius * Math.min(w / width, h / height);
    var low = Math.floor(Math.sqrt(4 * sigma * sigma + 1));
    if (low % 2 === 0) low--;
    var high = low + 2;
    var lowCount = Math.round((12 * sigma * sigma - 3 * low * low - 12 * low - 9) / (-4 * low - 4));
    for (i = 0; i < 3; i++) {
      var r = ((i < lowCount ? low : high) - 1) / 2;
      if (r === 0) continue;
      boxPass(this.alpha, this.scratch, w, h, r, false);
      boxPass(this.scratch, this.alpha, w, h, r, true);
    }

    for (i = 0; i < count; i++) {
      var offset = i * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = this.alpha[i];
    }
    ctx.putImageData(image, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    return this.canvas;
  };

  RTG.Blur = {
    create: function () { return new BlurLayer(); }
  };
})(window.RTG = window.RTG || {});
