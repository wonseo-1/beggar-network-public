// ═══════════════════════════════════
// MAP
// ═══════════════════════════════════
const SPOTS_SOURCE = 'spots';

// Warm up liberty style — buildings too grey at high zoom
// Google Maps uses very light buildings that blend with background.
// Liberty's building hsl(35,8%,85%) is too dark/grey → override to near-background tone.
function warmUpLiberty() {
  const overrides = [
    ['building', 'fill-color', '#f8f4f0'],
    ['building', 'fill-opacity', 0.2],
    ['building', 'fill-outline-color', 'hsla(35, 10%, 78%, 0.45)'],
    ['building-3d', 'fill-extrusion-color', '#f8f4f0'],
    ['building-3d', 'fill-extrusion-opacity', 0.15],
  ];
  for (const [layer, prop, val] of overrides) {
    try { map.setPaintProperty(layer, prop, val); } catch (_) {}
  }
}

function initMap() {
  const startCity = CITIES[currentCity] || CITIES[DEFAULT_CITY];
  map = new maplibregl.Map({
    container: 'map',
    style: STYLES.light,
    center: startCity.center,
    zoom: startCity.zoom,
    pitch: 0,
    maxPitch: 0,
    attributionControl: false,
  });
  map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
  map.addControl(new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: false,
    showUserLocation: true,
  }), 'bottom-right');

  // 사용자가 커버 도시(120km 이내) 안에 있을 때만 그 위치로 이동.
  // 커버 밖(예: 한국에서 접속)이면 선택된 도시 뷰 유지 — 빈 지도 방지
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const detected = detectCityFromCoords(pos.coords.latitude, pos.coords.longitude);
        if (!detected) return; // outside covered cities — stay put
        if (detected !== currentCity) switchCity(detected, false);
        map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 14 });
      },
      () => { /* denied — stay at saved city default */ },
      { timeout: 5000 }
    );
  }

  hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -20] });

  map.on('load', async () => {
    // Clean up map style: remove 3D buildings + hide POI icons (keep text labels)
    for (const layer of map.getStyle().layers) {
      // Buildings: leave as-is — maxPitch:0 keeps them flat naturally
      // POI layers: hide icons but keep text labels visible
      if (layer.id.startsWith('poi') && layer.type === 'symbol') {
        try {
          map.setLayoutProperty(layer.id, 'icon-size', 0);
        } catch (_) {}
      }
    }

    // Suppress missing sprite image warnings
    map.on('styleimagemissing', (e) => {
      if (!map.hasImage(e.id)) {
        map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
      }
    });

    // Warm dark map tones (only when dark mode active)
    if (isDark) {
      try { map.setPaintProperty('background', 'background-color', '#14110E'); } catch(_) {}
      try { map.setPaintProperty('land', 'background-color', '#1A1612'); } catch(_) {}
    } else {
      warmUpLiberty();
    }

    await loadData();
    addSpotsLayer();
    pushFeatures();
    updateStats();
    setupFilters();
    initCitySwitcher();
    if (typeof attachViewRank === 'function') attachViewRank();

    // Re-apply filters on zoom change (density filtering uses zoom level)
    map.on('zoomend', () => { applyFilters(); updateStats(); });
    checkAuth();
    buildTicker();
    initRankingPanel();
    initSearchAreaButton();
    // Court — load in background (don't block map)
    buildCourtPanel();
    // Render mascot in logo if sprites are available
    if (typeof window.renderMascot === 'function') {
      const mascotEl = document.getElementById('logoMascot');
      if (mascotEl) mascotEl.innerHTML = window.renderMascot(2);
    }
    // Render sprites in panel titles + toggle buttons
    if (typeof window.renderSprite === 'function') {
      const tableIcon = document.getElementById('tableTitleIcon');
      if (tableIcon) tableIcon.innerHTML = window.renderSprite('throne', 1.5);
      const courtIcon = document.getElementById('courtTitleIcon');
      if (courtIcon) courtIcon.innerHTML = window.renderSprite('gavel', 1.5);
    } else {
      console.warn('renderSprite not available — sprites.js may not have loaded');
    }
    // Hide loading screen
    document.getElementById('loading')?.classList.add('is-hidden');
    // First visit welcome modal
    showFirstVisitWelcome();
  });

  map.on('click', (e) => {
    if (!map.getLayer('spots-circle')) return;
    const hits = map.queryRenderedFeatures({ geometry: e.point, layers: ['spots-circle'] });
    if (hits.length === 0) {
      closeDetail();
      if (typeof _miniPopup !== 'undefined' && _miniPopup) {
        _miniPopup.remove();
        _miniPopup = null;
      }
    }
  });
}

