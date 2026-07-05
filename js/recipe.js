// ═══════════════════════════════════════════════════════════
// RECIPE TAB — Tier 2 (Pro version)
// Features: ingredient checkboxes, servings scaler, step-by-step mode,
//           shop missing items, cook mode, video embeds
// ═══════════════════════════════════════════════════════════

window.RECIPES_DATA = null;
let currentRecipeId = null;
let activeSeries = 'all';

// ─────────────────────────────────────────────────────────
// 플라이휠 헬퍼 (측정·공유) — 설계: docs/growth-flywheel.md
// recipe_key = 생성 레시피의 access_key(uuid). 정적 레시피는 uuid가 없어 null.
// ─────────────────────────────────────────────────────────
function recipeKeyOf(recipeId) {
  return (typeof recipeId === 'string' && recipeId.startsWith('gen-')) ? recipeId.slice(4) : null;
}
// 인라인 onclick 문자열 안에 안전하게 넣기 위한 sanitizer (따옴표/백슬래시/개행 제거)
function jsAttr(s) {
  return String(s == null ? '' : s).replace(/['"\\\n\r]/g, '');
}
function trackEvent(name, props) {
  if (typeof window.track === 'function') window.track(name, props || {});
}

// ─────────────────────────────────────────────────────────
// 데이터 로드
// ─────────────────────────────────────────────────────────
async function loadRecipes() {
  if (window.RECIPES_DATA) return window.RECIPES_DATA;
  try {
    const res = await fetch('data/recipes.json');
    window.RECIPES_DATA = await res.json();
    return window.RECIPES_DATA;
  } catch (e) {
    console.error('Failed to load recipes:', e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────
// 진입점
// ─────────────────────────────────────────────────────────
async function initRecipeTab() {
  const container = document.getElementById('tab-recipe');
  if (!container) return;
  container.innerHTML = '<div class="recipe-loading">Loading recipes…</div>';
  const data = await loadRecipes();
  if (!data) {
    container.innerHTML = '<div class="recipe-error">Could not load recipes.</div>';
    return;
  }
  renderRecipeList();
}

// ─────────────────────────────────────────────────────────
// 레시피 목록
// ─────────────────────────────────────────────────────────
function renderRecipeList() {
  const container = document.getElementById('tab-recipe');
  const recipes = ((window.RECIPES_DATA && window.RECIPES_DATA.recipes) || [])
    .filter(r => r.series !== 'my_recipe'); // generated recipes live in My Recipes section

  // 빈 상태
  if (recipes.length === 0) {
    container.innerHTML = `
      <div class="recipe-hub">
        <header class="recipe-hub__head">
          <h2 class="recipe-hub__title">🍳 Foodipedia</h2>
          <p class="recipe-hub__sub">Viral recipes, made at home for cheap.</p>
        </header>
        ${renderMyRecipeSection()}
        <div class="recipe-empty">
          <div class="recipe-empty__emoji">🍳</div>
          <h2>Recipes coming soon</h2>
          <p>We're cooking up the first batch of recipes.<br>Check back this week!</p>
        </div>
      </div>
    `;
    return;
  }

  const filtered = activeSeries === 'all'
    ? recipes
    : recipes.filter(r => r.series === activeSeries);

  const savingsOf = (r) => {
    const high = (r.home_price && (r.home_price.amount_high || r.home_price.amount)) || 0;
    const rest = (r.restaurant_price && r.restaurant_price.amount) || 0;
    return Math.max(0, rest - high);
  };
  // 북극성 베이스라인: 정적 레시피 전체(시리즈 필터 무관) 절약 합. 커뮤니티분은 RPC로 가산.
  const staticSavings = recipes.reduce((sum, r) => sum + savingsOf(r), 0);

  container.innerHTML = `
    <div class="recipe-hub">
      <header class="recipe-hub__head">
        <h2 class="recipe-hub__title">🍳 Foodipedia</h2>
        <p class="recipe-hub__sub">Viral recipes, made at home for cheap.</p>
        ${staticSavings > 0 ? `
        <div class="north-star" id="northStar" title="Total saved vs eating out">
          🤑 Beggar Network has saved cooks <strong>$${staticSavings.toLocaleString()}+</strong> so far
        </div>` : ''}
      </header>

      ${renderMyRecipeSection()}

      <div id="communityRecipes"></div>

      <div class="series-tabs">
        <button class="series-tab ${activeSeries === 'all' ? 'is-active' : ''}"
                onclick="setSeries('all')">
          All <span class="series-count">${recipes.length}</span>
        </button>
        <button class="series-tab ${activeSeries === 'beggar_original' ? 'is-active' : ''}"
                onclick="setSeries('beggar_original')">
          👑 Beggar Original <span class="series-count">${recipes.filter(r => r.series === 'beggar_original').length}</span>
        </button>
        <button class="series-tab ${activeSeries === 'restaurant_to_home' ? 'is-active' : ''}"
                onclick="setSeries('restaurant_to_home')">
          🗽 Restaurant → Home <span class="series-count">${recipes.filter(r => r.series === 'restaurant_to_home').length}</span>
        </button>
      </div>

      <div class="recipe-grid">
        ${filtered.map(r => renderRecipeCard(r)).join('')}
      </div>

      <footer class="recipe-hub__foot">
        <p class="recipe-disclosure">
          Beggar Network is part of the Amazon Associates Program.
          We earn from qualifying purchases at no extra cost to you.
        </p>
      </footer>
    </div>
  `;
  loadCommunityRecipes();
  loadNorthStar(staticSavings);
}

// ─────────────────────────────────────────────────────────
// 북극성: 정적 베이스라인 + 커뮤니티 공개 레시피 절약액 합산
// public_savings_total() RPC가 없으면(미배포) 정적 값만 표시 — 무해 폴백.
// ─────────────────────────────────────────────────────────
async function loadNorthStar(staticSavings) {
  const el = document.getElementById('northStar');
  if (!el || typeof sb === 'undefined') return;
  try {
    const { data, error } = await sb.rpc('public_savings_total');
    if (error || data == null) return; // RPC 미배포 → 정적 값 유지
    const total = Math.round(Number(staticSavings) + Number(data));
    if (total > 0) {
      el.innerHTML = `🤑 Beggar Network has saved cooks <strong>$${total.toLocaleString()}+</strong> so far`;
    }
  } catch (_) { /* non-fatal */ }
}

// ─────────────────────────────────────────────────────────
// Community Recipes — 공개된 유저 레시피 모아보기
// ─────────────────────────────────────────────────────────
async function loadCommunityRecipes() {
  const el = document.getElementById('communityRecipes');
  if (!el || typeof sb === 'undefined') return;
  try {
    // 자동 랭킹: 참여·품질 점수순 (설계 §6.1). RPC 미배포면 최신순으로 폴백.
    let data = null;
    try {
      const r = await sb.rpc('community_recipe_scores', { p_limit: 12 });
      if (!r.error && Array.isArray(r.data)) data = r.data;
    } catch (_) { /* fall through to recency */ }

    if (!data) {
      const r = await sb
        .from('generated_recipes')
        .select('slug, author_nickname, published_at, recipe->name, recipe->emoji, recipe->tagline')
        .eq('published', true)
        .order('published_at', { ascending: false })
        .limit(12);
      data = r.data;
    }
    if (!data || data.length === 0) return;

    el.innerHTML = `
      <section class="community-recipes">
        <h3 class="community-recipes__title">🌍 Community Recipes</h3>
        <p class="community-recipes__sub">Made from YouTube videos by beggars like you.</p>
        <div class="community-recipes__row">
          ${data.map(r => `
            <a class="community-card" href="/recipe/${encodeURIComponent(r.slug)}" target="_blank">
              <span class="community-card__emoji">${escapeHtml(r.emoji || '🍽️')}</span>
              <span class="community-card__name">${escapeHtml(r.name || 'Recipe')}</span>
              <span class="community-card__by">by ${escapeHtml(r.author_nickname || 'anonymous')}</span>
            </a>
          `).join('')}
        </div>
      </section>
    `;
  } catch (_) { /* non-fatal */ }
}

function setSeries(series) {
  activeSeries = series;
  renderRecipeList();
}

function formatHomePrice(hp) {
  if (!hp) return '$?';
  if (hp.amount_low !== undefined && hp.amount_high !== undefined) {
    if (hp.amount_low === hp.amount_high) return `$${hp.amount_low}`;
    return `$${hp.amount_low}-${hp.amount_high}`;
  }
  return `$${hp.amount}`;
}

function renderRecipeCard(recipe) {
  const hp = recipe.home_price;
  const seriesInfo = (window.RECIPES_DATA.series && window.RECIPES_DATA.series[recipe.series]) || {};
  const totalTime = recipe.total_time_min || recipe.prep_time_min || 0;
  const savePct = hp.savings_pct_low !== undefined
    ? `Save ${hp.savings_pct_low}-${hp.savings_pct_high}%`
    : `Save ${hp.savings_pct || 0}%`;

  return `
    <article class="recipe-card" onclick="openRecipe('${recipe.id}')">
      <div class="recipe-card__emoji">${recipe.emoji || '🍽️'}</div>
      <div class="recipe-card__body">
        <div class="recipe-card__series">
          <span class="series-badge series-badge--${recipe.series}">
            ${seriesInfo.emoji || ''} ${seriesInfo.label || ''}
          </span>
        </div>
        <h3 class="recipe-card__name">${recipe.name}</h3>
        <p class="recipe-card__tagline">${recipe.tagline}</p>
        <div class="recipe-card__price">
          <span class="price-out">$${recipe.restaurant_price.amount}</span>
          <span class="price-arrow">→</span>
          <span class="price-home">${formatHomePrice(hp)}</span>
          <span class="price-save">${savePct}</span>
        </div>
        <div class="recipe-card__meta">
          <span>⏱ ${totalTime} min</span>
          <span>🥘 ${recipe.ingredients.length} ingredients</span>
          ${recipe.videos && recipe.videos.length > 0 ? `<span>🎬 ${recipe.videos.length}</span>` : ''}
        </div>
      </div>
    </article>
  `;
}

// ═══════════════════════════════════════════════════════════
// 레시피 상세 - Tier 2 풀 기능
// ═══════════════════════════════════════════════════════════

// 상태: 사용자가 가진 재료 (localStorage 저장)
function getHaveItems(recipeId) {
  try {
    const raw = localStorage.getItem(`bn_have_${recipeId}`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}
function saveHaveItems(recipeId, set) {
  try {
    localStorage.setItem(`bn_have_${recipeId}`, JSON.stringify([...set]));
  } catch {}
}

// 상태: 현재 servings 배수
let currentServingsMultiplier = 1;

function openRecipe(recipeId) {
  const recipe = window.RECIPES_DATA.recipes.find(r => r.id === recipeId);
  if (!recipe) return;

  currentRecipeId = recipeId;
  currentServingsMultiplier = 1;
  const have = getHaveItems(recipeId);

  injectRecipeSchema(recipe);
  renderRecipeDetail(recipe, have);
  window.scrollTo({ top: 0, behavior: 'smooth' });

  trackEvent('recipe_view', { recipe_key: recipeKeyOf(recipeId), recipe_id: recipeId, series: recipe.series });
}

function renderRecipeDetail(recipe, have) {
  const container = document.getElementById('tab-recipe');
  const highPrice = recipe.home_price.amount_high || recipe.home_price.amount || 0;
  const savings = recipe.restaurant_price.amount - highPrice;
  const seriesInfo = (window.RECIPES_DATA.series && window.RECIPES_DATA.series[recipe.series]) || {};
  const baseServings = recipe.base_servings || 4;
  const currentServings = Math.round(baseServings * currentServingsMultiplier);

  container.innerHTML = `
    <div class="recipe-detail">
      <button class="recipe-back" onclick="renderRecipeList()">← All Recipes</button>

      <!-- HERO -->
      <header class="recipe-detail__head">
        <span class="series-badge series-badge--${recipe.series} series-badge--lg">
          ${seriesInfo.emoji} ${seriesInfo.label}
        </span>
        <div class="recipe-detail__emoji">${recipe.emoji || '🍽️'}</div>
        <h1 class="recipe-detail__name">${recipe.name}</h1>
        <p class="recipe-detail__tagline">${recipe.tagline}</p>

        <div class="recipe-meta-row">
          <div class="recipe-meta-pill">⏱ ${recipe.total_time_min || recipe.prep_time_min || 0} min</div>
          <div class="recipe-meta-pill">📊 ${recipe.difficulty || 'easy'}</div>
          ${recipe.calories_per_serving ? `<div class="recipe-meta-pill">🔥 ${recipe.calories_per_serving} cal</div>` : ''}
          ${recipe.macros_per_serving ? `<div class="recipe-meta-pill">💪 ${recipe.macros_per_serving.protein_g}g protein</div>` : ''}
        </div>

        <div class="recipe-pricecompare">
          <div class="pc-row">
            <div>
              <div class="pc-label">At restaurant</div>
              <div class="pc-where">${recipe.restaurant_price.where}</div>
            </div>
            <span class="pc-amount pc-amount--out">$${recipe.restaurant_price.amount}</span>
          </div>
          <div class="pc-row">
            <div>
              <div class="pc-label">At home</div>
              <div class="pc-where">${recipe.home_price.unit || 'per serving'}</div>
            </div>
            <span class="pc-amount pc-amount--home">${formatHomePrice(recipe.home_price)}</span>
          </div>
          <div class="pc-savings">You save ${recipe.home_price.savings_pct_low !== undefined ? `${recipe.home_price.savings_pct_low}-${recipe.home_price.savings_pct_high}%` : `${recipe.home_price.savings_pct || 0}%`}</div>
          ${recipe.home_price.first_batch_note ? `<div class="pc-first-batch">ⓘ ${recipe.home_price.first_batch_note}</div>` : ''}
          <button class="pc-share-btn" onclick="shareRecipe('${recipe.id}')">🤑 Share how much I saved</button>
        </div>

        ${recipe.why_this_works ? `
          <div class="recipe-why">
            <strong>Why this works:</strong> ${recipe.why_this_works}
          </div>
        ` : ''}
      </header>

      ${recipe.series === 'my_recipe' ? renderMyRecipeActions(recipe) : ''}

      <!-- INGREDIENTS with checkboxes + servings -->
      <section class="recipe-ingredients">
        <div class="recipe-section__head">
          <h3 class="recipe-section__title">🥘 Ingredients</h3>
          <div class="servings-scaler">
            <span class="servings-label">Servings:</span>
            <button class="servings-btn" onclick="adjustServings(-1, '${recipe.id}')">−</button>
            <span class="servings-value" id="servings-value">${currentServings}</span>
            <button class="servings-btn" onclick="adjustServings(1, '${recipe.id}')">+</button>
          </div>
        </div>

        ${renderIngredientList(recipe, have)}

        <div class="ingredient-summary" id="ingredient-summary">
          ${renderIngredientSummary(recipe, have)}
        </div>

        <div class="shop-routes">
          ${renderShopButtons(recipe, have)}
        </div>
      </section>

      <!-- TOOLS -->
      ${recipe.tools && recipe.tools.length > 0 ? `
        <section class="recipe-tools">
          <h3 class="recipe-section__title">🔪 Tools</h3>
          <ul class="tool-list">
            ${recipe.tools.map(t => {
              // tools may be plain strings (LLM 출력) or objects {name, amazon_search}
              const name = typeof t === 'string' ? t : (t.name || '');
              const q = typeof t === 'string' ? t : (t.amazon_search || t.name || '');
              if (!name) return '';
              return `
              <li class="tool-item">
                <span>${name}</span>
                <a href="${window.AmazonAffiliate.searchUrl(q)}"
                   target="_blank" rel="nofollow sponsored noopener" class="ing-link">
                  Find on Amazon
                </a>
              </li>
            `;}).join('')}
          </ul>
        </section>
      ` : ''}

      <!-- INSTRUCTIONS - 단계별 카드 -->
      <section class="recipe-steps">
        <div class="recipe-section__head">
          <h3 class="recipe-section__title">📝 Instructions</h3>
          <button class="cook-mode-btn" onclick="enterCookMode('${recipe.id}')">
            👨‍🍳 Cook Mode
          </button>
        </div>
        <div class="step-cards">
          ${recipe.instructions.map((step, i) => renderStepCard(step, i, recipe)).join('')}
        </div>
      </section>

      <!-- PRO TIPS -->
      ${recipe.pro_tips && recipe.pro_tips.length > 0 ? `
        <section class="recipe-tips">
          <h3 class="recipe-section__title">💡 Pro tips</h3>
          <ul class="tip-list">
            ${recipe.pro_tips.map(tip => `<li class="tip-item">${tip}</li>`).join('')}
          </ul>
        </section>
      ` : ''}

      <!-- VARIATIONS -->
      ${recipe.variations && recipe.variations.length > 0 ? `
        <section class="recipe-variations">
          <h3 class="recipe-section__title">🔄 Variations</h3>
          <div class="variation-list">
            ${recipe.variations.map(v => `
              <div class="variation-item">
                <strong>${v.name}</strong>
                <span>${v.change}</span>
              </div>
            `).join('')}
          </div>
        </section>
      ` : ''}

      <!-- VIDEOS -->
      ${window.VideoEmbed && recipe.videos && recipe.videos.length > 0
        ? window.VideoEmbed.renderSection(recipe)
        : ''}

      <!-- BACKGROUND / STORY -->
      ${recipe.background ? `
        <section class="recipe-background">
          <h3 class="recipe-section__title">📖 The story</h3>
          <p>${recipe.background}</p>
        </section>
      ` : ''}

      <!-- CROSS-LINK -->
      <section class="recipe-crosslink">
        <p>Looking for cheap food spots near you?</p>
        <button class="btn-crosslink" onclick="switchTab('map')">
          🗺️ Browse the Map →
        </button>
      </section>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────
// 재료 리스트 렌더링 (체크박스 + Pantry/Fresh 섹션 분리)
// ─────────────────────────────────────────────────────────
function renderIngredientList(recipe, have) {
  const pantry = recipe.ingredients.filter(i => i.type === 'pantry');
  const fresh = recipe.ingredients.filter(i => i.type === 'fresh');

  return `
    ${pantry.length > 0 ? `
      <div class="ing-group">
        <div class="ing-group__label">📦 Pantry</div>
        <ul class="ing-list">
          ${pantry.map(i => renderIngredientRow(i, recipe.id, have)).join('')}
        </ul>
      </div>
    ` : ''}
    ${fresh.length > 0 ? `
      <div class="ing-group">
        <div class="ing-group__label">🥬 Fresh</div>
        <ul class="ing-list">
          ${fresh.map(i => renderIngredientRow(i, recipe.id, have)).join('')}
        </ul>
      </div>
    ` : ''}
  `;
}

function renderIngredientRow(ingredient, recipeId, have) {
  const hasIt = have.has(ingredient.id);
  const scaledQty = scaleQuantity(ingredient.qty, currentServingsMultiplier);
  const route = window.AmazonAffiliate.bestRoute(ingredient);
  const linkLabel = ingredient.type === 'fresh' ? 'Amazon Fresh' : 'Amazon';
  const rk = recipeKeyOf(recipeId);
  const rkLit = rk ? `'${rk}'` : 'null';

  return `
    <li class="ing-item ${hasIt ? 'is-have' : ''}" data-ing-id="${ingredient.id}">
      <label class="ing-check-label">
        <input type="checkbox" class="ing-check" ${hasIt ? 'checked' : ''}
               onchange="toggleHave('${recipeId}', '${ingredient.id}')">
        <span class="ing-check-box"></span>
      </label>
      <div class="ing-info">
        <div class="ing-name">
          <strong>${formatQty(scaledQty)} ${ingredient.unit || ''}</strong>
          ${ingredient.name}
        </div>
        ${ingredient.note ? `<div class="ing-note">${ingredient.note}</div>` : ''}
      </div>
      <div class="ing-actions">
        <a href="${route.url}" target="_blank" rel="nofollow sponsored noopener" class="ing-link ${ingredient.type === 'fresh' ? 'ing-link--fresh' : ''}"
           onclick="trackEvent('amazon_click', {recipe_key:${rkLit}, ingredient_id:'${jsAttr(ingredient.id)}', route:'ingredient_${ingredient.type || 'pantry'}'})">
          ${linkLabel}
        </a>
      </div>
    </li>
  `;
}

function renderIngredientSummary(recipe, have) {
  const total = recipe.ingredients.length;
  const haveCount = recipe.ingredients.filter(i => have.has(i.id)).length;
  const needCount = total - haveCount;

  if (haveCount === 0) {
    return `<span>${total} ingredients needed</span>`;
  }
  if (needCount === 0) {
    return `<span class="summary-ready">✅ You have everything! Ready to cook.</span>`;
  }
  return `<span><strong>${needCount}</strong> to buy · <strong>${haveCount}</strong> in pantry</span>`;
}

function renderShopButtons(recipe, have) {
  // 필요한 거 (체크 안 한 거)만 추출
  const needed = recipe.ingredients.filter(i => !have.has(i.id));
  const pantryNeeded = needed.filter(i => i.type === 'pantry');
  const freshNeeded = needed.filter(i => i.type === 'fresh');
  const tools = recipe.tools || [];
  const rk = recipeKeyOf(recipe.id);
  const rkLit = rk ? `'${rk}'` : 'null';

  let buttons = [];

  if (needed.length === 0) {
    // 다 가지고 있음
    return `<div class="shop-ready">🎉 You're ready to cook!</div>`;
  }

  if (pantryNeeded.length > 0) {
    const hero = window.AmazonAffiliate.heroIngredient(pantryNeeded);
    const url = window.AmazonAffiliate.searchUrl(hero.amazon_search || hero.name);
    const others = pantryNeeded.length - 1;
    buttons.push(`
      <a href="${url}" target="_blank" rel="nofollow sponsored noopener"
         class="shop-btn shop-btn--primary"
         onclick="trackEvent('amazon_click', {recipe_key:${rkLit}, ingredient_id:'${jsAttr(hero.id || hero.name)}', route:'shop_pantry'})">
        <span class="shop-btn__main">🛒 Get the ${hero.name} on Amazon</span>
        <span class="shop-btn__sub">${others > 0 ? `Then tap the other ${others} item${others > 1 ? 's' : ''} below` : 'Pantry staple'}</span>
      </a>
    `);
  }

  if (freshNeeded.length > 0) {
    const hero = window.AmazonAffiliate.heroIngredient(freshNeeded);
    const url = window.AmazonAffiliate.searchUrl(hero.amazon_search || hero.name);
    const others = freshNeeded.length - 1;
    buttons.push(`
      <a href="${url}" target="_blank" rel="nofollow sponsored noopener"
         class="shop-btn"
         onclick="trackEvent('amazon_click', {recipe_key:${rkLit}, ingredient_id:'${jsAttr(hero.id || hero.name)}', route:'shop_fresh'})">
        <span class="shop-btn__main">🥬 Get the ${hero.name} on Amazon</span>
        <span class="shop-btn__sub">${others > 0 ? `Then tap the other ${others} fresh item${others > 1 ? 's' : ''} below` : 'Fresh pick'}</span>
      </a>
    `);
  }

  return buttons.join('');
}

// ─────────────────────────────────────────────────────────
// 체크박스 toggle (재료 있다/없다)
// ─────────────────────────────────────────────────────────
function toggleHave(recipeId, ingredientId) {
  const have = getHaveItems(recipeId);
  if (have.has(ingredientId)) {
    have.delete(ingredientId);
  } else {
    have.add(ingredientId);
  }
  saveHaveItems(recipeId, have);

  // UI 일부 업데이트 (전체 리렌더 안 하고)
  const recipe = window.RECIPES_DATA.recipes.find(r => r.id === recipeId);
  const row = document.querySelector(`.ing-item[data-ing-id="${ingredientId}"]`);
  if (row) row.classList.toggle('is-have', have.has(ingredientId));

  const summary = document.getElementById('ingredient-summary');
  if (summary) summary.innerHTML = renderIngredientSummary(recipe, have);

  // Shop 버튼 다시 그리기
  const shopContainer = document.querySelector('.recipe-ingredients .shop-routes');
  if (shopContainer) shopContainer.innerHTML = renderShopButtons(recipe, have);

  trackEvent('ingredient_check', {
    recipe_key: recipeKeyOf(recipeId),
    ingredient_id: ingredientId,
    on: have.has(ingredientId),
  });
}

// ─────────────────────────────────────────────────────────
// Servings 조정
// ─────────────────────────────────────────────────────────
function adjustServings(delta, recipeId) {
  const recipe = window.RECIPES_DATA.recipes.find(r => r.id === recipeId);
  if (!recipe) return;
  const base = recipe.base_servings || 4;
  const current = Math.round(base * currentServingsMultiplier);
  const newServings = Math.max(1, Math.min(50, current + delta));
  currentServingsMultiplier = newServings / base;

  document.getElementById('servings-value').textContent = newServings;

  // 재료 양 업데이트 (DOM 직접 수정)
  recipe.ingredients.forEach(ing => {
    const row = document.querySelector(`.ing-item[data-ing-id="${ing.id}"] .ing-name strong`);
    if (row) {
      const scaled = scaleQuantity(ing.qty, currentServingsMultiplier);
      row.textContent = `${formatQty(scaled)} ${ing.unit || ''}`;
    }
  });
}

// ─────────────────────────────────────────────────────────
// 수량 계산 + 포맷
// ─────────────────────────────────────────────────────────
function scaleQuantity(qty, multiplier) {
  if (!qty || typeof qty !== 'number') return qty;
  return qty * multiplier;
}

function formatQty(qty) {
  if (!qty && qty !== 0) return '';
  if (typeof qty !== 'number') return qty;

  // 정수면 그대로
  if (qty % 1 === 0) return String(qty);

  // 분수 매핑
  const fractions = [
    [0.125, '1/8'], [0.25, '1/4'], [0.333, '1/3'],
    [0.5, '1/2'], [0.667, '2/3'], [0.75, '3/4']
  ];
  const whole = Math.floor(qty);
  const frac = qty - whole;
  const closest = fractions.reduce((best, [val, label]) => {
    return Math.abs(val - frac) < Math.abs(best[0] - frac) ? [val, label] : best;
  }, [0, '']);

  if (Math.abs(closest[0] - frac) < 0.05) {
    return whole > 0 ? `${whole} ${closest[1]}` : closest[1];
  }

  // 분수 매핑 실패 → 소수점 1자리
  return qty.toFixed(qty < 1 ? 2 : 1);
}

// ─────────────────────────────────────────────────────────
// Step 카드 (단계별)
// ─────────────────────────────────────────────────────────
function renderStepCard(step, index, recipe) {
  const stepNumber = index + 1;
  const timerInfo = step.timer_seconds
    ? `<button class="step-timer-btn" onclick="startStepTimer(${step.timer_seconds}, this)">
         ▶ ${formatTimerLabel(step.timer_seconds)}
       </button>`
    : '';

  return `
    <article class="step-card" data-step-id="${step.id}">
      <div class="step-card__header">
        <span class="step-num">${stepNumber}</span>
        <h4 class="step-title">${step.title || `Step ${stepNumber}`}</h4>
      </div>
      <div class="step-card__body">
        <p class="step-content">${step.content}</p>
        ${timerInfo}
      </div>
    </article>
  `;
}

function formatTimerLabel(seconds) {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    return `${h}h timer`;
  }
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    return `${m}min timer`;
  }
  return `${seconds}s timer`;
}

// ─────────────────────────────────────────────────────────
// Step 타이머
// ─────────────────────────────────────────────────────────
function startStepTimer(seconds, btn) {
  const orig = btn.textContent;
  let remaining = seconds;
  btn.classList.add('is-running');

  const updateLabel = () => {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    btn.textContent = `⏱ ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  updateLabel();

  const interval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(interval);
      btn.classList.remove('is-running');
      btn.classList.add('is-done');
      btn.textContent = '✅ Done!';
      // 알림 (브라우저 권한 있으면)
      try {
        if (Notification.permission === 'granted') {
          new Notification('Timer done!', { body: 'Step timer finished.' });
        }
      } catch {}
      // 진동 (모바일)
      try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {}
      setTimeout(() => {
        btn.classList.remove('is-done');
        btn.textContent = orig;
      }, 5000);
      return;
    }
    updateLabel();
  }, 1000);

  // 클릭하면 취소
  btn.onclick = () => {
    clearInterval(interval);
    btn.classList.remove('is-running');
    btn.textContent = orig;
    btn.onclick = () => startStepTimer(seconds, btn);
  };
}

// ─────────────────────────────────────────────────────────
// Cook Mode (큰 화면, 한 단계씩)
// ─────────────────────────────────────────────────────────
function enterCookMode(recipeId) {
  const recipe = window.RECIPES_DATA.recipes.find(r => r.id === recipeId);
  if (!recipe) return;

  trackEvent('cook_mode', { recipe_key: recipeKeyOf(recipeId), recipe_id: recipeId });

  // 화면 잠금 방지 (Wake Lock API)
  let wakeLock = null;
  (async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch {}
  })();

  let stepIdx = 0;
  const overlay = document.createElement('div');
  overlay.className = 'cook-mode-overlay';
  document.body.appendChild(overlay);

  function renderCurrentStep() {
    const step = recipe.instructions[stepIdx];
    const total = recipe.instructions.length;
    overlay.innerHTML = `
      <div class="cook-mode">
        <div class="cook-mode__head">
          <span>${recipe.emoji} ${recipe.name}</span>
          <button class="cook-mode__close" onclick="exitCookMode()">✕</button>
        </div>
        <div class="cook-mode__progress">
          Step ${stepIdx + 1} of ${total}
          <div class="cook-mode__bar">
            <div class="cook-mode__bar-fill" style="width:${((stepIdx + 1) / total) * 100}%"></div>
          </div>
        </div>
        <div class="cook-mode__body">
          <h2 class="cook-mode__title">${step.title || `Step ${stepIdx + 1}`}</h2>
          <p class="cook-mode__content">${step.content}</p>
          ${step.timer_seconds ? `
            <button class="cook-mode__timer" onclick="startStepTimer(${step.timer_seconds}, this)">
              ▶ ${formatTimerLabel(step.timer_seconds)}
            </button>
          ` : ''}
        </div>
        <div class="cook-mode__footer">
          <button class="cook-mode__nav" onclick="window.cookModeStep(-1)"
                  ${stepIdx === 0 ? 'disabled' : ''}>← Prev</button>
          <button class="cook-mode__nav cook-mode__nav--next"
                  onclick="window.cookModeStep(1)"
                  ${stepIdx === total - 1 ? 'disabled' : ''}>Next →</button>
        </div>
      </div>
    `;
  }

  window.cookModeStep = function(delta) {
    stepIdx = Math.max(0, Math.min(recipe.instructions.length - 1, stepIdx + delta));
    renderCurrentStep();
  };

  window.exitCookMode = function() {
    if (wakeLock) { try { wakeLock.release(); } catch {} }
    overlay.remove();
  };

  renderCurrentStep();
}

// ─────────────────────────────────────────────────────────
// Schema.org markup
// ─────────────────────────────────────────────────────────
function injectRecipeSchema(recipe) {
  document.querySelectorAll('script[data-recipe-schema]').forEach(s => s.remove());
  const schema = window.AmazonAffiliate.buildSchema(recipe);
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.dataset.recipeSchema = 'true';
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
}

// ─────────────────────────────────────────────────────────
// 절약 모먼트 공유 (성장 엔진 1) — 설계 §5 구현 B
// detail.js shareSpot() 패턴 재사용: navigator.share + clipboard 폴백.
// 공개 레시피면 /recipe/:slug, 아니면 홈 + "공개하면 링크 생겨요" 넛지.
// share_click 이벤트 발신 → 공유 효과가 events(A)로 측정됨.
// ─────────────────────────────────────────────────────────
function shareRecipe(recipeId) {
  const recipe = window.RECIPES_DATA && window.RECIPES_DATA.recipes.find(r => r.id === recipeId);
  if (!recipe) return;

  const hp = recipe.home_price || {};
  const homeStr = formatHomePrice(hp);
  const rest = recipe.restaurant_price && recipe.restaurant_price.amount;
  const pct = hp.savings_pct_low !== undefined
    ? `${hp.savings_pct_low}-${hp.savings_pct_high}`
    : (hp.savings_pct != null ? String(hp.savings_pct) : null);

  const slug = recipe._slug;
  const hasPublic = !!slug;
  const url = hasPublic ? `${location.origin}/recipe/${slug}` : location.origin;
  const restTxt = rest ? ` instead of $${rest} eating out` : '';
  const pctTxt = pct ? ` — saved ${pct}% 🤑` : ' 🤑';
  const text = `I made ${recipe.name} at home for ${homeStr}${restTxt}${pctTxt}`;
  const nudge = hasPublic ? '' : `\n\nPublish your recipe to get a shareable link → ${location.origin}`;

  trackEvent('share_click', {
    recipe_key: recipeKeyOf(recipeId),
    channel: (navigator.share ? 'native' : 'clipboard'),
    has_public_url: hasPublic,
  });

  if (navigator.share) {
    navigator.share({ title: BRAND.name, text, url }).catch(() => {});
  } else {
    try {
      navigator.clipboard.writeText(`${text}\n${url}${nudge}`);
      showToast(hasPublic ? 'Copied! Paste it anywhere 🤑' : 'Copied! Publish to get a recipe link');
    } catch { showToast('Could not copy'); }
  }
}

// ─────────────────────────────────────────────────────────
// 가벼운 명시 피드백 (👍/제보) — 설계 §3·§5 가드레일
// feedback 이벤트 → DB 트리거가 report 누적 시 자동 숨김 (events.sql).
// recipe_key(uuid)가 있는 생성 레시피에만 의미. 정적 레시피는 무시.
// ─────────────────────────────────────────────────────────
function submitFeedback(recipeId, verdict) {
  const rk = recipeKeyOf(recipeId);
  if (!rk) return;
  trackEvent('feedback', { recipe_key: rk, verdict });
  showToast(verdict === 'up' ? '👍 Thanks for the love!' : '🚩 Reported. Thanks for flagging.');
  const row = document.getElementById('recipeFeedbackRow');
  if (row) row.querySelectorAll('button').forEach(b => { b.disabled = true; });
}

// ═══════════════════════════════════════════════════════════
// MY RECIPE — YouTube 링크 → AI 레시피 + Amazon 장보기
// ═══════════════════════════════════════════════════════════

function getMyRecipes() {
  try { return JSON.parse(localStorage.getItem('bn_my_recipes') || '[]'); }
  catch { return []; }
}

function saveMyRecipeEntry(entry) {
  const list = getMyRecipes().filter(e => e.key !== entry.key);
  list.unshift(entry);
  try { localStorage.setItem('bn_my_recipes', JSON.stringify(list.slice(0, 30))); } catch {}
  trackEvent('save', { recipe_key: entry.key });
}

function deleteMyRecipe(key) {
  const list = getMyRecipes().filter(e => e.key !== key);
  try { localStorage.setItem('bn_my_recipes', JSON.stringify(list)); } catch {}
  renderRecipeList();
}

function renderMyRecipeSection() {
  const saved = getMyRecipes();
  return `
    <section class="myrecipe-box">
      <h3 class="myrecipe-title">🎬 Turn any YouTube video into a recipe</h3>
      <p class="myrecipe-sub">Paste a cooking video — get your own recipe card + one-tap Amazon shopping list.</p>
      <input class="form-input myrecipe-url" id="myrecipeUrl" type="url"
             placeholder="https://www.youtube.com/watch?v=..." inputmode="url">
      <div class="myrecipe-controls">
        <label class="myrecipe-field">Servings
          <input class="form-input" id="myrecipeServings" type="number" min="1" max="12" value="2">
        </label>
        <label class="myrecipe-field">Budget $
          <input class="form-input" id="myrecipeBudget" type="number" min="1" max="200" placeholder="any">
        </label>
        <button type="button" class="myrecipe-btn" id="myrecipeBtn" onclick="generateMyRecipe()">
          ✨ Make My Recipe
        </button>
      </div>
      <div class="myrecipe-status" id="myrecipeStatus" style="display:none"></div>
      ${saved.length > 0 ? `
        <div class="myrecipe-saved">
          <div class="myrecipe-saved__label">My recipes (only on this device)</div>
          ${saved.map(e => `
            <div class="myrecipe-saved__row">
              <button type="button" class="myrecipe-saved__open" onclick="openMyRecipe('${e.key}')">
                ${e.emoji || '🍽️'} ${escapeHtml(e.name || 'Recipe')}
              </button>
              <button type="button" class="myrecipe-saved__del" title="Remove"
                      onclick="deleteMyRecipe('${e.key}')">✕</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </section>
  `;
}

function setMyRecipeStatus(msg, isError) {
  const el = document.getElementById('myrecipeStatus');
  if (!el) return;
  if (!msg) { el.style.display = 'none'; return; }
  el.textContent = msg;
  el.style.display = '';
  el.classList.toggle('is-error', !!isError);
}

// ── Remix + Publish ──────────────────────────────────────────

function renderMyRecipeActions(recipe) {
  const creator = recipe.videos && recipe.videos[0] && recipe.videos[0].creator;
  const credit = [
    creator ? `🎬 adapted from <strong>${escapeHtml(creator)}</strong>'s video` : '',
    recipe._author ? `👨‍🍳 by <strong>${escapeHtml(recipe._author)}</strong>` : '',
  ].filter(Boolean).join(' · ');

  const publishedUrl = recipe._slug ? `${location.origin}/recipe/${recipe._slug}` : null;

  return `
    <section class="myrecipe-actions">
      ${credit ? `<div class="myrecipe-credit">${credit}</div>` : ''}

      <div class="myrecipe-remix">
        <div class="myrecipe-actions__label">🧪 Remix this recipe</div>
        <p class="myrecipe-actions__hint">Tell me how to change it — the core stays, your twist goes in.</p>
        <textarea class="form-input myrecipe-remix__input" id="remixInput" rows="2"
          placeholder="e.g. make it spicier · no oven · add cheese · double the protein · under $10"></textarea>
        <button type="button" class="myrecipe-btn myrecipe-btn--sm" id="remixBtn"
                onclick="remixMyRecipe('${recipe.id}')">✨ Remix it</button>
      </div>

      <div class="myrecipe-publish">
        ${publishedUrl ? `
          <div class="myrecipe-actions__label">🌍 Published!</div>
          <div class="myrecipe-publish__url">
            <a href="${publishedUrl}" target="_blank">${publishedUrl}</a>
            <button type="button" class="myrecipe-btn myrecipe-btn--sm"
              onclick="navigator.clipboard.writeText('${publishedUrl}').then(()=>showToast('Link copied!'))">Copy</button>
          </div>
        ` : `
          <div class="myrecipe-actions__label">🌍 Publish to the world</div>
          <p class="myrecipe-actions__hint">Gets a public page with your name on it. Anyone can find it on Google.</p>
          <div class="myrecipe-publish__row">
            <input class="form-input" id="publishNick" maxlength="30" placeholder="Your chef name"
                   value="${typeof generateNickname === 'function' ? generateNickname() : ''}">
            <button type="button" class="myrecipe-btn myrecipe-btn--sm" id="publishBtn"
                    onclick="publishMyRecipe('${recipe.id}')">Publish</button>
          </div>
        `}
      </div>

      <div class="myrecipe-feedback" id="recipeFeedbackRow">
        <span class="myrecipe-feedback__label">Was this recipe good?</span>
        <button type="button" class="myrecipe-feedback__btn" onclick="submitFeedback('${recipe.id}', 'up')">👍 Yes</button>
        <button type="button" class="myrecipe-feedback__btn" onclick="submitFeedback('${recipe.id}', 'report')">🚩 Report</button>
      </div>

      <div class="myrecipe-status" id="myrecipeActionStatus" style="display:none"></div>
    </section>
  `;
}

function setActionStatus(msg, isError) {
  const el = document.getElementById('myrecipeActionStatus');
  if (!el) return;
  if (!msg) { el.style.display = 'none'; return; }
  el.textContent = msg;
  el.style.display = '';
  el.classList.toggle('is-error', !!isError);
}

async function remixMyRecipe(recipeId) {
  const key = recipeId.slice(4); // strip 'gen-'
  const text = (document.getElementById('remixInput')?.value || '').trim();
  if (text.length < 3) { setActionStatus('Tell me what to change first.', true); return; }

  const btn = document.getElementById('remixBtn');
  btn.disabled = true;
  btn.textContent = '🍳 Remixing...';
  setActionStatus('Rewriting the recipe with your twist... ~15 seconds.');

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-recipe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ access_key: key, remix: text }),
    });
    const data = await resp.json();
    if (!resp.ok || data.error) {
      setActionStatus(MYRECIPE_ERRORS[data.error] || 'Remix failed. Try rewording it.', true);
      btn.disabled = false;
      btn.textContent = '✨ Remix it';
      return;
    }
    const id = registerGeneratedRecipe(data);
    trackEvent('remix', { parent_key: key, recipe_key: data.access_key });
    saveMyRecipeEntry({ key: data.access_key, name: data.recipe.name, emoji: data.recipe.emoji, at: Date.now() });
    showToast('Remixed! This is your new version.');
    openRecipe(id);
  } catch {
    setActionStatus('Network error. Try again.', true);
    btn.disabled = false;
    btn.textContent = '✨ Remix it';
  }
}

