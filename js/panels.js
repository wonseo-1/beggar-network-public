// ═══════════════════════════════════
// TICKER BAR — intel + motto + UI guide
// ═══════════════════════════════════
const TICKER_INTEL = [
  // Motto (brand voice)
  { icon: 'coin',      text: "<strong>$14</strong> is the code. No menu over it. No exceptions." },
  { icon: 'flame',     text: "Eat like a beggar. Live like a king." },
  { icon: 'crown',     text: "Curated by hungry locals." },

  // UI guide (how to use the network)
  { icon: 'throne',    text: "<strong>Table</strong> — the cheapest spots, ranked." },
  { icon: 'gavel',     text: "<strong>Judge</strong> — call out the price liars." },
  { icon: 'magnifier', text: "<strong>Help Verify</strong> — confirm a price, earn cred." },
  { icon: 'plus',      text: "<strong>+ Submit</strong> a spot — paste a Google Maps link." },

  // Color legend (price tiers)
  { icon: 'star',      text: "<span class='ticker-tier ticker-tier--legend'>≤$4</span> Street Legend · <span class='ticker-tier ticker-tier--solid'>≤$8</span> Solid · <span class='ticker-tier ticker-tier--fair'>≤$11</span> Fair · <span class='ticker-tier ticker-tier--border'>≤$14</span> Borderline" },

  // Action hints
  { icon: 'eye',       text: "Tap any marker — see the cheapest item there." },
  { icon: 'flag',      text: "Drag the map → 'Show spots in this view' appears." },
];

function buildTicker() {
  const track = document.getElementById('tickerTrack');
  if (!track) return;

  // Duplicate items so the seamless loop works
  const items = [...TICKER_INTEL, ...TICKER_INTEL];

  track.innerHTML = items.map(item => {
    const iconHtml = item.icon
      ? `<img class="ticker-item__icon" src="assets/${item.icon}.svg" width="14" height="14" alt="">`
      : '';
    return `<span class="ticker-item">${iconHtml}<span class="ticker-item__text">${item.text}</span></span><span class="ticker-sep">•</span>`;
  }).join('');
}

// ═══════════════════════════════════
// RANKING PANEL
// ═══════════════════════════════════
function buildRankingPanel() {
  if (!allRestaurants.length) return;

  // Filter approved with real price, sort by price
  const approved = [...allRestaurants]
    .filter(r => r.status === 'approved' && Number(r.cheapest_price) > 0)
    .sort((a, b) => Number(a.cheapest_price) - Number(b.cheapest_price));

  // Group by brand_id — chains AND marts show once with location count
  const seen = new Map(); // brand_id → { rep, count, locations[] }
  const deduped = [];
  for (const r of approved) {
    const bid = r.brand_id;
    const isBrand = (r.spot_type === 'chain' || r.spot_type === 'mart') && bid;
    if (isBrand) {
      if (seen.has(bid)) {
        seen.get(bid).count++;
        seen.get(bid).locations.push(r);
      } else {
        const entry = { rep: r, count: 1, locations: [r] };
        seen.set(bid, entry);
        deduped.push(entry);
      }
    } else {
      deduped.push({ rep: r, count: 1, locations: [r] });
    }
  }

  const top = deduped.slice(0, 100);
  document.getElementById('rankingCount').textContent = `${top.length} verified spots · cheapest first`;

  const html = top.map((entry, i) => {
    const r = entry.rep;
    const grade = getGrade(Number(r.cheapest_price));
    const spotType = getSpotType(r);
    const typeEmoji = TYPE_EMOJI[spotType] || '🍽️';
    const priceStr = `$${Number(r.cheapest_price).toFixed(Number(r.cheapest_price) % 1 === 0 ? 0 : 2)}`;
    const menuSnippet = r.cheapest_menu_name ? escapeHtml(r.cheapest_menu_name) : '';
    const displayName = r.brand_name && entry.count > 1
      ? escapeHtml(r.brand_name)
      : escapeHtml(r.name);
    const locBadge = entry.count > 1
      ? `<span class="ranking-loc-count">${entry.count} loc</span>`
      : '';
    const subtitle = locBadge
      ? `${locBadge} ${menuSnippet ? `· ${menuSnippet}` : ''}`
      : menuSnippet;
    const clickAction = entry.count > 1
      ? `showBrandLocations(${r.brand_id})`
      : `focusRankingSpot('${r.id}')`;
    return `<div class="ranking-row" onclick="${clickAction}">
      <span class="ranking-rank">${i + 1}</span>
      <span class="ranking-emoji">${typeEmoji}</span>
      <div class="ranking-info">
        <div class="ranking-name">${displayName}</div>
        ${subtitle ? `<div class="ranking-menu">${subtitle}</div>` : ''}
      </div>
      <div class="ranking-right">
        <span class="ranking-price">${priceStr}</span>
        <span class="ranking-badge ${grade.key}">${grade.label}</span>
      </div>
    </div>`;
  }).join('');

  document.getElementById('rankingList').innerHTML = html;
}

