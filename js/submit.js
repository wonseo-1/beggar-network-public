// ═══════════════════════════════════
// SUBMIT — 3-step spot submission
// Step 1: Nickname + Find Place
// Step 2: Category + Tags
// Step 3: Photo + Menu Items + Submit
// ═══════════════════════════════════

let _pendingRestaurant = null;
let _selectedCategory = '';
let _selectedTags = new Set();
let _photoFile = null;

// ── Nickname generator ───────────────────────────────────────────────────────

const NICK_WORDS = [
  'noodle','slice','dumpling','taco','bagel','falafel','rice','bean',
  'mochi','ramen','gyoza','curry','pretzel','churro','samosa','bao',
  'burger','waffle','nacho','pho','sushi','kebab','crepe','pierogi',
  'pupusa','arepa','empanada','tamale','tofu','kimchi','matcha','mango',
];

function generateNickname() {
  const word = NICK_WORDS[Math.floor(Math.random() * NICK_WORDS.length)];
  const num = Math.floor(Math.random() * 99) + 1;
  return `beggar_${word}${num}`;
}

// ── Modal open/close ─────────────────────────────────────────────────────────

function openSubmitModal() {
  resetSubmitModal();
  // Set nickname
  const nickEl = document.getElementById('subNickname');
  if (nickEl && !nickEl.value) nickEl.value = generateNickname();
  // Render sprite icon in title
  if (typeof window.renderSprite === 'function') {
    const icon = document.getElementById('submitTitleIcon');
    if (icon) icon.innerHTML = window.renderSprite('plus', 1.5);
  }
  // Build category grid
  buildCategoryGrid();
  buildTagGrid();
  document.getElementById('submitModal').classList.add('show');
}

function closeSubmitModal() {
  document.getElementById('submitModal').classList.remove('show');
  resetSubmitModal();
}

function resetSubmitModal() {
  _pendingRestaurant = null;
  _selectedCategory = '';
  _selectedTags = new Set();
  _photoFile = null;
  const urlInput = document.getElementById('subUrlInput');
  if (urlInput) urlInput.value = '';
  const urlStatus = document.getElementById('urlStatus');
  if (urlStatus) urlStatus.style.display = 'none';
  const preview = document.getElementById('submitPreview');
  if (preview) preview.style.display = 'none';
  showStep(1);
  const menuRows = document.getElementById('menuRows');
  if (menuRows) menuRows.innerHTML = '';
  const photoPreview = document.getElementById('submitPhotoPreview');
  if (photoPreview) { photoPreview.style.display = 'none'; photoPreview.src = ''; }
  const photoPlaceholder = document.getElementById('submitPhotoPlaceholder');
  if (photoPlaceholder) photoPlaceholder.style.display = '';
  const nextBtn = document.getElementById('submitNext1');
  if (nextBtn) nextBtn.disabled = true;
  // Reset chain/dupe notices
  const cn = document.getElementById('submitChainNotice');
  if (cn) { cn.style.display = 'none'; cn.textContent = ''; }
  const dn = document.getElementById('submitDupeNotice');
  if (dn) { dn.style.display = 'none'; dn.innerHTML = ''; }
  // Reset dupe actions
  const da = document.getElementById('submitDupeActions');
  if (da) da.style.display = 'none';
  const em = document.getElementById('existingMenuDisplay');
  if (em) { em.style.display = 'none'; em.innerHTML = ''; }
  // Reset submit button text
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) submitBtn.textContent = 'Submit for Review';
  // Show submitNext1 in case it was hidden
  const next1 = document.getElementById('submitNext1');
  if (next1) next1.style.display = '';
}

// ── Step navigation ──────────────────────────────────────────────────────────

function showStep(n) {
  document.getElementById('submitStep1').style.display = n === 1 ? '' : 'none';
  document.getElementById('submitStep2').style.display = n === 2 ? '' : 'none';
  document.getElementById('submitStep3').style.display = n === 3 ? '' : 'none';
  // Update step indicators
  document.querySelectorAll('.submit-step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.toggle('active', s === n);
    el.classList.toggle('done', s < n);
  });
}

