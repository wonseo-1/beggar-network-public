// ═══════════════════════════════════
// VIEWPORT RANKING — 👑 지금 보이는 화면의 TOP 5
// 지도를 움직이면 갱신. TOP 3 마커에는 왕관 뱃지.
// ═══════════════════════════════════

// 기본 = 닫힘(칩만). 지도가 주인공, 랭킹은 누르면 뜬다.
let _viewRankOpen = false;
let _viewRankTop = [];

// 현재 뷰포트 안 approved 스팟을 가격순 정렬, r._rank(1~3) 부여
function computeViewportRanks() {
  if (!map) return [];
  let bounds;
  try { bounds = map.getBounds(); } catch { return []; }

  const visible = getFiltered().filter(r =>
    r.status === 'approved' &&
    Number(r.cheapest_price) > 0 &&
    Number.isFinite(r.lat) && Number.isFinite(r.lng) &&
    bounds.contains([r.lng, r.lat])
  );
  visible.sort((a, b) =>
    (Number(a.cheapest_price) - Number(b.cheapest_price)) ||
    ((b._legit || 0) - (a._legit || 0))
  );

  const rankById = {};
  visible.slice(0, 3).forEach((r, i) => { rankById[r.id] = i + 1; });

  let changed = false;
  for (const r of allRestaurants) {
    const nr = rankById[r.id] || 0;
    if ((r._rank || 0) !== nr) { r._rank = nr || undefined; changed = true; }
  }
  return { visible, changed };
}

let _viewRankTimer = null;
function refreshViewRank() {
  clearTimeout(_viewRankTimer);
  _viewRankTimer = setTimeout(async () => {
    const result = computeViewportRanks();
    if (!result || !result.visible) return;
    if (result.changed) await pushFeatures(); // 왕관 마커 갱신
    renderViewRankPanel(result.visible.slice(0, 5));
  }, 250);
}

function renderViewRankPanel(top) {
  const el = document.getElementById('viewRank');
  if (!el) return;
  _viewRankTop = top || [];
  el.style.display = '';

  // 닫힘 — 작은 칩만 (지도를 가리지 않음)
  if (!_viewRankOpen) {
    el.className = 'viewrank is-chip';
    el.innerHTML = `
      <button type="button" class="viewrank-chip" onclick="toggleViewRank()">
        👑 Top 5
      </button>`;
    return;
  }

  // 열림 — 랭킹 카드
  el.className = 'viewrank is-open';
  const head = `
    <button type="button" class="viewrank__head" onclick="toggleViewRank()">
      <span>👑 Cheapest in view</span>
      <span class="viewrank__close">✕</span>
    </button>`;

  if (_viewRankTop.length === 0) {
    el.innerHTML = head + `
      <div class="viewrank__empty">
        <p>No spots around here yet.</p>
        <div class="viewrank__cities">
          ${Object.entries(CITIES).map(([key, c]) =>
            `<button type="button" class="viewrank__citybtn" onclick="switchCity('${key}')">${c.emoji} ${c.short}</button>`
          ).join('')}
        </div>
      </div>`;
    return;
  }

  el.innerHTML = head + `
    <div class="viewrank__list">
      ${_viewRankTop.map((r, i) => {
        const price = Number(r.cheapest_price);
        const priceStr = '$' + price.toFixed(price % 1 === 0 ? 0 : 2);
        const grade = getGrade(price);
        return `
          <button type="button" class="viewrank__row" onclick="viewRankGo('${r.id}')">
            <span class="viewrank__rank ${i < 3 ? 'is-crown' : ''}">${i < 3 ? '👑' : ''}${i + 1}</span>
            <span class="viewrank__info">
              <strong>${escapeHtml(r.name)}</strong>
              <em>${escapeHtml(r.cheapest_menu_name || '')}</em>
            </span>
            <span class="viewrank__price" style="color:${grade.color}">${priceStr}</span>
          </button>`;
      }).join('')}
    </div>`;
}

function toggleViewRank() {
  _viewRankOpen = !_viewRankOpen;
  renderViewRankPanel(_viewRankTop);
}

function viewRankGo(id) {
  const r = allRestaurants.find(x => String(x.id) === String(id));
  if (!r) return;
  // 선택하면 패널 닫고 지도로 (지도가 주인공)
  _viewRankOpen = false;
  renderViewRankPanel(_viewRankTop);
  map.flyTo({ center: [r.lng, r.lat], zoom: Math.max(map.getZoom(), 15) });
  if (typeof showMiniPopup === 'function') showMiniPopup(r, [r.lng, r.lat]);
}

// map.js의 map.on('load')에서 호출
function attachViewRank() {
  map.on('moveend', refreshViewRank);
  refreshViewRank();
}

window.toggleViewRank = toggleViewRank;
window.viewRankGo = viewRankGo;