function showBrandLocations(brandId) {
  const locations = allRestaurants.filter(r => r.brand_id === brandId && r.status === 'approved');
  if (locations.length === 0) return;
  if (locations.length === 1) { focusRankingSpot(locations[0].id); return; }

  // Sort by distance from map center
  const center = map.getCenter();
  const dist = (r) => Math.sqrt(Math.pow(r.lat - center.lat, 2) + Math.pow(r.lng - center.lng, 2));
  locations.sort((a, b) => dist(a) - dist(b));

  const brandName = locations[0].brand_name || locations[0].name;
  const html = `
    <div class="ranking-brand-header">
      <button class="ranking-back-btn" onclick="buildRankingPanel()">← Back</button>
      <span>${escapeHtml(brandName)} · ${locations.length} locations</span>
    </div>
    ${locations.map((r, i) => {
      const d = dist(r);
      return `<div class="ranking-row" onclick="focusRankingSpot('${r.id}')">
        <span class="ranking-rank">${i + 1}</span>
        <span class="ranking-emoji">📍</span>
        <div class="ranking-info">
          <div class="ranking-name">${escapeHtml(r.name)}</div>
          <div class="ranking-menu">${escapeHtml(r.address || '')}</div>
        </div>
      </div>`;
    }).join('')}
  `;
  document.getElementById('rankingList').innerHTML = html;
}

function focusRankingSpot(id) {
  const r = allRestaurants.find(x => String(x.id) === String(id));
  if (!r || !Number.isFinite(r.lng) || !Number.isFinite(r.lat)) return;
  map.flyTo({ center: [r.lng, r.lat], zoom: Math.max(map.getZoom(), 15) });
  showDetail(r);

  // On mobile close the panel after selecting
  if (window.innerWidth < 768) {
    toggleRankingPanel();
  }
}

// Open by default on desktop after data loads
function initRankingPanel() {
  buildRankingPanel();
  // Closed by default on all viewports
}