function goToStep2() {
  if (!_pendingRestaurant) return;
  document.getElementById('step2Name').textContent = _pendingRestaurant.name;
  document.getElementById('step2Address').textContent = _pendingRestaurant.address;
  showStep(2);
}

function backToStep1() { showStep(1); }

function goToStep3() {
  if (!_selectedCategory) { showToast('Pick a category'); return; }
  document.getElementById('step3Name').textContent = _pendingRestaurant.name;

  // If chain, hide manual menu and photo
  const isChain = _pendingRestaurant.brand_spot_type === 'chain';
  const menuSection = document.getElementById('submitMenuSection');
  const manualMenu = document.getElementById('submitManualMenu');
  if (isChain) {
    if (menuSection) menuSection.style.display = 'none';
    if (manualMenu) manualMenu.style.display = 'none';
  } else {
    if (menuSection) menuSection.style.display = '';
    if (manualMenu) manualMenu.style.display = '';
    // Start with one empty menu row
    if (document.getElementById('menuRows').children.length === 0) addMenuRow();
  }
  showStep(3);
}

function backToStep2() { showStep(2); }

// ── Category grid ────────────────────────────────────────────────────────────

function buildCategoryGrid() {
  const grid = document.getElementById('subCatGrid');
  if (!grid) return;
  // Use CATEGORIES from config.js (deduplicate halal/middle_eastern)
  const seen = new Set();
  grid.innerHTML = CATEGORIES.filter(c => {
    if (seen.has(c.label)) return false;
    seen.add(c.label);
    return true;
  }).map(c =>
    `<button type="button" class="submit-cat-btn" data-cat="${c.key}" onclick="selectCategory('${c.key}', this)">
      <span class="submit-cat-emoji">${c.emoji}</span>
      <span class="submit-cat-label">${c.label}</span>
    </button>`
  ).join('');
}

function selectCategory(key, el) {
  _selectedCategory = key;
  document.querySelectorAll('.submit-cat-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  const next = document.getElementById('submitNext2');
  if (next) next.disabled = false;
}

// ── Tag grid ─────────────────────────────────────────────────────────────────

function buildTagGrid() {
  const grid = document.getElementById('subTagGrid');
  if (!grid) return;
  grid.innerHTML = SPOT_TAGS.map(t =>
    `<label class="submit-tag-label">
      <input type="checkbox" value="${t.key}" onchange="toggleTag('${t.key}', this.checked)">
      <span>${t.emoji} ${t.label}</span>
    </label>`
  ).join('');
}

function toggleTag(key, checked) {
  if (checked) _selectedTags.add(key);
  else _selectedTags.delete(key);
}

// ── Photo handling ───────────────────────────────────────────────────────────

function onPhotoSelected(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  _photoFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('submitPhotoPreview');
    const placeholder = document.getElementById('submitPhotoPlaceholder');
    preview.src = e.target.result;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

// ── Menu rows ────────────────────────────────────────────────────────────────

function addMenuRow() {
  const rows = document.getElementById('menuRows');
  const div = document.createElement('div');
  div.className = 'submit-menu-row';
  div.innerHTML = `
    <input class="form-input menu-row-name" placeholder="Item name">
    <input class="form-input menu-row-price" type="number" step="0.01" min="0" max="99" placeholder="$">
    <button type="button" class="submit-remove-btn" onclick="removeMenuRow(this)">✕</button>
  `;
  rows.appendChild(div);
}

function removeMenuRow(btn) {
  btn.closest('.submit-menu-row').remove();
}

// ── Google Maps URL parser ───────────────────────────────────────────────────

function parseGmapsUrl(url) {
  try {
    // Standard: /maps/place/Name/@lat,lng
    const placeMatch = url.match(/\/maps\/place\/([^/@?]+)/);
    if (placeMatch) {
      const name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
      const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (coordMatch) {
        return { name, lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) };
      }
      return { name, lat: null, lng: null };
    }
    // Search query format: maps.google.com?q=Name or /maps/search/?api=1&query=Name
    const qMatch = url.match(/[?&]q=([^&]+)/) || url.match(/[?&]query=([^&]+)/);
    if (qMatch) {
      const name = decodeURIComponent(qMatch[1].replace(/\+/g, ' '));
      // Try to find ftid-based coords or just return name
      const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      return { name, lat: coordMatch ? parseFloat(coordMatch[1]) : null, lng: coordMatch ? parseFloat(coordMatch[2]) : null };
    }
    // Short links
    if (url.includes('goo.gl/maps') || url.includes('maps.app.goo.gl')) {
      return { name: null, lat: null, lng: null, shortLink: true };
    }
    return null;
  } catch (_) { return null; }
}

function isGmapsUrl(val) {
  return val.includes('google.com/maps') || val.includes('maps.google.com') ||
         val.includes('goo.gl/maps') || val.includes('maps.app.goo.gl');
}

// ── Short URL resolver ───────────────────────────────────────────────────────

async function resolveShortUrl(shortUrl) {
  // Try Edge Function first
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/resolve-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ url: shortUrl }),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.resolved) return data.resolved;
    }
  } catch (_) {}

  // Fallback: try direct fetch (may fail due to CORS but worth trying)
  try {
    const resp = await fetch(shortUrl, { redirect: 'follow', mode: 'no-cors' });
    if (resp.url && resp.url !== shortUrl) return resp.url;
  } catch (_) {}

  return null;
}