// ═══════════════════════════════════
// DATA
// ═══════════════════════════════════
async function loadData() {
  // 읽기 경로: Supabase 실시간 쿼리 대신, GitHub Action이 주기적으로 구워내는
  // 정적 스냅샷(/data/api/v1/spots/<city>.json)을 fetch한다.
  // - 도시별로 파일이 나뉘어 있어서 지금 보고 있는 도시 데이터만 받아온다
  //   (예전엔 전체 도시를 다 받아와서 클라이언트에서 필터링했음 — egress 낭비였음).
  // - 쓰기(제출/검증/Judge 투표)는 이 함수와 무관하게 그대로 Supabase에 직접 쓴다.
  //   바뀐 건 "지도 로딩" 뿐이다.
  // - _legit/_cap 필드는 스냅샷 빌드 시점에 이미 집계되어 들어있다
  //   (build/generate-static.mjs의 buildMapSnapshot 참고).
  try {
    const res = await fetch(`/data/api/v1/spots/${encodeURIComponent(currentCity)}.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`snapshot fetch failed: ${res.status}`);
    const json = await res.json();
    allRestaurants = json.spots || [];
  } catch (e) {
    // Non-fatal — 지도가 비어 보일 뿐, 앱이 죽지는 않음
    console.log('Spot snapshot load failed:', e.message);
    allRestaurants = [];
  }

  console.log('Loaded', allRestaurants.length, 'spots (static snapshot)');
}

// ═══════════════════════════════════
// THEME
// ═══════════════════════════════════
function toggleTheme() {
  isDark = !isDark;
  map.setStyle(isDark ? STYLES.dark : STYLES.light);
  document.body.classList.toggle('light', !isDark);
  document.getElementById('themeBtn').textContent = isDark ? '☀️' : '🌙';

  map.once('style.load', async () => {
    if (!isDark) warmUpLiberty();
    await addSpotsLayer();
    pushFeatures();
  });
}

// ═══════════════════════════════════
// SEARCH THIS AREA
// ═══════════════════════════════════
function searchThisArea() {
  const bounds = map.getBounds();
  const filtered = allRestaurants.filter(r => {
    return r.lat >= bounds.getSouth() && r.lat <= bounds.getNorth()
        && r.lng >= bounds.getWest()  && r.lng <= bounds.getEast();
  });
  pushFeatures(filtered);
  updateStats();
  const btn = document.getElementById('searchAreaBtn');
  if (btn) btn.style.display = 'none';
  showToast(`${filtered.length} spots in this area`);
}

// ═══════════════════════════════════
// STATS
// ═══════════════════════════════════
// ═══════════════════════════════════
// CITY SWITCHER — 도시 옮겨다니기
// ═══════════════════════════════════
function initCitySwitcher() {
  const menu = document.getElementById('cityMenu');
  if (menu) {
    menu.innerHTML = Object.entries(CITIES).map(([key, c]) =>
      `<button type="button" class="city-menu__item ${key === currentCity ? 'is-active' : ''}"
               onclick="switchCity('${key}')">${c.emoji} ${c.label}</button>`
    ).join('');
  }
  updateCityLabel();
  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.city-switch-wrap')) {
      const m = document.getElementById('cityMenu');
      if (m) m.style.display = 'none';
    }
  });
}

function toggleCityMenu() {
  const m = document.getElementById('cityMenu');
  if (m) m.style.display = m.style.display === 'none' ? '' : 'none';
}

function updateCityLabel() {
  const c = CITIES[currentCity];
  const label = document.getElementById('citySwitchLabel');
  if (label && c) label.textContent = `${c.emoji} ${c.short}`;
  const feedSub = document.querySelector('.feed-panel-subtitle');
  if (feedSub && c) feedSub.textContent = `Recent community activity across ${c.short}`;
  document.querySelectorAll('.city-menu__item').forEach(b => {
    b.classList.toggle('is-active', b.textContent.includes(c.label));
  });
}

async function switchCity(key, fly = true) {
  if (!CITIES[key]) return;
  const m = document.getElementById('cityMenu');
  if (m) m.style.display = 'none';
  if (key === currentCity) return;
  currentCity = key;
  try { localStorage.setItem('bn_city', key); } catch {}
  updateCityLabel();
  await loadData();
  pushFeatures();
  updateStats();
  if (typeof buildTicker === 'function') try { buildTicker(); } catch {}
  if (fly && map) {
    const c = CITIES[key];
    map.flyTo({ center: c.center, zoom: c.zoom, duration: 3000, essential: true });
  }
}
window.switchCity = switchCity;
window.toggleCityMenu = toggleCityMenu;

function updateStats() {
  const f = getFiltered();
  const badge = document.getElementById('statsBadge');
  if (!allRestaurants || allRestaurants.length === 0) {
    badge.innerHTML = `<span style="color:#888">Loading spots…</span>`;
    return;
  }
  if (f.length === 0) {
    if (maxPrice < 14 || activeGrade !== 'all') {
      badge.innerHTML = `<span style="color:#EF4444">0 spots</span> — try raising the price`;
    } else if (searchTerm) {
      badge.innerHTML = `<span style="color:#EF4444">0 spots</span> match "${escapeHtml(searchTerm)}"`;
    } else {
      badge.innerHTML = `<span style="color:#EF4444">0 spots</span> in view — zoom out or pan`;
    }
    return;
  }
  const avg = f.reduce((s, r) => s + Number(r.cheapest_price), 0) / f.length;
  badge.innerHTML = `<strong>${f.length}</strong> spots · avg <strong>$${avg.toFixed(1)}</strong>`;
}
