// ═══════════════════════════════════
// SPOTS LAYER — Pill 마커 (거지맵 스타일)
// ═══════════════════════════════════
// Canvas API로 per-restaurant pill 이미지 동적 생성.
// 가격이 pill 안에 들어가므로 spots-price 레이어 불필요.
// 체인: 약어 라벨 (CH, SG 등), 마트: 🛒+이름약어

// Canvas pill generator — returns { canvas, width, height }
const _pillCache = {};
const DPR = 2; // retina

function makePillMarker(label, bgColor, borderColor, textColor, dotColor, borderWidth) {
  const cacheKey = `${label}|${dotColor || borderColor}|${borderWidth || 1}`;
  if (_pillCache[cacheKey]) return _pillCache[cacheKey];

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const h = 26 * DPR;
  const dotR = 5 * DPR;
  const dotPadL = 8 * DPR;
  const dotTextGap = 6 * DPR;
  const padR = 9 * DPR;
  const cornerR = h / 2;
  const bw = (borderWidth || 1) * DPR;

  ctx.font = `800 ${13 * DPR}px Inter, -apple-system, sans-serif`;
  const textWidth = ctx.measureText(label).width;
  const w = dotPadL + dotR + dotTextGap + textWidth + padR;

  canvas.width = w + 4 * DPR;
  canvas.height = h + 6 * DPR;
  const ox = 2 * DPR, oy = 2 * DPR;

  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 5 * DPR;
  ctx.shadowOffsetY = 2 * DPR;

  ctx.beginPath();
  ctx.roundRect(ox, oy, w, h, cornerR);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = borderColor || 'rgba(0,0,0,0.10)';
  ctx.lineWidth = bw;
  ctx.stroke();

  const dotX = ox + dotPadL, dotY = oy + h / 2;
  ctx.beginPath();
  ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
  ctx.fillStyle = dotColor || borderColor;
  ctx.fill();

  ctx.font = `800 ${13 * DPR}px Inter, -apple-system, sans-serif`;
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, ox + dotPadL + dotR + dotTextGap, oy + h / 2 + 0.5 * DPR);

  const tailSize = 5 * DPR, tailX = ox + w / 2, tailY = oy + h;
  ctx.beginPath();
  ctx.moveTo(tailX - tailSize, tailY);
  ctx.lineTo(tailX + tailSize, tailY);
  ctx.lineTo(tailX, tailY + tailSize);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  const result = { canvas, width: canvas.width, height: canvas.height };
  _pillCache[cacheKey] = result;
  return result;
}

function makeDotMarker(dotColor, borderColor, borderWidth) {
  const cacheKey = `dot|${dotColor}|${borderColor}|${borderWidth || 1}`;
  if (_pillCache[cacheKey]) return _pillCache[cacheKey];

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const r = 7 * DPR;
  canvas.width = r * 2 + 6 * DPR;
  canvas.height = r * 2 + 6 * DPR;

  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 3 * DPR;
  ctx.shadowOffsetY = 1 * DPR;

  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, r, 0, Math.PI * 2);
  ctx.fillStyle = dotColor;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = borderColor || '#FFFFFF';
  ctx.lineWidth = (borderWidth || 2) * DPR;
  ctx.stroke();

  const result = { canvas, width: canvas.width, height: canvas.height };
  _pillCache[cacheKey] = result;
  return result;
}

// 가격 중심 미니멀 라벨 — 이름은 호버/탭에서 (Airbnb 패턴)
function getPillLabel(r) {
  const price = Number(r.cheapest_price);
  const priceStr = (price && price > 0)
    ? '$' + price.toFixed(price % 1 === 0 ? 0 : 2)
    : '?';

  // Unverified — 가격 + 물음표
  if (r.status === 'unverified') return priceStr + ' ❓';

  const spotType = r.spot_type || 'spot';
  let label = priceStr;

  // 체인/마트만 타입 표시 (로컬 스팟은 순수 가격)
  if (spotType === 'chain') label = '⛓ ' + label;
  else if (spotType === 'mart') label = '🛒 ' + label;

  // 뷰포트 랭킹 왕관 (refreshViewRank가 r._rank 설정)
  if (r._rank) label = '👑' + r._rank + ' ' + label;

  // Trust stickers
  if (r._legit >= 10) label += ' 🔥';
  else if (r._cap >= 3 && r._cap > (r._legit || 0)) label += ' ⚠️';
  return label;
}

