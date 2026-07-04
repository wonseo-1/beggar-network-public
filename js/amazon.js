// ═══════════════════════════════════════════════════════════
// AMAZON / INSTACART AFFILIATE
// 모든 진입점 지원: 한 방 담기 / 개별 검색 / Beggar's Pick / Instacart
// 핵심 원칙: 사용자가 Amazon에 도착하기만 하면 24시간 쿠키로 수수료
// ═══════════════════════════════════════════════════════════

const AMAZON_TAG = (window.RECIPES_DATA && window.RECIPES_DATA._meta && window.RECIPES_DATA._meta.affiliate_tag)
  || 'poorguys-20';

// ─────────────────────────────────────────────────────────
// 1. Amazon 일반 검색 (가장 안정적, 모든 재료에 작동)
// ─────────────────────────────────────────────────────────
function amazonSearchUrl(query) {
  const q = encodeURIComponent(query);
  return `https://www.amazon.com/s?k=${q}&tag=${AMAZON_TAG}`;
}

// ─────────────────────────────────────────────────────────
// 2. Amazon 상품 페이지 (ASIN 있을 때 - Beggar's Pick 용)
// ─────────────────────────────────────────────────────────
function amazonProductUrl(asin) {
  if (!asin) return null;
  return `https://www.amazon.com/dp/${asin}?tag=${AMAZON_TAG}`;
}

// ─────────────────────────────────────────────────────────
// 3. Add-to-Cart 한 번에 담기 (pantry만, 최대 10개)
// ─────────────────────────────────────────────────────────
function amazonCartUrl(items) {
  const valid = items.filter(i => i.asin).slice(0, 10);
  if (valid.length === 0) return null;
  const parts = valid.map((it, idx) => {
    return `ASIN.${idx + 1}=${it.asin}&Quantity.${idx + 1}=${it.qty_num || 1}`;
  });
  return `https://www.amazon.com/gp/aws/cart/add.html?${parts.join('&')}&AssociateTag=${AMAZON_TAG}`;
}

// ─────────────────────────────────────────────────────────
// 4. Amazon Fresh 검색 (신선식품, 지역별 가용성 따라 다름)
// ─────────────────────────────────────────────────────────
function amazonFreshSearchUrl(query) {
  const q = encodeURIComponent(query);
  return `https://www.amazon.com/s?k=${q}&i=amazonfresh&tag=${AMAZON_TAG}`;
}

// ─────────────────────────────────────────────────────────
// 5. Instacart 검색 (신선식품 진짜 답, affiliate X but UX 좋음)
// ─────────────────────────────────────────────────────────
function instacartSearchUrl(query) {
  const q = encodeURIComponent(query);
  return `https://www.instacart.com/store/s?k=${q}`;
}

// ─────────────────────────────────────────────────────────
// 6. 묶음 검색 — DEPRECATED
// 여러 재료 검색어를 한 쿼리에 이어붙이면 아마존이 상품 1개로 해석 못 해
// 결과가 비거나 엉뚱해진다. heroSearchUrl을 쓸 것. (호환 위해 남겨둠)
// ─────────────────────────────────────────────────────────
function amazonBulkSearchUrl(items) {
  const queries = items.map(i => i.amazon_search || i.name).slice(0, 5);
  return amazonSearchUrl(queries.join(' '));
}

// ─────────────────────────────────────────────────────────
// 6b. 히어로 재료 — 묶음 대신 "사러 갈 만한" 대표 재료 1개를 고른다
// 아마존 검색은 상품 1개 개념만 매칭되므로 묶음 검색은 깨진다.
// 보관 가능(pantry) + 구체적(브랜드 포함, 검색어가 김) 재료를 우선,
// 소금·설탕 같은 기본 양념은 후순위로.
// ─────────────────────────────────────────────────────────
const STAPLE_RE = /\b(salt|pepper|water|sugar|flour|oil|butter|garlic|onion|eggs?|milk|rice|pasta|baking soda|baking powder)\b/i;

function heroIngredient(items) {
  const cand = (items || []).filter(i => i && (i.amazon_search || i.name));
  if (cand.length === 0) return null;
  const score = (i) => {
    const q = i.amazon_search || i.name || '';
    let pts = q.length;                         // 구체적(브랜드 포함)일수록 길다
    if (i.type === 'pantry') pts += 30;          // 보관 가능 = 아마존이 강한 영역
    if (STAPLE_RE.test(i.name || '')) pts -= 60; // 기본 양념은 후순위
    return pts;
  };
  return cand.slice().sort((a, b) => score(b) - score(a))[0];
}

function heroSearchUrl(items) {
  const h = heroIngredient(items);
  return h ? amazonSearchUrl(h.amazon_search || h.name) : null;
}