async function publishMyRecipe(recipeId) {
  const key = recipeId.slice(4);
  const recipe = window.RECIPES_DATA.recipes.find(r => r.id === recipeId);
  const nickname = (document.getElementById('publishNick')?.value || '').trim();
  if (!nickname) { setActionStatus('Pick a chef name first — it goes on the page.', true); return; }

  const btn = document.getElementById('publishBtn');
  btn.disabled = true;
  btn.textContent = 'Publishing...';

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-recipe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ access_key: key, action: 'publish', nickname }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.slug) {
      setActionStatus('Publish failed. Try again.', true);
      btn.disabled = false;
      btn.textContent = 'Publish';
      return;
    }
    recipe._slug = data.slug;
    recipe._author = nickname;
    trackEvent('publish', { recipe_key: key, slug: data.slug });
    showToast('🌍 Published!');
    openRecipe(recipeId); // re-render with the public link
  } catch {
    setActionStatus('Network error. Try again.', true);
    btn.disabled = false;
    btn.textContent = 'Publish';
  }
}

// 생성된 레시피를 RECIPES_DATA에 등록하고 id 반환
function registerGeneratedRecipe(data) {
  if (!window.RECIPES_DATA) window.RECIPES_DATA = { recipes: [], series: {} };
  if (!window.RECIPES_DATA.series) window.RECIPES_DATA.series = {};
  window.RECIPES_DATA.series.my_recipe = { emoji: '🎬', label: 'My Recipe' };

  const recipe = data.recipe;
  recipe.id = 'gen-' + data.access_key;
  recipe.series = 'my_recipe';
  if (data.slug) recipe._slug = data.slug;
  if (data.author_nickname) recipe._author = data.author_nickname;
  if (!recipe.home_price) recipe.home_price = { amount_low: 0, amount_high: 0, unit: 'per serving' };
  const hp = recipe.home_price;
  if (hp.savings_pct_low != null && hp.savings_pct_high != null && hp.savings_pct_low > hp.savings_pct_high) {
    const t = hp.savings_pct_low; hp.savings_pct_low = hp.savings_pct_high; hp.savings_pct_high = t;
  }
  if (hp.amount_low != null && hp.amount_high != null && hp.amount_low > hp.amount_high) {
    const t = hp.amount_low; hp.amount_low = hp.amount_high; hp.amount_high = t;
  }
  if (!recipe.restaurant_price) recipe.restaurant_price = { amount: 0, where: '' };
  if (!recipe.ingredients) recipe.ingredients = [];
  if (!recipe.instructions) recipe.instructions = [];
  if (!recipe.tags) recipe.tags = [];
  if (recipe.prep_time_min == null) recipe.prep_time_min = recipe.total_time_min || 0;

  const list = window.RECIPES_DATA.recipes;
  const idx = list.findIndex(r => r.id === recipe.id);
  if (idx >= 0) list[idx] = recipe; else list.push(recipe);
  return recipe.id;
}