function getPillColors(r) {
  // Unverified — gray
  if (r.status === 'unverified') {
    return { bg: '#F5F5F5', border: 'rgba(0,0,0,0.08)', borderWidth: 1, text: '#999999', dot: '#9CA3AF' };
  }

  const grade = getGrade(r.cheapest_price);
  const legit = r._legit || 0;
  const cap = r._cap || 0;
  const isDisputed = cap >= 3 && cap > legit;

  // Disputed: dot = grade color (preserved), border = orange
  if (isDisputed) {
    return { bg: '#FFFFFF', border: '#F97316', borderWidth: 2, text: '#111111', dot: grade.color };
  }

  // 뷰포트 TOP 3 — 골드 강조
  if (r._rank) {
    return { bg: '#FFF8E0', border: '#B8860B', borderWidth: 2, text: '#111111', dot: grade.color };
  }

  // All types: dot = price grade color only
  return { bg: '#FFFFFF', border: 'rgba(0,0,0,0.10)', borderWidth: 1, text: '#111111', dot: grade.color };
}

// Register all pill images for current restaurants
// Canvas → toDataURL → Image → map.addImage (가장 안정적)
let _lastZoomTier = -1;

function getZoomTier(zoom) {
  if (zoom <= 11) return 1;
  if (zoom < 14) return 2;
  return 3;
}

// 아이콘 id는 랭크 변형 포함 (pill-12-r0 / pill-12-r1 ...)
function pillIconId(r) {
  return 'pill-' + r.id + '-r' + (r._rank || 0);
}

function registerPillIcons() {
  const promises = [];

  for (const r of allRestaurants) {
    const pillId = pillIconId(r);
    if (map.hasImage(pillId)) continue;

    const colors = getPillColors(r);
    const label = getPillLabel(r);
    const pillObj = makePillMarker(label, colors.bg, colors.border, colors.text, colors.dot, colors.borderWidth);

    promises.push(new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { if (!map.hasImage(pillId)) map.addImage(pillId, img, { pixelRatio: DPR }); resolve(); };
      img.onerror = () => resolve();
      img.src = pillObj.canvas.toDataURL();
    }));
  }
  return Promise.all(promises);
}

async function addSpotsLayer() {
  map.addSource(SPOTS_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // Pill 마커 (단일 레이어 — 가격이 이미지 안에 통합)
  map.addLayer({
    id: 'spots-circle',
    type: 'symbol',
    source: SPOTS_SOURCE,
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': 1,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-anchor': 'center',
      'icon-padding': 0,
    },
  });

  attachSpotEvents();
}

// Active mini popup instance
let _miniPopup = null;

function attachSpotEvents() {
  map.on('click', 'spots-circle', (e) => {
    if (!e.features || !e.features.length) return;
    const id = e.features[0].properties.id;
    const r = allRestaurants.find(x => String(x.id) === String(id));
    if (!r) return;
    map.flyTo({ center: [r.lng, r.lat], zoom: Math.max(map.getZoom(), 15) });
    showDetail(r);
  });

  const isTouch = window.matchMedia('(hover: none)').matches;
  map.on('mouseenter', 'spots-circle', (e) => {
    map.getCanvas().style.cursor = 'pointer';
    if (isTouch || !e.features?.length) return;
    const f = e.features[0];
    hoverPopup
      .setLngLat(f.geometry.coordinates)
      .setHTML(`<b>${f.properties.name}</b><br>${f.properties.cheapestMenuName || ''}`)
      .addTo(map);
  });
  map.on('mouseleave', 'spots-circle', () => {
    map.getCanvas().style.cursor = '';
    hoverPopup.remove();
  });
}

