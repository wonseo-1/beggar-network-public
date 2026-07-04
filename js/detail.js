// ═══════════════════════════════════
// CATEGORY FORMATTER
// ═══════════════════════════════════
function formatCategory(cat) {
  const labels = CATEGORIES.find(c => c.key === cat);
  if (labels) return labels.label;
  return cat.replace(/_/g, ' / ').replace(/\b\w/g, c => c.toUpperCase());
}

// ═══════════════════════════════════
// HOURS FORMATTER
// ═══════════════════════════════════
function formatHours(hours) {
  if (!hours) return 'N/A';
  // Handle array format: ["Mon-Fri: 9am-9pm", "Sat-Sun: 10am-8pm"]
  if (Array.isArray(hours)) return hours.join(' · ');
  // Handle object format: {mon: "9am-9pm", ...}
  if (typeof hours === 'object') {
    const days = Object.entries(hours).map(([d, h]) => `${d}: ${h}`);
    return days.join(' · ');
  }
  // String passthrough
  return String(hours);
}

// ═══════════════════════════════════
// DETAIL CARD
// ═══════════════════════════════════
function showDetail(r) {
  const cheapestPrice = r.cheapest_price != null ? Number(r.cheapest_price) : null;
  const grade = cheapestPrice != null ? getGrade(cheapestPrice) : { key: 'unknown', label: 'Unknown' };
  const displayCategory = r.effective_category || r.category;
  const emoji = CAT[displayCategory] || '🍽️';
  const priceDisplay = cheapestPrice != null ? `$${cheapestPrice.toFixed(2)}` : 'N/A';
  const cheapestMenuName = r.cheapest_menu_name || '';

  // Rating display
  const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + ' ' + (r.address || ''))}`;
  const ratingDisplay = r.rating != null
    ? `<a href="${gmapsUrl}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">⭐ ${Number(r.rating).toFixed(1)} <span style="font-size:9px;opacity:0.6">Google ↗</span></a>`
    : `<a href="${gmapsUrl}" target="_blank" rel="noopener" style="font-size:11px;color:#666;text-decoration:underline">See on Google ↗</a>`;
  // Hours display
  const hoursDisplay = r.hours ? formatHours(r.hours) : 'N/A';

  const isUnverified = r.status === 'unverified';

  const html = `
    <div class="detail-name">${r.name}</div>
    <div class="detail-address">${r.address || ''}</div>
    ${isUnverified ? '<div class="detail-unverified-badge">🌱 New listing — be the first to verify the menu</div>' : ''}

    <div class="info-grid">
      <div class="info-cell">
        <div class="info-label">Category</div>
        <div class="info-value">${emoji} ${formatCategory(displayCategory || 'other')}</div>
      </div>
      <div class="info-cell">
        <div class="info-label">Cheapest</div>
        <div class="info-value price">${priceDisplay}${cheapestPrice != null ? `<span class="grade-badge ${grade.key}">${grade.label}</span>` : ''}</div>
      </div>
      <div class="info-cell">
        <div class="info-label">Cheap Pick</div>
        <div class="info-value">${cheapestMenuName || 'N/A'}</div>
      </div>
      <div class="info-cell">
        <div class="info-label">Rating</div>
        <div class="info-value" style="font-size:14px">${ratingDisplay}</div>
      </div>
      <div class="info-cell">
        <div class="info-label">Hours</div>
        <div class="info-value" style="font-size:11px;line-height:1.4">${escapeHtml(hoursDisplay)}</div>
      </div>
    </div>

    ${r.description ? `<div class="detail-desc">${r.description}</div>` : ''}

    ${cheapestPrice ? `
    <div class="worth-section" id="worthSection-${r.id}">
      <div class="worth-question">Worth it for ${priceDisplay}?</div>
      <div class="worth-buttons" id="worthButtons-${r.id}">
        <button class="worth-btn worth-btn--yes" onclick="submitWorthVote('${r.id}', 'worth_it')">
          🔥 Worth it (<span class="worth-count" data-type="worth_it">${r.worth_it_count || 0}</span>)
        </button>
        <button class="worth-btn worth-btn--no" onclick="submitWorthVote('${r.id}', 'not_worth')">
          💩 Not worth (<span class="worth-count" data-type="not_worth">${r.not_worth_count || 0}</span>)
        </button>
      </div>
      <div class="worth-summary" id="worthSummary-${r.id}">
        ${renderWorthSummary(r.worth_it_count || 0, r.not_worth_count || 0)}
      </div>
    </div>
    ` : ''}

    <div class="menu-section">
      <div class="menu-section-header">
        <div class="menu-section-title">Menu Items</div>
        <button class="menu-edit-btn" id="menuEditBtn-${r.id}" onclick="toggleMenuEdit('${r.id}')">✏️ Edit menu</button>
      </div>
      <div id="menuItems-${r.id}" class="menu-loading">Loading menu...</div>
    </div>

    <a class="detail-primary-btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + ' ' + (r.address || ''))}" target="_blank" rel="noopener">
      📍 Open in Google Maps
    </a>

    <div class="detail-quick-row">
      <button class="quick-btn" onclick="toggleBookmark('${r.id}')">🔖 Save</button>
      <button class="quick-btn" onclick="shareSpot('${r.name}',${cheapestPrice || 0})">📤 Share</button>
    </div>

    <div class="detail-issues">
      <div class="detail-issues-label">Something wrong?</div>
      <div class="issues-row">
        <button class="issue-btn issue-btn--danger" onclick="reportClosed('${r.id}')">💀 Closed</button>
        <button class="issue-btn" onclick="reportWrongInfo('${r.id}')">✏️ Wrong info</button>
      </div>
    </div>
  `;

  document.getElementById('sidePanelBody').innerHTML = html;
  document.getElementById('sidePanel').classList.add('show');

  // Mobile: show overlay behind side panel
  const overlay = document.getElementById('sheetOverlay');
  if (overlay) overlay.classList.add('show');

  // loadComments(r.id); // TODO: comments table not created yet
  loadMenuItems(r.id);
}

function renderSheetPreview(r) {
  const cheapestPrice = r.cheapest_price != null ? Number(r.cheapest_price) : null;
  const grade = cheapestPrice != null ? getGrade(cheapestPrice) : null;
  const displayCategory = r.effective_category || r.category;
  const emoji = CAT[displayCategory] || '🍽️';
  const priceDisplay = cheapestPrice != null ? `$${cheapestPrice.toFixed(2)}` : '';
  const gradeBadge = grade ? `<span class="grade-badge ${grade.key}" style="font-size:9px;padding:2px 7px;margin-left:4px">${grade.label}</span>` : '';

  document.getElementById('sheetPreview').innerHTML = `
    <div class="sheet-preview-name">${r.name}</div>
    <div class="sheet-preview-row">
      <span class="sheet-preview-price">${priceDisplay}</span>
      ${gradeBadge}
      <span class="sheet-preview-cat">${emoji} ${formatCategory(displayCategory || 'other')}</span>
      <span class="sheet-preview-arrow">▲</span>
    </div>
    <div class="sheet-preview-addr">${r.address || ''}</div>
  `;
}

function closeDetail() {
  const overlay = document.getElementById('sheetOverlay');
  if (overlay) overlay.classList.remove('show');
  document.getElementById('sidePanel').classList.remove('show');
}

// ═══════════════════════════════════
// MENU ITEMS
// ═══════════════════════════════════
let menuEditMode = {};
let menuVerifyMode = {};

async function loadMenuItems(restaurantId) {
  const containers = document.querySelectorAll(`#menuItems-${restaurantId}`);
  try {
    // Find the restaurant to check for brand_id
    const rest = allRestaurants.find(x => String(x.id) === String(restaurantId));
    const brandId = rest && rest.brand_id ? rest.brand_id : null;
    const brandName = rest && rest.brand_name ? rest.brand_name : null;

    let query = sb
      .from('menu_items')
      .select('id, name, price, is_cheap_pick, legit_count, cap_count, source, is_override, brand_id, restaurant_id')
      .eq('off_code', false)
      .order('price');

    if (brandId) {
      // Get brand-level menus (restaurant_id IS NULL) + location-specific overrides
      query = query.or(`brand_id.eq.${brandId},restaurant_id.eq.${restaurantId}`);
    } else {
      query = query.eq('restaurant_id', restaurantId);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (!data || data.length === 0) {
      containers.forEach(el => {
        el.innerHTML = '<div class="menu-empty">No menu data yet.</div>';
      });
      return;
    }

    if (menuEditMode[restaurantId]) {
      renderMenuEditMode(restaurantId, data);
      return;
    }
    if (menuVerifyMode[restaurantId]) {
      renderMenuVerifyMode(restaurantId, data);
      return;
    }

    // Default mode — clean list with verify prompt at bottom
    const chainBanner = brandId && brandName
      ? `<div class="menu-chain-banner">Menu shared across all ${escapeHtml(brandName)} locations</div>`
      : '';

    let html = chainBanner;
    data.forEach(item => {
      const star = item.is_cheap_pick ? ' ⭐' : '';
      html += `<div class="menu-item-row">
        <span class="menu-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}${star}</span>
        <span class="menu-item-price">$${Number(item.price).toFixed(2)}</span>
        </div>`;
    });

    const totalVerified = data.reduce((s, i) => s + (i.legit_count || 0), 0);
    html += `
      <div class="menu-verify-prompt">
        <div class="menu-verify-stats">${totalVerified} verified</div>
        <button class="menu-verify-enter-btn" onclick="toggleVerifyMode('${restaurantId}')">
          🔍 Help verify prices →
        </button>
      </div>
    `;

    containers.forEach(el => { el.innerHTML = html; });
  } catch (e) {
    containers.forEach(el => {
      el.innerHTML = '<div class="menu-empty">Menu unavailable.</div>';
    });
  }
}

