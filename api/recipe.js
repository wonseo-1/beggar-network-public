// Vercel serverless function — server-rendered SEO page for published recipes
// /recipe/:slug  (rewritten to /api/recipe?slug=:slug)

const SUPABASE_URL = 'https://vzjbgdhsihjfhdwxxqwk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6amJnZGhzaWhqZmhkd3h4cXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Nzc3MTIsImV4cCI6MjA5NDA1MzcxMn0.XchnQHREPiOppr4dpvzvxq06oFv2JXpBTeRTpyM7LzM';
const AMAZON_TAG = 'poorguys-20';
const SITE = 'https://beggarnetwork.vercel.app';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function amazonUrl(q) {
  return `https://www.amazon.com/s?k=${encodeURIComponent(q)}&tag=${AMAZON_TAG}`;
}

// 히어로 재료 — 묶음 검색은 아마존이 상품 1개로 해석 못 해 깨지므로,
// "사러 갈 만한" 대표 재료 1개만 골라 단일 상품 검색으로 보낸다.
const STAPLE_RE = /\b(salt|pepper|water|sugar|flour|oil|butter|garlic|onion|eggs?|milk|rice|pasta|baking soda|baking powder)\b/i;
function heroOf(ings) {
  const cand = (ings || []).filter(i => i && (i.amazon_search || i.name));
  if (!cand.length) return null;
  const score = (i) => {
    let pts = (i.amazon_search || i.name || '').length;
    if (i.type === 'pantry') pts += 30;
    if (STAPLE_RE.test(i.name || '')) pts -= 60;
    return pts;
  };
  return cand.slice().sort((a, b) => score(b) - score(a))[0];
}

function fmtQty(q) {
  if (q == null) return '';
  const fr = { 0.25: '¼', 0.33: '⅓', 0.5: '½', 0.66: '⅔', 0.75: '¾' };
  return fr[q] || String(q);
}

