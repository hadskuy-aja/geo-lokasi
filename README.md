# Ubah Lokasi

Extension Chrome buatan sendiri untuk mengganti lokasi yang dibaca website lewat
`navigator.geolocation`. Titiknya dipilih dengan klik di peta. Fungsinya sama
dengan Chrome DevTools > Sensors > Location override, cuma lebih enak dipakai
karena ada petanya.

Dipakai untuk menguji fitur berbasis lokasi (hotspot, portal, halaman cabang
terdekat) tanpa harus pindah tempat dulu.

Belum ada di Chrome Web Store, pasang sendiri lewat Load unpacked (caranya di
bawah). Tanpa library pihak ketiga, petanya ditulis sendiri.

> **In English:** a small Manifest V3 Chrome extension that overrides
> `navigator.geolocation` with a point you pick by clicking a map. Same idea as
> DevTools > Sensors > Location override, but quicker to use. Built for testing
> location-based features. No build step, no third-party libraries, the slippy
> map is ~200 lines of plain JS over OpenStreetMap tiles. Install with Load
> unpacked (see below); the UI is in Indonesian.

## Pasang

1. Buka `chrome://extensions`
2. Nyalakan **Developer mode** (kanan atas)
3. Klik **Load unpacked**, pilih folder ini: `~/Documents/09_Kode/geo-lokasi`

Catatan: sejak Chrome 137 flag `--load-extension` sudah diblokir, jadi memuat
lewat command line tidak bisa. Harus lewat halaman `chrome://extensions`.

## Pakai

1. Klik ikon pin di toolbar
2. Klik titik mana saja di peta, atau ketik nama tempat di kotak cari, atau
   tempel koordinat langsung (`-8.65, 115.21`)
3. Klik **Pakai lokasi ini**. Tab yang sedang terbuka otomatis dimuat ulang.

Saklar di kanan atas untuk mematikan sementara tanpa kehilangan titik yang
sudah dipilih. **Lokasi asli** mengembalikan GPS browser seperti semula.
Kalau aktif, ikon extension diberi tanda `ON` hijau.

Pilihan lain:

- **Akurasi (m)** - angka yang dilaporkan ke halaman sebagai radius akurasi.
- **Goyangkan titik** - tiap pembacaan digeser acak beberapa meter, supaya
  mirip GPS sungguhan yang tidak pernah diam.

## Yang diubah dan yang tidak

Diubah:

- `navigator.geolocation.getCurrentPosition()`
- `navigator.geolocation.watchPosition()` (kirim pembacaan tiap 10 detik)
- `navigator.permissions.query({name:'geolocation'})` dilaporkan `granted`,
  supaya halaman yang cek izin dulu mau lanjut

TIDAK diubah:

- Lokasi dari alamat IP. Banyak situs menebak lokasi dari IP, bukan dari GPS.
  Kalau situsnya begitu, extension ini tidak berpengaruh, perlu VPN/proxy.
- Zona waktu, bahasa browser, dan WebRTC.

Kalau extension dimatikan atau datanya rusak, panggilan diteruskan ke
geolocation asli browser, bukan dibuat gagal.

## Isi folder

| File | Isi |
|---|---|
| `manifest.json` | Manifest V3 |
| `inject.js` | Jalan di dunia MAIN halaman, membungkus `Geolocation.prototype` |
| `bridge.js` | Jalan di dunia ISOLATED, jembatan ke `chrome.storage` |
| `background.js` | Service worker: nilai awal + tanda ON di ikon |
| `popup.html/css/js` | Antarmuka |
| `map.js` | Peta geser sederhana tanpa library, tile OpenStreetMap |

Dua dunia dipisah karena script di dunia MAIN tidak boleh menyentuh API
extension, sedangkan `navigator.geolocation` halaman hanya bisa diganti dari
dunia MAIN. Keduanya bicara lewat CustomEvent berisi JSON.

## Izin yang diminta

- `storage` - menyimpan titik dan status aktif
- `<all_urls>` content script - supaya bisa jalan di situs mana saja
- `nominatim.openstreetmap.org` - hanya untuk kotak pencarian tempat

Peta memakai tile OpenStreetMap, pencarian memakai Nominatim.

## Uji

```bash
cd ~/Documents/09_Kode/geo-lokasi
node test/uji-logika.mjs    # 12 pemeriksaan logika dua dunia, tanpa browser
```

Yang sudah diuji: koordinat palsu terkirim, geolocation asli tidak dipanggil
saat aktif, fallback ke asli saat mati atau data rusak, drift, watchPosition,
izin, penolakan koordinat di luar rentang, klik peta, geser, zoom, pencarian.
