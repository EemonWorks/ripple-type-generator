/**
 * Falling droplets.
 *
 * A droplet carries the word it will become and falls straight down to its anchor. It
 * is drawn as a strobe -- the same droplet at several earlier moments. The fall is
 * quadratic in time, so evenly spaced strobe intervals leave dots whose gaps widen
 * toward the water, which is the trail in the reference.
 */
(function (RTG) {
  'use strict';

  var BASE_FALL = 1.9;
  var TRAIL = 4;

  function Droplet(ax, ay, word, t0, p) {
    var cam = RTG.Camera;

    this.ax = ax;
    this.ay = ay;
    this.word = word;
    this.t0 = t0;

    this.y0 = -0.17 * cam.H;
    this.fall = BASE_FALL / Math.max(0.05, p.fallSpeed);
    this.strobe = this.fall / 8.5;
    this.r = Math.max(1.6, 0.0055 * cam.H);
  }

  /** Screen y at a given age. Constant acceleration from rest. */
  Droplet.prototype.yAt = function (age) {
    var f = age / this.fall;
    return this.y0 + (this.ay - this.y0) * f * f;
  };

  var Droplets = {
    list: [],
    TRAIL: TRAIL,

    /** How long a droplet takes to land. Lyric drops are released this far early. */
    fallDuration: function (p) {
      return BASE_FALL / Math.max(0.05, p.fallSpeed);
    },

    spawn: function (ax, ay, word, t, p) {
      var d = new Droplet(ax, ay, word, t, p);
      this.list.push(d);
      return d;
    },

    /** Advances droplets; `onImpact(droplet, impactTime)` fires as each lands. */
    update: function (t, onImpact) {
      var list = this.list;
      for (var i = list.length - 1; i >= 0; i--) {
        var d = list[i];
        if (t - d.t0 >= d.fall) {
          list.splice(i, 1);
          if (onImpact) onImpact(d, d.t0 + d.fall);
        }
      }
    },

    clear: function () { this.list.length = 0; }
  };

  RTG.Droplets = Droplets;
})(window.RTG = window.RTG || {});
