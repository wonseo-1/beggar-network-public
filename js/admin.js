// ═══════════════════════════════════
// ADMIN — config
// ═══════════════════════════════════
const SUPABASE_URL = 'https://vzjbgdhsihjfhdwxxqwk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6amJnZGhzaWhqZmhkd3h4cXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Nzc3MTIsImV4cCI6MjA5NDA1MzcxMn0.XchnQHREPiOppr4dpvzvxq06oFv2JXpBTeRTpyM7LzM';
// ADMIN_EMAIL comes from js/admin-config.js (loaded before this file).

let sb;
try {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.error('Supabase init failed:', e);
  document.body.innerHTML = '<div style="padding:40px;text-align:center;font-family:Inter,sans-serif"><h2>Loading failed</h2><p>Try disabling browser extensions or refreshing.</p><button onclick="location.reload()">Reload</button></div>';
}

let adminUser = null;
let activeTab = 'pending';

// ═══════════════════════════════════
// INIT
// ═══════════════════════════════════
async function adminInit() {
  const { data: { session } } = await sb.auth.getSession();
  console.log('Admin init — session:', session?.user?.email, 'expected:', ADMIN_EMAIL);
  // 공개 사이트엔 로그인이 없으므로, 관리자 로그인은 여기(/admin)에서 직접.
  if (!session) {
    renderAdminSignIn();
    return;
  }
  if (session.user.email !== ADMIN_EMAIL) {
    document.getElementById('adminContent').innerHTML =
      `<div class="admin-empty">Signed in as ${escapeHtml(session.user.email)} — not an admin account.<br><br>`
      + `<button class="admin-btn admin-btn-reject" onclick="adminSignOut()">Sign out</button></div>`;
    return;
  }
  adminUser = session.user;
  sb.auth.onAuthStateChange((_, s) => {
    if (!s) renderAdminSignIn();
  });
  switchTab('pending');
}

function renderAdminSignIn() {
  document.getElementById('adminContent').innerHTML =
    `<div class="admin-empty">🛡️ Admin access<br><br>`
    + `<button class="admin-btn admin-btn-approve" onclick="adminSignIn()">Sign in with Google</button></div>`;
}

async function adminSignIn() {
  await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/admin.html' } });
}

async function adminSignOut() {
  try { await sb.auth.signOut(); } catch (e) {}
  renderAdminSignIn();
}