const MYRECIPE_ERRORS = {
  invalid_url: 'That doesn\'t look like a YouTube link.',
  video_unavailable: 'Couldn\'t read that video. Is it public?',
  not_a_recipe: 'That video doesn\'t look like a cooking video.',
  rate_limited: 'Daily limit reached (10/day). Come back tomorrow!',
  bad_request: 'Couldn\'t apply that change — try rewording it.',
  not_found: 'Recipe not found.',
};

async function generateMyRecipe() {
  const url = (document.getElementById('myrecipeUrl')?.value || '').trim();
  const servings = parseInt(document.getElementById('myrecipeServings')?.value) || 2;
  const budgetRaw = document.getElementById('myrecipeBudget')?.value;
  const budget = budgetRaw ? parseFloat(budgetRaw) : null;

  if (!/youtube\.com|youtu\.be/.test(url)) {
    setMyRecipeStatus('Paste a YouTube link first (youtube.com or youtu.be).', true);
    return;
  }

  const btn = document.getElementById('myrecipeBtn');
  btn.disabled = true;
  btn.textContent = '🍳 Cooking...';
  setMyRecipeStatus('Watching the video & writing your recipe... usually takes ~20 seconds.');

  trackEvent('generate_start', { servings, budget, has_url: true });
  const t0 = Date.now();

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-recipe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ url, servings, budget }),
    });
    const data = await resp.json();

    if (!resp.ok || data.error) {
      setMyRecipeStatus(MYRECIPE_ERRORS[data.error] || 'Something went wrong. Try again.', true);
      trackEvent('generate_fail', { error: (data && data.error) || 'unknown' });
      return;
    }

    const id = registerGeneratedRecipe(data);
    const recipe = data.recipe;
    const hp = recipe.home_price || {};
    trackEvent('generate_success', {
      recipe_key: data.access_key,
      had_transcript: !!data.had_transcript,
      savings_pct: hp.savings_pct_high != null ? hp.savings_pct_high : (hp.savings_pct || null),
      time_ms: Date.now() - t0,
    });
    saveMyRecipeEntry({
      key: data.access_key,
      name: recipe.name,
      emoji: recipe.emoji,
      at: Date.now(),
    });
    openRecipe(id);
  } catch (err) {
    console.error('generateMyRecipe error:', err);
    setMyRecipeStatus('Network error. Try again.', true);
    trackEvent('generate_fail', { error: 'network' });
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Make My Recipe';
  }
}

