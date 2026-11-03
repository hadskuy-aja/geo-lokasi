// Peta geser sederhana (tanpa library) memakai tile OpenStreetMap.
// Dipakai popup untuk memilih titik dengan klik.
const TILE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 19;
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const toRad = (d) => (d * Math.PI) / 180;

export function lonToX(lon, z) {
  return ((lon + 180) / 360) * Math.pow(2, z);
}

export function latToY(lat, z) {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const s = Math.sin(toRad(clamped));
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * Math.pow(2, z);
}

export function xToLon(x, z) {
  return (x / Math.pow(2, z)) * 360 - 180;
}

export function yToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function createMap(container, options = {}) {
  const layer = document.createElement("div");
  layer.className = "map-layer";
  container.appendChild(layer);

  const marker = document.createElement("div");
  marker.className = "map-marker";
  marker.innerHTML = '<span class="map-marker-pin"></span><span class="map-marker-dot"></span>';
  container.appendChild(marker);

  const state = {
    zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(options.zoom ?? 12))),
    lat: options.lat ?? 0,
    lon: options.lon ?? 0,
    markerLat: options.lat ?? 0,
    markerLon: options.lon ?? 0,
  };

  const tiles = new Map();
  let raf = 0;

  function sizes() {
    return {
      w: container.clientWidth || 320,
      h: container.clientHeight || 260,
      scale: Math.pow(2, state.zoom),
    };
  }

  function origin() {
    const { w, h } = sizes();
    return {
      x: lonToX(state.lon, state.zoom) * TILE - w / 2,
      y: latToY(state.lat, state.zoom) * TILE - h / 2,
    };
  }

  function draw() {
    const { w, h, scale } = sizes();
    const o = origin();
    const keep = new Set();

    const xStart = Math.floor(o.x / TILE);
    const xEnd = Math.floor((o.x + w) / TILE);
    const yStart = Math.max(0, Math.floor(o.y / TILE));
    const yEnd = Math.min(scale - 1, Math.floor((o.y + h) / TILE));

    for (let tx = xStart; tx <= xEnd; tx++) {
      for (let ty = yStart; ty <= yEnd; ty++) {
        const key = `${state.zoom}/${tx}/${ty}`;
        keep.add(key);
        let img = tiles.get(key);
        if (!img) {
          const wrapped = ((tx % scale) + scale) % scale;
          img = document.createElement("img");
          img.className = "map-tile";
          img.draggable = false;
          img.alt = "";
          img.loading = "eager";
          img.src = TILE_URL.replace("{z}", state.zoom)
            .replace("{x}", wrapped)
            .replace("{y}", ty);
          layer.appendChild(img);
          tiles.set(key, img);
        }
        img.style.transform = `translate3d(${tx * TILE - o.x}px, ${ty * TILE - o.y}px, 0)`;
      }
    }

    for (const [key, img] of tiles) {
      if (!keep.has(key)) {
        img.remove();
        tiles.delete(key);
      }
    }

    const mx = lonToX(state.markerLon, state.zoom) * TILE - o.x;
    const my = latToY(state.markerLat, state.zoom) * TILE - o.y;
    marker.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
    const visible = mx > -40 && my > -60 && mx < w + 40 && my < h + 60;
    marker.style.opacity = visible ? "1" : "0";
  }

  function render() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      draw();
    });
  }

  function pointAt(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const o = origin();
    const px = clientX - rect.left + o.x;
    const py = clientY - rect.top + o.y;
    return {
      lat: yToLat(py / TILE, state.zoom),
      lon: xToLon(px / TILE, state.zoom),
    };
  }

  // ---- geser ----
  let drag = null;

  container.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    const o = origin();
    drag = {
      id: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      ox: o.x,
      oy: o.y,
      moved: 0,
      time: Date.now(),
    };
    container.setPointerCapture(ev.pointerId);
    container.classList.add("is-dragging");
  });

  container.addEventListener("pointermove", (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const dx = ev.clientX - drag.startX;
    const dy = ev.clientY - drag.startY;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    const { w, h, scale } = sizes();
    const nx = drag.ox - dx;
    const ny = Math.max(
      -h / 2,
      Math.min(scale * TILE - h / 2, drag.oy - dy)
    );
    state.lon = xToLon((nx + w / 2) / TILE, state.zoom);
    state.lat = yToLat((ny + h / 2) / TILE, state.zoom);
    render();
  });

  function endDrag(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    const wasClick = drag.moved < 5 && Date.now() - drag.time < 700;
    drag = null;
    container.classList.remove("is-dragging");
    if (wasClick) {
      const p = pointAt(ev.clientX, ev.clientY);
      setMarker(p.lat, p.lon);
      options.onPick?.(p.lat, p.lon);
    } else {
      options.onMove?.(state.lat, state.lon, state.zoom);
    }
  }

  container.addEventListener("pointerup", endDrag);
  container.addEventListener("pointercancel", (ev) => {
    if (drag && ev.pointerId === drag.id) {
      drag = null;
      container.classList.remove("is-dragging");
    }
  });

  // ---- zoom ----
  container.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      const step = ev.deltaY > 0 ? -1 : 1;
      zoomAt(step, ev.clientX, ev.clientY);
    },
    { passive: false }
  );

  function zoomAt(step, clientX, clientY) {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.zoom + step));
    if (next === state.zoom) return;
    const rect = container.getBoundingClientRect();
    const useAnchor = clientX != null && clientY != null;
    const anchor = useAnchor
      ? pointAt(clientX, clientY)
      : { lat: state.lat, lon: state.lon };
    const px = useAnchor ? clientX - rect.left : rect.width / 2;
    const py = useAnchor ? clientY - rect.top : rect.height / 2;

    state.zoom = next;
    const { w, h } = sizes();
    const ox = lonToX(anchor.lon, next) * TILE - px;
    const oy = latToY(anchor.lat, next) * TILE - py;
    state.lon = xToLon((ox + w / 2) / TILE, next);
    state.lat = yToLat((oy + h / 2) / TILE, next);
    render();
    options.onMove?.(state.lat, state.lon, state.zoom);
  }

  function setMarker(lat, lon) {
    state.markerLat = lat;
    state.markerLon = lon;
    render();
  }

  function setView(lat, lon, zoom) {
    state.lat = lat;
    state.lon = lon;
    if (zoom != null) state.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom)));
    render();
  }

  const ro = new ResizeObserver(render);
  ro.observe(container);
  render();

  return {
    setMarker,
    setView,
    zoomIn: () => zoomAt(1),
    zoomOut: () => zoomAt(-1),
    get zoom() {
      return state.zoom;
    },
    get center() {
      return { lat: state.lat, lon: state.lon };
    },
  };
}