// ═══════════════════════════════════
// TOAST
// ═══════════════════════════════════
function showToast(msg) {
  const t = document.getElementById('adminToast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function escapeHtml(s) {
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

function timeAgo(d) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ═══════════════════════════════════
// TABS
// ═══════════════════════════════════
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  const content = document.getElementById('adminContent');
  content.innerHTML = '<div class="admin-loading">Loading...</div>';

  if (tab === 'pending') loadPendingSpots();
  else if (tab === 'pending_changes') loadPendingChanges();
  else if (tab === 'prices') loadPriceReports();
  else if (tab === 'reports') loadAllReports();
  else if (tab === 'contributions') loadContributions();
  else if (tab === 'stats') loadStats();
}

// ═══════════════════════════════════
// TAB: PENDING SPOTS
// ═══════════════════════════════════
async function loadPendingSpots() {
  const content = document.getElementById('adminContent');
  try {
    const { data, error } = await sb
      .from('restaurants_with_cheapest')
      .select('id, name, address, cheapest_price, cheapest_menu_name, created_by, created_at, category')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) {
      content.innerHTML = '<div class="admin-empty">No pending spots. All clear! ✅</div>';
      return;
    }

    content.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Name</th><th>Address</th><th>Price</th><th>Cheap Pick</th><th>Submitted</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(r => `
              <tr id="row-${r.id}">
                <td><strong>${escapeHtml(r.name)}</strong></td>
                <td style="font-size:12px;color:#888">${escapeHtml(r.address || '')}</td>
                <td>${r.cheapest_price != null ? '$' + Number(r.cheapest_price).toFixed(2) : 'N/A'}</td>
                <td style="font-size:12px">${escapeHtml(r.cheapest_menu_name || '')}</td>
                <td style="font-size:11px;color:#aaa">${timeAgo(r.created_at)}</td>
                <td class="admin-actions">
                  <button class="admin-btn admin-btn-approve" onclick="approveSpot('${r.id}')">✅ Approve</button>
                  <button class="admin-btn admin-btn-reject" onclick="rejectSpot('${r.id}')">❌ Reject</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    content.innerHTML = `<div class="admin-empty">Error loading spots: ${e.message}</div>`;
  }
}

async function approveSpot(id) {
  try {
    await sb.from('restaurants').update({ status: 'approved' }).eq('id', id);
    showToast('Spot approved! ✅');
    const row = document.getElementById(`row-${id}`);
    if (row) row.remove();
  } catch (e) { showToast('Error: ' + e.message); }
}

async function rejectSpot(id) {
  if (!confirm('Reject this spot?')) return;
  try {
    await sb.from('restaurants').update({ status: 'rejected' }).eq('id', id);
    showToast('Spot rejected.');
    const row = document.getElementById(`row-${id}`);
    if (row) row.remove();
  } catch (e) { showToast('Error: ' + e.message); }
}

// ═══════════════════════════════════
// TAB: PRICE REPORTS (cap verifications)
// ═══════════════════════════════════
async function loadPriceReports() {
  const content = document.getElementById('adminContent');
  try {
    const { data, error } = await sb
      .from('verifications')
      .select('id, menu_item_id, reported_price, verdict, created_at, menu_items(id, name, price, restaurant_id, restaurants(id, name))')
      .eq('verdict', 'cap')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    if (!data || data.length === 0) {
      content.innerHTML = '<div class="admin-empty">No cap reports. All good! ✅</div>';
      return;
    }

    // Group by menu item
    const grouped = {};
    data.forEach(v => {
      const mid = v.menu_item_id;
      if (!grouped[mid]) {
        grouped[mid] = {
          menuItem: v.menu_items,
          verifications: [],
        };
      }
      grouped[mid].verifications.push(v);
    });

    const rows = Object.values(grouped).map(g => {
      const mi = g.menuItem || {};
      const rest = mi.restaurants || {};
      const prices = g.verifications.map(v => Number(v.reported_price)).filter(p => !isNaN(p));
      const suggested = prices.length > 0
        ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)
        : 'N/A';
      return `
        <tr id="price-row-${mi.id}">
          <td><strong>${escapeHtml(rest.name || 'Unknown')}</strong></td>
          <td style="font-size:12px;color:#888">${escapeHtml(mi.name || '')}</td>
          <td>$${Number(mi.price || 0).toFixed(2)}</td>
          <td style="color:#FF6B35;font-weight:700">${suggested !== 'N/A' ? '$' + suggested : 'N/A'}</td>
          <td style="font-size:12px;color:#888">${g.verifications.length} cap(s)</td>
          <td class="admin-actions">
            <button class="admin-btn admin-btn-approve" onclick="applyNewPrice('${mi.id}', ${suggested})">✅ Apply</button>
          </td>
        </tr>`;
    });

    content.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr><th>Restaurant</th><th>Menu Item</th><th>Current Price</th><th>Avg Cap Price</th><th>Caps</th><th>Actions</th></tr>
          </thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>`;
  } catch (e) {
    content.innerHTML = `<div class="admin-empty">Error: ${e.message}</div>`;
  }
}

async function applyNewPrice(menuItemId, newPrice) {
  try {
    await sb.from('menu_items').update({ price: Number(newPrice) }).eq('id', menuItemId);
    showToast(`Price updated to $${Number(newPrice).toFixed(2)} ✅`);
    const row = document.getElementById(`price-row-${menuItemId}`);
    if (row) row.remove();
  } catch (e) { showToast('Error: ' + e.message); }
}

// ═══════════════════════════════════
// TAB: ALL REPORTS
// ═══════════════════════════════════
async function loadAllReports() {
  const content = document.getElementById('adminContent');
  try {
    const { data, error } = await sb
      .from('reports')
      .select('id, report_type, message, new_price, created_at, restaurants(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    if (!data || data.length === 0) {
      content.innerHTML = '<div class="admin-empty">No pending reports. All clear! ✅</div>';
      return;
    }

    content.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr><th>Restaurant</th><th>Type</th><th>Message</th><th>New Price</th><th>Time</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${data.map(r => `
              <tr id="report-row-${r.id}">
                <td><strong>${escapeHtml(r.restaurants?.name || 'Unknown')}</strong></td>
                <td><span class="report-type-badge">${r.report_type.replace(/_/g, ' ')}</span></td>
                <td style="font-size:12px;color:#888">${escapeHtml(r.message || '—')}</td>
                <td>${r.new_price != null ? '$' + Number(r.new_price).toFixed(2) : '—'}</td>
                <td style="font-size:11px;color:#aaa">${timeAgo(r.created_at)}</td>
                <td class="admin-actions">
                  <button class="admin-btn admin-btn-approve" onclick="resolveReport('${r.id}')">✅ Resolve</button>
                  <button class="admin-btn admin-btn-reject" onclick="rejectReport('${r.id}')">❌ Reject</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    content.innerHTML = `<div class="admin-empty">Error: ${e.message}</div>`;
  }
}

async function resolveReport(id) {
  try {
    await sb.from('reports').update({ status: 'resolved' }).eq('id', id);
    showToast('Resolved ✅');
    const row = document.getElementById(`report-row-${id}`);
    if (row) row.remove();
  } catch (e) { showToast('Error: ' + e.message); }
}

async function rejectReport(id) {
  try {
    await sb.from('reports').update({ status: 'rejected' }).eq('id', id);
    showToast('Rejected.');
    const row = document.getElementById(`report-row-${id}`);
    if (row) row.remove();
  } catch (e) { showToast('Error: ' + e.message); }
}

// ═══════════════════════════════════
// TAB: CONTRIBUTIONS
// ═══════════════════════════════════
const CONTRIBUTION_COLORS = {
  new_spot:     { bg: '#dcfce7', color: '#16a34a' },
  add_menu:     { bg: '#dbeafe', color: '#1d4ed8' },
  update_price: { bg: '#fef9c3', color: '#ca8a04' },
  update_info:  { bg: '#f0f0f0', color: '#555' },
  report_closed:{ bg: '#fee2e2', color: '#dc2626' },
  new_branch:   { bg: '#ede9fe', color: '#7c3aed' },
};

async function loadContributions() {
  const content = document.getElementById('adminContent');
  try {
    const { data, error } = await sb
      .from('contributions')
      .select('id, type, nickname, payload, created_at, restaurants(name)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    if (!data || data.length === 0) {
      content.innerHTML = '<div class="admin-empty">No contributions yet.</div>';
      return;
    }

    const rows = data.map(c => {
      const style = CONTRIBUTION_COLORS[c.type] || { bg: '#f0f0f0', color: '#555' };
      const badge = `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;background:${style.bg};color:${style.color}">${c.type.replace(/_/g, ' ')}</span>`;
      const restName = c.restaurants?.name || '—';
      const user = escapeHtml(c.nickname || '—');
      const payloadStr = Object.keys(c.payload || {}).length > 0
        ? `<span style="font-size:11px;color:#888;font-family:monospace">${escapeHtml(JSON.stringify(c.payload))}</span>`
        : '—';
      return `<tr>
        <td>${badge}</td>
        <td><strong>${escapeHtml(restName)}</strong></td>
        <td style="font-size:12px;color:#888">${user}</td>
        <td style="font-size:12px">${payloadStr}</td>
        <td style="font-size:11px;color:#aaa;white-space:nowrap">${timeAgo(c.created_at)}</td>
      </tr>`;
    });

    content.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr><th>Type</th><th>Restaurant</th><th>User</th><th>Details</th><th>Time</th></tr>
          </thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>`;
  } catch (e) {
    content.innerHTML = `<div class="admin-empty">Error loading contributions: ${e.message}</div>`;
  }
}

// ═══════════════════════════════════
// TAB: STATS
// ═══════════════════════════════════
async function loadStats() {
  const content = document.getElementById('adminContent');
  try {
    const [restRes, menuRes, reportsRes, verifRes, commentsRes] = await Promise.all([
      sb.from('restaurants').select('status'),
      sb.from('menu_items').select('id', { count: 'exact', head: true }),
      sb.from('reports').select('status'),
      sb.from('verifications').select('verdict'),
      sb.from('comments').select('id', { count: 'exact', head: true }),
    ]);

    const restaurants = restRes.data || [];
    const statuses = {};
    restaurants.forEach(r => { statuses[r.status] = (statuses[r.status] || 0) + 1; });

    const reports = reportsRes.data || [];
    const reportStatuses = {};
    reports.forEach(r => { reportStatuses[r.status] = (reportStatuses[r.status] || 0) + 1; });

    const verifs = verifRes.data || [];
    const legitCount = verifs.filter(v => v.verdict === 'legit').length;
    const capCount = verifs.filter(v => v.verdict === 'cap').length;

    content.innerHTML = `
      <div class="stats-grid">
        <div class="stats-card">
          <div class="stats-card-title">Restaurants</div>
          <div class="stats-card-big">${restaurants.length}</div>
          <div class="stats-card-breakdown">
            <span class="stat-pill stat-active">✅ Approved: ${statuses['approved'] || 0}</span>
            <span class="stat-pill stat-pending">⏳ Pending: ${statuses['pending_review'] || 0}</span>
            <span class="stat-pill stat-excluded">🚫 Rejected: ${statuses['rejected'] || 0}</span>
            <span class="stat-pill stat-excluded">🔒 Closed: ${statuses['closed'] || 0}</span>
          </div>
        </div>
        <div class="stats-card">
          <div class="stats-card-title">Menu Items</div>
          <div class="stats-card-big">${menuRes.count || 0}</div>
        </div>
        <div class="stats-card">
          <div class="stats-card-title">Reports</div>
          <div class="stats-card-big">${reports.length}</div>
          <div class="stats-card-breakdown">
            <span class="stat-pill stat-pending">⏳ Pending: ${reportStatuses['pending'] || 0}</span>
            <span class="stat-pill stat-active">✅ Resolved: ${reportStatuses['resolved'] || 0}</span>
            <span class="stat-pill stat-excluded">❌ Rejected: ${reportStatuses['rejected'] || 0}</span>
          </div>
        </div>
        <div class="stats-card">
          <div class="stats-card-title">Verifications</div>
          <div class="stats-card-big">${verifs.length}</div>
          <div class="stats-card-breakdown">
            <span class="stat-pill stat-active">✅ Legit: ${legitCount}</span>
            <span class="stat-pill stat-excluded">💀 Cap: ${capCount}</span>
          </div>
        </div>
        <div class="stats-card">
          <div class="stats-card-title">Comments</div>
          <div class="stats-card-big">${commentsRes.count || 0}</div>
        </div>
      </div>`;
  } catch (e) {
    content.innerHTML = `<div class="admin-empty">Error loading stats: ${e.message}</div>`;
  }
}

// ═══════════════════════════════════
// TAB: PENDING CHANGES (user submissions awaiting approval)
// ═══════════════════════════════════
async function loadPendingChanges() {
  const content = document.getElementById('adminContent');
  try {
    const { data, error } = await sb
      .from('pending_changes')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) {
      content.innerHTML = '<div class="admin-empty">No pending changes. All clear! ✅</div>';
      return;
    }

    // Get restaurant names for display
    const rids = [...new Set(data.map(d => d.restaurant_id).filter(Boolean))];
    let restMap = {};
    if (rids.length > 0) {
      const { data: rests } = await sb.from('restaurants').select('id, name').in('id', rids);
      if (rests) restMap = Object.fromEntries(rests.map(r => [r.id, r.name]));
    }

    const rows = data.map(c => {
      const restName = restMap[c.restaurant_id] || '—';
      const before = c.before_data || {};
      const after = c.after_data || {};

      let detail = '';
      if (c.change_type === 'update_price') {
        detail = `$${Number(before.price).toFixed(2)} → <strong>$${Number(after.price).toFixed(2)}</strong>`;
      } else if (c.change_type === 'add_menu') {
        detail = `+ ${escapeHtml(after.name)} <strong>$${Number(after.price).toFixed(2)}</strong>`;
      } else if (c.change_type === 'delete_menu') {
        detail = `🗑️ ${escapeHtml(before.name || '?')} ($${Number(before.price || 0).toFixed(2)})`;
      } else if (c.change_type === 'update_name') {
        detail = `"${escapeHtml(before.name || '')}" → "<strong>${escapeHtml(after.name || '')}</strong>"`;
      } else {
        detail = `<span style="font-size:11px">${escapeHtml(JSON.stringify(after))}</span>`;
      }

      const typeBadge = {
        update_price: { bg: '#fef9c3', color: '#ca8a04', label: 'price' },
        update_name:  { bg: '#dbeafe', color: '#1d4ed8', label: 'name' },
        add_menu:     { bg: '#dcfce7', color: '#16a34a', label: 'add' },
        delete_menu:  { bg: '#fee2e2', color: '#dc2626', label: 'delete' },
      }[c.change_type] || { bg: '#f0f0f0', color: '#555', label: c.change_type };

      return `<tr>
        <td><span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;background:${typeBadge.bg};color:${typeBadge.color}">${typeBadge.label}</span></td>
        <td><strong>${escapeHtml(restName)}</strong></td>
        <td style="font-size:13px">${detail}</td>
        <td style="font-size:11px;color:#aaa;white-space:nowrap">${timeAgo(c.created_at)}</td>
        <td>
          <button onclick="approvePending(${c.id})" style="background:#22c55e;color:#fff;border:0;padding:4px 10px;border-radius:6px;font-weight:700;font-size:12px;cursor:pointer;margin-right:4px">✅ Approve</button>
          <button onclick="rejectPending(${c.id})" style="background:#ef4444;color:#fff;border:0;padding:4px 10px;border-radius:6px;font-weight:700;font-size:12px;cursor:pointer">❌ Reject</button>
        </td>
      </tr>`;
    });

    content.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr><th>Type</th><th>Restaurant</th><th>Change</th><th>Time</th><th>Action</th></tr>
          </thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>`;
  } catch (e) {
    content.innerHTML = `<div class="admin-empty">Error: ${e.message}</div>`;
  }
}

async function approvePending(id) {
  try {
    const { data: change, error } = await sb.from('pending_changes').select('*').eq('id', id).single();
    if (error || !change) throw error || new Error('Not found');

    // Apply the change to the actual table
    switch (change.change_type) {
      case 'update_price':
        await sb.from('menu_items').update({ price: change.after_data.price }).eq('id', change.target_id);
        break;
      case 'update_name':
        await sb.from('menu_items').update({
          name: change.after_data.name,
          price: change.after_data.price,
        }).eq('id', change.target_id);
        break;
      case 'add_menu':
        await sb.from('menu_items').insert({
          restaurant_id: change.restaurant_id,
          name: change.after_data.name,
          price: change.after_data.price,
          source: 'user_added',
          added_by: change.user_id,
        });
        break;
      case 'delete_menu':
        await sb.from('menu_items').update({ off_code: true }).eq('id', change.target_id);
        break;
    }

    // Mark as approved
    await sb.from('pending_changes').update({
      status: 'approved',
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id);

    showToast('Approved ✅');
    loadPendingChanges();
  } catch (e) {
    showToast('Approve failed: ' + e.message);
  }
}

async function rejectPending(id) {
  try {
    await sb.from('pending_changes').update({
      status: 'rejected',
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id);

    showToast('Rejected ❌');
    loadPendingChanges();
  } catch (e) {
    showToast('Reject failed: ' + e.message);
  }
}

// Boot
adminInit();
