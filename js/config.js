// ═══════════════════════════════════
// CONFIG
// ═══════════════════════════════════
// Mapbox token (kept for Geocoding API only — map tiles use MapLibre + OpenFreeMap)
const MAPBOX_TOKEN = 'pk.eyJ1Ijoid29uc2VvIiwiYSI6ImNtcDBua3JxYjB5MG8ycXB1ZHdrYnRmY3QifQ.583rMzBKuqa1561e0Ui8jA';

const SUPABASE_URL = 'https://vzjbgdhsihjfhdwxxqwk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6amJnZGhzaWhqZmhkd3h4cXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Nzc3MTIsImV4cCI6MjA5NDA1MzcxMn0.XchnQHREPiOppr4dpvzvxq06oFv2JXpBTeRTpyM7LzM';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════
// BRAND (change these to rebrand the whole app)
// ═══════════════════════════════════
const BRAND = {
  name: 'Beggar Network',
  tagline: 'Cheap Eats Underground',
  maxPrice: 14,
  roles: {
    user: 'Beggar',
    scout: 'Scout',
    verifier: 'Beggar King',
    admin: 'Admin',
  },
  features: {
    court: 'The Court',
    network: 'Beggar Network',
    table: 'The Table',     // verified spots list
    blacklisted: 'Blacklisted',
    code: 'The Code',       // $14 max rule
    coins: 'Coins',
    markers: 'Markers',
  },
};

// ═══════════════════════════════════
// SPOT TYPE — from DB brands table
// ═══════════════════════════════════
function isChain(r) { return r.spot_type === 'chain'; }
function isGrocery(r) { return r.spot_type === 'mart'; }
function getSpotType(r) { return r.spot_type || 'spot'; }

// ═══════════════════════════════════
// ADS — 실제 광고(AdSense/스폰서) 연결 전까지 placeholder 숨김
// 연결되면 true로 바꾸면 광고 슬롯이 다시 보임
// ═══════════════════════════════════
const ADS_ENABLED = false;

// ═══════════════════════════════════
// CITIES — 도시별 지도 시작점 (옮겨다니며 구경)
// ═══════════════════════════════════
const CITIES = {
  nyc: { label: 'New York', short: 'NYC', emoji: '🗽', center: [-73.95, 40.73], zoom: 12 },
  la:  { label: 'Los Angeles', short: 'LA', emoji: '🌴', center: [-118.27, 34.05], zoom: 11 },
};
const DEFAULT_CITY = 'nyc';

function getCurrentCity() {
  try {
    const c = localStorage.getItem('bn_city');
    return CITIES[c] ? c : DEFAULT_CITY;
  } catch { return DEFAULT_CITY; }
}

// 좌표 → 가장 가까운 도시 키 (120km 이내), 커버 밖이면 null
function detectCityFromCoords(lat, lng) {
  let best = null, bestDist = Infinity;
  for (const [key, c] of Object.entries(CITIES)) {
    const dLat = (lat - c.center[1]) * 111;
    const dLng = (lng - c.center[0]) * 111 * Math.cos(lat * Math.PI / 180);
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist < bestDist) { bestDist = dist; best = key; }
  }
  return bestDist <= 120 ? best : null;
}

// ═══════════════════════════════════
// STATE
// ═══════════════════════════════════
let map, hoverPopup;
let currentCity = getCurrentCity();
let allRestaurants = [];
let activeType = 'all';   // 'all', 'spot', 'chain', 'mart'
let activeGrade = 'all';  // 'all', 'legend', 'solid', 'fair', 'border'
let maxPrice = 14;
let searchTerm = '';
let currentUser = null;
let isDark = false;
let showUnverified = true; // show unverified spots by default

const STYLES = {
  dark: 'https://tiles.openfreemap.org/styles/fiord',
  light: 'https://tiles.openfreemap.org/styles/liberty',
};

// Type emojis (for marker display)
const TYPE_EMOJI = {
  spot: '🍽️',
  chain: '🏪',
  mart: '🛒',
  cart: '🚚',
};

// ═══════════════════════════════════
// CATEGORIES — 고객 제보 시 선택지 + 필터 + 표시
// DB: brands.category / restaurants.category
// ═══════════════════════════════════
const CATEGORIES = [
  { key: 'pizza',          label: 'Pizza',            emoji: '🍕' },
  { key: 'american',       label: 'American',         emoji: '🍔' },
  { key: 'mexican',        label: 'Mexican / Latin',  emoji: '🌮' },
  { key: 'chinese',        label: 'Chinese',          emoji: '🥟' },
  { key: 'halal',          label: 'Halal / ME',       emoji: '🥙' },
  { key: 'sandwich_deli',  label: 'Sandwich / Deli',  emoji: '🥪' },
  { key: 'salad',          label: 'Salad / Healthy',  emoji: '🥗' },
  { key: 'asian',          label: 'Asian',            emoji: '🍛' },
  { key: 'other',          label: 'Other',            emoji: '🍽️' },
];

const CAT = Object.fromEntries(CATEGORIES.map(c => [c.key, c.emoji]));
// Legacy category key fallbacks
CAT['indian'] = '🍛'; CAT['korean'] = '🍛'; CAT['japanese'] = '🍛';
CAT['thai'] = '🍛'; CAT['vietnamese'] = '🍛'; CAT['mediterranean'] = '🍛';
CAT['caribbean'] = '🍛'; CAT['bagel'] = '🥪'; CAT['dessert'] = '🍽️';