// ═══════════════════════════════════
// MINI POPUP
// ═══════════════════════════════════
async function showMiniPopup(r, lngLat) {
  // Remove any existing mini popup
  if (_miniPopup) { _miniPopup.remove(); _miniPopup = null; }

  const cheapestPrice = r.cheapest_price != null ? Number(r.cheapest_price) : null;
  const priceStr = cheapestPrice != null ? `$${cheapestPrice.toFixed(cheapestPrice % 1 === 0 ? 0 : 2)}` : '?';
  const grade = cheapestPrice != null ? getGrade(cheapestPrice) : { label: 'Unknown', key: 'unknown' };
  const emoji = CAT[r.category] || '🍽️';
  const catLabel = r.category ? r.category.charAt(0).toUpperCase() + r.category.slice(1) : 'Other';

  // Show popup immediately with placeholder counts, then update after query
  const popupId = `mini-popup-${r.id}`;

  function buildHtml(legit, cap, menuItemId, showCapInput) {
    const capInputHtml = showCapInput
      ? `<div class="mini-cap-input-wrap" id="miniCapInputWrap-${r.id}">
           <input class="mini-cap-input" id="miniCapInput-${r.id}" type="number" step="0.01" min="0" placeholder="Actual price">
           <button class="mini-cap-submit-btn" onclick="miniCapSubmit(${menuItemId}, '${r.id}')">Cap it</button>
         </div>`
      : '';
    return `
      <div class="mini-popup" id="${popupId}">
        <div class="mini-popup-header">
          <span class="mini-popup-name">${escapeHtml(r.name)}</span>
          <span class="mini-popup-price">${priceStr}</span>
        </div>
        <div class="mini-popup-meta">
          ${emoji} ${catLabel} · <span class="mini-popup-grade grade-${grade.key}">${grade.label}</span>
        </div>
        <div class="mini-popup-counts">
          🔥 <span id="miniLegitCount-${r.id}">${legit}</span> &nbsp; 💀 <span id="miniCapCount-${r.id}">${cap}</span>
        </div>
        ${capInputHtml}
        <div class="mini-popup-actions">
          <button class="mini-legit-btn" id="miniLegitBtn-${r.id}" onclick="miniLegit('${r.id}')" ${menuItemId ? '' : 'disabled'}>🔥 Legit!</button>
          <button class="mini-cap-btn" id="miniCapBtn-${r.id}" onclick="miniCapToggle('${r.id}')" ${menuItemId ? '' : 'disabled'}>💀 Cap</button>
          <button class="mini-more-btn" onclick="miniMore('${r.id}')">▸ More</button>
        </div>
      </div>`;
  }

  // Initial render with cached counts
  _miniPopup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    offset: [0, -12],
    className: 'mini-popup-container',
    maxWidth: 'none',
  })
    .setLngLat(lngLat)
    .setHTML(buildHtml(r._legit || 0, r._cap || 0, r.cheapest_menu_id || null, false))
    .addTo(map);

  _miniPopup.on('close', () => { _miniPopup = null; });

  // Attach restaurant data to popup for later use
  _miniPopup._restaurantData = r;

  // Fetch live counts for cheapest menu item
  try {
    const { data } = await sb
      .from('menu_items')
      .select('id, legit_count, cap_count')
      .eq('restaurant_id', r.id)
      .eq('off_code', false)
      .order('price')
      .limit(1);

    if (data && data.length > 0 && _miniPopup) {
      const item = data[0];
      _miniPopup._menuItemId = item.id;

      // Update counts in DOM if popup still open
      const legitEl = document.getElementById(`miniLegitCount-${r.id}`);
      const capEl   = document.getElementById(`miniCapCount-${r.id}`);
      if (legitEl) legitEl.textContent = item.legit_count || 0;
      if (capEl)   capEl.textContent   = item.cap_count   || 0;

      // Enable buttons now that menu item is loaded
      const legitBtn = document.getElementById(`miniLegitBtn-${r.id}`);
      const capBtn   = document.getElementById(`miniCapBtn-${r.id}`);
      if (legitBtn) legitBtn.disabled = false;
      if (capBtn)   capBtn.disabled = false;
    }
  } catch (e) {
    // Non-fatal
  }
}

// Called by 🔥 Legit button in mini popup
async function miniLegit(restaurantId) {
  if (!_miniPopup) return;
  const menuItemId = _miniPopup._menuItemId;
  if (!menuItemId) { showToast('Loading menu data...'); return; }

  try {
    const { error } = await castVerification(menuItemId, 'legit', null);
    if (error) throw error;
    showToast('🔥 Marked legit!');
    _miniRefreshCounts(restaurantId, menuItemId);
  } catch (e) {
    showToast('Already voted from this device');
  }
}