function renderMenuVerifyMode(restaurantId, items) {
  const containers = document.querySelectorAll(`#menuItems-${restaurantId}`);
  let html = `
    <div class="menu-verify-hint">Tap ✅ if you saw this price today, ❌ if it changed</div>
    <div class="menu-verify-list">
  `;
  (items || []).forEach(item => {
    const star = item.is_cheap_pick ? ' ⭐' : '';
    html += `
      <div class="menu-verify-row">
        <div class="menu-verify-info">
          <span class="menu-item-name">${escapeHtml(item.name)}${star}</span>
          <span class="menu-item-price">$${Number(item.price).toFixed(2)}</span>
        </div>
        <div class="menu-verify-actions">
          <button class="verify-btn verify-btn--yes" onclick="submitVerdict(${item.id}, 'legit', null, '${restaurantId}')">
            ✅ Yes (${item.legit_count || 0})
          </button>
          <button class="verify-btn verify-btn--no" onclick="promptCapPrice(${item.id}, ${Number(item.price)}, '${restaurantId}')">
            ❌ Changed (${item.cap_count || 0})
          </button>
        </div>
      </div>
    `;
  });
  html += `</div>
    <button class="menu-verify-done-btn" onclick="toggleVerifyMode('${restaurantId}')">✓ Done verifying</button>
  `;
  containers.forEach(el => { el.innerHTML = html; });
}

