// Uji kontrak inject.js (dunia MAIN) <-> bridge.js (dunia ISOLATED)
// tanpa browser: dua konteks vm berbagi satu objek window palsu.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const EXT = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`);
};

// ---- window palsu yang dipakai bersama kedua dunia ----
const win = new EventTarget();
win.setTimeout = setTimeout;
win.clearTimeout = clearTimeout;
win.setInterval = setInterval;
win.clearInterval = clearInterval;

// ---- geolocation asli palsu ----
let nativeCalls = 0;
class Geolocation {
  getCurrentPosition(success, error) {
    nativeCalls++;
    setTimeout(() => success({ coords: { latitude: 1, longitude: 2, accuracy: 999 }, timestamp: 0 }));
  }
  watchPosition(success) {
    nativeCalls++;
    return 1;
  }
  clearWatch() {}
}
class Permissions {
  query() {
    return Promise.resolve({ name: "geolocation", state: "prompt" });
  }
}
const navigator = {
  geolocation: new Geolocation(),
  permissions: new Permissions(),
};

// ---- chrome.storage palsu untuk bridge ----
let store = { enabled: true, lat: -8.409518, lon: 115.188919, accuracy: 15, drift: false };
const changeListeners = [];
const chrome = {
  storage: {
    local: { get: (keys, cb) => setTimeout(() => cb({ ...store })) },
    onChanged: { addListener: (fn) => changeListeners.push(fn) },
  },
  runtime: { lastError: null },
};
// Chrome memberitahu content script tiap storage berubah; tiru itu.
const setStore = (patch) => {
  store = { ...store, ...patch };
  const changes = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, { newValue: v }]));
  for (const fn of changeListeners) fn(changes, "local");
};

const shared = {
  window: win,
  navigator,
  Geolocation,
  Permissions,
  CustomEvent,
  Math,
  Date,
  JSON,
  Number,
  Object,
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  TypeError,
};

// dunia ISOLATED: punya chrome, tidak punya navigator.geolocation asli
vm.runInNewContext(readFileSync(`${EXT}/bridge.js`, "utf8"), { ...shared, chrome }, {
  filename: "bridge.js",
});
// dunia MAIN: tidak punya chrome
vm.runInNewContext(readFileSync(`${EXT}/inject.js`, "utf8"), { ...shared }, {
  filename: "inject.js",
});

const getPos = () =>
  new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject)
  );

const run = async () => {
  // 1. aktif -> koordinat palsu
  let p = await getPos();
  check(
    "aktif: getCurrentPosition pakai koordinat pilihan",
    p.coords.latitude === -8.409518 && p.coords.longitude === 115.188919 && p.coords.accuracy === 15,
    JSON.stringify(p.coords)
  );
  check("aktif: tidak memanggil geolocation asli", nativeCalls === 0, `nativeCalls=${nativeCalls}`);
  check("timestamp masuk akal", Math.abs(Date.now() - p.timestamp) < 5000);
  check("position.toJSON jalan", typeof p.toJSON === "function" && p.toJSON().coords.latitude === -8.409518);

  // 2. izin dilaporkan granted
  const perm = await navigator.permissions.query({ name: "geolocation" });
  check("aktif: permissions.query -> granted", perm.state === "granted", perm.state);
  const other = await navigator.permissions.query({ name: "camera" });
  check("izin lain tidak disentuh", other.state === "prompt", other.state);

  // 3. watchPosition mengirim pembacaan pertama lalu bisa dihentikan
  const seen = [];
  const id = navigator.geolocation.watchPosition((pos) => seen.push(pos.coords.latitude));
  await new Promise((r) => setTimeout(r, 60));
  check("aktif: watchPosition mengirim pembacaan", seen.length === 1 && seen[0] === -8.409518, JSON.stringify(seen));
  navigator.geolocation.clearWatch(id);

  // 4. drift membuat titik bergoyang sedikit tapi tetap dekat
  setStore({ drift: true });
  const a = await getPos();
  const b = await getPos();
  const moved = a.coords.latitude !== b.coords.latitude;
  const near = Math.abs(a.coords.latitude - -8.409518) < 0.001;
  check("drift: titik bergeser sedikit saja", moved && near, `${a.coords.latitude} vs ${b.coords.latitude}`);
  setStore({ drift: false });

  // 5. dimatikan -> jatuh ke geolocation asli
  setStore({ enabled: false });
  p = await getPos();
  check(
    "mati: diteruskan ke geolocation asli",
    p.coords.latitude === 1 && nativeCalls === 1,
    `lat=${p.coords.latitude} nativeCalls=${nativeCalls}`
  );
  const permOff = await navigator.permissions.query({ name: "geolocation" });
  check("mati: permissions.query kembali asli", permOff.state === "prompt", permOff.state);

  // 6. koordinat ngawur di storage -> dianggap tidak aktif
  setStore({ enabled: true, lat: null, lon: undefined, accuracy: 20 });
  p = await getPos();
  check("data rusak: tetap pakai geolocation asli", p.coords.latitude === 1 && nativeCalls === 2);

  // 7. tanpa callback harus melempar TypeError seperti API asli
  let threw = false;
  try {
    navigator.geolocation.getCurrentPosition();
  } catch (e) {
    threw = e instanceof TypeError;
  }
  check("tanpa callback melempar TypeError", threw);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} lulus`);
  process.exit(failed.length ? 1 : 0);
};

run();