// Toggle the cap price input inside the popup
function miniCapToggle(restaurantId) {
  const wrap = document.getElementById(`miniCapInputWrap-${restaurantId}`);
  if (wrap) {
    wrap.remove();
    return;
  }
  // Inject cap input row before actions
  const actions = document.querySelector(`#mini-popup-${restaurantId} .mini-popup-actions`);
  if (!actions) return;
  const div = document.createElement('div');
  div.className = 'mini-cap-input-wrap';
  div.id = `miniCapInputWrap-${restaurantId}`;
  const menuItemId = _miniPopup ? _miniPopup._menuItemId : null;
  div.innerHTML = `
    <input class="mini-cap-input" id="miniCapInput-${restaurantId}" type="number" step="0.01" min="0" placeholder="Actual price ($)">
    <button class="mini-cap-submit-btn" onclick="miniCapSubmit(${menuItemId}, '${restaurantId}')">Cap it</button>
  `;
  actions.insertAdjacentElement('beforebegin', div);
  document.getElementById(`miniCapInput-${restaurantId}`)?.focus();
}

// Submit cap with reported price
async function miniCapSubmit(menuItemId, restaurantId) {
  const input = document.getElementById(`miniCapInput-${restaurantId}`);
  if (!input) return;
  const price = parseFloat(input.value);
  if (isNaN(price) || price <= 0) { showToast('Enter a valid price'); return; }

  try {
    const { error } = await castVerification(menuItemId, 'cap', price);
    if (error) throw error;
    showToast(`💀 Capped at $${price.toFixed(2)}`);
    // Remove input row
    document.getElementById(`miniCapInputWrap-${restaurantId}`)?.remove();
    _miniRefreshCounts(restaurantId, menuItemId);
  } catch (e) {
    showToast('Failed to submit');
  }
}

// Refresh legit/cap counts in the open mini popup
async function _miniRefreshCounts(restaurantId, menuItemId) {
  try {
    const { data } = await sb
      .from('menu_items')
      .select('legit_count, cap_count')
      .eq('id', menuItemId)
      .single();
    if (data) {
      const legitEl = document.getElementById(`miniLegitCount-${restaurantId}`);
      const capEl   = document.getElementById(`miniCapCount-${restaurantId}`);
      if (legitEl) legitEl.textContent = data.legit_count || 0;
      if (capEl)   capEl.textContent   = data.cap_count   || 0;
    }
  } catch (e) { /* non-fatal */ }
}

// More button — open full detail card and close popup
function miniMore(restaurantId) {
  const r = allRestaurants.find(x => String(x.id) === String(restaurantId));
  if (_miniPopup) { _miniPopup.remove(); _miniPopup = null; }
  if (r) showDetail(r);
}

// ═══════════════════════════════════
// MARKERS / FEATURES
// ═══════════════════════════════════
async function pushFeatures() {
  const src = map.getSource(SPOTS_SOURCE);
  if (!src) {
    console.warn('pushFeatures: spots source not ready yet');
    return;
  }

  await registerPillIcons();

  const features = allRestaurants
    .filter(r => Number.isFinite(r.lng) && Number.isFinite(r.lat))
    .map(r => {
      const cheapestPrice = Number(r.cheapest_price) || 0;
      const category = (r.category && CAT[r.category]) ? r.category : 'other';
      const spotType = r.spot_type || 'spot';
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
        properties: {
          id: String(r.id),
          icon: pillIconId(r),
          name: r.name,
          cheapestMenuName: r.cheapest_menu_name || '',
          cheapestPrice,
          category,
          spotType,
          gradeKey: r.marker_grade || 'unknown',
          isChain: spotType === 'chain' ? 1 : 0,
          isGrocery: spotType === 'mart' ? 1 : 0,
          status: r.status || 'approved',
        },
      };
    });

  src.setData({ type: 'FeatureCollection', features });
  console.log(`🟢 ${features.length} features pushed to '${SPOTS_SOURCE}'`);
  applyFilters();
}
