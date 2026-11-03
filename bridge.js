// Berjalan di dunia ISOLATED. Jembatan antara inject.js dan chrome.storage,
// karena script di dunia MAIN tidak boleh menyentuh API extension.
(() => {
  "use strict";

  const REQ = "__ubahlokasi_req";
  const RES = "__ubahlokasi_res";
  const KEYS = ["enabled", "lat", "lon", "accuracy", "drift"];

  let cache = null;

  function reply(id, cfg) {
    try {
      window.dispatchEvent(new CustomEvent(RES, { detail: JSON.stringify({ id, cfg }) }));
    } catch {
      /* halaman sudah pergi */
    }
  }

  window.addEventListener(REQ, (ev) => {
    let id;
    try {
      id = JSON.parse(ev.detail).id;
    } catch {
      return;
    }

    if (cache) {
      reply(id, cache);
      return;
    }

    try {
      chrome.storage.local.get(KEYS, (data) => {
        if (chrome.runtime.lastError) {
          reply(id, null);
          return;
        }
        cache = data || null;
        reply(id, cache);
      });
    } catch {
      // Konteks extension sudah tidak valid (habis reload extension).
      // Jawab null supaya halaman kembali ke geolocation asli.
      reply(id, null);
    }
  });

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      cache = null;
    });
  } catch {
    /* abaikan */
  }
})();
