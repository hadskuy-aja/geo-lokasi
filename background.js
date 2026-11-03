// Service worker: isi nilai awal dan tandai ikon saat fitur aktif.
const DEFAULTS = {
  enabled: false,
  lat: -8.670458,
  lon: 115.212629, // Denpasar
  accuracy: 20,
  drift: false,
  zoom: 12,
};

async function paintBadge() {
  const { enabled } = await chrome.storage.local.get("enabled");
  await chrome.action.setBadgeText({ text: enabled ? "ON" : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const missing = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (current[key] === undefined) missing[key] = value;
  }
  if (Object.keys(missing).length) await chrome.storage.local.set(missing);
  await paintBadge();
});

chrome.runtime.onStartup.addListener(paintBadge);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled) paintBadge();
});