// ── Google Maps URL input handler ────────────────────────────────────────────

async function onUrlInput(val) {
  const statusEl = document.getElementById('urlStatus');
  const preview = document.getElementById('submitPreview');

  val = val.trim();
  if (!val) {
    if (statusEl) statusEl.style.display = 'none';
    if (preview) preview.style.display = 'none';
    _pendingRestaurant = null;
    document.getElementById('submitNext1').disabled = true;
    return;
  }

  // Check if it's a Google Maps URL
  if (!isGmapsUrl(val)) {
    if (statusEl) {
      statusEl.textContent = 'Please paste a Google Maps link (google.com/maps/... or maps.app.goo.gl/...)';
      statusEl.style.display = '';
      statusEl.className = 'submit-url-status submit-url-hint';
    }
    return;
  }

  if (statusEl) {
    statusEl.textContent = 'Finding restaurant...';
    statusEl.style.display = '';
    statusEl.className = 'submit-url-status submit-url-loading';
  }

  let parsed = parseGmapsUrl(val);

  // Handle short links
  if (parsed && parsed.shortLink) {
    const resolved = await resolveShortUrl(val);
    if (resolved) {
      parsed = parseGmapsUrl(resolved);
      if (!parsed) {
        if (statusEl) {
          statusEl.textContent = 'Could not parse that link. Try copying the full URL from Google Maps.';
          statusEl.className = 'submit-url-status submit-url-error';
        }
        return;
      }
    } else {
      if (statusEl) {
        statusEl.textContent = 'Could not resolve short link. Try copying the full URL from Google Maps.';
        statusEl.className = 'submit-url-status submit-url-error';
      }
      return;
    }
  }

  if (!parsed) {
    if (statusEl) {
      statusEl.textContent = 'Not a valid Google Maps link. Try Share → Copy link from Google Maps.';
      statusEl.className = 'submit-url-status submit-url-error';
    }
    return;
  }

  let restaurant = { name: parsed.name, lat: parsed.lat, lng: parsed.lng, address: '' };

  // Reverse geocode to get address if we have coordinates
  if (parsed.lat && parsed.lng) {
    restaurant.address = await reverseGeocode(parsed.lat, parsed.lng);
  }

  // No coordinates but have name — try forward geocode (name+address → coords)
  if (!restaurant.lat && restaurant.name) {
    if (statusEl) {
      statusEl.textContent = 'Looking up location...';
    }
    try {
      const query = encodeURIComponent(restaurant.name);
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json` +
        `?access_token=${MAPBOX_TOKEN}&limit=1&types=poi,address`
      );
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        const feat = data.features[0];
        restaurant.lat = feat.center[1];
        restaurant.lng = feat.center[0];
        restaurant.address = feat.place_name || '';
        // Use parsed name (from Google) over Mapbox name
      }
    } catch (_) {}
  }

  if (!restaurant.lat) {
    if (statusEl) {
      statusEl.textContent = 'Could not find location. Make sure to copy the link from a specific restaurant page.';
      statusEl.className = 'submit-url-status submit-url-error';
    }
    return;
  }

  // Clean up name (URL-encoded names may have + or %20)
  if (restaurant.name) {
    restaurant.name = restaurant.name.replace(/\+/g, ' ').trim();
  }

  if (statusEl) statusEl.style.display = 'none';
  await showSubmitPreview(restaurant);
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
      `?access_token=${MAPBOX_TOKEN}&limit=1`
    );
    const data = await res.json();
    return data.features?.[0]?.place_name || `${lat}, ${lng}`;
  } catch (_) { return `${lat}, ${lng}`; }
}

// ── Duplicate check ──────────────────────────────────────────────────────────

async function checkDuplicate(name, lat, lng) {
  try {
    // Search for restaurants with similar name
    const normName = name.toLowerCase().replace(/[.']/g, '').trim();
    const { data } = await sb
      .from('restaurants')
      .select('id,name,address,lat,lng')
      .eq('status', 'approved');
    if (!data) return null;

    // Find any within 200m with similar name
    for (const r of data) {
      const rNorm = r.name.toLowerCase().replace(/[.']/g, '').trim();
      if (!rNorm.includes(normName) && !normName.includes(rNorm)) continue;
      const dist = haversineMeters(lat, lng, r.lat, r.lng);
      if (dist < 200) return r;
    }
    return null;
  } catch (_) { return null; }
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const p = Math.PI / 180;
  const a = 0.5 - Math.cos((lat2 - lat1) * p) / 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lng2 - lng1) * p)) / 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function showSubmitPreview(restaurant) {
  _pendingRestaurant = restaurant;
  document.getElementById('previewName').textContent = restaurant.name;
  document.getElementById('previewAddress').textContent = restaurant.address;
  document.getElementById('submitPreview').style.display = '';
  document.getElementById('submitNext1').disabled = false;

  // Reset notices
  const cn = document.getElementById('submitChainNotice');
  if (cn) { cn.style.display = 'none'; cn.textContent = ''; }
  const dn = document.getElementById('submitDupeNotice');
  if (dn) { dn.style.display = 'none'; dn.innerHTML = ''; }
  const da = document.getElementById('submitDupeActions');
  if (da) da.style.display = 'none';
  const next1 = document.getElementById('submitNext1');

  // Check for duplicates
  if (restaurant.lat && restaurant.lng) {
    const dupe = await checkDuplicate(restaurant.name, restaurant.lat, restaurant.lng);
    if (dupe) {
      _pendingRestaurant._dupe = dupe;
      const dupeText = document.getElementById('submitDupeText');
      if (dupeText) dupeText.textContent = `📍 "${dupe.name}" already exists nearby! ${dupe.address}`;
      if (da) da.style.display = '';
      if (next1) next1.style.display = 'none';
      // Show new branch button only if this is a chain brand
      const newBranchBtn = document.getElementById('submitNewBranchBtn');
      if (newBranchBtn) newBranchBtn.style.display = _pendingRestaurant.brand_id ? '' : 'none';
    } else {
      if (next1) next1.style.display = '';
    }
  }

  // Brand matching
  const searchTerm = (restaurant.name || '').trim();
  if (searchTerm.length >= 2) {
    try {
      const { data: brands } = await sb
        .from('brands')
        .select('*')
        .ilike('name', `%${searchTerm}%`)
        .limit(5);

      const chainMatch = brands && brands.find(b => b.spot_type === 'chain');
      const brandMatch = chainMatch || (brands && brands[0]);

      if (brandMatch) {
        _pendingRestaurant.brand_id = brandMatch.id;
        _pendingRestaurant.brand_name = brandMatch.name;
        _pendingRestaurant.brand_spot_type = brandMatch.spot_type;

        if (brandMatch.spot_type === 'chain') {
          cn.textContent = `🏪 ${escapeHtml(brandMatch.name)} chain — menu shared from brand.`;
          cn.style.display = '';
        }

        // Update new branch button visibility now that we know brand_id
        const newBranchBtn = document.getElementById('submitNewBranchBtn');
        if (newBranchBtn && da && da.style.display !== 'none') {
          newBranchBtn.style.display = '';
        }
      }
    } catch (_) {}
  }
}

// ── Form submit ──────────────────────────────────────────────────────────────

async function handleSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (!_pendingRestaurant) { showToast('Find a restaurant first'); return; }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  const nickname = (document.getElementById('subNickname')?.value || '').trim() || generateNickname();
  const isChainLocation = _pendingRestaurant.brand_spot_type === 'chain';

  // Collect menu rows (skip empty rows, skip for chains)
  const menuItems = [];
  if (!isChainLocation) {
    const rows = document.querySelectorAll('#menuRows .submit-menu-row');
    for (const row of rows) {
      const itemName = row.querySelector('.menu-row-name').value.trim();
      const price = parseFloat(row.querySelector('.menu-row-price').value);
      if (itemName && !isNaN(price) && price > 0) {
        menuItems.push({ name: itemName, price });
      }
    }
    // Photo or menu is nice but not required — will be unverified without menu
    menuItems.sort((a, b) => a.price - b.price);
  }

  // Update mode: add menu items to existing restaurant, don't create new one
  if (_pendingRestaurant.mode === 'update') {
    try {
      if (menuItems.length === 0) {
        showToast('Add at least one menu item');
        btn.disabled = false;
        btn.textContent = 'Submit Menu Update';
        return;
      }

      const menuRows = menuItems.map(item => ({
        restaurant_id: _pendingRestaurant.existingId,
        name: item.name,
        price: item.price,
        source: 'user_added',
        submitted_nickname: nickname,
        ...(currentUser ? { added_by: currentUser.id } : { submitted_by: nickname }),
      }));

      const { error: menuErr } = await sb.from('menu_items').insert(menuRows);
      if (menuErr) throw menuErr;

      // Log contribution (non-fatal)
      await sb.from('contributions').insert({
        restaurant_id: _pendingRestaurant.existingId,
        user_id: currentUser?.id || null,
        nickname,
        type: 'add_menu',
        payload: { items: menuItems },
      }).then(null, () => {});

      closeSubmitModal();
      showToast('Menu updated! Community will verify.');
      await loadData();
      pushFeatures();
      return;
    } catch (err) {
      console.error('Update error:', err);
      showToast('Failed to update. Try again.');
      btn.disabled = false;
      btn.textContent = 'Submit Menu Update';
      return;
    }
  }

  try {
    // 1. Upload photo if present
    let photoPath = null;
    if (_photoFile) {
      const ext = _photoFile.name.split('.').pop() || 'jpg';
      const fileName = `menu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      photoPath = `menu-photos/${fileName}`;
      const { error: uploadErr } = await sb.storage
        .from('submissions')
        .upload(photoPath, _photoFile, { contentType: _photoFile.type });
      if (uploadErr) {
        console.warn('Photo upload failed:', uploadErr);
        photoPath = null; // Non-fatal — proceed without photo
      }
    }

    // 2. Build restaurant row
    // Has menu items → pending_review (admin approves), no menu → unverified
    const hasMenu = menuItems.length > 0;
    const restRow = {
      name: _pendingRestaurant.name,
      address: _pendingRestaurant.address,
      lat: _pendingRestaurant.lat,
      lng: _pendingRestaurant.lng,
      category: _selectedCategory,
      tags: _selectedTags.size > 0 ? Array.from(_selectedTags) : null,
      status: hasMenu ? 'pending_review' : 'unverified',
      submitted_nickname: nickname,
      city: (typeof detectCityFromCoords === 'function'
        && detectCityFromCoords(_pendingRestaurant.lat, _pendingRestaurant.lng)) || 'nyc',
    };
    // Auth user or anonymous
    if (currentUser) {
      restRow.created_by = currentUser.id;
    } else {
      restRow.submitted_by = nickname;
    }
    if (_pendingRestaurant.brand_id) {
      restRow.brand_id = _pendingRestaurant.brand_id;
    }

    const { data: inserted, error: restErr } = await sb
      .from('restaurants')
      .insert(restRow)
      .select('id')
      .single();

    if (restErr) throw restErr;

    // Log contribution (non-fatal)
    await sb.from('contributions').insert({
      restaurant_id: inserted.id,
      user_id: currentUser?.id || null,
      nickname,
      type: _pendingRestaurant.mode === 'new_branch' ? 'new_branch' : 'new_spot',
      payload: { name: _pendingRestaurant.name, address: _pendingRestaurant.address },
    }).then(null, () => {});

    // 3. Insert menu items
    if (menuItems.length > 0) {
      const menuRows = menuItems.map(item => ({
        restaurant_id: inserted.id,
        name: item.name,
        price: item.price,
        source: 'user_added',
        submitted_nickname: nickname,
        ...(currentUser ? { added_by: currentUser.id } : { submitted_by: nickname }),
      }));
      const { error: menuErr } = await sb.from('menu_items').insert(menuRows);
      if (menuErr) console.warn('Menu insert failed:', menuErr);
    }

    closeSubmitModal();
    showToast('Submitted! We\'ll review it soon.');
  } catch (err) {
    console.error('Submit error:', err);
    showToast('Failed to submit. Try again.');
  }

  btn.disabled = false;
  btn.textContent = 'Submit for Review';
}