function toggleVerifyMode(restaurantId) {
  menuVerifyMode[restaurantId] = !menuVerifyMode[restaurantId];
  loadMenuItems(restaurantId);
}

function renderMenuEditMode(restaurantId, items) {
  const containers = document.querySelectorAll(`#menuItems-${restaurantId}`);
  let html = `<div class="menu-edit-hint">Add, remove, or rename menu items. Changes go to review.</div>
  <div class="menu-edit-list" id="menuEditList-${restaurantId}">`;
  (items || []).forEach(item => {
    html += `<div class="menu-edit-row" data-item-id="${item.id}">
      <input class="menu-edit-name" type="text" value="${escapeHtml(item.name)}" placeholder="Item name">
      <input class="menu-edit-price" type="number" step="0.01" min="0" value="${Number(item.price).toFixed(2)}" placeholder="Price">
      <button class="menu-edit-delete" onclick="removeMenuItem('${item.id}', '${restaurantId}')">❌</button>
    </div>`;
  });
  html += `</div>
  <button class="menu-edit-add-btn" onclick="addMenuEditRow('${restaurantId}')">➕ Add item</button>
  <button class="menu-edit-save-btn" onclick="saveMenuEdits('${restaurantId}')">💾 Save changes</button>`;
  containers.forEach(el => { el.innerHTML = html; });
}

function toggleMenuEdit(restaurantId) {
  menuEditMode[restaurantId] = !menuEditMode[restaurantId];
  const btn = document.getElementById(`menuEditBtn-${restaurantId}`);
  if (btn) btn.textContent = menuEditMode[restaurantId] ? '✕ Cancel' : '✏️ Edit menu';
  menuVerifyMode[restaurantId] = false; // exit verify mode if entering edit
  loadMenuItems(restaurantId);
}