// ─────────────────────────────────────────────────────────
// 7. 재료별 베스트 라우트 자동 선택
// ─────────────────────────────────────────────────────────
function bestAmazonRoute(ingredient) {
  // ASIN 있으면 정확한 상품 페이지
  if (ingredient.asin) {
    return {
      url: amazonProductUrl(ingredient.asin),
      label: 'Buy on Amazon',
      type: 'product'
    };
  }
  // 일반 검색
  return {
    url: amazonSearchUrl(ingredient.amazon_search || ingredient.name),
    label: ingredient.type === 'fresh' ? 'Search Amazon Fresh' : 'Search Amazon',
    type: 'search'
  };
}

// ─────────────────────────────────────────────────────────
// 8. "Shop the Recipe" — 메인 진입점들
// pantry는 cart로, fresh는 instacart로
// ─────────────────────────────────────────────────────────
function shopTheRecipe(recipe) {
  const pantry = recipe.ingredients.filter(i => i.type === 'pantry');
  const fresh = recipe.ingredients.filter(i => i.type === 'fresh');
  const tools = recipe.tools || [];
  const routes = [];

  // Pantry 묶음 (ASIN 있는 거 cart, 없으면 검색 - 사용자한테는 둘 다 "한 방"으로 보임)
  if (pantry.length > 0) {
    const withAsin = pantry.filter(i => i.asin);
    if (withAsin.length >= 2) {
      // ASIN 있으면 진짜 한 방 cart
      routes.push({
        label: `🛒 Shop all ${pantry.length} pantry items on Amazon`,
        sublabel: `One click → adds ${withAsin.length} to cart`,
        url: amazonCartUrl(withAsin),
        type: 'amazon_cart',
        primary: true
      });
    } else {
      // ASIN 없으면 묶음 검색 (사용자 UX는 비슷)
      routes.push({
        label: `🛒 Shop all ${pantry.length} pantry items on Amazon`,
        sublabel: 'Opens Amazon — all items in one search',
        url: amazonBulkSearchUrl(pantry),
        type: 'amazon_search',
        primary: true
      });
    }
  }

  // Fresh 묶음 (Amazon Fresh / Whole Foods - 같은 Amazon 검색)
  if (fresh.length > 0) {
    routes.push({
      label: `🥬 Shop ${fresh.length} fresh item${fresh.length > 1 ? 's' : ''} on Amazon Fresh`,
      sublabel: 'Same-day in 2,300+ cities (Whole Foods + Amazon Fresh)',
      url: amazonBulkSearchUrl(fresh),
      type: 'amazon_fresh',
      primary: false
    });
  }

  // Tools (있으면)
  if (tools.length > 0) {
    routes.push({
      label: `🔪 Shop ${tools.length} tool${tools.length > 1 ? 's' : ''} on Amazon`,
      sublabel: 'One-time purchase',
      url: amazonBulkSearchUrl(tools),
      type: 'amazon_tools',
      primary: false
    });
  }

  return routes;
}

// ─────────────────────────────────────────────────────────
// 9. Beggar's Pick URL (큐레이션된 단일 상품)
// ─────────────────────────────────────────────────────────
function beggarsPickUrl(pick) {
  if (!pick) return null;
  if (pick.asin) return amazonProductUrl(pick.asin);
  return amazonSearchUrl(pick.amazon_search || pick.name);
}

// ─────────────────────────────────────────────────────────
// Schema.org Recipe markup (SEO + Instacart 미래 인덱싱)
// ─────────────────────────────────────────────────────────
function buildRecipeSchema(recipe) {
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": recipe.name,
    "description": recipe.tagline,
    "recipeIngredient": recipe.ingredients.map(i => `${i.qty} ${i.name}`),
    "recipeInstructions": recipe.instructions.map((step, i) => ({
      "@type": "HowToStep",
      "position": i + 1,
      "text": step
    })),
    "totalTime": `PT${recipe.prep_time_min}M`,
    "recipeCategory": recipe.series === 'beggar_original' ? 'original' : 'copycat',
    "keywords": recipe.tags.join(", "),
    "video": (recipe.videos || []).filter(v => v.url).map(v => ({
      "@type": "VideoObject",
      "name": v.title,
      "contentUrl": v.url
    }))
  };
}

// 글로벌 노출
window.AmazonAffiliate = {
  searchUrl: amazonSearchUrl,
  productUrl: amazonProductUrl,
  cartUrl: amazonCartUrl,
  freshSearchUrl: amazonFreshSearchUrl,
  instacartUrl: instacartSearchUrl,
  bulkSearchUrl: amazonBulkSearchUrl,
  heroIngredient: heroIngredient,
  heroSearchUrl: heroSearchUrl,
  bestRoute: bestAmazonRoute,
  shopTheRecipe: shopTheRecipe,
  beggarsPickUrl: beggarsPickUrl,
  buildSchema: buildRecipeSchema,
  TAG: AMAZON_TAG
};
