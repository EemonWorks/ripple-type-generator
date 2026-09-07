/**
 * Local perspective applied around each ripple's anchor. Circles live in map space;
 * s0 foreshortens them vertically and P controls perspective bow. The shared wave
 * field uses map-space distances as a stylized approximation, not global fluid physics.
 */
(function (RTG) {
  'use strict';

  var Camera = {
    W: 0, H: 0,
    s0: 0.45,
    cosPhi: 0.893,
    P: 300,
    Zc0: 666,
    dvLimit: 700,

    configure: function (W, H, tiltDeg, perspective) {
      this.W = W;
      this.H = H;

      var s = Math.sin(tiltDeg * Math.PI / 180);
      this.s0 = Math.min(0.97, Math.max(0.05, s));
      this.cosPhi = Math.sqrt(1 - this.s0 * this.s0);

      this.P = Math.max(30, perspective * H);
      this.Zc0 = this.P / this.s0;

      // Beyond this the near edge of a ring would pass the camera.
      this.dvLimit = this.Zc0 / this.cosPhi;
    },

    /** Screen y -> map v. Map x and screen x are the same axis. */
    toMapY: function (sy) { return sy / this.s0; },
    toScreenY: function (v) { return v * this.s0; },

    /**
     * Projects a map offset from an anchor.
     *
     * @param {number} ax,ay  anchor, in screen pixels
     * @param {number} dx     lateral offset, map units
     * @param {number} dv     offset toward the viewer, map units
     */
    project: function (ax, ay, dx, dv, out) {
      var Zc = this.Zc0 - dv * this.cosPhi;
      if (Zc < this.Zc0 * 0.06) { out.ok = false; return out; }

      var inv = 1 / Zc;
      out.x = ax + this.Zc0 * dx * inv;
      out.y = ay + this.P * dv * inv;
      out.ok = true;
      return out;
    },

    /**
     * Largest ring radius that stays safely in front of the camera. m = R / dvLimit, and
     * the projection stretches as m approaches 1, so this also caps how bowed a ring can
     * get. 0.86 admits the reference's outer ring (m = 0.82) with a little headroom.
     */
    maxSafeRadius: function () { return this.dvLimit * 0.86; }
  };

  RTG.Camera = Camera;
})(window.RTG = window.RTG || {});