function addMenuEditRow(restaurantId) {
  const lists = document.querySelectorAll(`#menuEditList-${restaurantId}`);
  lists.forEach(list => {
    const row = document.createElement('div');
    row.className = 'menu-edit-row';
    row.dataset.itemId = '';
    row.innerHTML = `
      <input class="menu-edit-name" type="text" placeholder="Item name">
      <input class="menu-edit-price" type="number" step="0.01" min="0" placeholder="Price">
      <button class="menu-edit-delete" onclick="this.closest('.menu-edit-row').remove()">❌</button>
    `;
    list.appendChild(row);
  });
}

async function removeMenuItem(itemId, restaurantId) {
  const who = getVoterId();
  try {
    // Pending: submit deletion for review
    const { data: item } = await sb.from('menu_items').select('name, price').eq('id', itemId).single();
    await sb.from('pending_changes').insert({
      target_table: 'menu_items',
      target_id: Number(itemId),
      restaurant_id: Number(restaurantId),
      change_type: 'delete_menu',
      before_data: item || {},
      after_data: { deleted: true },
      ...who,
    });
    // Log contribution
    await sb.from('contributions').insert({
      restaurant_id: Number(restaurantId),
      menu_item_id: Number(itemId),
      user_id: who.user_id,
      nickname: who.user_id ? null : getAnonNickname(),
      type: 'update_info',
      payload: { action: 'delete_menu', name: item?.name },
    }).then(null, () => {});
    showToast('Deletion submitted for review');
  } catch (e) {
    showToast('Failed to submit');
  }
}

async function saveMenuEdits(restaurantId) {
  const who = getVoterId();

  const lists = document.querySelectorAll(`#menuEditList-${restaurantId}`);
  if (!lists.length) return;

  const rows = lists[0].querySelectorAll('.menu-edit-row');
  const items = [];
  let valid = true;
  rows.forEach(row => {
    const nameEl = row.querySelector('.menu-edit-name');
    const priceEl = row.querySelector('.menu-edit-price');
    const name = nameEl ? nameEl.value.trim() : '';
    const price = priceEl ? parseFloat(priceEl.value) : NaN;
    if (!name || isNaN(price) || price < 0) { valid = false; return; }
    items.push({ id: row.dataset.itemId || null, name, price });
  });

  if (!valid) { showToast('Fill in all fields'); return; }

  try {
    for (const item of items) {
      if (item.id) {
        // Existing item — get original values for before_data
        const { data: orig } = await sb.from('menu_items').select('name, price').eq('id', item.id).single();
        if (orig && (orig.name !== item.name || Number(orig.price) !== item.price)) {
          await sb.from('pending_changes').insert({
            target_table: 'menu_items',
            target_id: Number(item.id),
            restaurant_id: Number(restaurantId),
            change_type: orig.price !== item.price ? 'update_price' : 'update_name',
            before_data: { name: orig.name, price: Number(orig.price) },
            after_data: { name: item.name, price: item.price },
            ...who,
          });
        }
      } else {
        // New item
        await sb.from('pending_changes').insert({
          target_table: 'menu_items',
          target_id: null,
          restaurant_id: Number(restaurantId),
          change_type: 'add_menu',
          before_data: {},
          after_data: { name: item.name, price: item.price },
          ...who,
        });
      }
    }

    menuEditMode[restaurantId] = false;
    const btn = document.getElementById(`menuEditBtn-${restaurantId}`);
    if (btn) btn.textContent = '✏️ Edit menu';
    await loadMenuItems(restaurantId);
    showToast('Changes submitted for review!');
  } catch (e) {
    showToast('Submit failed');
  }
}

// ═══════════════════════════════════
// VERIFICATION (Legit / Cap)
// ═══════════════════════════════════
async function submitVerdict(menuItemId, verdict, reportedPrice, restaurantId) {
  try {
    const { error } = await castVerification(menuItemId, verdict, reportedPrice);
    if (error) throw error;
    // Log contribution
    await sb.from('contributions').insert({
      restaurant_id: parseInt(restaurantId),
      menu_item_id: Number(menuItemId),
      user_id: currentUser?.id || null,
      nickname: currentUser ? null : getAnonNickname(),
      type: 'update_info',
      payload: { action: verdict, reported_price: reportedPrice },
    }).then(null, () => {});
    showToast(verdict === 'legit' ? '✅ Marked legit!' : `💀 Capped at $${Number(reportedPrice).toFixed(2)}`);
    await loadMenuItems(restaurantId);
  } catch (e) { showToast('Failed to submit'); }
}