// ═══════════════════════════════════
// VERIFY QUEUE
// ═══════════════════════════════════
async function openVerifyQueue() {
  document.getElementById('verifyPanel').classList.add('show');
  const list = document.getElementById('verifyQueueList');
  list.innerHTML = '<div class="verify-queue-empty">Loading...</div>';

  try {
    const { data, error } = await sb
      .from('the_court_queue')
      .select('id, name, price, category, restaurant_id, restaurant_name, restaurant_address')
      .limit(30);

    if (error) throw error;

    if (!data || data.length === 0) {
      list.innerHTML = '<div class="verify-queue-empty">No items need verification right now. You\'re amazing! 🎉</div>';
      return;
    }

    list.innerHTML = data.map(r => {
      const emoji = CAT[r.category] || '🍽️';
      return `<div class="verify-queue-item" onclick="focusVerifySpot('${r.restaurant_id}')">
        <div class="verify-item-info">
          <div class="verify-item-name">${escapeHtml(r.restaurant_name || r.name)}</div>
          <div class="verify-item-sub">${emoji} ${escapeHtml(r.name || '')}</div>
        </div>
        <div class="verify-item-price">$${Number(r.price).toFixed(2)}</div>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = '<div class="verify-queue-empty">Could not load queue.</div>';
  }
}

function closeVerifyQueue() {
  document.getElementById('verifyPanel').classList.remove('show');
}

function focusVerifySpot(id) {
  closeVerifyQueue();
  // Try to find in active restaurants first, fall back to full list
  let r = allRestaurants.find(x => String(x.id) === String(id));
  if (r && Number.isFinite(r.lng) && Number.isFinite(r.lat)) {
    map.flyTo({ center: [r.lng, r.lat], zoom: Math.max(map.getZoom(), 15) });
    showDetail(r);
  } else {
    // Load just that restaurant from DB
    sb.from('restaurants_with_cheapest').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      if (data && Number.isFinite(data.lng) && Number.isFinite(data.lat)) {
        map.flyTo({ center: [data.lng, data.lat], zoom: 15 });
        showDetail(data);
      }
    });
  }
}

// ═══════════════════════════════════
// THE COURT PANEL
// ═══════════════════════════════════
async function buildCourtPanel() {
  const queueEl = document.getElementById('courtQueue');
  const verdictsEl = document.getElementById('courtVerdicts');
  const subtitleEl = document.getElementById('courtSubtitle');

  queueEl.innerHTML = '<div class="court-empty">Loading...</div>';
  verdictsEl.innerHTML = '<div class="court-empty">Loading...</div>';

  // Query menu items needing verification via the_court_queue VIEW
  try {
    const { data: spots } = await sb
      .from('the_court_queue')
      .select('id, name, price, category, restaurant_name, restaurant_id')
      .limit(20);

    const list = spots || [];
    subtitleEl.textContent = `${list.length} items need a check`;

    // Update header Judge badge
    const badge = document.getElementById('courtBadge');
    if (badge) {
      if (list.length > 0) {
        badge.textContent = list.length > 99 ? '99+' : String(list.length);
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    }

    if (list.length === 0) {
      queueEl.innerHTML = '<div class="court-empty">All prices are verified! 🎉</div>';
    } else {
      queueEl.innerHTML = list.map(r => {
        const emoji = CAT[r.category] || '🍽️';
        const priceStr = `$${Number(r.price).toFixed(2)}`;
        return `<div class="court-row" id="court-row-${r.id}">
          <div class="court-row-top">
            <span class="court-row-emoji">${emoji}</span>
            <div class="court-row-info">
              <div class="court-row-name">${escapeHtml(r.restaurant_name || '')}</div>
              <div style="font-size:11px;color:#888">${escapeHtml(r.name || '')}</div>
            </div>
            <span class="court-row-price">${priceStr}</span>
          </div>
          <div class="court-row-actions">
            <button class="court-confirm-btn" onclick="courtConfirm('${r.id}', this)">✅ Legit</button>
            <button class="court-wrong-btn" onclick="courtWrongPrice('${r.id}', ${Number(r.price)}, this)">💀 Cap</button>
          </div>
          <div id="court-input-${r.id}" style="display:none">
            <div class="court-price-input-wrap">
              <input class="court-price-input" id="court-price-val-${r.id}" type="number" step="0.01" min="0.01" placeholder="Actual price">
              <button class="court-price-submit" onclick="courtSubmitWrongPrice('${r.id}', ${Number(r.price)})">Submit</button>
            </div>
          </div>
        </div>`;
      }).join('');
    }
  } catch (e) {
    queueEl.innerHTML = '<div class="court-empty">Could not load queue.</div>';
  }

  await loadRecentVerdicts();
}

async function loadRecentVerdicts() {
  const el = document.getElementById('courtVerdicts');
  try {
    const { data } = await sb
      .from('verifications')
      .select('id, verdict, reported_price, created_at, menu_items(name, restaurants(name))')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!data || data.length === 0) {
      el.innerHTML = '<div class="court-empty">No verdicts yet.</div>';
      return;
    }

    el.innerHTML = data.map(v => {
      const menuName = v.menu_items?.name || 'Unknown item';
      const restName = v.menu_items?.restaurants?.name || 'Unknown';
      const ago = timeAgo(v.created_at);
      if (v.verdict === 'legit') {
        return `<div class="court-verdict">
          <span class="court-verdict-icon">✅</span>
          <div class="court-verdict-body">
            <div class="court-verdict-text">${escapeHtml(restName)} · ${escapeHtml(menuName)} — legit</div>
            <div class="court-verdict-meta">${ago}</div>
          </div>
        </div>`;
      } else {
        const newP = v.reported_price != null ? `→ $${Number(v.reported_price).toFixed(2)}` : '';
        return `<div class="court-verdict">
          <span class="court-verdict-icon">💀</span>
          <div class="court-verdict-body">
            <div class="court-verdict-text">${escapeHtml(restName)} · ${escapeHtml(menuName)} ${newP} capped</div>
            <div class="court-verdict-meta">${ago}</div>
          </div>
        </div>`;
      }
    }).join('');
  } catch (e) {
    el.innerHTML = '<div class="court-empty">Could not load verdicts.</div>';
  }
}

async function courtConfirm(menuItemId, btn) {
  btn.disabled = true;
  const wrongBtn = btn.parentElement.querySelector('.court-wrong-btn');
  if (wrongBtn) wrongBtn.disabled = true;

  try {
    const { error } = await castVerification(menuItemId, 'legit', null);
    if (error) throw error;
    await sb.from('contributions').insert({
      menu_item_id: Number(menuItemId),
      user_id: currentUser?.id || null,
      nickname: currentUser ? null : getAnonNickname(),
      type: 'update_info',
      payload: { action: 'legit', source: 'court' },
    }).then(null, () => {});
    showToast('Marked legit! ✅');
    const row = document.getElementById(`court-row-${menuItemId}`);
    if (row) {
      row.style.opacity = '0.4';
      row.style.pointerEvents = 'none';
    }
    await loadRecentVerdicts();
  } catch (e) {
    showToast('Thanks! ✅');
    btn.disabled = false;
    if (wrongBtn) wrongBtn.disabled = false;
  }
}

function courtWrongPrice(restaurantId, currentPrice, btn) {
  const inputWrap = document.getElementById(`court-input-${restaurantId}`);
  if (!inputWrap) return;
  inputWrap.style.display = inputWrap.style.display === 'none' ? 'block' : 'none';
  const inp = document.getElementById(`court-price-val-${restaurantId}`);
  if (inp && inputWrap.style.display !== 'none') inp.focus();
}

async function courtSubmitWrongPrice(menuItemId, currentPrice) {
  const inp = document.getElementById(`court-price-val-${menuItemId}`);
  if (!inp) return;
  const newPrice = parseFloat(inp.value);
  if (isNaN(newPrice) || newPrice <= 0) { showToast('Enter a valid price'); return; }

  try {
    const { error } = await castVerification(menuItemId, 'cap', newPrice);
    if (error) throw error;
    await sb.from('contributions').insert({
      menu_item_id: Number(menuItemId),
      user_id: currentUser?.id || null,
      nickname: currentUser ? null : getAnonNickname(),
      type: 'update_price',
      payload: { action: 'cap', reported_price: newPrice, source: 'court' },
    }).then(null, () => {});
    showToast(`Capped at $${newPrice.toFixed(2)} ✅`);
    const row = document.getElementById(`court-row-${menuItemId}`);
    if (row) {
      row.style.opacity = '0.4';
      row.style.pointerEvents = 'none';
    }
    await loadRecentVerdicts();
  } catch (e) {
    showToast('Report submitted!');
  }
}

// ═══════════════════════════════════
// ACTIVITY FEED PANEL
// ═══════════════════════════════════
function openFeedPanel() {
  document.getElementById('feedOverlay').classList.add('show');
  loadFeedData();
}

function closeFeedPanel() {
  document.getElementById('feedOverlay').classList.remove('show');
}

async function loadFeedData() {
  const listEl = document.getElementById('feedList');
  listEl.innerHTML = '<div class="feed-empty">Loading...</div>';

  try {
    const [reportsRes, newSpotsRes, verifRes] = await Promise.all([
      sb
        .from('reports')
        .select('report_type, created_at, restaurants(name)')
        .order('created_at', { ascending: false })
        .limit(15),
      sb
        .from('restaurants_with_cheapest')
        .select('name, cheapest_price, created_at, status')
        .eq('status', 'approved')
        .gt('cheapest_price', 0)
        .gt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
      sb
        .from('verifications')
        .select('verdict, reported_price, created_at, menu_items(name, restaurants(name))')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const entries = [];

    (reportsRes.data || []).forEach(r => {
      entries.push({
        type: r.report_type,
        name: r.restaurants?.name || 'Unknown',
        created_at: r.created_at,
      });
    });

    (newSpotsRes.data || []).forEach(r => {
      entries.push({
        type: 'new_spot',
        name: r.name,
        price: r.cheapest_price,
        created_at: r.created_at,
      });
    });

    (verifRes.data || []).forEach(v => {
      entries.push({
        type: v.verdict === 'legit' ? 'verified_legit' : 'verified_cap',
        name: v.menu_items?.restaurants?.name || 'Unknown',
        menuName: v.menu_items?.name || '',
        reported_price: v.reported_price,
        created_at: v.created_at,
      });
    });

    entries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    listEl.innerHTML = buildFeedHtml(entries.slice(0, 25));
  } catch (e) {
    listEl.innerHTML = '<div class="feed-empty">Could not load feed.</div>';
  }
}

function buildFeedHtml(entries) {
  if (!entries || entries.length === 0) {
    return '<div class="feed-empty">No activity yet. Be the first!</div>';
  }

  return entries.map(entry => {
    let icon, text;
    const name = escapeHtml(entry.name);
    const ago = timeAgo(entry.created_at);

    if (entry.type === 'new_spot') {
      icon = '🆕';
      text = `<strong>${name}</strong> added — $${Number(entry.price).toFixed(2)}`;
    } else if (entry.type === 'verified_legit') {
      icon = '✅';
      text = `<strong>${name}</strong> · ${escapeHtml(entry.menuName || '')} verified legit`;
    } else if (entry.type === 'verified_cap') {
      const capP = entry.reported_price != null ? ` → $${Number(entry.reported_price).toFixed(2)}` : '';
      icon = '💀';
      text = `<strong>${name}</strong> · ${escapeHtml(entry.menuName || '')} capped${capP}`;
    } else if (entry.type === 'closed') {
      icon = '🚫';
      text = `<strong>${name}</strong> reported as closed`;
    } else {
      icon = '⚠️';
      text = `<strong>${name}</strong> reported: ${entry.type.replace(/_/g, ' ')}`;
    }

    return `<div class="feed-entry">
      <div class="feed-entry-icon">${icon}</div>
      <div class="feed-entry-body">
        <div class="feed-entry-text">${text}</div>
        <div class="feed-entry-meta">${ago}</div>
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════
// SEARCH THIS AREA
// ═══════════════════════════════════
let searchAreaPending = false;
let mapMoved = false;

function initSearchAreaButton() {
  map.on('moveend', () => {
    if (!mapMoved) {
      mapMoved = true;
      return; // ignore first move on load
    }
    showSearchAreaBtn();
  });
  map.on('zoomend', () => {
    if (!mapMoved) return;
    showSearchAreaBtn();
  });
}

function showSearchAreaBtn() {
  const btn = document.getElementById('searchAreaBtn');
  btn.classList.add('visible');
}

function searchThisArea() {
  const bounds = map.getBounds();
  const btn = document.getElementById('searchAreaBtn');
  btn.classList.remove('visible');

  // Filter allRestaurants to current bounds, use their ids in a search filter
  const inBounds = allRestaurants.filter(r => {
    if (!Number.isFinite(r.lng) || !Number.isFinite(r.lat)) return false;
    return bounds.contains([r.lng, r.lat]);
  });

  const matchIds = inBounds.map(r => String(r.id));

  // Apply a temporary bounds filter on top of existing filters
  const term = searchTerm.toLowerCase();
  const conditions = [['<=', ['get', 'cheapestPrice'], maxPrice]];

  // Type filter
  if (activeType === 'mart') {
    conditions.push(['==', ['get', 'isGrocery'], 1]);
  } else if (activeType === 'chain') {
    conditions.push(['==', ['get', 'isChain'], 1]);
    conditions.push(['==', ['get', 'isGrocery'], 0]);
  } else if (activeType === 'spot') {
    conditions.push(['==', ['get', 'isChain'], 0]);
    conditions.push(['==', ['get', 'isGrocery'], 0]);
  }

  // Grade filter
  if (activeGrade === 'legend') {
    conditions.push(['<=', ['get', 'cheapestPrice'], 4]);
  } else if (activeGrade === 'solid') {
    conditions.push(['all', ['>', ['get', 'cheapestPrice'], 4], ['<=', ['get', 'cheapestPrice'], 8]]);
  } else if (activeGrade === 'fair') {
    conditions.push(['all', ['>', ['get', 'cheapestPrice'], 8], ['<=', ['get', 'cheapestPrice'], 11]]);
  } else if (activeGrade === 'border') {
    conditions.push(['all', ['>', ['get', 'cheapestPrice'], 11], ['<=', ['get', 'cheapestPrice'], 14]]);
  }

  if (term) {
    const termIds = allRestaurants
      .filter(r => (r.name || '').toLowerCase().includes(term) || (r.category || '').toLowerCase().includes(term))
      .map(r => String(r.id));
    if (termIds.length === 0) {
      conditions.push(['==', ['get', 'id'], '__none__']);
    } else {
      conditions.push(['in', ['get', 'id'], ['literal', termIds]]);
    }
  }

  if (matchIds.length === 0) {
    conditions.push(['==', ['get', 'id'], '__none__']);
  } else {
    conditions.push(['in', ['get', 'id'], ['literal', matchIds]]);
  }

  const combined = conditions.length === 1 ? conditions[0] : ['all', ...conditions];
  if (map.getLayer('spots-circle')) map.setFilter('spots-circle', combined);

  // Update stats to reflect bounds-filtered count
  const visibleCount = inBounds.length;
  const avg = visibleCount > 0
    ? (inBounds.reduce((s, r) => s + Number(r.cheapest_price), 0) / visibleCount)
    : 0;
  document.getElementById('statsBadge').innerHTML =
    `<strong>${visibleCount}</strong> in view · avg <strong>$${avg.toFixed(1)}</strong>`;

  // Re-show the button on next map move
  map.once('movestart', () => {
    // After user pans again, show button again
    setTimeout(showSearchAreaBtn, 600);
  });
}

// ═══════════════════════════════════
// PANEL TOGGLE (edge handles + mobile tabs)
// ═══════════════════════════════════
(function () {
  'use strict';

  const stage = document.getElementById('stage');
  const panelLeft = document.getElementById('panelLeft');
  const panelRight = document.getElementById('panelRight');
  const handleLeft = document.getElementById('handleLeft');
  const handleRight = document.getElementById('handleRight');
  const mTabTable = document.getElementById('mTabTable');
  const mTabCourt = document.getElementById('mTabCourt');

  if (!stage || !panelLeft || !panelRight) return;

  let tableOpen = false;
  let courtOpen = false;

  function resizeMap() {
    if (typeof map !== 'undefined' && map && typeof map.resize === 'function') {
      window.setTimeout(() => map.resize(), 60);
      window.setTimeout(() => map.resize(), 340);
    }
  }

  function setTableOpen(open) {
    tableOpen = !!open;
    panelLeft.classList.toggle('is-open', tableOpen);
    handleLeft.classList.toggle('is-open', tableOpen);
    if (mTabTable) mTabTable.classList.toggle('is-open', tableOpen);
    stage.dataset.tableOpen = tableOpen ? 'true' : 'false';
    handleLeft.setAttribute('aria-label', tableOpen ? 'Close The Table' : 'Open The Table');
    resizeMap();
  }

  function setCourtOpen(open) {
    courtOpen = !!open;
    panelRight.classList.toggle('is-open', courtOpen);
    handleRight.classList.toggle('is-open', courtOpen);
    if (mTabCourt) mTabCourt.classList.toggle('is-open', courtOpen);
    stage.dataset.courtOpen = courtOpen ? 'true' : 'false';
    handleRight.setAttribute('aria-label', courtOpen ? 'Close The Court' : 'Open The Court');
    resizeMap();
  }

  window.toggleRankingPanel = function () { setTableOpen(!tableOpen); };
  window.toggleCourtPanel = function () { setCourtOpen(!courtOpen); };

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (tableOpen) setTableOpen(false);
    else if (courtOpen) setCourtOpen(false);
  });

  window.clearSearch = window.clearSearch || function () {
    const input = document.getElementById('searchInput');
    if (input) {
      input.value = '';
      if (typeof onSearchInput === 'function') onSearchInput('');
    }
  };

  stage.dataset.tableOpen = 'false';
  stage.dataset.courtOpen = 'false';

  // Hide loading splash
  function hideLoading() {
    const el = document.getElementById('loading');
    if (el && !el.classList.contains('is-hidden')) el.classList.add('is-hidden');
  }
  if (typeof map !== 'undefined' && map && map.on) {
    map.on('load', () => setTimeout(hideLoading, 200));
  }
  setTimeout(hideLoading, 1500);

  window.__panels = { setTableOpen, setCourtOpen };

  // ═══════════════════════════════════
  // APP TAB BAR
  // ═══════════════════════════════════
  window.switchTab = function (tab) {
    // Close any open coming-soon overlay
    if (typeof closeComingSoon === 'function') closeComingSoon();

    // Switch tab content
    document.querySelectorAll('.tab-content').forEach(el => {
      el.style.display = 'none';
      el.classList.remove('is-active');
    });
    const target = document.getElementById('tab-' + tab);
    if (target) {
      target.style.display = '';
      target.classList.add('is-active');
    }

    // Switch tab buttons
    document.querySelectorAll('.app-tab').forEach(t =>
      t.classList.toggle('is-active', t.dataset.tab === tab)
    );

    switch (tab) {
      case 'map':
        setTableOpen(false);
        setCourtOpen(false);
        if (typeof closeDetail === 'function') closeDetail();
        // Resize map after tab switch
        if (window.map && typeof window.map.resize === 'function') {
          setTimeout(() => window.map.resize(), 100);
        }
        break;
      case 'recipe':
        if (typeof initRecipeTab === 'function') initRecipeTab();
        break;
      case 'my':
        // My tab content is in the HTML already
        break;
    }
  };

  if (typeof buildTicker === 'function') {
    try { buildTicker(); } catch (e) { /* non-fatal */ }
  }
})();