// ── Dupe action handlers ──────────────────────────────────────────────────────

// User chose to update existing restaurant's menu
function switchToUpdateMode() {
  if (!_pendingRestaurant || !_pendingRestaurant._dupe) return;
  _pendingRestaurant.existingId = _pendingRestaurant._dupe.id;
  _pendingRestaurant.mode = 'update';

  // Skip Step 2 (category already set), go to Step 3
  document.getElementById('step3Name').textContent = _pendingRestaurant._dupe.name;

  // Load existing menu for reference
  loadExistingMenu(_pendingRestaurant.existingId);

  // Change submit button text
  const btn = document.getElementById('submitBtn');
  if (btn) btn.textContent = 'Submit Menu Update';

  // Hide manual menu toggle for chains
  const isChain = _pendingRestaurant.brand_spot_type === 'chain';
  const menuSection = document.getElementById('submitMenuSection');
  const manualMenu = document.getElementById('submitManualMenu');
  if (isChain) {
    if (menuSection) menuSection.style.display = 'none';
    if (manualMenu) manualMenu.style.display = 'none';
  } else {
    if (menuSection) menuSection.style.display = '';
    if (manualMenu) manualMenu.style.display = '';
    if (document.getElementById('menuRows').children.length === 0) addMenuRow();
  }

  showStep(3);
}

