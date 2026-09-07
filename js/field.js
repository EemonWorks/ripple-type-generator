/**
 * Shared wave-height field used to make ripples interfere.
 *
 * Every live ring contributes a localised signed wavelet centred on its own radius:
 *
 *     pulse(d, r) = cos(PI * (d - r) / w) * exp(-0.5 * ((d - r) / w)^2)
 *
 * That is a crest sitting exactly on the ring with shallow troughs either side. When
 * another ring is sampled through this field its radius is pushed outward on the crest
 * and pulled inward in the troughs, so rings visibly bend around each other instead of
 * merely overlapping.
 *
 * Rings are flattened into parallel arrays once per frame. The hot path is
 * O(vertices * rings), so the distance test is done squared -- no sqrt, no cos, no exp
 * unless the sample actually lands inside a wavelet.
 */
(function (RTG) {
  'use strict';

  var PI = Math.PI;
  var CUT = 2.5;             // wavelet support, in units of w

  var owner = [];
  var cX = [], cT = [];
  var rad = [], amp = [], wid = [];
  var lo2 = [], hi2 = [];    // squared reject bounds, precomputed per ring
  var count = 0;

  var Field = {
    begin: function () { count = 0; },

    /**
     * @param {number} src   index of the owning source (self-interaction is skipped)
     * @param {number} r     current ring radius, world units
     * @param {number} a     amplitude, decays as the ring spreads
     * @param {number} w     wavelet half-width, world units
     */
    add: function (src, x, t, r, a, w) {
      var reach = CUT * w;
      var lo = r - reach;

      owner[count] = src;
      cX[count] = x; cT[count] = t;
      rad[count] = r; amp[count] = a; wid[count] = w;
      lo2[count] = lo > 0 ? lo * lo : -1;
      hi2[count] = (r + reach) * (r + reach);
      count++;
    },

    /** Summed height at ground point (x, t), ignoring rings owned by `exclude`. */
    sample: function (x, t, exclude) {
      var h = 0;
      var previous = -1, d2 = 0, distance = -1;

      for (var i = 0; i < count; i++) {
        if (owner[i] === exclude) continue;

        // Rings are added source by source; their centre distance is identical.
        if (owner[i] !== previous) {
          var dx = x - cX[i];
          var dt = t - cT[i];
          d2 = dx * dx + dt * dt;
          distance = -1;
          previous = owner[i];
        }

        if (d2 > hi2[i]) continue;
        var l = lo2[i];
        if (l > 0 && d2 < l) continue;

        if (distance < 0) distance = Math.sqrt(d2);
        var u = (distance - rad[i]) / wid[i];
        h += amp[i] * Math.cos(PI * u) * Math.exp(-0.5 * u * u);
      }

      return h;
    },

    size: function () { return count; }
  };

  RTG.Field = Field;
})(window.RTG = window.RTG || {});
