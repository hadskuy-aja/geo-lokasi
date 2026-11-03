// Berjalan di dunia MAIN halaman, sebelum script halaman jalan.
// Tugasnya: bungkus navigator.geolocation supaya jawabannya bisa diganti
// dengan koordinat pilihan. Kalau fitur mati, panggilan diteruskan ke API asli.
(() => {
  "use strict";

  const geo = navigator.geolocation;
  if (!geo || typeof Geolocation === "undefined") return;

  const REQ = "__ubahlokasi_req";
  const RES = "__ubahlokasi_res";

  const nativeGet = Geolocation.prototype.getCurrentPosition;
  const nativeWatch = Geolocation.prototype.watchPosition;
  const nativeClear = Geolocation.prototype.clearWatch;
  const nativePermQuery =
    navigator.permissions && navigator.permissions.query
      ? navigator.permissions.query.bind(navigator.permissions)
      : null;

  let seq = 0;
  const pending = new Map();

  window.addEventListener(RES, (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.detail);
    } catch {
      return;
    }
    const resolve = pending.get(msg.id);
    if (!resolve) return;
    pending.delete(msg.id);
    resolve(msg.cfg || null);
  });

  // Tanya konfigurasi ke bridge (dunia ISOLATED). Null berarti pakai API asli.
  function config() {
    return new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      try {
        window.dispatchEvent(new CustomEvent(REQ, { detail: JSON.stringify({ id }) }));
      } catch {
        pending.delete(id);
        resolve(null);
        return;
      }
      setTimeout(() => {
        if (pending.delete(id)) resolve(null);
      }, 1500);
    });
  }

  function jitter(meters) {
    // Sedikit variasi acak supaya titik tidak persis sama tiap pembacaan.
    return (Math.random() - 0.5) * (meters / 111320);
  }

  function makePosition(cfg) {
    const drift = cfg.drift ? 8 : 0;
    const coords = {
      latitude: cfg.lat + (drift ? jitter(drift) : 0),
      longitude: cfg.lon + (drift ? jitter(drift) : 0),
      accuracy: cfg.accuracy > 0 ? cfg.accuracy : 20,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON() {
        return { ...this };
      },
    };
    return {
      coords,
      timestamp: Date.now(),
      toJSON() {
        return { coords: coords.toJSON(), timestamp: this.timestamp };
      },
    };
  }

  function active(cfg) {
    return !!(cfg && cfg.enabled && Number.isFinite(cfg.lat) && Number.isFinite(cfg.lon));
  }

  function getCurrentPosition(success, error, options) {
    if (typeof success !== "function") {
      throw new TypeError(
        "Failed to execute 'getCurrentPosition' on 'Geolocation': 1 argument required."
      );
    }
    config().then((cfg) => {
      if (!active(cfg)) {
        nativeGet.call(this, success, error, options);
        return;
      }
      try {
        success(makePosition(cfg));
      } catch (e) {
        setTimeout(() => {
          throw e;
        });
      }
    });
  }

  const watchers = new Map();
  let watchSeq = 0x7000;

  function watchPosition(success, error, options) {
    if (typeof success !== "function") {
      throw new TypeError(
        "Failed to execute 'watchPosition' on 'Geolocation': 1 argument required."
      );
    }
    const handle = ++watchSeq;
    const self = this;
    watchers.set(handle, { native: null, timer: null });

    config().then((cfg) => {
      const entry = watchers.get(handle);
      if (!entry) return; // sudah di-clear sebelum konfigurasi datang
      if (!active(cfg)) {
        entry.native = nativeWatch.call(self, success, error, options);
        return;
      }
      const emit = () => {
        try {
          success(makePosition(cfg));
        } catch (e) {
          setTimeout(() => {
            throw e;
          });
        }
      };
      emit();
      entry.timer = setInterval(emit, 10000);
    });

    return handle;
  }

  function clearWatch(handle) {
    const entry = watchers.get(handle);
    if (!entry) {
      nativeClear.call(this, handle);
      return;
    }
    watchers.delete(handle);
    if (entry.timer) clearInterval(entry.timer);
    if (entry.native != null) nativeClear.call(this, entry.native);
  }

  function define(obj, name, value) {
    try {
      Object.defineProperty(obj, name, {
        value,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    } catch {
      /* biarkan API asli kalau tidak bisa ditimpa */
    }
  }

  define(Geolocation.prototype, "getCurrentPosition", getCurrentPosition);
  define(Geolocation.prototype, "watchPosition", watchPosition);
  define(Geolocation.prototype, "clearWatch", clearWatch);

  // Sebagian situs cek izin dulu dan berhenti kalau statusnya "prompt".
  if (nativePermQuery) {
    const query = function (desc) {
      if (!desc || desc.name !== "geolocation") return nativePermQuery(desc);
      return config().then((cfg) => {
        if (!active(cfg)) return nativePermQuery(desc);
        return {
          name: "geolocation",
          state: "granted",
          status: "granted",
          onchange: null,
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false;
          },
        };
      });
    };
    if (typeof Permissions !== "undefined" && Permissions.prototype) {
      define(Permissions.prototype, "query", query);
    } else {
      define(navigator.permissions, "query", query);
    }
  }
})();