function promptCapPrice(menuItemId, currentPrice, restaurantId) {
  const input = prompt(`Current price shows $${Number(currentPrice).toFixed(2)}\n\nWhat price did you see today?\n(We'll update it after a few people confirm)`);
  if (input === null) return;
  const price = parseFloat(input);
  if (isNaN(price) || price <= 0) { showToast('Enter a valid price'); return; }
  submitVerdict(menuItemId, 'cap', price, restaurantId);
}


// ═══════════════════════════════════
// COMMENTS
// ═══════════════════════════════════
async function loadComments(id) {
  const el = document.querySelectorAll(`#comments-${id}`);
  try {
    const { data, error } = await sb.from('comments').select('*').eq('restaurant_id', id).order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    const html = (!data || data.length === 0)
      ? '<div style="font-size:13px;color:#bbb;padding:6px 0;">No comments yet. Be the first!</div>'
      : data.map(c => `<div class="comment">${escapeHtml(c.content)}<div class="comment-meta">${timeAgo(c.created_at)}</div></div>`).join('');
    el.forEach(e => e.innerHTML = html);
  } catch (e) {
    el.forEach(e => e.innerHTML = '<div style="font-size:13px;color:#bbb;">No comments yet</div>');
  }
}

async function postComment(id) {
  const inputs = document.querySelectorAll(`#commentInput-${id}`);
  const content = inputs[0]?.value?.trim();
  if (!content) return;
  try {
    await sb.from('comments').insert({ restaurant_id: id, content, ...getVoterId() });
    inputs.forEach(i => i.value = '');
    loadComments(id);
    showToast('Comment posted!');
  } catch (e) { showToast('Failed'); }
}

// ═══════════════════════════════════
// BOOKMARK / REPORT / SHARE
// ═══════════════════════════════════
// 익명(로그인 없이) 저장은 디바이스 로컬에 보관 — My Recipes 패턴과 동일.
// 로그인 사용자는 기존 DB 경로 그대로(크로스기기 동기화 유지). 데이터 손실/락아웃 없음.
function getLocalBookmarks() {
  try { return new Set(JSON.parse(localStorage.getItem('bn_bookmarks') || '[]')); }
  catch { return new Set(); }
}
function saveLocalBookmarks(set) {
  try { localStorage.setItem('bn_bookmarks', JSON.stringify([...set])); } catch {}
}

async function toggleBookmark(id) {
  // 익명: 디바이스 로컬 저장 (로그인 게이트 제거)
  if (!currentUser) {
    const set = getLocalBookmarks();
    const key = String(id);
    if (set.has(key)) { set.delete(key); showToast('Removed'); }
    else { set.add(key); showToast('Saved (on this device)'); }
    saveLocalBookmarks(set);
    return;
  }
  // 로그인: 기존 DB 경로 (변경 없음)
  try {
    const { data: existing } = await sb.from('bookmarks').select('*').eq('restaurant_id', id).eq('user_id', currentUser.id).maybeSingle();
    if (existing) { await sb.from('bookmarks').delete().eq('id', existing.id); showToast('Removed'); }
    else { await sb.from('bookmarks').insert({ restaurant_id: id, user_id: currentUser.id }); showToast('Saved!'); }
  } catch (e) { showToast('Failed'); }
}

async function reportClosed(id) {
  if (!confirm('Mark this spot as permanently closed?\n\nIf 3+ people confirm, it gets removed from the map.')) return;
  const restaurantId = Number(id);
  const who = getVoterId();
  try {
    await sb.from('reports').insert({ restaurant_id: restaurantId, report_type: 'closed', ...who });
    await sb.from('contributions').insert({
      restaurant_id: restaurantId, user_id: who.user_id,
      nickname: who.user_id ? null : getAnonNickname(),
      type: 'report_closed', payload: {},
    }).then(null, () => {});
    // 3건↑ 자동 폐업은 SECURITY DEFINER 트리거가 처리 (sql/anon_writes.sql)
    const { count } = await sb.from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId).eq('report_type', 'closed').eq('status', 'pending');
    showToast(count >= 3 ? '💀 Marked as closed' : `💀 Reported (${count}/3 needed)`);
  } catch (e) { showToast('Report failed'); }
}