// Load existing menu items read-only
async function loadExistingMenu(restaurantId) {
  const existingMenuEl = document.getElementById('existingMenuDisplay');
  if (!existingMenuEl) return;

  try {
    const { data } = await sb
      .from('menu_items')
      .select('name, price')
      .eq('restaurant_id', restaurantId)
      .eq('off_code', false)
      .order('price');

    if (data && data.length > 0) {
      existingMenuEl.innerHTML = '<div class="existing-menu-label">Current menu:</div>' +
        data.map(item =>
          `<div class="existing-menu-item">
            <span>${escapeHtml(item.name)}</span>
            <span class="existing-menu-price">$${Number(item.price).toFixed(2)}</span>
          </div>`
        ).join('');
      existingMenuEl.style.display = '';
    } else {
      existingMenuEl.innerHTML = '<div class="existing-menu-label">No menu yet — be the first to add!</div>';
      existingMenuEl.style.display = '';
    }
  } catch (_) {
    existingMenuEl.style.display = 'none';
  }
}

// User chose to add a new branch of an existing chain
function switchToNewBranch() {
  if (!_pendingRestaurant) return;
  _pendingRestaurant.mode = 'new_branch';
  // Show submitNext1 again for normal flow
  document.getElementById('submitNext1').disabled = false;
  document.getElementById('submitNext1').style.display = '';
  document.getElementById('submitDupeActions').style.display = 'none';
  goToStep2();
}

// User confirmed this is a different spot
function confirmNewSpot() {
  if (!confirm('Are you sure this is a different restaurant, not the one shown above?')) return;
  _pendingRestaurant.mode = 'new_spot_confirmed';
  // Show submitNext1 again for normal flow
  document.getElementById('submitNext1').disabled = false;
  document.getElementById('submitNext1').style.display = '';
  document.getElementById('submitDupeActions').style.display = 'none';
}
