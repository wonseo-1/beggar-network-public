// ═══════════════════════════════════
// AUTH
// ═══════════════════════════════════
// ADMIN_EMAIL comes from js/admin-config.js (loaded before this file).

async function checkAuth() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) { currentUser = session.user; updateAuthUI(); }
    sb.auth.onAuthStateChange((_, session) => { currentUser = session?.user || null; updateAuthUI(); });
  } catch (e) {}
}

async function signIn() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) showToast('Sign in failed');
}

async function signOut() {
  try { await sb.auth.signOut(); } catch (e) {}
  currentUser = null; updateAuthUI(); showToast('Signed out');
}

function isAdmin() {
  return !!(currentUser && currentUser.email === ADMIN_EMAIL);
}

function updateAuthUI() {
  const el = document.getElementById('authArea');
  if (!el) return;
  if (currentUser) {
    // 로그인 상태(=관리자 본인)에게만 Admin 링크 + Sign out 노출
    const adminLink = isAdmin()
      ? `<a class="admin-link-btn" href="admin.html">🛡️ Admin</a>`
      : '';
    el.innerHTML = `${adminLink}<button class="btn btn-glass btn-sm" onclick="signOut()">Sign out</button>`;
  } else {
    // 공개 로그인 없음 — 계정은 관리자 전용. 관리자는 /admin 에서 로그인.
    el.innerHTML = '';
  }
}