async function reportWrongInfo(id) {
  const note = prompt('What\'s wrong with this listing?\n\nExamples:\n• Wrong address or hours\n• Wrong menu item name\n• Wrong category\n• Fake listing\n\nDescribe briefly:');
  if (!note || note.trim().length < 3) return;
  const who = getVoterId();
  try {
    await sb.from('reports').insert({ restaurant_id: Number(id), report_type: 'wrong_info', note: note.trim(), ...who });
    await sb.from('contributions').insert({
      restaurant_id: Number(id), user_id: who.user_id,
      nickname: who.user_id ? null : getAnonNickname(),
      type: 'report_closed', payload: { report_type: 'wrong_info', note: note.trim() },
    }).then(null, () => {});
    showToast('✏️ Reported. Thanks!');
  } catch (e) { showToast('Report failed'); }
}


function shareSpot(name, price) {
  const text = `🍴 ${name} — $${Number(price).toFixed(2)} on ${BRAND.name}!`;
  if (navigator.share) navigator.share({ title: BRAND.name, text, url: location.href });
  else { navigator.clipboard.writeText(text); showToast('Copied!'); }
}

// ═══════════════════════════════════
// WORTH IT RATING
// ═══════════════════════════════════
function renderWorthSummary(worthCount, notWorthCount) {
  const total = worthCount + notWorthCount;
  if (total === 0) return `<span class="worth-summary__empty">Be the first to rate</span>`;
  const pct = Math.round((worthCount / total) * 100);
  let label, color;
  if (pct >= 80) { label = 'Highly recommend'; color = '#16A34A'; }
  else if (pct >= 60) { label = 'Mostly worth it'; color = '#22C55E'; }
  else if (pct >= 40) { label = 'Mixed reviews'; color = '#EAB308'; }
  else if (pct >= 20) { label = 'Mostly skip'; color = '#F97316'; }
  else { label = 'Skip it'; color = '#EF4444'; }
  return `
    <span class="worth-summary__pct" style="color:${color}">${pct}%</span>
    <span class="worth-summary__label">${label}</span>
    <span class="worth-summary__total">· ${total} rating${total > 1 ? 's' : ''}</span>
  `;
}

async function submitWorthVote(restaurantId, vote) {
  const who = getVoterId();
  const idField = who.user_id ? 'user_id' : 'anon_id';
  const idValue = who.user_id || who.anon_id;
  try {
    const { data: existing } = await sb.from('worth_votes')
      .select('id, vote').eq('restaurant_id', Number(restaurantId)).eq(idField, idValue).maybeSingle();

    if (existing && existing.vote === vote) {
      await sb.from('worth_votes').delete().eq('id', existing.id);
      showToast('Vote removed');
    } else if (existing) {
      await sb.from('worth_votes').update({ vote }).eq('id', existing.id);
      showToast(vote === 'worth_it' ? '🔥 Marked as worth it' : '💩 Marked as not worth');
    } else {
      await sb.from('worth_votes').insert({ restaurant_id: Number(restaurantId), vote, ...who });
      showToast(vote === 'worth_it' ? '🔥 Thanks for your vote!' : '💩 Thanks for your vote!');
    }
    // worth 카운트는 SECURITY DEFINER 트리거가 worth_votes에서 재계산 (sql/anon_writes.sql)
    await refreshWorthUI(restaurantId);
  } catch (e) { showToast('Vote failed'); }
}

async function adjustWorthCount(restaurantId, vote, delta) {
  const field = vote === 'worth_it' ? 'worth_it_count' : 'not_worth_count';
  const { data } = await sb.from('restaurants').select(field).eq('id', Number(restaurantId)).single();
  if (!data) return;
  const newValue = Math.max(0, (data[field] || 0) + delta);
  await sb.from('restaurants').update({ [field]: newValue }).eq('id', Number(restaurantId));
}

async function refreshWorthUI(restaurantId) {
  const { data } = await sb.from('restaurants').select('worth_it_count, not_worth_count').eq('id', Number(restaurantId)).single();
  if (!data) return;
  const wc = data.worth_it_count || 0;
  const nwc = data.not_worth_count || 0;
  document.querySelectorAll(`#worthButtons-${restaurantId} [data-type="worth_it"]`).forEach(el => el.textContent = wc);
  document.querySelectorAll(`#worthButtons-${restaurantId} [data-type="not_worth"]`).forEach(el => el.textContent = nwc);
  document.querySelectorAll(`#worthSummary-${restaurantId}`).forEach(el => el.innerHTML = renderWorthSummary(wc, nwc));
}
