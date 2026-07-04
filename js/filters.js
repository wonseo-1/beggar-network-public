// ═══════════════════════════════════
// FILTERS
// ═══════════════════════════════════
function getFiltered() {
  const term = searchTerm.toLowerCase();
  return allRestaurants.filter(r => {
    // Unverified toggle
    if (r.status === 'unverified' && !showUnverified) return false;
    // Unverified spots skip price/grade filters (they may not have prices)
    if (r.status !== 'unverified') {
      if (Number(r.cheapest_price) > maxPrice) return false;
      if (activeGrade !== 'all') {
        const grade = getGrade(Number(r.cheapest_price));
        if (grade.key !== activeGrade) return false;
      }
    }
    const spotType = getSpotType(r);
    if (activeType !== 'all' && spotType !== activeType) return false;
    if (activeCategory !== 'all') {
      const cat = r.effective_category || r.category || 'other';
      if (cat !== activeCategory) return false;
    }
    if (term && !(r.name || '').toLowerCase().includes(term) && !(r.category || '').toLowerCase().includes(term)) return false;
    return true;
  });
}

function applyFilters() {
  const term = searchTerm.toLowerCase();

  // Build conditions array
  // Approved: respect price filter. Unverified: show if toggle on (skip price filter)
  const priceOrUnverified = showUnverified
    ? ['any',
        ['all', ['==', ['get', 'status'], 'approved'], ['<=', ['get', 'cheapestPrice'], maxPrice]],
        ['==', ['get', 'status'], 'unverified']
      ]
    : ['all', ['==', ['get', 'status'], 'approved'], ['<=', ['get', 'cheapestPrice'], maxPrice]];
  const conditions = [priceOrUnverified];

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

  // Grade filter — use price ranges matching getGrade thresholds
  if (activeGrade === 'legend') {
    conditions.push(['<=', ['get', 'cheapestPrice'], 4]);
  } else if (activeGrade === 'solid') {
    conditions.push(['all', ['>', ['get', 'cheapestPrice'], 4], ['<=', ['get', 'cheapestPrice'], 8]]);
  } else if (activeGrade === 'fair') {
    conditions.push(['all', ['>', ['get', 'cheapestPrice'], 8], ['<=', ['get', 'cheapestPrice'], 11]]);
  } else if (activeGrade === 'border') {
    conditions.push(['all', ['>', ['get', 'cheapestPrice'], 11], ['<=', ['get', 'cheapestPrice'], 14]]);
  }

  // Category filter — client-side ID matching (category is effective_category from view)
  if (activeCategory !== 'all') {
    const catIds = allRestaurants
      .filter(r => (r.effective_category || r.category || 'other') === activeCategory)
      .map(r => String(r.id));
    if (catIds.length === 0) {
      conditions.push(['==', ['get', 'id'], '__none__']);
    } else {
      conditions.push(['in', ['get', 'id'], ['literal', catIds]]);
    }
  }

  // Search: filter allRestaurants client-side, build an id set
  // Mapbox expression can't do substring match, so we collect matching ids
  if (term) {
    const matchIds = allRestaurants
      .filter(r => (r.name || '').toLowerCase().includes(term) || (r.category || '').toLowerCase().includes(term))
      .map(r => String(r.id));

    if (matchIds.length === 0) {
      // No matches — hide everything
      conditions.push(['==', ['get', 'id'], '__none__']);
    } else {
      // Use ['in', id, literal([...])] — Mapbox GL JS v3 supports this
      conditions.push(['in', ['get', 'id'], ['literal', matchIds]]);
    }
  }

  // Zoom-based density filtering: show cheaper spots at lower zoom levels
  const zoom = map.getZoom();
  if (zoom <= 11) {
    conditions.push(['any', ['==', ['get', 'status'], 'unverified'], ['<=', ['get', 'cheapestPrice'], 4]]);
  } else if (zoom <= 12) {
    conditions.push(['any', ['==', ['get', 'status'], 'unverified'], ['<=', ['get', 'cheapestPrice'], 8]]);
  } else if (zoom <= 13) {
    conditions.push(['any', ['==', ['get', 'status'], 'unverified'], ['<=', ['get', 'cheapestPrice'], 11]]);
  }
  // zoom > 13: no density filter, show all

  const combined = conditions.length === 1 ? conditions[0] : ['all', ...conditions];

  if (map.getLayer('spots-circle')) map.setFilter('spots-circle', combined);
}

function setupFilters() {
  // Type tabs (header-embedded segmented control)
  document.querySelectorAll('#typeBar .type-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeType = tab.dataset.type;
      document.querySelectorAll('#typeBar .type-tab').forEach(t => {
        t.classList.remove('is-active', 'active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      applyFilters(); updateStats(); updateTypeCounts(); closeDetail();
    });
  });

  // Grade chips (row 2)
  document.querySelectorAll('#gradeBar .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeGrade = chip.dataset.grade;
      document.querySelectorAll('#gradeBar .chip').forEach(c => c.classList.remove('active', 'is-active'));
      chip.classList.add('is-active');
      applyFilters(); updateStats(); updateTypeCounts(); closeDetail();
    });
  });

  updateTypeCounts();
}

