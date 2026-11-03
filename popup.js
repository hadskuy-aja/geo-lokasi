import { createMap } from "./map.js";

const KEYS = ["enabled", "lat", "lon", "accuracy", "drift", "zoom"];
const el = (id) => document.getElementById(id);

const ui = {
  toggle: el("toggle"),
  toggleText: el("toggle-text"),
  lat: el("lat"),
  lon: el("lon"),
  accuracy: el("accuracy"),
  drift: el("drift"),
  search: el("search"),
  searchBtn: el("search-btn"),
  results: el("results"),
  apply: el("apply"),
  reset: el("reset"),
  status: el("status"),
};

let map;
let cfg;

const round = (n) => Math.round(n * 1e6) / 1e6;

function say(text, kind = "") {
  ui.status.textContent = text;
  ui.status.className = "status" + (kind ? " " + kind : "");
}

function paintToggle() {
  ui.toggle.checked = !!cfg.enabled;
  ui.toggleText.textContent = cfg.enabled ? "Aktif" : "Mati";
  document.body.classList.toggle("on", !!cfg.enabled);
}

function readFields() {
  const lat = parseFloat(ui.lat.value.replace(",", "."));
  const lon = parseFloat(ui.lon.value.replace(",", "."));
  const acc = parseInt(ui.accuracy.value, 10);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    say("Lintang harus antara -90 dan 90.", "err");
    return null;
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    say("Bujur harus antara -180 dan 180.", "err");
    return null;
  }
  return {
    lat: round(lat),
    lon: round(lon),
    accuracy: Number.isFinite(acc) && acc > 0 ? acc : 20,
    drift: ui.drift.checked,
  };
}

function showPoint(lat, lon, moveView = false) {
  ui.lat.value = round(lat);
  ui.lon.value = round(lon);
  map.setMarker(lat, lon);
  if (moveView) map.setView(lat, lon);
}

async function reloadActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) await chrome.tabs.reload(tab.id);
    return true;
  } catch {
    return false;
  }
}

async function save(patch, { reload = true } = {}) {
  cfg = { ...cfg, ...patch };
  await chrome.storage.local.set(patch);
  if (reload) await reloadActiveTab();
}

// ---- pencarian tempat ----
function parseCoordinates(text) {
  const m = text
    .trim()
    .match(/^(-?\d{1,3}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1].replace(",", "."));
  const lon = parseFloat(m[2].replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function clearResults() {
  ui.results.innerHTML = "";
  ui.results.hidden = true;
}

async function doSearch() {
  const q = ui.search.value.trim();
  if (!q) return;
  clearResults();

  const direct = parseCoordinates(q);
  if (direct) {
    showPoint(direct.lat, direct.lon, true);
    say("Titik diset dari koordinat yang kamu tulis.");
    return;
  }

  say("Mencari...");
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=" +
      encodeURIComponent(q);
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) {
      say("Tempat tidak ditemukan.", "err");
      return;
    }
    say(`${list.length} hasil, pilih salah satu.`);
    for (const item of list) {
      const li = document.createElement("li");
      li.textContent = item.display_name;
      li.title = item.display_name;
      li.addEventListener("click", () => {
        showPoint(parseFloat(item.lat), parseFloat(item.lon), true);
        clearResults();
        ui.search.value = "";
        say("Titik diset. Klik \"Pakai lokasi ini\" untuk menerapkan.");
      });
      ui.results.appendChild(li);
    }
    ui.results.hidden = false;
  } catch (e) {
    say("Pencarian gagal: " + e.message, "err");
  }
}

// ---- mulai ----
(async function init() {
  cfg = await chrome.storage.local.get(KEYS);
  cfg = {
    enabled: !!cfg.enabled,
    lat: Number.isFinite(cfg.lat) ? cfg.lat : -8.670458,
    lon: Number.isFinite(cfg.lon) ? cfg.lon : 115.212629,
    accuracy: Number.isFinite(cfg.accuracy) ? cfg.accuracy : 20,
    drift: !!cfg.drift,
    zoom: Number.isFinite(cfg.zoom) ? cfg.zoom : 12,
  };

  ui.lat.value = round(cfg.lat);
  ui.lon.value = round(cfg.lon);
  ui.accuracy.value = cfg.accuracy;
  ui.drift.checked = cfg.drift;
  paintToggle();
  if (cfg.enabled) say("Lokasi palsu sedang aktif di semua tab.", "ok");

  map = createMap(el("map"), {
    lat: cfg.lat,
    lon: cfg.lon,
    zoom: cfg.zoom,
    onPick: (lat, lon) => {
      ui.lat.value = round(lat);
      ui.lon.value = round(lon);
      say("Titik dipindah. Klik \"Pakai lokasi ini\" untuk menerapkan.");
    },
    onMove: (lat, lon, zoom) => {
      chrome.storage.local.set({ zoom });
    },
  });

  for (const input of [ui.lat, ui.lon]) {
    input.addEventListener("change", () => {
      const v = readFields();
      if (v) {
        showPoint(v.lat, v.lon, true);
        say("Titik dipindah ke koordinat itu.");
      }
    });
  }

  ui.searchBtn.addEventListener("click", doSearch);
  ui.search.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") doSearch();
    if (ev.key === "Escape") clearResults();
  });

  ui.apply.addEventListener("click", async () => {
    const v = readFields();
    if (!v) return;
    await save({ ...v, enabled: true });
    paintToggle();
    say(`Aktif di ${v.lat}, ${v.lon}. Tab ini sudah dimuat ulang.`, "ok");
  });

  ui.reset.addEventListener("click", async () => {
    await save({ enabled: false });
    paintToggle();
    say("Kembali ke lokasi asli. Tab ini sudah dimuat ulang.");
  });

  ui.toggle.addEventListener("change", async () => {
    if (ui.toggle.checked) {
      const v = readFields();
      if (!v) {
        ui.toggle.checked = false;
        return;
      }
      await save({ ...v, enabled: true });
      say("Aktif. Tab ini sudah dimuat ulang.", "ok");
    } else {
      await save({ enabled: false });
      say("Mati. Tab ini sudah dimuat ulang.");
    }
    paintToggle();
  });

  ui.drift.addEventListener("change", () => {
    if (cfg.enabled) save({ drift: ui.drift.checked }, { reload: false });
  });

  el("zoom-in").addEventListener("click", () => map.zoomIn());
  el("zoom-out").addEventListener("click", () => map.zoomOut());
})();