async function openMyRecipe(key) {
  const id = 'gen-' + key;
  trackEvent('revisit', { recipe_key: key });
  const inMemory = window.RECIPES_DATA && window.RECIPES_DATA.recipes.find(r => r.id === id);
  if (inMemory) { openRecipe(id); return; }

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-recipe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ access_key: key }),
    });
    if (!resp.ok) { showToast('Recipe not found'); deleteMyRecipe(key); return; }
    const data = await resp.json();
    openRecipe(registerGeneratedRecipe(data));
  } catch {
    showToast('Network error. Try again.');
  }
}

// 전역 노출
window.initRecipeTab = initRecipeTab;
window.openRecipe = openRecipe;
window.renderRecipeList = renderRecipeList;
window.setSeries = setSeries;
window.toggleHave = toggleHave;
window.adjustServings = adjustServings;
window.startStepTimer = startStepTimer;
window.enterCookMode = enterCookMode;
window.generateMyRecipe = generateMyRecipe;
window.openMyRecipe = openMyRecipe;
window.deleteMyRecipe = deleteMyRecipe;
window.remixMyRecipe = remixMyRecipe;
window.publishMyRecipe = publishMyRecipe;
window.shareRecipe = shareRecipe;
window.submitFeedback = submitFeedback;
window.trackEvent = trackEvent;
