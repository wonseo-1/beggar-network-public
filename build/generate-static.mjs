// build/generate-static.mjs
//
// GitHub Action에서 주기적으로 실행되는 정적 스냅샷 빌더.
// - Supabase(REST API, anon key)에서 지도 데이터 + 발행된 레시피를 읽어와서
//   전부 정적 파일(JSON / HTML / XML)로 구워낸다.
// - 이 스크립트는 "읽기 전용"이다 — Supabase에 쓰기 작업은 절대 하지 않는다.
// - api/recipe.js, api/sitemap.js (Vercel 서버리스 함수)의 로직을 그대로 포팅한
//   버전이다. 요청 시점에 서버가 렌더하던 걸, 빌드 시점에 한 번 렌더해서
//   파일로 저장하는 방식으로 바꿨을 뿐, 출력 결과(HTML/메타태그)는 동일하다.
//
// 실행: node build/generate-static.mjs
// 필요 환경변수: 없음 (anon key는 이미 클라이언트에 공개되는 값이라 코드에 상수로 둠 —
//   RLS로 보호되는 값이라 안전. 절대 SUPABASE_SERVICE_KEY/SECRET_KEY는 여기 넣지 않는다.)

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = 'https://vzjbgdhsihjfhdwxxqwk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6amJnZGhzaWhqZmhkd3h4cXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Nzc3MTIsImV4cCI6MjA5NDA1MzcxMn0.XchnQHREPiOppr4dpvzvxq06oFv2JXpBTeRTpyM7LzM';
const AMAZON_TAG = 'poorguys-20';
// TODO: swap to your real custom domain once one exists; falls back to the
// GitHub Pages URL. Only affects canonical/OG URLs in generated recipe pages.
const SITE = process.env.SITE_URL || 'https://beggarnetwork.vercel.app';

// NOTE: use fileURLToPath, not URL.pathname — pathname is percent-encoded when
// the filesystem path contains non-ASCII chars (e.g. a Korean folder name),
// which would silently write the snapshot to a bogus "%EA%B1%..." directory.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sbHeaders() {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
}

async function sbFetch(pathAndQuery) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`Supabase fetch failed (${r.status}): ${pathAndQuery}`);
  return r.json();
}

// ────────────────────────────────────────────────────────────
// 1. 지도 데이터 스냅샷 — /api/v1/*.json
//    (js/map.js loadData()와 동일한 쿼리를 빌드타임에 한 번 실행)
// ────────────────────────────────────────────────────────────
async function buildMapSnapshot() {
  const restaurants = await sbFetch(
    'restaurants_with_cheapest?' +
    'select=id,name,address,lat,lng,city,category,rating,hours,status,brand_id,tags,spot_type,' +
    'brand_slug,brand_abbr,brand_name,effective_category,cheapest_price,cheapest_menu_id,' +
    'cheapest_menu_name,menu_count,marker_grade' +
    '&status=in.(approved,unverified)'
  );

  const menuStats = await sbFetch(
    'menu_items?select=restaurant_id,legit_count,cap_count&off_code=eq.false&legit_count=gt.0'
  );

  const statsByRestaurant = {};
  for (const item of menuStats) {
    const rid = String(item.restaurant_id);
    if (!statsByRestaurant[rid]) statsByRestaurant[rid] = { legit: 0, cap: 0 };
    statsByRestaurant[rid].legit += item.legit_count || 0;
    statsByRestaurant[rid].cap += item.cap_count || 0;
  }

  const byCity = {};
  for (const r of restaurants) {
    const city = r.city || 'nyc';
    r._legit = (statsByRestaurant[String(r.id)] || {}).legit || 0;
    r._cap = (statsByRestaurant[String(r.id)] || {}).cap || 0;
    (byCity[city] ||= []).push(r);
  }

  const apiDir = path.join(ROOT, 'data', 'api', 'v1');
  await mkdir(path.join(apiDir, 'spots'), { recursive: true });

  const generatedAt = new Date().toISOString();

  for (const [city, spots] of Object.entries(byCity)) {
    await writeFile(
      path.join(apiDir, 'spots', `${city}.json`),
      JSON.stringify({ city, generated_at: generatedAt, count: spots.length, spots }, null, 0)
    );
  }

  await writeFile(
    path.join(apiDir, 'cities.json'),
    JSON.stringify({
      generated_at: generatedAt,
      cities: Object.entries(byCity).map(([city, spots]) => ({
        city, count: spots.length,
      })),
    }, null, 2)
  );

  await writeFile(
    path.join(apiDir, 'meta.json'),
    JSON.stringify({
      schema_version: 'v1',
      generated_at: generatedAt,
      license: 'CC BY 4.0 — see /DATA_LICENSE.md',
      attribution_url: SITE,
      source: 'Beggar Network (https://github.com/) — community-verified cheap-eats data',
    }, null, 2)
  );

  console.log(`[map-snapshot] wrote ${Object.keys(byCity).length} city file(s), ${restaurants.length} total spots`);
}

// ────────────────────────────────────────────────────────────
// 2. 레시피 정적 페이지 — recipe/<slug>/index.html
//    (api/recipe.js 로직 그대로 포팅, 요청 시점 렌더 → 빌드 시점 렌더)
// ────────────────────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function amazonUrl(q) {
  return `https://www.amazon.com/s?k=${encodeURIComponent(q)}&tag=${AMAZON_TAG}`;
}

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

function renderRecipeHtml(row, slug) {
  const rec = row.recipe;
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

  return `<!doctype html>
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
  <a href="${SITE}" style="color:var(--brown)">${esc(SITE.replace(/^https?:\/\//, ''))} — cheap eats, all under $14</a></p>
</div>
</body>
</html>`;
}

async function buildRecipePages() {
  const rows = await sbFetch(
    'generated_recipes?published=eq.true' +
    '&select=slug,recipe,author_nickname,video_url,published_at,servings'
  );

  const recipeRoot = path.join(ROOT, 'recipe');
  await mkdir(recipeRoot, { recursive: true });

  let count = 0;
  for (const row of rows) {
    if (!row.slug || !row.recipe) continue;
    const dir = path.join(recipeRoot, row.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), renderRecipeHtml(row, row.slug));
    count++;
  }
  console.log(`[recipe-pages] wrote ${count} static recipe page(s)`);
  return rows;
}

// ────────────────────────────────────────────────────────────
// 3. sitemap.xml (api/sitemap.js 포팅)
// ────────────────────────────────────────────────────────────
async function buildSitemap(recipeRows) {
  const urls = [
    `<url><loc>${SITE}/</loc><changefreq>daily</changefreq></url>`,
    ...recipeRows
      .filter(r => r.slug)
      .map(r => `<url><loc>${SITE}/recipe/${r.slug}</loc><lastmod>${(r.published_at || '').slice(0, 10)}</lastmod></url>`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
  await writeFile(path.join(ROOT, 'sitemap.xml'), xml);
  console.log(`[sitemap] wrote sitemap.xml with ${urls.length} url(s)`);
}

// ────────────────────────────────────────────────────────────
async function main() {
  await buildMapSnapshot();
  const recipeRows = await buildRecipePages();
  await buildSitemap(recipeRows);
}

main().catch((err) => {
  console.error('[generate-static] FAILED:', err);
  process.exit(1);
});