// Compute live type counts respecting grade + price + search (but NOT type itself)
function updateTypeCounts() {
  const term = (searchTerm || '').toLowerCase();
  const counts = { all: 0, spot: 0, chain: 0, mart: 0 };

  for (const r of allRestaurants) {
    const price = Number(r.cheapest_price);
    if (!Number.isFinite(price)) continue;
    if (price > maxPrice) continue;
    if (activeGrade !== 'all') {
      const g = getGrade(price);
      if (g.key !== activeGrade) continue;
    }
    if (term &&
        !(r.name || '').toLowerCase().includes(term) &&
        !(r.category || '').toLowerCase().includes(term)) continue;

    counts.all++;
    const t = getSpotType(r);
    if (counts[t] != null) counts[t]++;
  }

  for (const key of ['all', 'spot', 'chain', 'mart']) {
    const el = document.querySelector(`#typeBar [data-count="${key}"]`);
    if (el) el.textContent = counts[key];
  }
}

function togglePriceFilter() { document.getElementById('priceFilter').classList.toggle('show'); }

let _slideQueued = false;
function onPriceSlide(val) {
  maxPrice = parseInt(val);
  const g = getGrade(maxPrice);
  document.getElementById('priceValue').textContent = `$${maxPrice} · ${g.label}`;
  document.getElementById('priceValue').style.color = g.color;
  if (_slideQueued) return;
  _slideQueued = true;
  requestAnimationFrame(() => {
    _slideQueued = false;
    applyFilters(); updateStats();
    if (typeof updateTypeCounts === 'function') updateTypeCounts();
  });
}

// ═══════════════════════════════════
// SEARCH
// ═══════════════════════════════════
function onSearchInput(val) {
  searchTerm = val.trim();
  applyFilters();
  updateStats();
  if (typeof updateTypeCounts === 'function') updateTypeCounts();
}

function clearSearch() {
  searchTerm = '';
  document.getElementById('searchInput').value = '';
  applyFilters();
  updateStats();
  if (typeof updateTypeCounts === 'function') updateTypeCounts();
}

// ═══════════════════════════════════
// FILTER MODAL (mobile)
// ═══════════════════════════════════
let activeCategory = 'all';

function openFilterModal() {
  const modal = document.getElementById('filterModal');
  if (!modal) return;
  buildFilterChips();
  updateFilterCount();
  modal.classList.add('show');
}

function closeFilterModal() {
  document.getElementById('filterModal')?.classList.remove('show');
}

function applyAndCloseFilter() {
  applyFilters();
  updateStats();
  if (typeof updateTypeCounts === 'function') updateTypeCounts();
  closeFilterModal();
}

function resetFilters() {
  activeType = 'all';
  activeGrade = 'all';
  activeCategory = 'all';
  document.querySelectorAll('#typeBar .type-tab').forEach(t => t.classList.toggle('is-active', t.dataset.type === 'all'));
  document.querySelectorAll('#gradeBar .chip').forEach(c => c.classList.toggle('is-active', c.dataset.grade === 'all'));
  buildFilterChips();
  updateFilterCount();
  applyFilters();
  updateStats();
  if (typeof updateTypeCounts === 'function') updateTypeCounts();
}

function buildFilterChips() {
  const gradeEl = document.getElementById('filterGradeChips');
  if (gradeEl) {
    const grades = [
      { key: 'all', label: 'All prices', dot: null },
      { key: 'legend', label: '≤$4', dot: '#22C55E' },
      { key: 'solid', label: '≤$8', dot: '#3B82F6' },
      { key: 'fair', label: '≤$11', dot: '#EAB308' },
      { key: 'border', label: '≤$14', dot: '#EF4444' },
    ];
    gradeEl.innerHTML = grades.map(g =>
      `<button class="filter-chip ${activeGrade === g.key ? 'is-active' : ''}" onclick="setFilterGrade('${g.key}')">
        ${g.dot ? '<span class="filter-chip__dot" style="background:' + g.dot + '"></span>' : ''}${g.label}
      </button>`
    ).join('');
  }

  const catEl = document.getElementById('filterCatChips');
  if (catEl) {
    const cats = [{ key: 'all', label: 'All', emoji: '' }, ...CATEGORIES];
    catEl.innerHTML = cats.map(c =>
      `<button class="filter-chip ${activeCategory === c.key ? 'is-active' : ''}" onclick="setFilterCategory('${c.key}')">
        ${c.emoji ? c.emoji + ' ' : ''}${c.label}
      </button>`
    ).join('');
  }

  const typeEl = document.getElementById('filterTypeChips');
  if (typeEl) {
    const types = [
      { key: 'all', label: 'All' },
      { key: 'spot', label: '🍴 Spots' },
      { key: 'chain', label: '⛓ Chains' },
      { key: 'mart', label: '🛒 Markets' },
    ];
    typeEl.innerHTML = types.map(t =>
      `<button class="filter-chip ${activeType === t.key ? 'is-active' : ''}" onclick="setFilterType('${t.key}')">
        ${t.label}
      </button>`
    ).join('');
  }
}

function setFilterGrade(key) {
  activeGrade = key;
  document.querySelectorAll('#gradeBar .chip').forEach(c => c.classList.toggle('is-active', c.dataset.grade === key));
  buildFilterChips();
  updateFilterCount();
}

function setFilterCategory(key) {
  activeCategory = key;
  buildFilterChips();
  updateFilterCount();
}

function setFilterType(key) {
  activeType = key;
  document.querySelectorAll('#typeBar .type-tab').forEach(t => t.classList.toggle('is-active', t.dataset.type === key));
  buildFilterChips();
  updateFilterCount();
}

function updateFilterCount() {
  const count = getFiltered().length;
  const el = document.getElementById('filterCount');
  if (el) el.textContent = count;
}

// ═══════════════════════════════════