// ═══════════════════════════════════
// TAGS — 가게 특성 (복수 선택, restaurants.tags[])
// ═══════════════════════════════════
const SPOT_TAGS = [
  { key: 'cash_only',    label: 'Cash Only',       emoji: '💵' },
  { key: 'no_seating',   label: 'No Seating',      emoji: '🪑' },
  { key: 'late_night',   label: 'Late Night / 24hr', emoji: '🌙' },
  { key: 'takeout_only', label: 'Takeout Only',    emoji: '🥡' },
];

function getGrade(price) {
  if (price <= 4)  return { key: 'legend', label: 'Street Legend', color: '#22C55E', bg: '#ECFDF5', border: '#16A34A' };
  if (price <= 8)  return { key: 'solid',  label: 'Solid Find',    color: '#3B82F6', bg: '#EFF6FF', border: '#2563EB' };
  if (price <= 11) return { key: 'fair',   label: 'Fair Deal',     color: '#EAB308', bg: '#FFFBEB', border: '#CA8A04' };
  return { key: 'border', label: 'Borderline', color: '#EF4444', bg: '#FEF2F2', border: '#DC2626' };
}

// ═══════════════════════════════════
// UTILS
// ═══════════════════════════════════
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ═══════════════════════════════════
// VOTER IDENTITY — 위키식 익명 기여
// 로그인했으면 user_id, 아니면 디바이스별 안정 anon_id
// ═══════════════════════════════════
function getVoterId() {
  if (typeof currentUser !== 'undefined' && currentUser) {
    return { user_id: currentUser.id, anon_id: null };
  }
  let id = null;
  try { id = localStorage.getItem('bn_anon_id'); } catch {}
  if (!id) {
    id = 'anon_' + ((crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now() + '_' + Math.random().toString(36).slice(2));
    try { localStorage.setItem('bn_anon_id', id); } catch {}
  }
  return { user_id: null, anon_id: id };
}

// ═══════════════════════════════════
// TRACK — 자가발전 플라이휠 측정 substrate (설계: docs/growth-flywheel.md §4)
// fire-and-forget. 실패해도 앱 흐름에 영향 0 (events 테이블 없거나 오프라인이어도 무해).
// 식별자는 기존 getVoterId() 익명 ID 재사용 — 로그인 불필요.
// ═══════════════════════════════════
async function track(name, props = {}) {
  try {
    if (typeof sb === 'undefined') return;
    const who = getVoterId();
    const recipe_key = props && props.recipe_key ? props.recipe_key : null;
    await sb.from('events').insert({
      name,
      ...who,
      recipe_key,
      props: props || {},
    });
  } catch (_) { /* non-fatal */ }
}
window.track = track;

// 익명 기여자용 표시 닉네임 (디바이스 고정)
function getAnonNickname() {
  let n = null;
  try { n = localStorage.getItem('bn_anon_nick'); } catch {}
  if (!n) {
    n = (typeof generateNickname === 'function') ? generateNickname() : 'beggar_anon';
    try { localStorage.setItem('bn_anon_nick', n); } catch {}
  }
  return n;
}

// 검증 1표 — 로그인/익명 자동 분기. 에러는 호출측에서 throw 확인
async function castVerification(menuItemId, verdict, reportedPrice) {
  const who = getVoterId();
  const row = {
    menu_item_id: Number(menuItemId),
    verdict,
    reported_price: (reportedPrice == null ? null : reportedPrice),
    ...who,
  };
  const conflict = who.user_id ? 'menu_item_id,user_id' : 'menu_item_id,anon_id';
  return sb.from('verifications').upsert(row, { onConflict: conflict });
}

function timeAgo(d) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ═══════════════════════════════════
// FIRST VISIT WELCOME
// ═══════════════════════════════════
function showFirstVisitWelcome() {
  if (localStorage.getItem('bn_welcomed_v1')) return;
  const modal = document.createElement('div');
  modal.className = 'welcome-modal';
  modal.innerHTML = `
    <div class="welcome-card">
      <div class="welcome-emoji">👑</div>
      <h2 class="welcome-title">Welcome to Beggar Network</h2>
      <p class="welcome-sub">
        A <strong>Foodipedia for cheap eats</strong>.<br>
        Verified by locals. All under $14.
      </p>
      <ul class="welcome-list">
        <li>📍 Tap any pin to see prices</li>
        <li>⚖️ Verify prices to earn Beggar Coins</li>
        <li>➕ Submit your favorite cheap spot</li>
      </ul>
      <button class="welcome-cta" onclick="closeWelcome()">Let's go →</button>
    </div>
  `;
  document.body.appendChild(modal);
}

function closeWelcome() {
  localStorage.setItem('bn_welcomed_v1', '1');
  document.querySelector('.welcome-modal')?.remove();
}

function showComingSoon(emoji, title, desc, note) {
  const existing = document.querySelector('.coming-soon-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.className = 'coming-soon-overlay';
  overlay.innerHTML = `
    <div class="coming-soon">
      <div class="coming-soon-emoji">${emoji}</div>
      <h2>${title}</h2>
      <p>${desc}</p>
      <div class="coming-soon-note">${note}</div>
      <button class="quick-btn" onclick="closeComingSoon()" style="margin-top:20px">← Back to map</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

function closeComingSoon() {
  document.querySelector('.coming-soon-overlay')?.remove();
}