module.exports = async (req, res) => {
  const slug = String(req.query.slug || '').slice(0, 80);
  if (!slug) { res.status(404).send('Not found'); return; }

  let row = null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/generated_recipes` +
      `?slug=eq.${encodeURIComponent(slug)}&published=eq.true` +
      `&select=recipe,author_nickname,video_url,published_at,servings`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
    );
    const rows = await r.json();
    row = Array.isArray(rows) && rows[0];
  } catch (_) {}

  if (!row || !row.recipe) {
    res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Recipe not found — Beggar Network</title></head>
<body style="font-family:system-ui;text-align:center;padding:80px 20px">
<h1>🍳 Recipe not found</h1><p>This recipe may have been removed.</p>
<a href="${SITE}">← Beggar Network</a></body></html>`);
    return;
  }

  const rec = row.recipe;
  // Guard: normalize low/high order from older rows
  const hp0 = rec.home_price;
  if (hp0) {
    if (hp0.savings_pct_low != null && hp0.savings_pct_high != null && hp0.savings_pct_low > hp0.savings_pct_high) {
      const t = hp0.savings_pct_low; hp0.savings_pct_low = hp0.savings_pct_high; hp0.savings_pct_high = t;
    }
    if (hp0.amount_low != null && hp0.amount_high != null && hp0.amount_low > hp0.amount_high) {
      const t = hp0.amount_low; hp0.amount_low = hp0.amount_high; hp0.amount_high = t;
    }
  }
  const author = row.author_nickname || 'anonymous beggar';
  const creator = rec.videos && rec.videos[0] && rec.videos[0].creator;
  const videoUrl = rec.videos && rec.videos[0] && rec.videos[0].url;
  const title = `${rec.name} — cheap home recipe | Beggar Network`;
  const desc = (rec.tagline || `Make ${rec.name} at home for cheap.`).slice(0, 160);
  const url = `${SITE}/recipe/${slug}`;
  const ings = rec.ingredients || [];
  const steps = rec.instructions || [];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: rec.name,
    description: rec.tagline || '',
    author: { '@type': 'Person', name: author },
    datePublished: (row.published_at || '').slice(0, 10),
    recipeYield: `${rec.base_servings || row.servings || 2} servings`,
    totalTime: `PT${rec.total_time_min || 30}M`,
    recipeIngredient: ings.map(i => `${fmtQty(i.qty)} ${i.unit || ''} ${i.name}`.trim()),
    recipeInstructions: steps.map((s, i) => ({
      '@type': 'HowToStep', position: i + 1, name: s.title || `Step ${i + 1}`, text: s.content || '',
    })),
    keywords: (rec.tags || []).join(', '),
    ...(rec.calories_per_serving ? { nutrition: { '@type': 'NutritionInformation', calories: `${rec.calories_per_serving} calories` } } : {}),
    ...(videoUrl ? { video: { '@type': 'VideoObject', name: rec.videos[0].title || rec.name, contentUrl: videoUrl } } : {}),
  };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(rec.name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE}/assets/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(rec.name)} — cheap home recipe on Beggar Network">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(rec.name)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/assets/og-image.png">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
  :root { --ink:#0F0E0B; --paper:#FEF9E8; --gold:#EAB308; --brown:#44382B; }
  * { box-sizing:border-box; margin:0; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#FFFDF5; color:var(--ink); line-height:1.6; }
  .wrap { max-width:760px; margin:0 auto; padding:24px 16px 80px; }
  .topbar { display:flex; justify-content:space-between; align-items:center; padding:8px 0 20px; }
  .brand { font-weight:900; text-decoration:none; color:var(--ink); font-size:18px; }
  .brand span { color:var(--gold); }
  .cta { background:var(--gold); color:var(--ink); border:2px solid var(--ink); border-radius:10px; padding:8px 14px; font-weight:800; text-decoration:none; font-size:13px; box-shadow:0 2px 0 var(--ink); }
  h1 { font-size:32px; font-weight:900; line-height:1.2; margin:8px 0; }
  .tagline { color:var(--brown); font-size:16px; margin-bottom:10px; }
  .byline { font-size:13px; color:var(--brown); margin-bottom:18px; }
  .byline strong { color:var(--ink); }
  .meta { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:18px; }
  .pill { background:var(--paper); border:1.5px solid var(--ink); border-radius:99px; padding:4px 12px; font-size:13px; font-weight:700; }
  .price { background:var(--paper); border:2px solid var(--ink); border-radius:14px; padding:16px; margin-bottom:24px; box-shadow:0 3px 0 var(--ink); }
  .price .row { display:flex; justify-content:space-between; padding:4px 0; }
  .save { color:#16A34A; font-weight:900; text-align:center; margin-top:6px; }
  h2 { font-size:20px; font-weight:900; margin:28px 0 12px; }
  ul.ings { list-style:none; padding:0; }
  ul.ings li { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 0; border-bottom:1px dashed #D9CDB8; }
  ul.ings .amz { white-space:nowrap; font-size:12px; font-weight:800; color:var(--ink); background:#FFE9B8; border:1.5px solid var(--ink); border-radius:8px; padding:4px 10px; text-decoration:none; }
  ol.steps { padding-left:0; list-style:none; counter-reset:st; }
  ol.steps li { counter-increment:st; background:#fff; border:1.5px solid var(--ink); border-radius:12px; padding:14px 14px 14px 52px; margin-bottom:10px; position:relative; }
  ol.steps li::before { content:counter(st); position:absolute; left:14px; top:14px; width:26px; height:26px; background:var(--gold); border:1.5px solid var(--ink); border-radius:99px; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:13px; }
  ol.steps strong { display:block; margin-bottom:2px; }
  .tips li { margin-left:18px; margin-bottom:6px; }
  .video a { color:var(--brown); }
  .shopall { display:block; text-align:center; background:#FF9900; color:#fff; border:2px solid var(--ink); border-radius:12px; padding:14px; font-weight:900; text-decoration:none; margin:18px 0; box-shadow:0 3px 0 var(--ink); }
  .foot { margin-top:40px; font-size:12px; color:var(--brown); text-align:center; }
  .remixcta { background:var(--paper); border:2px dashed var(--ink); border-radius:14px; padding:18px; text-align:center; margin-top:30px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <a class="brand" href="${SITE}">🍳 Beggar <span>Network</span></a>
    <a class="cta" href="${SITE}">Make your own →</a>
  </div>

  <div style="font-size:48px">${esc(rec.emoji || '🍽️')}</div>
  <h1>${esc(rec.name)}</h1>
  <p class="tagline">${esc(rec.tagline || '')}</p>
  <p class="byline">👨‍🍳 Recipe by <strong>${esc(author)}</strong>${creator ? ` · adapted from <strong>${esc(creator)}</strong>'s video` : ''}</p>

  <div class="meta">
    <span class="pill">⏱ ${esc(rec.total_time_min || rec.prep_time_min || 0)} min</span>
    <span class="pill">📊 ${esc(rec.difficulty || 'easy')}</span>
    <span class="pill">🍽 ${esc(rec.base_servings || row.servings || 2)} servings</span>
    ${rec.calories_per_serving ? `<span class="pill">🔥 ${esc(rec.calories_per_serving)} cal</span>` : ''}
  </div>

  ${rec.restaurant_price ? `
  <div class="price">
    <div class="row"><span>At restaurant${rec.restaurant_price.where ? ` (${esc(rec.restaurant_price.where)})` : ''}</span><strong style="color:#DC2626">$${esc(rec.restaurant_price.amount)}</strong></div>
    <div class="row"><span>At home (${esc((rec.home_price && rec.home_price.unit) || 'per serving')})</span><strong style="color:#16A34A">$${esc(rec.home_price ? `${rec.home_price.amount_low}-${rec.home_price.amount_high}` : '?')}</strong></div>
    ${rec.home_price && rec.home_price.savings_pct_low != null ? `<div class="save">You save ${esc(rec.home_price.savings_pct_low)}-${esc(rec.home_price.savings_pct_high)}%</div>` : ''}
  </div>` : ''}

  <h2>🥘 Ingredients</h2>
  <ul class="ings">
    ${ings.map(i => `<li><span><strong>${esc(fmtQty(i.qty))} ${esc(i.unit || '')}</strong> ${esc(i.name)}${i.note ? ` <em style="color:var(--brown);font-size:13px">— ${esc(i.note)}</em>` : ''}</span><a class="amz" rel="nofollow sponsored noopener" target="_blank" href="${esc(amazonUrl(i.amazon_search || i.name))}">Amazon</a></li>`).join('')}
  </ul>
  ${(() => { const h = heroOf(ings); return h ? `<a class="shopall" rel="nofollow sponsored noopener" target="_blank" href="${esc(amazonUrl(h.amazon_search || h.name))}">🛒 Get the ${esc(h.name)} on Amazon</a>` : ''; })()}

  <h2>📝 Instructions</h2>
  <ol class="steps">
    ${steps.map(s => `<li><strong>${esc(s.title || '')}</strong>${esc(s.content || '')}</li>`).join('')}
  </ol>

  ${rec.pro_tips && rec.pro_tips.length ? `<h2>💡 Pro tips</h2><ul class="tips">${rec.pro_tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}

  ${videoUrl ? `<h2>🎬 Original video</h2><p class="video"><a href="${esc(videoUrl)}" rel="noopener" target="_blank">${esc((rec.videos[0] && rec.videos[0].title) || videoUrl)}</a>${creator ? ` by ${esc(creator)}` : ''}</p>` : ''}

  <div class="remixcta">
    <p style="font-weight:800;margin-bottom:8px">Want this spicier? Cheaper? No oven?</p>
    <a class="cta" href="${SITE}">🎬 Paste any YouTube video → get your own recipe</a>
  </div>

  <p class="foot">Beggar Network is part of the Amazon Associates Program. We earn from qualifying purchases at no extra cost to you.<br>
  <a href="${SITE}" style="color:var(--brown)">beggarnetwork.vercel.app — cheap eats, all under $14</a></p>
</div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(html);
};
