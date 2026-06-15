// ─── STATE ───────────────────────────────────────────────────────────────────
const state = {
  token: localStorage.getItem('admin_token') || null,
  username: localStorage.getItem('admin_username') || null,
  isSuperAdmin: localStorage.getItem('admin_is_super') === 'true',
  page: 'dashboard',
  data: {},
  pagination: {},
};

// ─── API ─────────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}),
    },
    ...opts,
    body: opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined,
  });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const container = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = 'toast-item ' + type;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function logout() {
  state.token = null; state.username = null; state.isSuperAdmin = false;
  localStorage.removeItem('admin_token'); localStorage.removeItem('admin_username'); localStorage.removeItem('admin_is_super');
  render();
}

// ─── CONFIRM MODAL ───────────────────────────────────────────────────────────
let modalCallback = null;
function confirm(title, body, cb, danger = true, label = null) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  const btn = document.getElementById('modal-confirm-btn');
  btn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
  btn.textContent = label || (danger ? 'Hapus' : 'Konfirmasi');
  modalCallback = cb;
  document.getElementById('confirm-modal').classList.add('open');
}
window.closeModal = () => { document.getElementById('confirm-modal').classList.remove('open'); modalCallback = null; };
document.getElementById('modal-confirm-btn').onclick = () => { if (modalCallback) { modalCallback(); closeModal(); } };

// ─── RENDER ──────────────────────────────────────────────────────────────────
function render() {
  const root = document.getElementById('root');
  if (!state.token) { root.innerHTML = renderLogin(); attachLogin(); return; }
  root.innerHTML = renderApp();
  attachNav();
  renderPage();
}

function renderLogin() {
  return `
  <div id="login-screen">
    <div class="login-card">
      <h2>max99 panel</h2>
      <p>Login untuk masuk ke panel administrasi</p>
      <div class="form-group">
        <label>Username</label>
        <input class="input" id="l-user" type="text" placeholder="admin username" autocomplete="username" />
      </div>
      <div class="form-group">
        <label>Password</label>
        <input class="input" id="l-pass" type="password" placeholder="••••••••" autocomplete="current-password" />
      </div>
      <div id="l-error" class="error-msg" style="display:none"></div>
      <button class="login-btn" id="l-btn">Masuk</button>
    </div>
  </div>`;
}

function attachLogin() {
  const btn = document.getElementById('l-btn');
  const doLogin = async () => {
    const username = document.getElementById('l-user').value.trim();
    const password = document.getElementById('l-pass').value;
    const errEl = document.getElementById('l-error');
    errEl.style.display = 'none';
    btn.textContent = 'Loading...'; btn.disabled = true;
    const res = await api('/auth/login', { method: 'POST', body: { username, password } });
    btn.textContent = 'Masuk'; btn.disabled = false;
    if (!res || res.error) { errEl.textContent = res?.error || 'Gagal login'; errEl.style.display = 'block'; return; }
    state.token = res.token; state.username = res.username; state.isSuperAdmin = !!res.isSuperAdmin;
    localStorage.setItem('admin_token', res.token); localStorage.setItem('admin_username', res.username); localStorage.setItem('admin_is_super', state.isSuperAdmin ? 'true' : 'false');
    render();
  };
  btn.onclick = doLogin;
  document.getElementById('l-pass').onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };
}

function renderApp() {
  const allNav = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', superOnly: false },
    { id: 'users', label: 'Manajemen User', icon: '👥', superOnly: false },
    { id: 'register-special', label: 'Register Akun Spesial', icon: '⭐', superOnly: false },
    { id: 'chatrooms', label: 'Chatroom', icon: '💬', superOnly: false },
    { id: 'credits', label: 'Kredit & Transaksi', icon: '💰', superOnly: false },
    { id: 'credit-management', label: 'Manajemen Kredit', icon: '💳', superOnly: true },
    { id: 'managed-account', label: 'Managed Account', icon: '🔐', superOnly: false },
    { id: 'vouchers', label: 'Voucher', icon: '🎫' },
    { id: 'gifts', label: 'Virtual Gifts', icon: '🎁' },
    { id: 'badges', label: 'Badges', icon: '🏅' },
    { id: 'store', label: 'Store', icon: '🛍️' },
    { id: 'merchants', label: 'Merchant', icon: '🏪' },
    { id: 'add-merchant', label: 'Tambah Merchant', icon: '➕' },
    { id: 'merchant-tags', label: 'Merchant Tags', icon: '🏷️' },
    { id: 'bots', label: 'Bot Service', icon: '🤖' },
    { id: 'admin-management', label: 'Manajemen Administrator', icon: '🛡️' },
    { id: 'audit-login', label: 'Audit Login Admin', icon: '🔒' },
    { id: 'system-settings', label: 'Pengaturan Sistem', icon: '⚙️' },
    { id: 'xp-settings',     label: 'Pengaturan XP',     icon: '⭐' },
    { id: 'broadcast', label: 'Broadcast Pesan', icon: '📢' },
    { id: 'apk-releases', label: 'Rilis APK', icon: '📦' },
    { id: 'party-live', label: 'Party Live 🎤', icon: '🎵' },
    { id: 'solo-live', label: 'Solo Live 🎬', icon: '📹' },
    { id: 'shop-frames', label: 'Bingkai Avatar', icon: '🪞' },
    { id: 'leaderboard-editor', label: 'Koreksi Leaderboard', icon: '🏆' },
    { id: 'agencies', label: 'Agencies', icon: '🏢' },
    { id: 'withdraw-requests', label: 'Withdraw Diamond', icon: '💸' },
    { id: 'payroll', label: 'Payroll Agency', icon: '💵' },
    { id: 'host-salary', label: 'Host Gaji Pokok', icon: '🎙️' },
    { id: 'home-banners', label: 'Banner Beranda', icon: '🖼️' },
    { id: 'local-uploads', label: 'File Lokal (Fallback)', icon: '💾' },
  ];
  const nav = allNav.filter(n => !n.superOnly || state.isSuperAdmin);
  const roleLabel = state.isSuperAdmin ? 'Super Administrator' : 'Administrator';
  return `
  <div id="app">
    <aside id="sidebar">
      <div class="logo"><span class="logo-icon">⚡</span>migme Admin</div>
      <nav>${nav.map(n => `<div class="nav-item${state.page === n.id ? ' active' : ''}" data-page="${n.id}"><span class="icon">${n.icon}</span>${n.label}</div>`).join('')}</nav>
      <div class="user-info">
        <div class="avatar">${(state.username || 'A')[0].toUpperCase()}</div>
        <div><div class="name">${state.username || 'Admin'}</div><div class="role">${roleLabel}</div></div>
        <button class="logout-btn" id="logout-btn">Keluar</button>
      </div>
    </aside>
    <main id="main">
      <div id="topbar"><h1 id="page-title">${nav.find(n=>n.id===state.page)?.label || allNav.find(n=>n.id===state.page)?.label || 'Dashboard'}</h1></div>
      <div id="content"><div class="loading"><div class="spinner"></div>Memuat data...</div></div>
    </main>
  </div>`;
}

function attachNav() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.onclick = () => { state.page = el.dataset.page; render(); };
  });
  document.getElementById('logout-btn').onclick = logout;
}

async function renderPage() {
  const content = document.getElementById('content');
  switch (state.page) {
    case 'dashboard': await renderDashboard(content); break;
    case 'users': await renderUsers(content); break;
    case 'register-special': renderRegisterSpecial(content); break;
    case 'chatrooms': await renderChatrooms(content); break;
    case 'credits': await renderCredits(content); break;
    case 'credit-management':
      if (!state.isSuperAdmin) { content.innerHTML = '<div class="empty" style="padding:60px 0;text-align:center"><div style="font-size:48px;margin-bottom:16px">🔒</div><div style="font-size:18px;font-weight:700;margin-bottom:8px">Akses Ditolak</div><div style="color:var(--text-muted)">Halaman ini hanya bisa diakses oleh Super Administrator.</div></div>'; break; }
      renderCreditManagement(content); break;
    case 'managed-account': renderManagedAccount(content); break;
    case 'vouchers': await renderVouchers(content); break;
    case 'gifts': await renderGifts(content); break;
    case 'badges': await renderBadges(content); break;
    case 'store': await renderStore(content); break;
    case 'merchants': await renderMerchants(content); break;
    case 'add-merchant': renderAddMerchant(content); break;
    case 'merchant-tags': await renderMerchantTags(content); break;
    case 'bots': await renderBots(content); break;
    case 'admin-management': await renderAdminManagement(content); break;
    case 'audit-login': await renderAuditLogin(content); break;
    case 'system-settings': await renderSystemSettings(content); break;
    case 'xp-settings':     await renderXpSettings(content); break;
    case 'broadcast': renderBroadcast(content); break;
    case 'apk-releases': await renderReleases(content); break;
    case 'party-live': await renderPartyLive(content); break;
    case 'solo-live': await renderSoloLive(content); break;
    case 'shop-frames': await renderShopFrames(content); break;
    case 'leaderboard-editor': await renderLeaderboardEditor(content); break;
    case 'agencies': await renderAgencies(content); break;
    case 'withdraw-requests': await renderWithdrawRequests(content); break;
    case 'payroll': await renderPayroll(content); break;
    case 'host-salary': await renderHostSalary(content); break;
    case 'home-banners': await renderHomeBanners(content); break;
    case 'local-uploads': await renderLocalUploads(content); break;
    default: content.innerHTML = '<div class="empty">Halaman tidak ditemukan</div>';
  }
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
async function renderDashboard(el) {
  const data = await api('/dashboard/stats');
  if (!data) return;
  const maxGrowth = Math.max(...(data.charts.userGrowth.map(r => parseInt(r.count)) || [1]), 1);

  el.innerHTML = `
  <div class="stats-grid">
    <div class="stat-card purple">
      <div class="stat-label">Total User</div>
      <div class="stat-value">${fmtNum(data.users.total)}</div>
      <div class="stat-sub">+${fmtNum(data.users.newToday)} hari ini · +${fmtNum(data.users.newThisWeek)} minggu ini</div>
    </div>
    <div class="stat-card green">
      <div class="stat-label">User Aktif</div>
      <div class="stat-value">${fmtNum(data.users.active)}</div>
      <div class="stat-sub">Tidak tersuspensi</div>
    </div>
    <div class="stat-card red">
      <div class="stat-label">User Tersuspensi</div>
      <div class="stat-value">${fmtNum(data.users.suspended)}</div>
      <div class="stat-sub">Akun diblokir</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-label">Total Chatroom</div>
      <div class="stat-value">${fmtNum(data.chatrooms.total)}</div>
      <div class="stat-sub">${fmtNum(data.chatrooms.active)} aktif</div>
    </div>
    <div class="stat-card orange">
      <div class="stat-label">Total Merchant</div>
      <div class="stat-value">${fmtNum(data.merchants.total)}</div>
      <div class="stat-sub">Merchant terdaftar</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-label">Transaksi 24 Jam</div>
      <div class="stat-value">${fmtNum(data.credits.recentTransactions.count)}</div>
      <div class="stat-sub">Volume: ${fmtFloat(data.credits.recentTransactions.volume)}</div>
    </div>
  </div>
  <div class="two-col">
    <div class="card">
      <div class="card-title">Pertumbuhan User (30 Hari)</div>
      <div class="chart-bar-wrap">
        ${data.charts.userGrowth.length === 0 ? '<div class="empty">Tidak ada data</div>' :
          data.charts.userGrowth.slice(-15).map(r => `
          <div class="chart-bar-row">
            <div class="chart-bar-label">${fmtDate(r.date)}</div>
            <div class="chart-bar-bg"><div class="chart-bar-fill" style="width:${(parseInt(r.count)/maxGrowth*100).toFixed(1)}%"></div></div>
            <div class="chart-bar-val">${r.count}</div>
          </div>`).join('')}
      </div>
    </div>
    <div class="card">
      <div class="card-title">Top User Kredit</div>
      ${data.charts.topCreditUsers.length === 0 ? '<div class="empty">Tidak ada data</div>' :
        `<table><thead><tr><th>Username</th><th>Balance</th><th>Mata Uang</th></tr></thead><tbody>
        ${data.charts.topCreditUsers.map(u => `
          <tr><td><strong>${esc(u.username)}</strong></td><td>${fmtFloat(u.balance)}</td><td>${esc(u.currency)}</td></tr>
        `).join('')}
        </tbody></table>`}
      <div class="card-title" style="margin-top:20px">Total Saldo Per Mata Uang</div>
      ${data.credits.balances.map(b => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px">
          <span>${esc(b.currency)}</span><strong>${fmtFloat(parseFloat(b.total))}</strong>
        </div>`).join('')}
    </div>
  </div>`;
}

// ─── USERS ───────────────────────────────────────────────────────────────────
async function renderUsers(el, page = 1, search = '') {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat...</div>';
  const data = await api(`/users?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
  if (!data) return;
  const totalPages = Math.ceil(data.total / 20);
  el.innerHTML = `
  <div class="search-row">
    <input class="input" id="user-search" placeholder="Cari username / email..." value="${esc(search)}" />
    <button class="btn btn-primary" id="user-search-btn">Cari</button>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Username</th><th>Email</th><th>Level</th><th>Balance</th><th>Status</th><th>Terdaftar</th><th>Aksi</th></tr></thead>
      <tbody>
        ${data.users.length === 0 ? `<tr><td colspan="7"><div class="empty">Tidak ada data</div></td></tr>` :
          data.users.map(u => `
          <tr>
            <td><strong><span class="user-link" onclick="showUserHistory('${esc(u.username)}')" style="cursor:pointer;color:var(--primary);text-decoration:underline dotted">${esc(u.username)}</span></strong>${u.is_admin ? ' <span class="badge purple">Admin</span>' : ''}<br><small style="color:var(--text-muted)">${esc(u.display_name || '')}</small></td>
            <td>${esc(u.email)}<br><span class="badge ${u.email_verified ? 'green' : 'yellow'}">${u.email_verified ? 'Terverifikasi' : 'Belum'}</span></td>
            <td>Lv.${u.mig_level || 1}</td>
            <td>${u.balance != null ? fmtFloat(u.balance) + ' ' + (u.currency || '') : '-'}</td>
            <td><span class="badge ${u.is_suspended ? 'red' : 'green'}">${u.is_suspended ? 'Suspended' : 'Aktif'}</span></td>
            <td>${fmtDateTime(u.created_at)}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-sm btn-outline" onclick="toggleSuspend('${u.id}', ${!u.is_suspended},'${esc(u.username)}')">${u.is_suspended ? 'Aktifkan' : 'Suspend'}</button>
              <button class="btn btn-sm btn-outline" onclick="checkUserIp('${esc(u.username)}')">Cek IP</button>
              <button class="btn btn-sm btn-danger" onclick="deleteUser('${u.id}','${esc(u.username)}')">Hapus</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div class="pagination">
    <div class="page-info">Total: ${fmtNum(data.total)} user | Halaman ${page} dari ${totalPages}</div>
    ${page > 1 ? `<button class="btn btn-outline btn-sm" id="prev-btn">← Prev</button>` : ''}
    ${page < totalPages ? `<button class="btn btn-outline btn-sm" id="next-btn">Next →</button>` : ''}
  </div>`;

  document.getElementById('user-search-btn').onclick = () => renderUsers(el, 1, document.getElementById('user-search').value);
  document.getElementById('user-search').onkeydown = (e) => { if (e.key === 'Enter') renderUsers(el, 1, document.getElementById('user-search').value); };
  if (document.getElementById('prev-btn')) document.getElementById('prev-btn').onclick = () => renderUsers(el, page - 1, search);
  if (document.getElementById('next-btn')) document.getElementById('next-btn').onclick = () => renderUsers(el, page + 1, search);

  window.toggleSuspend = async (id, suspend, username) => {
    confirm(`${suspend ? 'Suspend' : 'Aktifkan'} User`, `Yakin ${suspend ? 'suspend' : 'aktifkan'} @${username}?`, async () => {
      await api(`/users/${id}/suspend`, { method: 'PATCH', body: { isSuspended: suspend } });
      renderUsers(el, page, search);
    }, suspend);
  };
  window.deleteUser = async (id, username) => {
    confirm('Hapus User', `Yakin hapus user @${username}? Tindakan ini tidak bisa dibatalkan!`, async () => {
      await api(`/users/${id}`, { method: 'DELETE' });
      renderUsers(el, page, search);
    });
  };
}

// ─── REGISTER AKUN SPESIAL ────────────────────────────────────────────────────
function renderRegisterSpecial(el) {
  el.innerHTML = `
  <div style="max-width:580px">
    <div style="display:flex;gap:0;border-radius:10px;overflow:hidden;border:1px solid var(--border);margin-bottom:20px">
      <button id="rs-tab-create" onclick="rsShowTab('create')" style="flex:1;padding:11px 0;font-size:13px;font-weight:700;background:var(--accent);color:#fff;border:none;cursor:pointer">⭐ Buat Akun Spesial</button>
      <button id="rs-tab-rename" onclick="rsShowTab('rename')" style="flex:1;padding:11px 0;font-size:13px;font-weight:700;background:var(--card);color:var(--text-muted);border:none;cursor:pointer;border-left:1px solid var(--border)">✏️ Edit Username</button>
    </div>

    <!-- TAB: BUAT AKUN SPESIAL -->
    <div id="rs-panel-create" class="card">
      <div class="card-title">Buat Akun Spesial</div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;margin-top:-8px">
        Username bebas 1–18 karakter, akun langsung terverifikasi.
      </p>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="field-group">
          <label>Username <span style="color:var(--danger)">*</span></label>
          <input class="input" id="rs-username" placeholder="1–18 karakter bebas..." maxlength="18" />
          <span id="rs-username-count" style="font-size:11px;color:var(--text-muted)">0 / 18</span>
        </div>
        <div class="field-group">
          <label>Display Name</label>
          <input class="input" id="rs-display-name" placeholder="nama tampilan..." />
        </div>
        <div class="field-group">
          <label>Email <span style="color:var(--danger)">*</span></label>
          <input class="input" id="rs-email" type="email" placeholder="email@contoh.com" />
        </div>
        <div class="field-group">
          <label>Password <span style="color:var(--danger)">*</span></label>
          <div style="position:relative">
            <input class="input" id="rs-password" type="password" placeholder="••••••••" style="padding-right:44px" />
            <button type="button" id="rs-pw-toggle" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);font-size:16px;cursor:pointer">👁</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="field-group">
            <label>Negara</label>
            <input class="input" id="rs-country" placeholder="ID, US, SG..." maxlength="3" />
            <span style="font-size:11px;color:var(--text-muted)">Kode negara (contoh: ID)</span>
          </div>
          <div class="field-group">
            <label>Gender</label>
            <select class="input" id="rs-gender">
              <option value="">— Pilih —</option>
              <option value="male">Laki-laki</option>
              <option value="female">Perempuan</option>
              <option value="other">Lainnya</option>
            </select>
          </div>
        </div>
        <div id="rs-error" style="color:var(--danger);font-size:13px;display:none"></div>
        <div id="rs-success" style="color:var(--success);font-size:13px;display:none"></div>
        <div style="display:flex;gap:10px;margin-top:4px">
          <button class="btn btn-primary" id="rs-save-btn">Buat Akun Spesial</button>
          <button class="btn btn-outline" onclick="state.page='users';render()">Batal</button>
        </div>
      </div>
    </div>

    <!-- TAB: EDIT USERNAME -->
    <div id="rs-panel-rename" class="card" style="display:none">
      <div class="card-title">Edit Username</div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;margin-top:-8px">
        Ganti username akun yang sudah ada. Semua data akan ikut diperbarui.
      </p>

      <!-- Step 1: Cari user -->
      <div style="margin-bottom:18px">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">1. Cari User</div>
        <div style="display:flex;gap:8px">
          <input class="input" id="rn-old-username" placeholder="Username saat ini..." maxlength="18" style="flex:1" />
          <button class="btn btn-outline" id="rn-lookup-btn" style="white-space:nowrap">🔍 Cari</button>
        </div>
      </div>

      <!-- User info card (tersembunyi sampai ditemukan) -->
      <div id="rn-user-info" style="display:none;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:18px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff" id="rn-avatar-letter">?</div>
          <div>
            <div style="font-weight:700;font-size:14px" id="rn-info-username">—</div>
            <div style="font-size:12px;color:var(--text-muted)" id="rn-info-display">—</div>
            <div style="font-size:11px;color:var(--text-muted)" id="rn-info-email">—</div>
          </div>
        </div>
      </div>

      <!-- Step 2: Username baru -->
      <div id="rn-step2" style="display:none">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">2. Username Baru</div>
        <div class="field-group" style="margin-bottom:14px">
          <input class="input" id="rn-new-username" placeholder="Masukkan username baru..." maxlength="18" />
          <span id="rn-new-count" style="font-size:11px;color:var(--text-muted)">0 / 18</span>
        </div>

        <div id="rn-warn" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;font-size:12px;color:#92400e;margin-bottom:14px">
          ⚠️ Perubahan username akan langsung berlaku. User perlu login ulang setelah proses selesai.
        </div>

        <div id="rn-error" style="color:var(--danger);font-size:13px;display:none;margin-bottom:8px"></div>
        <div id="rn-success" style="color:var(--success);font-size:13px;display:none;margin-bottom:8px"></div>

        <div style="display:flex;gap:10px">
          <button class="btn btn-primary" id="rn-save-btn">✏️ Ganti Username</button>
          <button class="btn btn-outline" onclick="rnReset()">Reset</button>
        </div>
      </div>

      <div id="rn-lookup-error" style="color:var(--danger);font-size:13px;display:none;margin-top:4px"></div>
    </div>
  </div>`;

  // ── Tab switching ─────────────────────────────────────────────────────────
  window.rsShowTab = (tab) => {
    const isCreate = tab === 'create';
    document.getElementById('rs-panel-create').style.display = isCreate ? '' : 'none';
    document.getElementById('rs-panel-rename').style.display = isCreate ? 'none' : '';
    document.getElementById('rs-tab-create').style.background = isCreate ? 'var(--accent)' : 'var(--card)';
    document.getElementById('rs-tab-create').style.color = isCreate ? '#fff' : 'var(--text-muted)';
    document.getElementById('rs-tab-rename').style.background = isCreate ? 'var(--card)' : 'var(--accent)';
    document.getElementById('rs-tab-rename').style.color = isCreate ? 'var(--text-muted)' : '#fff';
  };

  // ── Buat Akun Spesial logic ───────────────────────────────────────────────
  const usernameInput = document.getElementById('rs-username');
  const countEl = document.getElementById('rs-username-count');
  usernameInput.oninput = () => {
    const len = usernameInput.value.length;
    countEl.textContent = `${len} / 18`;
    countEl.style.color = len > 0 && len <= 18 ? 'var(--success)' : 'var(--danger)';
  };

  document.getElementById('rs-pw-toggle').onclick = () => {
    const pw = document.getElementById('rs-password');
    pw.type = pw.type === 'password' ? 'text' : 'password';
  };

  document.getElementById('rs-save-btn').onclick = async () => {
    const errEl = document.getElementById('rs-error');
    const sucEl = document.getElementById('rs-success');
    errEl.style.display = 'none';
    sucEl.style.display = 'none';

    const username = usernameInput.value.trim();
    const displayName = document.getElementById('rs-display-name').value.trim();
    const email = document.getElementById('rs-email').value.trim();
    const password = document.getElementById('rs-password').value;
    const country = document.getElementById('rs-country').value.trim().toUpperCase();
    const gender = document.getElementById('rs-gender').value;

    if (!username) { errEl.textContent = 'Username wajib diisi'; errEl.style.display = 'block'; return; }
    if (username.length > 18) { errEl.textContent = 'Username maksimal 18 karakter'; errEl.style.display = 'block'; return; }
    if (!email) { errEl.textContent = 'Email wajib diisi'; errEl.style.display = 'block'; return; }
    if (!password) { errEl.textContent = 'Password wajib diisi'; errEl.style.display = 'block'; return; }

    const btn = document.getElementById('rs-save-btn');
    btn.textContent = 'Membuat akun...'; btn.disabled = true;

    const res = await api('/users/special', {
      method: 'POST',
      body: { username, displayName, email, password, country: country || null, gender: gender || null },
    });
    btn.textContent = 'Buat Akun Spesial'; btn.disabled = false;

    if (!res || res.error) {
      errEl.textContent = res?.error || 'Gagal membuat akun';
      errEl.style.display = 'block';
      return;
    }

    sucEl.textContent = `Akun @${res.user.username} berhasil dibuat!`;
    sucEl.style.display = 'block';
    usernameInput.value = '';
    document.getElementById('rs-display-name').value = '';
    document.getElementById('rs-email').value = '';
    document.getElementById('rs-password').value = '';
    document.getElementById('rs-country').value = '';
    document.getElementById('rs-gender').value = '';
    countEl.textContent = '0 / 18';
    countEl.style.color = 'var(--text-muted)';
  };

  // ── Edit Username logic ───────────────────────────────────────────────────
  let rnFoundUser = null;

  window.rnReset = () => {
    rnFoundUser = null;
    document.getElementById('rn-old-username').value = '';
    document.getElementById('rn-new-username').value = '';
    document.getElementById('rn-new-count').textContent = '0 / 18';
    document.getElementById('rn-user-info').style.display = 'none';
    document.getElementById('rn-step2').style.display = 'none';
    document.getElementById('rn-lookup-error').style.display = 'none';
    document.getElementById('rn-error').style.display = 'none';
    document.getElementById('rn-success').style.display = 'none';
  };

  document.getElementById('rn-new-username').oninput = () => {
    const len = document.getElementById('rn-new-username').value.length;
    const el = document.getElementById('rn-new-count');
    el.textContent = `${len} / 18`;
    el.style.color = len > 0 && len <= 18 ? 'var(--success)' : 'var(--danger)';
  };

  document.getElementById('rn-old-username').onkeydown = (e) => {
    if (e.key === 'Enter') document.getElementById('rn-lookup-btn').click();
  };

  document.getElementById('rn-lookup-btn').onclick = async () => {
    const oldU = document.getElementById('rn-old-username').value.trim();
    const errEl = document.getElementById('rn-lookup-error');
    errEl.style.display = 'none';
    document.getElementById('rn-user-info').style.display = 'none';
    document.getElementById('rn-step2').style.display = 'none';
    document.getElementById('rn-error').style.display = 'none';
    document.getElementById('rn-success').style.display = 'none';

    if (!oldU) { errEl.textContent = 'Masukkan username dulu'; errEl.style.display = 'block'; return; }

    const btn = document.getElementById('rn-lookup-btn');
    btn.textContent = 'Mencari...'; btn.disabled = true;

    const res = await api('/users?search=' + encodeURIComponent(oldU) + '&limit=1');
    btn.textContent = '🔍 Cari'; btn.disabled = false;

    const match = res?.users?.find(u => u.username.toLowerCase() === oldU.toLowerCase());
    if (!match) {
      errEl.textContent = `User @${oldU} tidak ditemukan`;
      errEl.style.display = 'block';
      rnFoundUser = null;
      return;
    }

    rnFoundUser = match;
    const letter = (match.username || '?')[0].toUpperCase();
    document.getElementById('rn-avatar-letter').textContent = letter;
    document.getElementById('rn-info-username').textContent = '@' + match.username;
    document.getElementById('rn-info-display').textContent = match.display_name || '—';
    document.getElementById('rn-info-email').textContent = match.email || '—';
    document.getElementById('rn-user-info').style.display = 'block';
    document.getElementById('rn-step2').style.display = 'block';
    document.getElementById('rn-new-username').value = '';
    document.getElementById('rn-new-count').textContent = '0 / 18';
    document.getElementById('rn-new-username').focus();
  };

  document.getElementById('rn-save-btn').onclick = () => {
    const errEl = document.getElementById('rn-error');
    const sucEl = document.getElementById('rn-success');
    errEl.style.display = 'none';
    sucEl.style.display = 'none';

    if (!rnFoundUser) { errEl.textContent = 'Cari user dulu'; errEl.style.display = 'block'; return; }
    const newU = document.getElementById('rn-new-username').value.trim();
    if (!newU) { errEl.textContent = 'Username baru wajib diisi'; errEl.style.display = 'block'; return; }
    if (newU.length > 18) { errEl.textContent = 'Maksimal 18 karakter'; errEl.style.display = 'block'; return; }
    if (newU.toLowerCase() === rnFoundUser.username.toLowerCase()) { errEl.textContent = 'Username baru sama dengan username saat ini'; errEl.style.display = 'block'; return; }

    const oldUsername = rnFoundUser.username;
    confirm(
      'Ganti Username',
      `Yakin ganti username @${oldUsername} → @${newU}?\n\nHanya username yang berubah. Semua data (level, kredit, dll) tetap aman.`,
      async () => {
        const btn = document.getElementById('rn-save-btn');
        btn.textContent = 'Menyimpan...'; btn.disabled = true;

        const res = await api('/users/rename', {
          method: 'PUT',
          body: { old_username: oldUsername, new_username: newU },
        });
        btn.textContent = '✏️ Ganti Username'; btn.disabled = false;

        if (!res || res.error) {
          errEl.textContent = res?.error || 'Gagal mengganti username';
          errEl.style.display = 'block';
          return;
        }

        sucEl.textContent = `✅ Username berhasil diganti: @${oldUsername} → @${newU}`;
        sucEl.style.display = 'block';

        rnFoundUser = { ...rnFoundUser, username: newU };
        document.getElementById('rn-avatar-letter').textContent = newU[0].toUpperCase();
        document.getElementById('rn-info-username').textContent = '@' + newU;
        document.getElementById('rn-old-username').value = newU;
        document.getElementById('rn-new-username').value = '';
        document.getElementById('rn-new-count').textContent = '0 / 18';
      },
      false,
      'Ya, Ganti'
    );
  };
}

// ─── CHATROOMS ────────────────────────────────────────────────────────────────
function openCreateRoomModal() {
  document.getElementById('crm-name').value = '';
  document.getElementById('crm-desc').value = '';
  document.getElementById('crm-category').value = '8';
  document.getElementById('crm-capacity').value = '25';
  document.getElementById('crm-language').value = 'id';
  document.getElementById('crm-type').value = 'official';
  document.getElementById('crm-color').value = '#4CAF50';
  document.getElementById('crm-color-picker').value = '#4CAF50';
  document.getElementById('crm-owner').value = '';
  document.getElementById('crm-adult').checked = false;
  document.getElementById('crm-allow-kick').checked = true;
  document.getElementById('create-room-modal').classList.add('open');
  setTimeout(() => document.getElementById('crm-name').focus(), 100);
}

window.closeCreateRoomModal = () => {
  document.getElementById('create-room-modal').classList.remove('open');
};

window.saveCreateRoom = async () => {
  const name      = document.getElementById('crm-name').value.trim();
  const desc      = document.getElementById('crm-desc').value.trim();
  const category  = document.getElementById('crm-category').value;
  const capacity  = document.getElementById('crm-capacity').value;
  const language  = document.getElementById('crm-language').value;
  const typeVal   = document.getElementById('crm-type').value;
  const color     = document.getElementById('crm-color').value.trim() || '#4CAF50';
  const owner     = document.getElementById('crm-owner').value.trim();
  const adult     = document.getElementById('crm-adult').checked;
  const allowKick = document.getElementById('crm-allow-kick').checked;

  if (!name) { toast('Nama room wajib diisi', 'error'); document.getElementById('crm-name').focus(); return; }
  if (!category) { toast('Kategori wajib dipilih', 'error'); return; }

  const btn = document.getElementById('crm-save-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Membuat...';

  const res = await api('/chatrooms', {
    method: 'POST',
    body: {
      name, description: desc || null,
      category_id: parseInt(category),
      max_participants: parseInt(capacity) || 25,
      language, color,
      allow_kick: allowKick,
      adult_only: adult,
      user_owned: typeVal === 'user',
      owner: owner || null,
    },
  });

  btn.disabled = false;
  btn.textContent = '🏠 Buat Room';

  if (res && res.success) {
    toast(res.message || 'Chatroom berhasil dibuat', 'success');
    closeCreateRoomModal();
    if (window._refreshRooms) window._refreshRooms();
  } else {
    toast(res?.error || 'Gagal membuat chatroom', 'error');
  }
};

let _editRoomData = null;
let _editRoomRefresh = null;

function openEditRoomModal(room, refreshFn) {
  _editRoomData = room;
  _editRoomRefresh = refreshFn;
  document.getElementById('erm-room-name').textContent = room.name;
  document.getElementById('erm-capacity').value = room.max_participants || 25;
  document.getElementById('erm-category').value = String(room.category_id || 1);
  document.getElementById('erm-owner').value = '';
  document.getElementById('edit-room-modal').classList.add('open');
}

window.closeEditRoomModal = () => {
  document.getElementById('edit-room-modal').classList.remove('open');
  _editRoomData = null;
};

window.saveEditRoom = async () => {
  if (!_editRoomData) return;
  const capacity = parseInt(document.getElementById('erm-capacity').value);
  const category = parseInt(document.getElementById('erm-category').value);
  const ownerInput = document.getElementById('erm-owner').value.trim();

  if (isNaN(capacity) || capacity < 2) {
    toast('Kapasitas minimal 2', 'error'); return;
  }

  const btn = document.getElementById('erm-save-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Menyimpan...';

  const payload = {
    max_participants: capacity,
    category_id: category,
  };
  if (ownerInput !== '') payload.created_by = ownerInput;

  const res = await api(`/chatrooms/${_editRoomData.id}`, { method: 'PUT', body: payload });
  btn.disabled = false;
  btn.textContent = '💾 Simpan Perubahan';

  if (res && res.success) {
    toast(res.message || 'Chatroom berhasil diperbarui', 'success');
    closeEditRoomModal();
    if (_editRoomRefresh) _editRoomRefresh();
  } else {
    toast(res?.error || 'Gagal memperbarui chatroom', 'error');
  }
};

async function renderChatrooms(el, page = 1, search = '') {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat...</div>';
  const data = await api(`/chatrooms?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
  if (!data) return;
  const totalPages = Math.ceil(data.total / 20);

  const CATEGORIES = {1:'General',2:'Social',3:'Entertainment',4:'Friends',5:'Business',6:'Help',7:'Games',8:'Regional',9:'Music',10:'News'};

  el.innerHTML = `
  <div class="search-row">
    <input class="input" id="room-search" placeholder="Cari nama chatroom..." value="${esc(search)}" />
    <button class="btn btn-primary" id="room-search-btn">Cari</button>
    <button class="btn btn-primary" onclick="openCreateRoomModal()" style="margin-left:auto;white-space:nowrap">🏠 Buat Room</button>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Nama</th><th>Peserta</th><th>Kategori</th><th>Tipe</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>
      <tbody>
        ${data.chatrooms.length === 0 ? `<tr><td colspan="7"><div class="empty">Tidak ada chatroom</div></td></tr>` :
          data.chatrooms.map(c => `
          <tr>
            <td><strong>${esc(c.name)}</strong><br><small style="color:var(--text-muted)">${esc(c.description || '-')}</small></td>
            <td>${c.current_participants}/${c.max_participants}</td>
            <td><span class="badge gray">${esc(CATEGORIES[c.category_id] || String(c.category_id))}</span>${c.adult_only ? ' <span class="badge red">18+</span>' : ''}</td>
            <td><span class="badge ${c.user_owned ? 'blue' : 'purple'}">${c.user_owned ? 'User' : 'Official'}</span></td>
            <td><span class="badge ${c.status === 1 ? 'green' : 'red'}">${c.status === 1 ? 'Aktif' : 'Nonaktif'}</span></td>
            <td>${fmtDateTime(c.created_at)}</td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:wrap">
                <button class="btn btn-sm btn-outline" onclick="openEditRoomModal(${JSON.stringify(c).replace(/"/g,'&quot;')}, _refreshRooms)" title="Edit">✏️ Edit</button>
                <button class="btn btn-sm btn-outline" onclick="toggleRoom('${c.id}',${c.status === 1 ? 0 : 1})">${c.status === 1 ? 'Nonaktifkan' : 'Aktifkan'}</button>
                <button class="btn btn-sm btn-danger" onclick="deleteRoom('${c.id}','${esc(c.name)}')">Hapus</button>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div class="pagination">
    <div class="page-info">Total: ${fmtNum(data.total)} | Halaman ${page} dari ${totalPages}</div>
    ${page > 1 ? `<button class="btn btn-outline btn-sm" id="prev-btn">← Prev</button>` : ''}
    ${page < totalPages ? `<button class="btn btn-outline btn-sm" id="next-btn">Next →</button>` : ''}
  </div>`;

  window._refreshRooms = () => renderChatrooms(el, page, search);
  document.getElementById('room-search-btn').onclick = () => renderChatrooms(el, 1, document.getElementById('room-search').value);
  document.getElementById('room-search').onkeydown = (e) => { if (e.key === 'Enter') renderChatrooms(el, 1, document.getElementById('room-search').value); };
  if (document.getElementById('prev-btn')) document.getElementById('prev-btn').onclick = () => renderChatrooms(el, page - 1, search);
  if (document.getElementById('next-btn')) document.getElementById('next-btn').onclick = () => renderChatrooms(el, page + 1, search);

  window.toggleRoom = async (id, status) => {
    await api(`/chatrooms/${id}/status`, { method: 'PATCH', body: { status } });
    renderChatrooms(el, page, search);
  };
  window.deleteRoom = async (id, name) => {
    confirm('Hapus Chatroom', `Yakin hapus chatroom "${name}"?`, async () => {
      await api(`/chatrooms/${id}`, { method: 'DELETE' });
      renderChatrooms(el, page, search);
    });
  };
}

// ─── CREDITS ─────────────────────────────────────────────────────────────────
const TX_TYPES = {1:'Credit Card',2:'Voucher',3:'SMS',4:'Call',5:'Subscription',6:'Purchase',7:'Referral',8:'Activation',9:'Bonus',10:'Refund',14:'Transfer',17:'Voucher Created',23:'Kick Charge',33:'Game Bet',34:'Game Reward',41:'Virtual Gift',};

async function renderCredits(el, page = 1, search = '') {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat...</div>';
  const data = await api(`/credits/accounts?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
  if (!data || data.error || !Array.isArray(data.accounts)) {
    el.innerHTML = `<div class="empty" style="padding:60px 0;text-align:center">
      <div style="font-size:48px;margin-bottom:12px">⚠️</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:6px">Gagal memuat data</div>
      <div style="font-size:13px;color:var(--text-muted)">${data?.error || 'Tidak dapat terhubung ke server'}</div>
    </div>`;
    return;
  }
  const totalPages = Math.ceil(data.total / 20) || 1;
  el.innerHTML = `
  <div class="search-row">
    <input class="input" id="credit-search" placeholder="Cari username..." value="${esc(search)}" />
    <button class="btn btn-primary" id="credit-search-btn">Cari</button>
    <button class="btn btn-outline" id="show-tx-btn">Lihat Transaksi Terbaru</button>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Username</th><th>Mata Uang</th><th>Balance</th><th>Funded Balance</th><th>Update Terakhir</th></tr></thead>
      <tbody>
        ${data.accounts.length === 0 ? `<tr><td colspan="5"><div class="empty">Tidak ada data</div></td></tr>` :
          data.accounts.map(a => `
          <tr>
            <td><strong>${esc(a.username)}</strong></td>
            <td>${esc(a.currency)}</td>
            <td><strong>${fmtFloat(a.balance)}</strong></td>
            <td>${fmtFloat(a.funded_balance)}</td>
            <td>${fmtDateTime(a.updated_at)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div class="pagination">
    <div class="page-info">Total: ${fmtNum(data.total)} akun | Halaman ${page} dari ${totalPages}</div>
    ${page > 1 ? `<button class="btn btn-outline btn-sm" id="prev-btn">← Prev</button>` : ''}
    ${page < totalPages ? `<button class="btn btn-outline btn-sm" id="next-btn">Next →</button>` : ''}
  </div>
  <div id="tx-section"></div>`;

  document.getElementById('credit-search-btn').onclick = () => renderCredits(el, 1, document.getElementById('credit-search').value);
  document.getElementById('credit-search').onkeydown = (e) => { if (e.key === 'Enter') renderCredits(el, 1, document.getElementById('credit-search').value); };
  if (document.getElementById('prev-btn')) document.getElementById('prev-btn').onclick = () => renderCredits(el, page - 1, search);
  if (document.getElementById('next-btn')) document.getElementById('next-btn').onclick = () => renderCredits(el, page + 1, search);

  document.getElementById('show-tx-btn').onclick = async () => {
    const txEl = document.getElementById('tx-section');
    txEl.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat transaksi...</div>';
    const tx = await api('/credits/transactions?page=1&limit=30');
    if (!tx || tx.error || !Array.isArray(tx.transactions)) {
      txEl.innerHTML = `<div class="empty" style="padding:20px;text-align:center;color:var(--danger)">${tx?.error || 'Gagal memuat transaksi'}</div>`;
      return;
    }
    txEl.innerHTML = `<br><div class="card">
      <div class="card-title">Transaksi Terbaru</div>
      <div class="table-wrap">
      <table>
        <thead><tr><th>Username</th><th>Tipe</th><th>Jumlah</th><th>Keterangan</th><th>Waktu</th></tr></thead>
        <tbody>
          ${tx.transactions.length === 0
            ? `<tr><td colspan="5"><div class="empty">Belum ada transaksi</div></td></tr>`
            : tx.transactions.map(t => `
          <tr>
            <td>${esc(t.username)}</td>
            <td><span class="badge ${t.amount > 0 ? 'green' : 'red'}">${TX_TYPES[t.type] || 'Tipe '+t.type}</span></td>
            <td style="font-weight:600;color:${t.amount > 0 ? 'var(--success)' : 'var(--danger)'}">${t.amount > 0 ? '+' : ''}${fmtFloat(t.amount)} ${t.currency}</td>
            <td>${esc(t.description || '-')}</td>
            <td>${fmtDateTime(t.created_at)}</td>
          </tr>`).join('')}
        </tbody>
      </table></div></div>`;
  };
}

// ─── MANAJEMEN KREDIT ─────────────────────────────────────────────────────────
function renderCreditManagement(el) {
  el.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:24px;max-width:680px">

    <div class="card">
      <div class="card-title">Tambah Kredit ke User Tertentu</div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;margin-top:-8px">
        Tambahkan sejumlah kredit langsung ke akun user yang dituju.
      </p>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="field-group">
          <label>Username <span style="color:var(--danger)">*</span></label>
          <input class="input" id="cm-username" placeholder="Masukkan username..." />
        </div>
        <div class="field-group">
          <label>Jumlah Kredit <span style="color:var(--danger)">*</span></label>
          <input class="input" id="cm-amount" type="number" min="1" step="any" placeholder="Contoh: 1000" />
        </div>
        <div class="field-group">
          <label>Mata Uang</label>
          <select class="input" id="cm-currency">
            <option value="">Gunakan mata uang akun user</option>
            <option value="IDR">IDR</option>
          </select>
        </div>
        <div class="field-group">
          <label>Keterangan</label>
          <input class="input" id="cm-description" placeholder="Keterangan transaksi (opsional)..." />
        </div>
        <div id="cm-result" style="display:none;padding:12px;border-radius:8px;font-size:13px"></div>
        <div>
          <button class="btn btn-primary" id="cm-add-btn">Tambah Kredit</button>
        </div>
      </div>
    </div>

    <div class="card" style="border-left:4px solid var(--danger)">
      <div class="card-title" style="color:var(--danger)">⬇️ Tarik IDR dari User</div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;margin-top:-8px">
        Ambil kembali IDR dari akun user — digunakan jika admin salah transfer kredit.
      </p>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="field-group">
          <label>Username <span style="color:var(--danger)">*</span></label>
          <div style="display:flex;gap:8px">
            <input class="input" id="wd-username" placeholder="Masukkan username..." style="flex:1" />
            <button class="btn btn-outline" id="wd-check-btn" style="flex-shrink:0">Cek Saldo</button>
          </div>
        </div>
        <div id="wd-balance-info" style="display:none;padding:10px 14px;border-radius:8px;font-size:13px;background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;font-weight:500"></div>
        <div class="field-group">
          <label>Jumlah Tarik (IDR) <span style="color:var(--danger)">*</span></label>
          <input class="input" id="wd-amount" type="number" min="1" step="any" placeholder="Contoh: 50000" />
        </div>
        <div class="field-group">
          <label>Alasan / Keterangan</label>
          <input class="input" id="wd-description" placeholder="Contoh: Admin salah transfer, koreksi saldo..." />
        </div>
        <div id="wd-result" style="display:none;padding:12px;border-radius:8px;font-size:13px"></div>
        <div>
          <button class="btn btn-danger" id="wd-deduct-btn">⬇️ Tarik IDR</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Transfer Kredit ke Semua User</div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;margin-top:-8px">
        Tambahkan kredit secara massal ke seluruh akun yang terdaftar di sistem.
      </p>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="field-group">
          <label>Jumlah Kredit per User <span style="color:var(--danger)">*</span></label>
          <input class="input" id="ca-amount" type="number" min="1" step="any" placeholder="Contoh: 500" />
        </div>
        <div class="field-group">
          <label>Mata Uang</label>
          <select class="input" id="ca-currency">
            <option value="">Gunakan mata uang masing-masing akun</option>
            <option value="IDR">IDR</option>
          </select>
        </div>
        <div class="field-group">
          <label>Keterangan</label>
          <input class="input" id="ca-description" placeholder="Keterangan transaksi (opsional)..." />
        </div>
        <div id="ca-result" style="display:none;padding:12px;border-radius:8px;font-size:13px"></div>
        <div>
          <button class="btn btn-danger" id="ca-add-btn">Transfer ke Semua User</button>
        </div>
      </div>
    </div>

    <div class="card" style="border-left:4px solid var(--info)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div class="card-title" style="margin-bottom:0;color:var(--info)">📋 Log Transfer Admin</div>
        <button class="btn btn-outline btn-sm" id="al-refresh-btn" onclick="loadAdminLogs(1)">↻ Refresh</button>
      </div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
        Riwayat lengkap semua aksi transfer / deduct kredit yang dilakukan oleh administrator.
      </p>
      <div id="al-body">
        <div class="loading"><div class="spinner"></div>Memuat log...</div>
      </div>
      <div id="al-footer" style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;display:none">
        <span id="al-page-info" style="font-size:13px;color:var(--text-muted)"></span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" id="al-prev-btn" style="display:none">← Prev</button>
          <button class="btn btn-outline btn-sm" id="al-next-btn" style="display:none">Next →</button>
        </div>
      </div>
    </div>

  </div>`;

  document.getElementById('cm-add-btn').onclick = async () => {
    const btn = document.getElementById('cm-add-btn');
    const resultEl = document.getElementById('cm-result');
    const username = document.getElementById('cm-username').value.trim();
    const amount = parseFloat(document.getElementById('cm-amount').value);
    const currency = document.getElementById('cm-currency').value || undefined;
    const description = document.getElementById('cm-description').value.trim() || undefined;

    resultEl.style.display = 'none';
    if (!username) { toast('Username wajib diisi', 'error'); return; }
    if (isNaN(amount) || amount <= 0) { toast('Jumlah kredit harus lebih dari 0', 'error'); return; }

    btn.textContent = 'Memproses...'; btn.disabled = true;
    const body = { username, amount };
    if (currency) body.currency = currency;
    if (description) body.description = description;

    const res = await api('/credits/add', { method: 'POST', body });
    btn.textContent = 'Tambah Kredit'; btn.disabled = false;

    if (!res || res.error) {
      resultEl.style.cssText = 'display:block;padding:12px;border-radius:8px;font-size:13px;background:var(--danger-light,#fee);color:var(--danger);border:1px solid var(--danger)';
      resultEl.textContent = '✗ ' + (res?.error || 'Gagal menambah kredit');
      return;
    }
    resultEl.style.cssText = 'display:block;padding:12px;border-radius:8px;font-size:13px;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0';
    resultEl.textContent = `✓ Berhasil menambah ${fmtFloat(res.added)} ${res.currency} ke @${res.username}. Saldo baru: ${fmtFloat(res.newBalance)} ${res.currency}`;
    toast(`Kredit berhasil ditambahkan ke @${res.username}`, 'success');
    document.getElementById('cm-username').value = '';
    document.getElementById('cm-amount').value = '';
    document.getElementById('cm-description').value = '';
    loadAdminLogs(1);
  };

  document.getElementById('ca-add-btn').onclick = () => {
    const amount = parseFloat(document.getElementById('ca-amount').value);
    if (isNaN(amount) || amount <= 0) { toast('Jumlah kredit harus lebih dari 0', 'error'); return; }

    confirm(
      'Transfer ke Semua User',
      `Yakin ingin menambah ${fmtFloat(amount)} kredit ke SEMUA user? Tindakan ini tidak bisa dibatalkan.`,
      async () => {
        const btn = document.getElementById('ca-add-btn');
        const resultEl = document.getElementById('ca-result');
        const currency = document.getElementById('ca-currency').value || undefined;
        const description = document.getElementById('ca-description').value.trim() || undefined;

        btn.textContent = 'Memproses...'; btn.disabled = true;
        resultEl.style.display = 'none';

        const body = { amount };
        if (currency) body.currency = currency;
        if (description) body.description = description;

        const res = await api('/credits/transfer-all', { method: 'POST', body });
        btn.textContent = 'Transfer ke Semua User'; btn.disabled = false;

        if (!res || res.error) {
          resultEl.style.cssText = 'display:block;padding:12px;border-radius:8px;font-size:13px;background:var(--danger-light,#fee);color:var(--danger);border:1px solid var(--danger)';
          resultEl.textContent = '✗ ' + (res?.error || 'Gagal melakukan transfer');
          return;
        }
        resultEl.style.cssText = 'display:block;padding:12px;border-radius:8px;font-size:13px;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0';
        resultEl.textContent = `✓ Transfer selesai! ${fmtNum(res.successCount)} dari ${fmtNum(res.totalProcessed)} user berhasil menerima ${fmtFloat(res.amount)} kredit.${res.failCount > 0 ? ` (${res.failCount} gagal)` : ''}`;
        toast(`Transfer massal selesai: ${res.successCount} user berhasil`, 'success');
        document.getElementById('ca-amount').value = '';
        document.getElementById('ca-description').value = '';
        loadAdminLogs(1);
      },
      true
    );
  };

  // ── Tarik IDR handlers ────────────────────────────────────────────────────
  document.getElementById('wd-check-btn').onclick = async () => {
    const btn = document.getElementById('wd-check-btn');
    const username = document.getElementById('wd-username').value.trim();
    const balanceInfo = document.getElementById('wd-balance-info');
    if (!username) { toast('Masukkan username terlebih dahulu', 'error'); return; }
    btn.textContent = 'Mengecek...'; btn.disabled = true;
    const res = await api(`/credits/balance/${encodeURIComponent(username)}`);
    btn.textContent = 'Cek Saldo'; btn.disabled = false;
    if (!res || res.error) {
      balanceInfo.style.cssText = 'display:block;padding:10px 14px;border-radius:8px;font-size:13px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;font-weight:500';
      balanceInfo.textContent = '✗ ' + (res?.error || 'User tidak ditemukan');
      return;
    }
    balanceInfo.style.cssText = 'display:block;padding:10px 14px;border-radius:8px;font-size:13px;background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;font-weight:500';
    balanceInfo.textContent = `💰 Saldo @${res.username}: ${fmtFloat(res.balance)} ${res.currency}`;
  };

  document.getElementById('wd-deduct-btn').onclick = () => {
    const username = document.getElementById('wd-username').value.trim();
    const amount = parseFloat(document.getElementById('wd-amount').value);
    if (!username) { toast('Username wajib diisi', 'error'); return; }
    if (isNaN(amount) || amount <= 0) { toast('Jumlah harus lebih dari 0', 'error'); return; }

    confirm(
      'Tarik IDR dari User',
      `Yakin ingin MENARIK ${fmtFloat(amount)} IDR dari akun @${username}? Tindakan ini akan mengurangi saldo user.`,
      async () => {
        const btn = document.getElementById('wd-deduct-btn');
        const resultEl = document.getElementById('wd-result');
        const description = document.getElementById('wd-description').value.trim() || undefined;

        btn.textContent = 'Memproses...'; btn.disabled = true;
        resultEl.style.display = 'none';

        const body = { username, amount };
        if (description) body.description = description;

        const res = await api('/credits/deduct', { method: 'POST', body });
        btn.textContent = '⬇️ Tarik IDR'; btn.disabled = false;

        if (!res || res.error) {
          resultEl.style.cssText = 'display:block;padding:12px;border-radius:8px;font-size:13px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5';
          resultEl.textContent = '✗ ' + (res?.error || 'Gagal menarik IDR');
          return;
        }
        resultEl.style.cssText = 'display:block;padding:12px;border-radius:8px;font-size:13px;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0';
        resultEl.textContent = `✓ Berhasil menarik ${fmtFloat(res.deducted)} ${res.currency} dari @${res.username}. Saldo sebelumnya: ${fmtFloat(res.previousBalance)} → Saldo baru: ${fmtFloat(res.newBalance)} ${res.currency}`;
        toast(`Berhasil tarik ${fmtFloat(res.deducted)} IDR dari @${res.username}`, 'success');

        document.getElementById('wd-username').value = '';
        document.getElementById('wd-amount').value = '';
        document.getElementById('wd-description').value = '';
        document.getElementById('wd-balance-info').style.display = 'none';
        loadAdminLogs(1);
      },
      true
    );
  };

  loadAdminLogs(1);
}

let _adminLogsPage = 1;
let _adminLogsTotal = 0;
const _adminLogsLimit = 20;

async function loadAdminLogs(page = 1) {
  _adminLogsPage = page;
  const bodyEl = document.getElementById('al-body');
  const footerEl = document.getElementById('al-footer');
  if (!bodyEl) return;

  bodyEl.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat log...</div>';

  const data = await api(`/credits/admin-logs?page=${page}&limit=${_adminLogsLimit}`);
  if (!data || data.error) {
    bodyEl.innerHTML = `<div class="empty">Gagal memuat log: ${data?.error || 'Error'}</div>`;
    return;
  }

  _adminLogsTotal = data.total || 0;
  const logs = data.logs || [];

  if (logs.length === 0) {
    bodyEl.innerHTML = '<div class="empty">Belum ada log transfer admin.</div>';
    if (footerEl) footerEl.style.display = 'none';
    return;
  }

  const isDeduct = (desc) => desc && desc.includes(' deduct ');
  const isBroadcast = (desc) => desc && desc.includes(' to all users ');

  bodyEl.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:0">
      ${logs.map(l => {
        const deduct = isDeduct(l.description);
        const broadcast = isBroadcast(l.description);
        const iconBg = deduct ? '#fee2e2' : '#dcfce7';
        const icon = deduct ? '⬇️' : (broadcast ? '📢' : '⬆️');
        const amtColor = deduct ? 'var(--danger)' : 'var(--success)';
        const amt = parseFloat(l.amount);
        const amtStr = (amt > 0 && !deduct ? '+' : '') + fmtFloat(amt) + ' ' + (l.currency || '');
        const createdAt = l.created_at ? new Date(l.created_at).toLocaleString('id-ID', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
        return `
        <div class="history-item">
          <div class="history-icon" style="background:${iconBg}">${icon}</div>
          <div class="history-label">
            <div class="hl-main">${esc(l.description || '')}</div>
            <div class="hl-sub">User: <strong>${esc(l.username)}</strong> &nbsp;·&nbsp; ${esc(createdAt)} &nbsp;·&nbsp; Saldo akhir: ${fmtFloat(parseFloat(l.running_balance))} ${esc(l.currency||'')}</div>
          </div>
          <div class="history-amount" style="color:${amtColor}">${amtStr}</div>
        </div>`;
      }).join('')}
    </div>`;

  if (footerEl) {
    const totalPages = Math.ceil(_adminLogsTotal / _adminLogsLimit);
    const pageInfoEl = document.getElementById('al-page-info');
    const prevBtn = document.getElementById('al-prev-btn');
    const nextBtn = document.getElementById('al-next-btn');
    if (pageInfoEl) pageInfoEl.textContent = `Halaman ${page} dari ${totalPages} (${_adminLogsTotal} log)`;
    if (prevBtn) { prevBtn.style.display = page > 1 ? 'inline-flex' : 'none'; prevBtn.onclick = () => loadAdminLogs(page - 1); }
    if (nextBtn) { nextBtn.style.display = page < totalPages ? 'inline-flex' : 'none'; nextBtn.onclick = () => loadAdminLogs(page + 1); }
    footerEl.style.display = 'flex';
  }
}

// ─── MANAGED ACCOUNT ──────────────────────────────────────────────────────────
function renderManagedAccount(el) {
  el.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:24px;max-width:680px">

    <div class="card" style="border:2px solid var(--primary,#6366f1)">
      <div class="card-title">🔍 Cari User</div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;margin-top:-8px">
        Masukkan username untuk melihat info akun dan mengisi otomatis form di bawah.
      </p>
      <div style="display:flex;gap:10px;align-items:flex-start">
        <input class="input" id="ma-lookup-input" placeholder="Ketik username lalu tekan Enter atau klik Cari..." style="flex:1" />
        <button class="btn btn-primary" id="ma-lookup-btn" style="white-space:nowrap">Cari</button>
      </div>
      <div id="ma-lookup-result" style="display:none;margin-top:16px;padding:14px;border-radius:10px;background:var(--bg,#f8f9fa);border:1px solid var(--border)"></div>
    </div>

    <div class="card">
      <div class="card-title">🔑 Change Password</div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;margin-top:-8px">Ubah password login akun user.</p>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="field-group">
          <label>Username <span style="color:var(--danger)">*</span></label>
          <input class="input" id="ma-pw-username" placeholder="Masukkan username..." />
        </div>
        <div class="field-group">
          <label>Password Baru <span style="color:var(--danger)">*</span></label>
          <input class="input" id="ma-pw-new" type="password" placeholder="Minimal 6 karakter..." />
        </div>
        <div class="field-group">
          <label>Konfirmasi Password Baru <span style="color:var(--danger)">*</span></label>
          <input class="input" id="ma-pw-confirm" type="password" placeholder="Ulangi password baru..." />
        </div>
        <div id="ma-pw-result" style="display:none;padding:12px;border-radius:8px;font-size:13px"></div>
        <div><button class="btn btn-primary" id="ma-pw-btn">Ubah Password</button></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">🔢 Change PIN</div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;margin-top:-8px">Ubah PIN transfer kredit user (4–6 digit angka).</p>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="field-group">
          <label>Username <span style="color:var(--danger)">*</span></label>
          <input class="input" id="ma-pin-username" placeholder="Masukkan username..." />
        </div>
        <div class="field-group">
          <label>PIN Baru <span style="color:var(--danger)">*</span></label>
          <input class="input" id="ma-pin-new" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="4–6 digit angka..." />
        </div>
        <div class="field-group">
          <label>Konfirmasi PIN Baru <span style="color:var(--danger)">*</span></label>
          <input class="input" id="ma-pin-confirm" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="Ulangi PIN baru..." />
        </div>
        <div id="ma-pin-result" style="display:none;padding:12px;border-radius:8px;font-size:13px"></div>
        <div><button class="btn btn-primary" id="ma-pin-btn">Ubah PIN</button></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">✉️ Change Email</div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;margin-top:-8px">Ubah alamat email akun user. Email baru langsung ditandai terverifikasi.</p>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="field-group">
          <label>Username <span style="color:var(--danger)">*</span></label>
          <input class="input" id="ma-em-username" placeholder="Masukkan username..." />
        </div>
        <div class="field-group">
          <label>Email Saat Ini</label>
          <input class="input" id="ma-em-current" placeholder="(belum dicari)" disabled style="opacity:0.6" />
        </div>
        <div class="field-group">
          <label>Email Baru <span style="color:var(--danger)">*</span></label>
          <input class="input" id="ma-em-new" type="email" placeholder="contoh@email.com" />
        </div>
        <div id="ma-em-result" style="display:none;padding:12px;border-radius:8px;font-size:13px"></div>
        <div><button class="btn btn-primary" id="ma-em-btn">Ubah Email</button></div>
      </div>
    </div>

  </div>`;

  function showResult(id, ok, msg) {
    const r = document.getElementById(id);
    r.style.cssText = ok
      ? 'display:block;padding:12px;border-radius:8px;font-size:13px;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0'
      : 'display:block;padding:12px;border-radius:8px;font-size:13px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca';
    r.textContent = (ok ? '✓ ' : '✗ ') + msg;
  }

  function fillForms(username) {
    ['ma-pw-username', 'ma-pin-username', 'ma-em-username'].forEach(id => {
      document.getElementById(id).value = username;
    });
  }

  function renderLookupCard(u) {
    const statusBadge = u.is_suspended
      ? '<span class="badge red">Suspended</span>'
      : '<span class="badge green">Aktif</span>';
    const adminBadge = u.is_admin ? '<span class="badge purple">Admin</span>' : '';
    const verifiedBadge = u.email_verified
      ? '<span class="badge green">Terverifikasi</span>'
      : '<span class="badge yellow">Belum Verifikasi</span>';
    const pinBadge = u.has_pin
      ? '<span class="badge blue">PIN Terset</span>'
      : '<span class="badge gray">Belum ada PIN</span>';

    return `
    <div style="display:grid;grid-template-columns:auto 1fr;gap:10px 16px;align-items:center;font-size:13px">
      <div style="grid-column:1/-1;display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div style="width:44px;height:44px;border-radius:50%;background:var(--primary,#6366f1);display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;font-weight:700;flex-shrink:0">
          ${u.display_picture ? `<img src="${esc(u.display_picture)}" style="width:44px;height:44px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'" />` : esc((u.username||'?')[0].toUpperCase())}
        </div>
        <div>
          <div style="font-weight:700;font-size:15px">${esc(u.username)}</div>
          <div style="color:var(--text-muted)">${esc(u.display_name || '')}</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">${statusBadge}${adminBadge}</div>
      </div>
      <span style="color:var(--text-muted)">Email</span>
      <span><strong>${esc(u.email)}</strong> ${verifiedBadge}</span>
      <span style="color:var(--text-muted)">Level</span>
      <span>Level ${u.mig_level || 1}${u.country ? ' · ' + esc(u.country) : ''}</span>
      <span style="color:var(--text-muted)">Balance</span>
      <span>${u.balance != null ? '<strong>' + fmtFloat(u.balance) + '</strong> ' + esc(u.currency || '') : '-'}</span>
      <span style="color:var(--text-muted)">Transfer PIN</span>
      <span>${pinBadge}</span>
      <span style="color:var(--text-muted)">Terdaftar</span>
      <span>${fmtDateTime(u.created_at)}</span>
      <div style="grid-column:1/-1;margin-top:10px">
        <button class="btn btn-primary btn-sm" id="ma-autofill-btn">↓ Isi Otomatis Username ke Semua Form</button>
      </div>
    </div>`;
  }

  const doLookup = async () => {
    const username = document.getElementById('ma-lookup-input').value.trim();
    const resultEl = document.getElementById('ma-lookup-result');
    const btn = document.getElementById('ma-lookup-btn');
    if (!username) { toast('Masukkan username terlebih dahulu', 'error'); return; }

    btn.textContent = 'Mencari...'; btn.disabled = true;
    resultEl.style.display = 'none';

    const res = await api(`/accounts/lookup?username=${encodeURIComponent(username)}`);
    btn.textContent = 'Cari'; btn.disabled = false;

    if (!res || res.error) {
      resultEl.style.cssText = 'display:block;margin-top:16px;padding:12px;border-radius:8px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;font-size:13px';
      resultEl.textContent = '✗ ' + (res?.error || 'User tidak ditemukan');
      return;
    }

    const u = res.user;
    resultEl.style.cssText = 'display:block;margin-top:16px;padding:14px;border-radius:10px;background:var(--bg,#f8f9fa);border:1px solid var(--border)';
    resultEl.innerHTML = renderLookupCard(u);

    document.getElementById('ma-em-current').value = u.email || '';

    document.getElementById('ma-autofill-btn').onclick = () => {
      fillForms(u.username);
      document.getElementById('ma-em-current').value = u.email || '';
      toast(`Username @${u.username} diisi ke semua form`, 'success');
    };
  };

  document.getElementById('ma-lookup-btn').onclick = doLookup;
  document.getElementById('ma-lookup-input').onkeydown = (e) => { if (e.key === 'Enter') doLookup(); };

  document.getElementById('ma-pw-btn').onclick = async () => {
    const btn = document.getElementById('ma-pw-btn');
    const username = document.getElementById('ma-pw-username').value.trim();
    const newPassword = document.getElementById('ma-pw-new').value;
    const confirmPassword = document.getElementById('ma-pw-confirm').value;

    document.getElementById('ma-pw-result').style.display = 'none';
    if (!username) { showResult('ma-pw-result', false, 'Username wajib diisi'); return; }
    if (!newPassword || newPassword.length < 6) { showResult('ma-pw-result', false, 'Password minimal 6 karakter'); return; }
    if (newPassword !== confirmPassword) { showResult('ma-pw-result', false, 'Konfirmasi password tidak cocok'); return; }

    btn.textContent = 'Memproses...'; btn.disabled = true;
    const res = await api('/accounts/change-password', { method: 'PATCH', body: { username, newPassword } });
    btn.textContent = 'Ubah Password'; btn.disabled = false;

    if (!res || res.error) { showResult('ma-pw-result', false, res?.error || 'Gagal mengubah password'); return; }
    showResult('ma-pw-result', true, res.message || 'Password berhasil diubah');
    toast(`Password @${username} berhasil diubah`, 'success');
    document.getElementById('ma-pw-new').value = '';
    document.getElementById('ma-pw-confirm').value = '';
  };

  document.getElementById('ma-pin-btn').onclick = async () => {
    const btn = document.getElementById('ma-pin-btn');
    const username = document.getElementById('ma-pin-username').value.trim();
    const newPin = document.getElementById('ma-pin-new').value;
    const confirmPin = document.getElementById('ma-pin-confirm').value;

    document.getElementById('ma-pin-result').style.display = 'none';
    if (!username) { showResult('ma-pin-result', false, 'Username wajib diisi'); return; }
    if (!/^\d{4,6}$/.test(newPin)) { showResult('ma-pin-result', false, 'PIN harus 4–6 digit angka'); return; }
    if (newPin !== confirmPin) { showResult('ma-pin-result', false, 'Konfirmasi PIN tidak cocok'); return; }

    btn.textContent = 'Memproses...'; btn.disabled = true;
    const res = await api('/accounts/change-pin', { method: 'PATCH', body: { username, newPin } });
    btn.textContent = 'Ubah PIN'; btn.disabled = false;

    if (!res || res.error) { showResult('ma-pin-result', false, res?.error || 'Gagal mengubah PIN'); return; }
    showResult('ma-pin-result', true, res.message || 'PIN berhasil diubah');
    toast(`PIN @${username} berhasil diubah`, 'success');
    document.getElementById('ma-pin-new').value = '';
    document.getElementById('ma-pin-confirm').value = '';
  };

  document.getElementById('ma-em-btn').onclick = async () => {
    const btn = document.getElementById('ma-em-btn');
    const username = document.getElementById('ma-em-username').value.trim();
    const newEmail = document.getElementById('ma-em-new').value.trim();

    document.getElementById('ma-em-result').style.display = 'none';
    if (!username) { showResult('ma-em-result', false, 'Username wajib diisi'); return; }
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { showResult('ma-em-result', false, 'Format email tidak valid'); return; }

    btn.textContent = 'Memproses...'; btn.disabled = true;
    const res = await api('/accounts/change-email', { method: 'PATCH', body: { username, newEmail } });
    btn.textContent = 'Ubah Email'; btn.disabled = false;

    if (!res || res.error) { showResult('ma-em-result', false, res?.error || 'Gagal mengubah email'); return; }
    showResult('ma-em-result', true, `${res.message || 'Email berhasil diubah'} → ${res.newEmail}`);
    toast(`Email @${username} berhasil diubah`, 'success');
    document.getElementById('ma-em-current').value = res.newEmail || '';
    document.getElementById('ma-em-new').value = '';
  };
}

// ─── VOUCHERS ────────────────────────────────────────────────────────────────
const VOUCHER_STATUS = {0:'Inactive',1:'Active',2:'Cancelled',3:'Redeemed',4:'Expired',5:'Failed'};
const VOUCHER_BADGE = {0:'gray',1:'green',2:'red',3:'blue',4:'yellow',5:'red'};

async function renderVouchers(el, page = 1) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat...</div>';
  const data = await api(`/credits/vouchers?page=${page}&limit=20`);
  if (!data) return;
  const totalPages = Math.ceil(data.total / 20);
  el.innerHTML = `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Kode</th><th>Jumlah</th><th>Status</th><th>Diredeem Oleh</th><th>Batch Creator</th><th>Kadaluarsa</th></tr></thead>
      <tbody>
        ${data.vouchers.length === 0 ? `<tr><td colspan="6"><div class="empty">Tidak ada voucher</div></td></tr>` :
          data.vouchers.map(v => `
          <tr>
            <td><code style="font-size:12px;background:var(--bg);padding:2px 6px;border-radius:4px">${esc(v.code)}</code></td>
            <td><strong>${fmtFloat(v.amount)}</strong> ${esc(v.currency)}</td>
            <td><span class="badge ${VOUCHER_BADGE[v.status] || 'gray'}">${VOUCHER_STATUS[v.status] || v.status}</span></td>
            <td>${esc(v.redeemed_by_username || '-')}</td>
            <td>${esc(v.batch_creator || '-')}</td>
            <td>${v.expiry_date ? fmtDateTime(v.expiry_date) : 'Tidak ada'}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div class="pagination">
    <div class="page-info">Total: ${fmtNum(data.total)} voucher | Halaman ${page} dari ${totalPages}</div>
    ${page > 1 ? `<button class="btn btn-outline btn-sm" id="prev-btn">← Prev</button>` : ''}
    ${page < totalPages ? `<button class="btn btn-outline btn-sm" id="next-btn">Next →</button>` : ''}
  </div>`;
  if (document.getElementById('prev-btn')) document.getElementById('prev-btn').onclick = () => renderVouchers(el, page - 1);
  if (document.getElementById('next-btn')) document.getElementById('next-btn').onclick = () => renderVouchers(el, page + 1);
}

// ─── GIFTS ────────────────────────────────────────────────────────────────────
let giftsData = [];
let giftCategories = [];
let currentGiftId = null;
let currentGiftFilter = 'all';
let giftContentEl = null;

const CAT_NAMES = {
  1: 'Standar', 2: 'Premium / VIP', 3: 'Spesial', 4: 'Seasonal', 5: 'Event',
};

function catName(id) { return CAT_NAMES[id] || `Grup ${id}`; }

async function renderGifts(el) {
  giftContentEl = el;
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat gifts...</div>';
  const data = await api('/gifts');
  if (!data) return;
  giftsData = data.gifts || [];
  giftCategories = data.categories || [];
  drawGiftPage();
}

function drawGiftPage() {
  const el = giftContentEl;
  const groups = ['all', ...giftCategories.map(c => String(c.group_id))];
  const filtered = currentGiftFilter === 'all' ? giftsData : giftsData.filter(g => String(g.group_id) === currentGiftFilter);

  el.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
    <div>
      <h2 style="font-size:16px;font-weight:600">Virtual Gifts</h2>
      <p style="font-size:13px;color:var(--text-muted)">${fmtNum(giftsData.length)} gift terdaftar</p>
    </div>
    <button class="btn btn-primary" onclick="openGiftModal(null)">＋ Tambah Gift</button>
  </div>
  <div class="cat-tabs">
    <div class="cat-tab${currentGiftFilter === 'all' ? ' active' : ''}" onclick="filterGifts('all')">
      Semua <span style="opacity:0.7">(${giftsData.length})</span>
    </div>
    ${giftCategories.map(c => `
      <div class="cat-tab${currentGiftFilter === String(c.group_id) ? ' active' : ''}" onclick="filterGifts('${c.group_id}')">
        ${catName(c.group_id)} <span style="opacity:0.7">(${c.count})</span>
      </div>`).join('')}
    <button class="btn btn-outline btn-sm" onclick="openNewCatPrompt()" style="margin-left:auto">+ Kategori Baru</button>
  </div>
  <div class="gift-grid" id="gift-grid">
    ${filtered.length === 0 ? '<div class="empty" style="grid-column:1/-1">Belum ada gift di kategori ini</div>' :
      filtered.map(g => renderGiftCard(g)).join('')}
  </div>`;

  window.filterGifts = (gid) => { currentGiftFilter = gid; drawGiftPage(); };
  window.openNewCatPrompt = () => {
    const id = window.prompt('Masukkan nomor ID kategori baru (misal: 3, 4, 5):');
    if (!id || isNaN(parseInt(id))) return;
    openGiftModal(null, parseInt(id));
  };
}

function renderGiftCard(g) {
  const hasImg = !!g.location_64x64_png;
  const imgEl = hasImg
    ? `<img src="${esc(g.location_64x64_png)}?t=${Date.now()}" alt="${esc(g.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><span class="gift-emoji" style="display:none">${esc(g.hot_key || '🎁')}</span>`
    : `<span class="gift-emoji">${esc(g.hot_key || '🎁')}</span>`;

  return `
  <div class="gift-card" id="gcard-${g.id}">
    ${g.group_vip_only ? '<div class="vip-ribbon">VIP</div>' : ''}
    <div class="gift-img-wrap">${imgEl}</div>
    ${hasImg ? `<span class="has-img-badge">✓ ImageKit CDN</span>` : `<span class="no-img-badge">Belum ada gambar</span>`}
    <div class="gift-name">${esc(g.name)}</div>
    <div class="gift-price">IDR ${fmtFloat(g.price)}</div>
    <div style="margin-bottom:6px">
      <span class="badge ${g.status === 1 ? 'green' : 'gray'}" style="font-size:10px">${g.status === 1 ? 'Aktif' : 'Nonaktif'}</span>
      <span class="badge blue" style="font-size:10px">${catName(g.group_id)}</span>
    </div>
    <div class="gift-actions">
      <button class="btn btn-sm btn-outline" onclick="openGiftModal(${g.id})">✏️ Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deleteGift(${g.id},'${esc(g.name)}')">🗑️</button>
    </div>
  </div>`;
}

// ── Gift Modal ────────────────────────────────────────────────────────────────
let pendingUploadFile = null;

async function openGiftModal(giftId, defaultGroupId = 1) {
  currentGiftId = giftId;
  const modal = document.getElementById('gift-modal');
  const title = document.getElementById('gm-title');
  title.textContent = giftId ? 'Edit Gift' : 'Tambah Gift Baru';

  // Build category options from existing categories + add new ones
  const catOpts = [...new Set([...giftCategories.map(c => c.group_id), 1, 2, 3, 4, 5, defaultGroupId])]
    .sort((a, b) => a - b)
    .map(id => `<option value="${id}">${catName(id)} (Grup ${id})</option>`)
    .join('');
  document.getElementById('gm-group').innerHTML = catOpts;

  // Reset form
  resetGiftForm();

  if (giftId) {
    const g = giftsData.find(x => x.id === giftId);
    if (g) fillGiftForm(g);
  } else {
    document.getElementById('gm-group').value = defaultGroupId;
  }

  // Set up file input
  const fileInput = document.getElementById('gm-file');
  fileInput.value = '';
  pendingUploadFile = null;
  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) previewGiftFile(file);
  };

  // Set up drag & drop
  const zone = document.getElementById('gm-upload-zone');
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('drag-over'); };
  zone.ondragleave = () => zone.classList.remove('drag-over');
  zone.ondrop = (e) => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) previewGiftFile(file);
  };

  // Delete image btn
  document.getElementById('gm-del-img-btn').onclick = async () => {
    if (!currentGiftId) return;
    confirm('Hapus Gambar', `Yakin hapus gambar gift ini?`, async () => {
      const res = await api(`/gifts/${currentGiftId}/image`, { method: 'DELETE' });
      if (res?.success) {
        toast('Gambar berhasil dihapus', 'success');
        const g = giftsData.find(x => x.id === currentGiftId);
        if (g) { g.location_64x64_png = null; g.location_16x16_png = null; }
        updatePreview(null, document.getElementById('gm-hotkey').value || '🎁');
        document.getElementById('gm-current-img').style.display = 'none';
        drawGiftPage();
      }
    });
  };

  modal.classList.add('open');
}

window.closeGiftModal = () => {
  document.getElementById('gift-modal').classList.remove('open');
  currentGiftId = null;
  pendingUploadFile = null;
};

function resetGiftForm() {
  document.getElementById('gm-name').value = '';
  document.getElementById('gm-hotkey').value = '';
  document.getElementById('gm-price').value = '10';
  document.getElementById('gm-currency').value = 'IDR';
  document.getElementById('gm-sort').value = '';
  document.getElementById('gm-available').value = '';
  document.getElementById('gm-msg').value = '';
  document.getElementById('gm-vip').checked = false;
  document.getElementById('gm-status').value = '1';
  document.getElementById('gm-upload-progress').style.display = 'none';
  document.getElementById('gm-current-img').style.display = 'none';
  updatePreview(null, '🎁');
}

function fillGiftForm(g) {
  document.getElementById('gm-name').value = g.name || '';
  document.getElementById('gm-hotkey').value = g.hot_key || '';
  document.getElementById('gm-price').value = g.price ?? 10;
  document.getElementById('gm-currency').value = g.currency || 'IDR';
  document.getElementById('gm-group').value = g.group_id ?? 1;
  document.getElementById('gm-sort').value = g.sort_order || '';
  document.getElementById('gm-available').value = g.num_available ?? '';
  document.getElementById('gm-msg').value = g.gift_all_message || '';
  document.getElementById('gm-vip').checked = !!g.group_vip_only;
  document.getElementById('gm-status').value = String(g.status ?? 1);

  // Update hotkey preview when changed
  document.getElementById('gm-hotkey').oninput = () => {
    if (!g.location_64x64_png) updatePreview(null, document.getElementById('gm-hotkey').value || '🎁');
  };

  if (g.location_64x64_png) {
    updatePreview(g.location_64x64_png, g.hot_key || '🎁');
    document.getElementById('gm-current-img').style.display = 'block';
    document.getElementById('gm-img-link').href = g.location_64x64_png;
    document.getElementById('gm-img-link').textContent = g.location_64x64_png;
  } else {
    updatePreview(null, g.hot_key || '🎁');
  }
}

function updatePreview(imgUrl, emoji) {
  const wrap = document.getElementById('gm-preview');
  if (imgUrl) {
    wrap.innerHTML = `<img src="${esc(imgUrl)}" alt="preview" />`;
  } else {
    wrap.innerHTML = `<span class="preview-emoji">${emoji || '🎁'}</span>`;
  }
}

function previewGiftFile(file) {
  if (file.size > 5 * 1024 * 1024) { toast('File terlalu besar! Maksimal 5MB', 'error'); return; }
  pendingUploadFile = file;
  const reader = new FileReader();
  reader.onload = (e) => updatePreview(e.target.result, null);
  reader.readAsDataURL(file);
}

async function saveGift() {
  const btn = document.getElementById('gm-save-btn');
  const name = document.getElementById('gm-name').value.trim();
  if (!name) { toast('Nama gift wajib diisi!', 'error'); return; }

  const payload = {
    name,
    hotKey: document.getElementById('gm-hotkey').value,
    price: document.getElementById('gm-price').value,
    currency: document.getElementById('gm-currency').value,
    groupId: document.getElementById('gm-group').value,
    sortOrder: document.getElementById('gm-sort').value,
    groupVipOnly: document.getElementById('gm-vip').checked,
    giftAllMessage: document.getElementById('gm-msg').value,
    numAvailable: document.getElementById('gm-available').value,
    status: document.getElementById('gm-status').value,
  };

  btn.textContent = 'Menyimpan...'; btn.disabled = true;

  let res;
  if (currentGiftId) {
    res = await api(`/gifts/${currentGiftId}`, { method: 'PATCH', body: payload });
  } else {
    res = await api('/gifts', { method: 'POST', body: payload });
  }

  if (!res || res.error) {
    toast(res?.error || 'Gagal menyimpan gift', 'error');
    btn.textContent = 'Simpan Gift'; btn.disabled = false;
    return;
  }

  const savedGift = res.gift;
  const savedId = savedGift?.id || currentGiftId;

  // Upload image jika ada file dipilih
  if (pendingUploadFile && savedId) {
    await uploadGiftImage(savedId, pendingUploadFile);
  } else {
    toast(currentGiftId ? 'Gift berhasil diupdate!' : 'Gift berhasil ditambah!', 'success');
    btn.textContent = 'Simpan Gift'; btn.disabled = false;
    closeGiftModal();
    const data = await api('/gifts');
    if (data) { giftsData = data.gifts; giftCategories = data.categories; drawGiftPage(); }
  }

  btn.textContent = 'Simpan Gift'; btn.disabled = false;
}

async function uploadGiftImage(giftId, file) {
  const progress = document.getElementById('gm-upload-progress');
  const fill = document.getElementById('gm-progress-fill');
  const msg = document.getElementById('gm-upload-msg');
  const btn = document.getElementById('gm-save-btn');

  progress.style.display = 'block';
  fill.style.width = '30%';
  msg.className = 'upload-msg';
  msg.textContent = '⬆ Mengupload ke ImageKit CDN...';
  btn.disabled = true;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result.split(',')[1];
    const mimeType = file.type || 'image/png';
    fill.style.width = '60%';
    try {
      const res = await api(`/gifts/${giftId}/upload`, {
        method: 'POST',
        body: { base64Data: base64, mimeType },
      });
      fill.style.width = '100%';
      if (res?.success) {
        msg.className = 'upload-msg success';
        msg.textContent = '✓ Upload berhasil! Gambar aktif di CDN.';
        toast('Gift dan gambar berhasil disimpan!', 'success');
        await new Promise(r => setTimeout(r, 800));
        closeGiftModal();
        const data = await api('/gifts');
        if (data) { giftsData = data.gifts; giftCategories = data.categories; drawGiftPage(); }
      } else {
        msg.className = 'upload-msg error';
        msg.textContent = '✗ ' + (res?.error || 'Upload gagal');
        toast(res?.error || 'Upload gambar gagal', 'error');
      }
    } catch (err) {
      msg.className = 'upload-msg error';
      msg.textContent = '✗ Error: ' + err.message;
      toast('Upload error: ' + err.message, 'error');
    }
    btn.disabled = false;
  };
  reader.readAsDataURL(file);
}

window.openGiftModal = openGiftModal;
window.deleteGift = async (id, name) => {
  confirm('Hapus Gift', `Yakin hapus gift "${name}"? Tindakan ini tidak bisa dibatalkan!`, async () => {
    const res = await api(`/gifts/${id}`, { method: 'DELETE' });
    if (res?.success) {
      toast(`Gift "${name}" berhasil dihapus`, 'success');
      giftsData = giftsData.filter(g => g.id !== id);
      drawGiftPage();
    }
  });
};
window.saveGift = saveGift;

// ─── BADGES (auto-assigned to top leaderboard users) ─────────────────────────
const PERIOD_LABELS = { ALL_TIME: 'All-time', WEEKLY: 'Weekly', DAILY: 'Daily' };

let _badgeGamesCache = null;
let _badgesById = {};
async function loadBadgeGames() {
  if (_badgeGamesCache) return _badgeGamesCache;
  const data = await api('/badges/games/list');
  _badgeGamesCache = data?.games || [];
  return _badgeGamesCache;
}

function describeBadgeSlot(b) {
  if (!b.slot_kind) return '<span style="color:var(--text-muted)">— Tidak ditugaskan —</span>';
  const period = PERIOD_LABELS[b.slot_period] || b.slot_period || '';
  if (b.slot_kind === 'event_champion') {
    const eventName = b.slot_game_type ? esc(b.slot_game_type) : 'Event';
    const rankLabel = b.slot_rank ? ` · Top ${b.slot_rank}` : '';
    return `<span class="badge" style="background:#f59e0b;color:#fff">🏆 Event Champion${rankLabel} · ${eventName}</span>`;
  }
  if (b.slot_kind === 'gift_sender') {
    return `<span class="badge purple">Top ${b.slot_rank} Gift Sender${period ? ' · ' + period : ''}</span>`;
  }
  if (b.slot_kind === 'gift_received') {
    return `<span class="badge purple">Top ${b.slot_rank} Gift Received${period ? ' · ' + period : ''}</span>`;
  }
  if (b.slot_kind === 'top_level') {
    return `<span class="badge green">Top ${b.slot_rank} Level${period ? ' · ' + period : ''}</span>`;
  }
  return `<span class="badge blue">Top ${b.slot_rank} ${b.slot_game_type || '?'} Wins${period ? ' · ' + period : ''}</span>`;
}

async function renderBadges(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat...</div>';
  const [data, games] = await Promise.all([api('/badges'), loadBadgeGames()]);
  if (!data) return;
  const list = data.badges || [];
  _badgesById = {};
  for (const b of list) _badgesById[b.id] = b;

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Tentang Badges</div>
      <p style="color:var(--text-muted);margin:0 0 8px">
        Upload icon badge dan tugaskan ke salah satu slot leaderboard.
        Pemain yang menempati peringkat 1, 2, atau 3 di leaderboard tersebut
        akan otomatis menampilkan badge ini di mini profile mereka.
      </p>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Tambah Badge Baru</div>
      <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label class="label">Nama</label>
          <input class="input" id="badge-new-name" placeholder="cth: Top Pelakor Champion" />
        </div>
        <div>
          <label class="label">Deskripsi</label>
          <input class="input" id="badge-new-desc" placeholder="cth: Juara 1 Tebak Hati All-Time" />
        </div>
        <div>
          <label class="label">Slot Kind</label>
          <select class="input" id="badge-new-kind" onchange="onBadgeKindChange('new')">
            <option value="">— Tanpa slot (manual) —</option>
            <option value="event_champion">🏆 Event Champion (manual)</option>
            <option value="game_win">Top Pemenang Game</option>
            <option value="gift_sender">Top Gift Sender</option>
            <option value="gift_received">Top Gift Received</option>
            <option value="top_level">Top Level</option>
          </select>
        </div>
        <div id="badge-new-game-wrap" style="display:none">
          <label class="label">Game</label>
          <select class="input" id="badge-new-game">
            ${games.map(g => `<option value="${esc(g.value)}">${esc(g.label)}</option>`).join('')}
          </select>
        </div>
        <div id="badge-new-eventname-wrap" style="display:none">
          <label class="label">Nama Event</label>
          <input class="input" id="badge-new-eventname" placeholder="cth: Turnamen Pelakor April" />
        </div>
        <div id="badge-new-rank-wrap" style="display:none">
          <label class="label">Rank</label>
          <select class="input" id="badge-new-rank">
            <option value="1">🥇 Top 1</option>
            <option value="2">🥈 Top 2</option>
            <option value="3">🥉 Top 3</option>
          </select>
        </div>
        <div id="badge-new-period-wrap" style="display:none">
          <label class="label">Period</label>
          <select class="input" id="badge-new-period">
            <option value="ALL_TIME">All-time</option>
            <option value="WEEKLY">Weekly</option>
            <option value="DAILY">Daily</option>
          </select>
        </div>
      </div>
      <div style="margin-top:12px">
        <button class="btn btn-primary" onclick="createBadge()">Tambah Badge</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Daftar Badges (${list.length})</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th style="width:110px">Icon / Frame</th><th>Nama</th><th>Slot</th><th style="width:320px">Aksi</th></tr>
          </thead>
          <tbody>
            ${list.length === 0 ? `<tr><td colspan="4"><div class="empty">Belum ada badge</div></td></tr>` :
              list.map(b => `
                <tr>
                  <td style="vertical-align:top">
                    <div style="display:flex;gap:6px;align-items:center">
                      ${b.icon_url
                        ? `<img src="${esc(b.icon_url)}" alt="" style="width:48px;height:48px;object-fit:contain;border-radius:6px;background:#222"/>`
                        : `<div style="width:48px;height:48px;border-radius:6px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:22px">🏅</div>`}
                      ${b.avatar_frame_url
                        ? `<div style="position:relative;width:40px;height:40px;flex-shrink:0" title="Avatar Frame aktif">
                            <div style="width:40px;height:40px;border-radius:50%;background:#222"></div>
                            <img src="${esc(b.avatar_frame_url)}" alt="frame" style="position:absolute;inset:-4px;width:48px;height:48px;object-fit:contain;pointer-events:none"/>
                          </div>`
                        : ''}
                    </div>
                  </td>
                  <td>
                    <strong>${esc(b.name)}</strong>
                    ${b.description ? `<br><small style="color:var(--text-muted)">${esc(b.description)}</small>` : ''}
                    ${b.avatar_frame_url ? `<br><small style="color:#f59e0b">🖼 Frame aktif</small>` : ''}
                  </td>
                  <td>${describeBadgeSlot(b)}</td>
                  <td>
                    <div style="display:flex;flex-wrap:wrap;gap:4px">
                      <label class="btn btn-sm btn-outline" style="cursor:pointer">
                        Upload Icon
                        <input type="file" accept="image/*" style="display:none" onchange="uploadBadgeIcon(${b.id}, this)" />
                      </label>
                      <label class="btn btn-sm btn-outline" style="cursor:pointer" title="Upload frame PNG transparan untuk avatar">
                        🖼 Frame
                        <input type="file" accept="image/png,image/webp" style="display:none" onchange="uploadBadgeFrame(${b.id}, this)" />
                      </label>
                      ${b.avatar_frame_url ? `<button class="btn btn-sm btn-outline" onclick="clearBadgeFrame(${b.id})" title="Hapus frame avatar">✕ Frame</button>` : ''}
                      <button class="btn btn-sm btn-outline" onclick="editBadge(${b.id})">Edit</button>
                      <button class="btn btn-sm btn-outline" onclick="manageBadgeAwards(${b.id})">Berikan ke User</button>
                      <button class="btn btn-sm btn-danger" onclick="deleteBadge(${b.id})">Hapus</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function onBadgeKindChange(prefix) {
  const kind = document.getElementById(`badge-${prefix}-kind`).value;
  const showSlot       = !!kind;
  const isChampion     = kind === 'event_champion';
  const showGame       = kind === 'game_win';
  const showEventName  = isChampion;
  const showPeriod     = showSlot && !isChampion;

  const gameWrap = document.getElementById(`badge-${prefix}-game-wrap`);
  if (gameWrap) gameWrap.style.display = showGame ? '' : 'none';

  const evtWrap = document.getElementById(`badge-${prefix}-eventname-wrap`);
  if (evtWrap) evtWrap.style.display = showEventName ? '' : 'none';

  document.getElementById(`badge-${prefix}-rank-wrap`).style.display   = showSlot ? '' : 'none';
  document.getElementById(`badge-${prefix}-period-wrap`).style.display = showPeriod ? '' : 'none';
}

async function createBadge() {
  const name = document.getElementById('badge-new-name').value.trim();
  if (!name) return alert('Nama badge wajib diisi');
  const kind = document.getElementById('badge-new-kind').value || null;
  const isChampion = kind === 'event_champion';
  const body = {
    name,
    description: document.getElementById('badge-new-desc').value.trim(),
    slotKind:    kind,
    slotGameType: kind === 'game_win'
      ? document.getElementById('badge-new-game').value
      : isChampion
        ? (document.getElementById('badge-new-eventname')?.value?.trim() || null)
        : null,
    slotRank:    kind ? parseInt(document.getElementById('badge-new-rank').value)  : null,
    slotPeriod:  (kind && !isChampion) ? document.getElementById('badge-new-period').value : null,
  };
  const res = await api('/badges', { method: 'POST', body });
  if (res?.success) { renderBadges(document.getElementById('content')); }
}

async function deleteBadge(id) {
  const b = _badgesById[id];
  const name = b?.name || `#${id}`;
  // Use the project's custom confirm modal (signature: title, body, callback, danger)
  confirm(
    `Hapus badge "${name}"?`,
    'Tindakan ini tidak dapat dibatalkan. Semua user yang punya badge ini juga akan kehilangannya.',
    async () => {
      const res = await api(`/badges/${id}`, { method: 'DELETE' });
      if (res?.success) {
        toast(`Badge "${name}" dihapus`, 'success');
        renderBadges(document.getElementById('content'));
      } else {
        toast(res?.error || 'Gagal menghapus badge', 'error');
      }
    },
    true,
  );
}

function editBadge(id) {
  const b = _badgesById[id];
  if (!b) { toast('Badge tidak ditemukan, refresh halaman', 'error'); return; }
  openEditBadge(b);
}

function openEditBadge(b) {
  const games = _badgeGamesCache || [];
  const kind = b.slot_kind || '';
  const gameOpts = games.map(g => `<option value="${esc(g.value)}" ${g.value === b.slot_game_type ? 'selected' : ''}>${esc(g.label)}</option>`).join('');
  const rankOpts = [1,2,3].map(r => `<option value="${r}" ${b.slot_rank === r ? 'selected' : ''}>Top ${r}</option>`).join('');
  const periodOpts = ['ALL_TIME','WEEKLY','DAILY'].map(p => `<option value="${p}" ${b.slot_period === p ? 'selected' : ''}>${PERIOD_LABELS[p]}</option>`).join('');

  const html = `
    <div class="modal-overlay open" onclick="if(event.target===this)closeEditBadge()">
      <div class="modal" style="max-width:500px">
        <div class="modal-header"><h3>Edit Badge</h3><button class="modal-close" onclick="closeEditBadge()">×</button></div>
        <div class="modal-body">
          <label class="label">Nama</label>
          <input class="input" id="badge-edit-name" value="${esc(b.name)}" />
          <label class="label" style="margin-top:8px">Deskripsi</label>
          <input class="input" id="badge-edit-desc" value="${esc(b.description || '')}" />
          <label class="label" style="margin-top:8px">Slot Kind</label>
          <select class="input" id="badge-edit-kind" onchange="onBadgeKindChange('edit')">
            <option value="" ${!kind ? 'selected' : ''}>— Tanpa slot (manual) —</option>
            <option value="event_champion" ${kind==='event_champion' ? 'selected' : ''}>🏆 Event Champion (manual)</option>
            <option value="game_win" ${kind==='game_win' ? 'selected' : ''}>Top Pemenang Game</option>
            <option value="gift_sender" ${kind==='gift_sender' ? 'selected' : ''}>Top Gift Sender</option>
            <option value="gift_received" ${kind==='gift_received' ? 'selected' : ''}>Top Gift Received</option>
            <option value="top_level" ${kind==='top_level' ? 'selected' : ''}>Top Level</option>
          </select>
          <div id="badge-edit-game-wrap" style="display:${kind==='game_win'?'':'none'};margin-top:8px">
            <label class="label">Game</label>
            <select class="input" id="badge-edit-game">${gameOpts}</select>
          </div>
          <div id="badge-edit-eventname-wrap" style="display:${kind==='event_champion'?'':'none'};margin-top:8px">
            <label class="label">Nama Event</label>
            <input class="input" id="badge-edit-eventname" value="${esc(b.slot_game_type || '')}" placeholder="cth: Turnamen Pelakor April" />
          </div>
          <div id="badge-edit-rank-wrap" style="display:${kind?'':'none'};margin-top:8px">
            <label class="label">Rank</label>
            <select class="input" id="badge-edit-rank">${rankOpts}</select>
          </div>
          <div id="badge-edit-period-wrap" style="display:${(kind && kind!=='event_champion')?'':'none'};margin-top:8px">
            <label class="label">Period</label>
            <select class="input" id="badge-edit-period">${periodOpts}</select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="closeEditBadge()">Batal</button>
          <button class="btn btn-primary" onclick="saveEditBadge(${b.id})">Simpan</button>
        </div>
      </div>
    </div>`;
  const wrap = document.createElement('div');
  wrap.id = '__badge-edit-modal';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
}

function closeEditBadge() {
  const m = document.getElementById('__badge-edit-modal');
  if (m) m.remove();
}

async function saveEditBadge(id) {
  const kind = document.getElementById('badge-edit-kind').value || '';
  const isChampion = kind === 'event_champion';
  const body = {
    name: document.getElementById('badge-edit-name').value.trim(),
    description: document.getElementById('badge-edit-desc').value.trim(),
    slotKind: kind || '',
    slotGameType: kind === 'game_win'
      ? document.getElementById('badge-edit-game').value
      : isChampion
        ? (document.getElementById('badge-edit-eventname')?.value?.trim() || null)
        : null,
    slotRank:    kind ? parseInt(document.getElementById('badge-edit-rank').value)  : null,
    slotPeriod:  (kind && !isChampion) ? document.getElementById('badge-edit-period').value : null,
  };
  const res = await api(`/badges/${id}`, { method: 'PATCH', body });
  if (res?.success) {
    toast('Badge diperbarui', 'success');
    closeEditBadge();
    renderBadges(document.getElementById('content'));
  } else {
    toast(res?.error || 'Gagal menyimpan perubahan', 'error');
  }
}

async function uploadBadgeIcon(id, input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('Gambar terlalu besar (max 5MB)'); return; }
  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = String(reader.result || '');
    const base64Data = dataUrl.split(',')[1];
    const mimeType = file.type || 'image/png';
    const res = await api(`/badges/${id}/upload`, {
      method: 'POST', body: { base64Data, mimeType },
    });
    if (res?.success) renderBadges(document.getElementById('content'));
  };
  reader.readAsDataURL(file);
}

async function uploadBadgeFrame(id, input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('Frame terlalu besar (max 5MB)'); return; }
  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = String(reader.result || '');
    const base64Data = dataUrl.split(',')[1];
    const mimeType = file.type || 'image/png';
    toast('Mengupload frame...', 'info');
    const res = await api(`/badges/${id}/upload-frame`, {
      method: 'POST', body: { base64Data, mimeType },
    });
    if (res?.success) {
      toast('Frame avatar berhasil diupload', 'success');
      renderBadges(document.getElementById('content'));
    } else {
      toast(res?.error || 'Upload frame gagal', 'error');
    }
  };
  reader.readAsDataURL(file);
}

async function clearBadgeFrame(id) {
  const res = await api(`/badges/${id}`, { method: 'PATCH', body: { avatarFrameUrl: null } });
  if (res?.success) {
    toast('Frame avatar dihapus', 'success');
    renderBadges(document.getElementById('content'));
  } else {
    toast(res?.error || 'Gagal menghapus frame', 'error');
  }
}

// ─── Manual badge awards (give badge to specific username) ───────────────────
async function manageBadgeAwards(id) {
  const b = _badgesById[id];
  if (!b) { toast('Badge tidak ditemukan, refresh halaman', 'error'); return; }

  closeBadgeAwards();
  const wrap = document.createElement('div');
  wrap.id = '__badge-awards-modal';
  wrap.innerHTML = `
    <div class="modal-overlay open" onclick="if(event.target===this)closeBadgeAwards()">
      <div class="modal" style="max-width:560px">
        <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <h3 style="margin:0">Berikan Badge: ${esc(b.name)}</h3>
          <button class="modal-close" onclick="closeBadgeAwards()" style="background:none;border:none;font-size:22px;cursor:pointer">×</button>
        </div>
        <div class="modal-body" style="margin-top:12px">
          <p style="color:var(--text-muted);margin:0 0 12px">
            Masukkan username untuk memberikan badge ini secara manual.
            Cocok untuk pemenang event Top 1/2/3 yang ditentukan admin.
          </p>
          <div style="display:flex;gap:8px">
            <input class="input" id="badge-award-user-${id}" placeholder="username" style="flex:1" />
            <button class="btn btn-primary" onclick="awardBadgeToUser(${id})">Berikan</button>
          </div>
          <div style="margin-top:16px">
            <div class="card-title" style="margin-bottom:8px">User yang memiliki badge ini</div>
            <div id="badge-awards-list-${id}"><div class="loading"><div class="spinner"></div>Memuat...</div></div>
          </div>
        </div>
        <div class="modal-footer" style="margin-top:12px;display:flex;justify-content:flex-end">
          <button class="btn btn-outline" onclick="closeBadgeAwards()">Tutup</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById(`badge-award-user-${id}`)?.focus();
  await refreshBadgeAwardsList(id);
}

function closeBadgeAwards() {
  const m = document.getElementById('__badge-awards-modal');
  if (m) m.remove();
}

async function refreshBadgeAwardsList(id) {
  const el = document.getElementById(`badge-awards-list-${id}`);
  if (!el) return;
  const data = await api(`/badges/${id}/awards`);
  const awards = data?.awards || [];
  if (!awards.length) {
    el.innerHTML = `<div class="empty" style="padding:16px">Belum ada user yang menerima badge ini</div>`;
    return;
  }
  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Username</th><th style="width:160px">Diberikan</th><th style="width:90px">Aksi</th></tr>
        </thead>
        <tbody>
          ${awards.map(a => `
            <tr>
              <td><strong>${esc(a.username)}</strong></td>
              <td style="color:var(--text-muted);font-size:12px">${a.created_at ? esc(new Date(a.created_at).toLocaleString()) : '-'}</td>
              <td><button class="btn btn-sm btn-danger" onclick="revokeBadgeAward(${id}, '${esc(a.username).replace(/'/g, "\\'")}')">Cabut</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function awardBadgeToUser(id) {
  const inp = document.getElementById(`badge-award-user-${id}`);
  const username = (inp?.value || '').trim();
  if (!username) { toast('Username wajib diisi', 'error'); return; }
  const res = await api(`/badges/${id}/award`, { method: 'POST', body: { username } });
  if (res?.success) {
    toast(`Badge diberikan ke ${res.username}`, 'success');
    if (inp) inp.value = '';
    await refreshBadgeAwardsList(id);
  } else {
    toast(res?.error || 'Gagal memberikan badge', 'error');
  }
}

async function revokeBadgeAward(id, username) {
  confirm(
    `Cabut badge dari ${username}?`,
    'User akan kehilangan badge ini di mini profile mereka.',
    async () => {
      const res = await api(`/badges/${id}/award/${encodeURIComponent(username)}`, { method: 'DELETE' });
      if (res?.success) {
        toast(`Badge dicabut dari ${username}`, 'success');
        await refreshBadgeAwardsList(id);
      } else {
        toast(res?.error || 'Gagal mencabut badge', 'error');
      }
    },
    true,
  );
}

// ─── STORE (Hadiah + Stiker tabs) ─────────────────────────────────────────────
let currentStoreTab = 'hadiah';
let storeContentEl = null;
let stickerPacksData = [];
let currentStickerPackId = null;
let currentStickerPackEditId = null;
let currentStickerItemId = null;
let currentStickerItemPackId = null;
let stickerPackContentEl = null;
let pendingStickerFile = null;

async function renderStore(el) {
  storeContentEl = el;
  el.innerHTML = `
  <div class="store-tab-bar">
    <button class="store-tab${currentStoreTab === 'hadiah' ? ' active' : ''}" id="store-tab-hadiah">🎁 Hadiah</button>
    <button class="store-tab${currentStoreTab === 'stiker' ? ' active' : ''}" id="store-tab-stiker">😊 Stiker</button>
  </div>
  <div id="store-tab-content"></div>`;

  document.getElementById('store-tab-hadiah').onclick = async () => {
    if (currentStoreTab === 'hadiah') return;
    currentStoreTab = 'hadiah';
    document.getElementById('store-tab-hadiah').classList.add('active');
    document.getElementById('store-tab-stiker').classList.remove('active');
    const tc = document.getElementById('store-tab-content');
    await renderGifts(tc);
  };
  document.getElementById('store-tab-stiker').onclick = async () => {
    if (currentStoreTab === 'stiker') return;
    currentStoreTab = 'stiker';
    document.getElementById('store-tab-stiker').classList.add('active');
    document.getElementById('store-tab-hadiah').classList.remove('active');
    const tc = document.getElementById('store-tab-content');
    currentStickerPackId = null;
    await renderStickerPacksTab(tc);
  };

  const tc = document.getElementById('store-tab-content');
  if (currentStoreTab === 'hadiah') {
    await renderGifts(tc);
  } else {
    await renderStickerPacksTab(tc);
  }
}

async function renderStickerPacksTab(el) {
  stickerPackContentEl = el;
  if (currentStickerPackId !== null) {
    await renderStickerDetail(el, currentStickerPackId);
  } else {
    await renderStickerPacksList(el);
  }
}

async function renderStickerPacksList(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat stiker pack...</div>';
  const data = await api('/stickers/packs');
  if (!data) return;
  stickerPacksData = data.packs || [];

  const typeStats = { emotikon: stickerPacksData.filter(p => p.type === 0).length, stiker: stickerPacksData.filter(p => p.type === 1).length };

  el.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
    <div>
      <h2 style="font-size:16px;font-weight:600">Stiker Pack</h2>
      <p style="font-size:13px;color:var(--text-muted)">${fmtNum(stickerPacksData.length)} pack · ${typeStats.stiker} stiker · ${typeStats.emotikon} emotikon</p>
    </div>
    <button class="btn btn-primary" onclick="openStickerPackModal(null)">＋ Tambah Pack</button>
  </div>
  ${stickerPacksData.length === 0
    ? '<div class="empty">Belum ada stiker pack. Tambahkan pack pertama!</div>'
    : `<div class="gift-grid">${stickerPacksData.map(p => renderStickerPackCard(p)).join('')}</div>`}`;
}

function renderStickerPackCard(p) {
  const typeBadge = p.type === 0 ? 'blue' : 'purple';
  const typeLabel = p.type === 0 ? 'Emotikon' : 'Stiker';
  const iconEmoji = p.type === 0 ? '😊' : '🎭';
  return `
  <div class="gift-card" id="spcard-${p.id}">
    <div class="gift-img-wrap">
      <span class="gift-emoji">${iconEmoji}</span>
    </div>
    <div class="gift-name">${esc(p.name)}</div>
    <div style="margin-bottom:6px">
      <span class="badge ${typeBadge}" style="font-size:10px">${typeLabel}</span>
      <span class="badge ${p.status === 1 ? 'green' : 'gray'}" style="font-size:10px">${p.status === 1 ? 'Aktif' : 'Nonaktif'}</span>
    </div>
    <div class="gift-price">${p.sticker_count || 0} stiker · ${p.price > 0 ? fmtFloat(p.price) + ' MIG' : 'Gratis'}</div>
    <div class="gift-actions">
      <button class="btn btn-sm btn-outline" onclick="viewStickerPack(${p.id})" title="Kelola Stiker">📂 Kelola</button>
      <button class="btn btn-sm btn-outline" onclick="openStickerPackModal(${p.id})" title="Edit Pack">✏️</button>
      <button class="btn btn-sm btn-danger" onclick="deleteStickerPack(${p.id},'${esc(p.name)}')" title="Hapus">🗑️</button>
    </div>
  </div>`;
}

async function viewStickerPack(packId) {
  currentStickerPackId = packId;
  await renderStickerDetail(stickerPackContentEl, packId);
}

async function renderStickerDetail(el, packId) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat stiker...</div>';
  const data = await api(`/stickers/packs/${packId}`);
  if (!data || data.error) { el.innerHTML = `<div class="empty">Gagal memuat pack: ${data?.error || 'error'}</div>`; return; }
  const pack = data.pack;
  const stickers = data.stickers || [];

  el.innerHTML = `
  <div class="sticker-breadcrumb">
    <span class="bc-link" onclick="goBackToStickerPacks()">← Semua Pack</span>
    <span style="color:var(--text-muted)">/</span>
    <strong>${esc(pack.name)}</strong>
    <span class="badge ${pack.type === 0 ? 'blue' : 'purple'}" style="font-size:10px">${pack.type === 0 ? 'Emotikon' : 'Stiker'}</span>
    <span class="badge ${pack.status === 1 ? 'green' : 'gray'}" style="font-size:10px">${pack.status === 1 ? 'Aktif' : 'Nonaktif'}</span>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
    <div>
      <h2 style="font-size:16px;font-weight:600">${esc(pack.name)}</h2>
      <p style="font-size:13px;color:var(--text-muted)">${stickers.length} stiker${pack.description ? ' · ' + esc(pack.description) : ''} · ${pack.price > 0 ? fmtFloat(pack.price) + ' MIG' : 'Gratis'}</p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-outline" onclick="openStickerPackModal(${pack.id})">✏️ Edit Pack</button>
      <button class="btn btn-primary" onclick="openStickerItemModal(null,${pack.id})">＋ Tambah Stiker</button>
    </div>
  </div>
  ${stickers.length === 0
    ? '<div class="empty">Belum ada stiker dalam pack ini. Klik "Tambah Stiker" untuk mulai!</div>'
    : `<div class="sticker-grid">${stickers.map(s => renderStickerItemCard(s)).join('')}</div>`}`;
}

function renderStickerItemCard(s) {
  const hasImg = !!s.location_png;
  const imgEl = hasImg
    ? `<img src="${esc(s.location_png)}?t=${Date.now()}" alt="${esc(s.alias)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><span style="display:none;font-size:26px">😊</span>`
    : `<span style="font-size:26px">😊</span>`;
  return `
  <div class="sticker-card" id="scard-${s.id}">
    <div class="sticker-img-wrap">${imgEl}</div>
    ${hasImg ? `<span class="has-sticker-img">✓ CDN</span>` : `<span class="no-sticker-img">Belum ada gambar</span>`}
    <div class="sticker-alias">${esc(s.alias)}</div>
    <div class="sticker-actions">
      <button class="btn btn-sm btn-outline" onclick="openStickerItemModal(${s.id},${s.emoticon_pack_id})" title="Edit">✏️</button>
      <button class="btn btn-sm btn-danger" onclick="deleteStickerItem(${s.id},'${esc(s.alias)}')" title="Hapus">🗑️</button>
    </div>
  </div>`;
}

function goBackToStickerPacks() {
  currentStickerPackId = null;
  renderStickerPacksList(stickerPackContentEl);
}

// ── Sticker Pack Modal ──────────────────────────────────────────────────────
function openStickerPackModal(packId) {
  currentStickerPackEditId = packId;
  document.getElementById('spm-title').textContent = packId ? 'Edit Pack Stiker' : 'Tambah Pack Stiker';
  resetStickerPackForm();
  if (packId) {
    const p = stickerPacksData.find(x => x.id === packId);
    if (p) fillStickerPackForm(p);
  }
  document.getElementById('sticker-pack-modal').classList.add('open');
}

window.closeStickerPackModal = () => {
  document.getElementById('sticker-pack-modal').classList.remove('open');
  currentStickerPackEditId = null;
};

function resetStickerPackForm() {
  document.getElementById('spm-name').value = '';
  document.getElementById('spm-type').value = '1';
  document.getElementById('spm-desc').value = '';
  document.getElementById('spm-price').value = '0';
  document.getElementById('spm-sort').value = '';
  document.getElementById('spm-status').value = '1';
  document.getElementById('spm-forsale').checked = true;
}

function fillStickerPackForm(p) {
  document.getElementById('spm-name').value = p.name || '';
  document.getElementById('spm-type').value = String(p.type ?? 1);
  document.getElementById('spm-desc').value = p.description || '';
  document.getElementById('spm-price').value = p.price ?? 0;
  document.getElementById('spm-sort').value = p.sort_order || '';
  document.getElementById('spm-status').value = String(p.status ?? 1);
  document.getElementById('spm-forsale').checked = !!p.for_sale;
}

async function saveStickerPack() {
  const btn = document.getElementById('spm-save-btn');
  const name = document.getElementById('spm-name').value.trim();
  if (!name) { toast('Nama pack wajib diisi!', 'error'); return; }

  const payload = {
    name,
    type: parseInt(document.getElementById('spm-type').value),
    description: document.getElementById('spm-desc').value.trim() || null,
    price: parseFloat(document.getElementById('spm-price').value) || 0,
    sortOrder: document.getElementById('spm-sort').value || null,
    status: parseInt(document.getElementById('spm-status').value),
    forSale: document.getElementById('spm-forsale').checked,
  };

  btn.textContent = 'Menyimpan...'; btn.disabled = true;

  let res;
  if (currentStickerPackEditId) {
    res = await api(`/stickers/packs/${currentStickerPackEditId}`, { method: 'PATCH', body: payload });
  } else {
    res = await api('/stickers/packs', { method: 'POST', body: payload });
  }

  btn.textContent = 'Simpan Pack'; btn.disabled = false;

  if (!res || res.error) { toast(res?.error || 'Gagal menyimpan pack', 'error'); return; }
  toast(currentStickerPackEditId ? 'Pack berhasil diupdate!' : 'Pack berhasil ditambah!', 'success');
  closeStickerPackModal();

  if (currentStickerPackId !== null) {
    await renderStickerDetail(stickerPackContentEl, currentStickerPackId);
  } else {
    await renderStickerPacksList(stickerPackContentEl);
  }
}

window.deleteStickerPack = async (id, name) => {
  confirm('Hapus Pack', `Yakin hapus pack "${name}"? Semua stiker dalam pack akan ikut terhapus!`, async () => {
    const res = await api(`/stickers/packs/${id}`, { method: 'DELETE' });
    if (res?.success) {
      toast(`Pack "${name}" berhasil dihapus`, 'success');
      if (currentStickerPackId === id) {
        currentStickerPackId = null;
        await renderStickerPacksList(stickerPackContentEl);
      } else {
        stickerPacksData = stickerPacksData.filter(p => p.id !== id);
        if (stickerPackContentEl) await renderStickerPacksList(stickerPackContentEl);
      }
    } else {
      toast(res?.error || 'Gagal menghapus pack', 'error');
    }
  });
};

window.openStickerPackModal = openStickerPackModal;
window.viewStickerPack = viewStickerPack;
window.goBackToStickerPacks = goBackToStickerPacks;
window.saveStickerPack = saveStickerPack;

// ── Sticker Item Modal ──────────────────────────────────────────────────────
function openStickerItemModal(stickerId, packId) {
  currentStickerItemId = stickerId;
  currentStickerItemPackId = packId;
  pendingStickerFile = null;
  document.getElementById('sim-title').textContent = stickerId ? 'Edit Stiker' : 'Tambah Stiker';
  resetStickerItemForm();

  if (stickerId) {
    api(`/stickers/packs/${packId}`).then(data => {
      if (data?.stickers) {
        const s = data.stickers.find(x => x.id === stickerId);
        if (s) fillStickerItemForm(s);
      }
    });
  }

  const fileInput = document.getElementById('sim-file');
  fileInput.value = '';
  fileInput.onchange = (e) => { const f = e.target.files[0]; if (f) previewStickerFile(f); };

  const zone = document.getElementById('sim-upload-zone');
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('drag-over'); };
  zone.ondragleave = () => zone.classList.remove('drag-over');
  zone.ondrop = (e) => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0]; if (f) previewStickerFile(f);
  };

  document.getElementById('sim-del-img-btn').onclick = async () => {
    if (!currentStickerItemId) return;
    confirm('Hapus Gambar', 'Yakin hapus gambar stiker ini?', async () => {
      const res = await api(`/stickers/emoticons/${currentStickerItemId}`, { method: 'PATCH', body: { clearImage: true } });
      if (res?.success) {
        toast('Gambar stiker dihapus', 'success');
        updateStickerPreview(null);
        document.getElementById('sim-current-img').style.display = 'none';
      }
    });
  };

  document.getElementById('sticker-item-modal').classList.add('open');
}

window.closeStickerItemModal = () => {
  document.getElementById('sticker-item-modal').classList.remove('open');
  currentStickerItemId = null;
  pendingStickerFile = null;
};

function resetStickerItemForm() {
  document.getElementById('sim-alias').value = '';
  document.getElementById('sim-type').value = '0';
  document.getElementById('sim-upload-progress').style.display = 'none';
  document.getElementById('sim-current-img').style.display = 'none';
  updateStickerPreview(null);
}

function fillStickerItemForm(s) {
  document.getElementById('sim-alias').value = s.alias || '';
  document.getElementById('sim-type').value = String(s.type ?? 0);
  if (s.location_png) {
    updateStickerPreview(s.location_png);
    document.getElementById('sim-current-img').style.display = 'block';
    document.getElementById('sim-img-link').href = s.location_png;
    document.getElementById('sim-img-link').textContent = s.location_png;
  } else {
    updateStickerPreview(null);
  }
}

function updateStickerPreview(imgUrl) {
  const wrap = document.getElementById('sim-preview');
  if (!wrap) return;
  wrap.innerHTML = imgUrl
    ? `<img src="${esc(imgUrl)}" alt="preview" />`
    : `<span class="preview-emoji">😊</span>`;
}

function previewStickerFile(file) {
  if (file.size > 5 * 1024 * 1024) { toast('File terlalu besar! Maksimal 5MB', 'error'); return; }
  pendingStickerFile = file;
  const reader = new FileReader();
  reader.onload = (e) => updateStickerPreview(e.target.result);
  reader.readAsDataURL(file);
}

async function saveStickerItem() {
  const btn = document.getElementById('sim-save-btn');
  const alias = document.getElementById('sim-alias').value.trim();
  if (!alias) { toast('Alias stiker wajib diisi!', 'error'); return; }

  const payload = {
    alias,
    type: parseInt(document.getElementById('sim-type').value),
    emoticonPackId: currentStickerItemPackId,
  };

  btn.textContent = 'Menyimpan...'; btn.disabled = true;

  let res;
  let savedId = currentStickerItemId;

  if (currentStickerItemId) {
    res = await api(`/stickers/emoticons/${currentStickerItemId}`, { method: 'PATCH', body: payload });
  } else {
    res = await api('/stickers/emoticons', { method: 'POST', body: payload });
    savedId = res?.sticker?.id;
  }

  if (!res || res.error) {
    toast(res?.error || 'Gagal menyimpan stiker', 'error');
    btn.textContent = 'Simpan Stiker'; btn.disabled = false;
    return;
  }

  if (pendingStickerFile && savedId) {
    await uploadStickerImage(savedId, pendingStickerFile);
  } else {
    toast(currentStickerItemId ? 'Stiker berhasil diupdate!' : 'Stiker berhasil ditambah!', 'success');
    btn.textContent = 'Simpan Stiker'; btn.disabled = false;
    closeStickerItemModal();
    if (currentStickerPackId !== null) {
      await renderStickerDetail(stickerPackContentEl, currentStickerPackId);
    }
  }

  btn.textContent = 'Simpan Stiker'; btn.disabled = false;
}

async function uploadStickerImage(stickerId, file) {
  const progress = document.getElementById('sim-upload-progress');
  const fill = document.getElementById('sim-progress-fill');
  const msg = document.getElementById('sim-upload-msg');
  const btn = document.getElementById('sim-save-btn');

  progress.style.display = 'block';
  fill.style.width = '30%';
  msg.className = 'upload-msg';
  msg.textContent = '⬆ Mengupload ke ImageKit CDN...';
  btn.disabled = true;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result.split(',')[1];
    const mimeType = file.type || 'image/png';
    fill.style.width = '60%';
    try {
      const res = await api(`/stickers/emoticons/${stickerId}/upload`, {
        method: 'POST',
        body: { base64Data: base64, mimeType },
      });
      fill.style.width = '100%';
      if (res?.success) {
        msg.className = 'upload-msg success';
        msg.textContent = '✓ Upload berhasil! Gambar aktif di CDN.';
        toast('Stiker dan gambar berhasil disimpan!', 'success');
        await new Promise(r => setTimeout(r, 800));
        closeStickerItemModal();
        if (currentStickerPackId !== null) {
          await renderStickerDetail(stickerPackContentEl, currentStickerPackId);
        }
      } else {
        msg.className = 'upload-msg error';
        msg.textContent = '✗ ' + (res?.error || 'Upload gagal');
        toast(res?.error || 'Upload gambar gagal', 'error');
      }
    } catch (err) {
      msg.className = 'upload-msg error';
      msg.textContent = '✗ Error: ' + err.message;
      toast('Upload error: ' + err.message, 'error');
    }
    btn.disabled = false;
  };
  reader.readAsDataURL(file);
}

window.openStickerItemModal = openStickerItemModal;
window.deleteStickerItem = async (id, alias) => {
  confirm('Hapus Stiker', `Yakin hapus stiker "${alias}"? Tindakan ini tidak bisa dibatalkan!`, async () => {
    const res = await api(`/stickers/emoticons/${id}`, { method: 'DELETE' });
    if (res?.success) {
      toast(`Stiker "${alias}" berhasil dihapus`, 'success');
      if (currentStickerPackId !== null) {
        await renderStickerDetail(stickerPackContentEl, currentStickerPackId);
      }
    } else {
      toast(res?.error || 'Gagal menghapus stiker', 'error');
    }
  });
};
window.saveStickerItem = saveStickerItem;

// ─── MERCHANTS ────────────────────────────────────────────────────────────────
const MERCHANT_TYPE = {1:'Merchant',2:'Mentor',3:'HeadMentor'};

async function renderMerchants(el, page = 1, search = '') {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat...</div>';
  const data = await api(`/merchants?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
  if (!data) return;
  const totalPages = Math.ceil(data.total / 20);
  el.innerHTML = `
  <div class="search-row">
    <input class="input" id="merchant-search" placeholder="Cari merchant..." value="${esc(search)}" />
    <button class="btn btn-primary" id="merchant-search-btn">Cari</button>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Username</th><th>Display Name</th><th>Tipe</th><th>Poin</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>
      <tbody>
        ${data.merchants.length === 0 ? `<tr><td colspan="7"><div class="empty">Tidak ada merchant</div></td></tr>` :
          data.merchants.map(m => `
          <tr>
            <td><strong style="color:${esc(m.username_color || '#000')}">${esc(m.username)}</strong></td>
            <td>${esc(m.display_name)}<br><small style="color:var(--text-muted)">${esc(m.category || '-')}</small></td>
            <td><span class="badge ${m.merchant_type >= 3 ? 'purple' : m.merchant_type === 2 ? 'red' : 'blue'}">${MERCHANT_TYPE[m.merchant_type] || m.merchant_type}</span></td>
            <td>${fmtNum(m.total_points)}</td>
            <td><span class="badge ${m.status === 1 ? 'green' : 'red'}">${m.status === 1 ? 'Aktif' : 'Nonaktif'}</span></td>
            <td>${fmtDateTime(m.created_at)}</td>
            <td><button class="btn btn-sm btn-outline" onclick="toggleMerchant('${m.id}',${m.status === 1 ? 0 : 1},'${esc(m.username)}')">${m.status === 1 ? 'Nonaktifkan' : 'Aktifkan'}</button></td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div class="pagination">
    <div class="page-info">Total: ${fmtNum(data.total)} | Halaman ${page} dari ${totalPages}</div>
    ${page > 1 ? `<button class="btn btn-outline btn-sm" id="prev-btn">← Prev</button>` : ''}
    ${page < totalPages ? `<button class="btn btn-outline btn-sm" id="next-btn">Next →</button>` : ''}
  </div>`;

  document.getElementById('merchant-search-btn').onclick = () => renderMerchants(el, 1, document.getElementById('merchant-search').value);
  document.getElementById('merchant-search').onkeydown = (e) => { if (e.key === 'Enter') renderMerchants(el, 1, document.getElementById('merchant-search').value); };
  if (document.getElementById('prev-btn')) document.getElementById('prev-btn').onclick = () => renderMerchants(el, page - 1, search);
  if (document.getElementById('next-btn')) document.getElementById('next-btn').onclick = () => renderMerchants(el, page + 1, search);

  window.toggleMerchant = async (id, status, username) => {
    confirm(`${status === 1 ? 'Aktifkan' : 'Nonaktifkan'} Merchant`, `Yakin ubah status merchant @${username}?`, async () => {
      await api(`/merchants/${id}/status`, { method: 'PATCH', body: { status } });
      renderMerchants(el, page, search);
    }, status !== 1);
  };
}

// ─── ADD MERCHANT ─────────────────────────────────────────────────────────────
function renderAddMerchant(el) {
  el.innerHTML = `
  <div class="card" style="max-width:600px">
    <div class="card-title">Form Tambah Merchant</div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="field-group">
        <label>Username <span style="color:var(--danger)">*</span></label>
        <input class="input" id="am-username" placeholder="username merchant..." />
      </div>
      <div class="field-group">
        <label>Display Name <span style="color:var(--danger)">*</span></label>
        <input class="input" id="am-display-name" placeholder="nama tampilan..." />
      </div>
      <div class="field-group">
        <label>Level Merchant <span style="color:var(--danger)">*</span></label>
        <select class="input" id="am-type">
          <option value="1">Level 1 - Merchant</option>
          <option value="2">Level 2 - Mentor</option>
          <option value="3">Level 3 - HeadMentor</option>
        </select>
      </div>
      <div class="field-group">
        <label>Deskripsi</label>
        <input class="input" id="am-description" placeholder="deskripsi singkat..." />
      </div>
      <div class="field-group">
        <label>Kategori</label>
        <input class="input" id="am-category" placeholder="kategori bisnis..." />
      </div>
      <div class="field-group">
        <label>Website URL</label>
        <input class="input" id="am-website" placeholder="https://..." />
      </div>
      <div class="field-group">
        <label>Warna Username</label>
        <div style="display:flex;gap:10px;align-items:center">
          <input type="color" id="am-color" value="#990099" style="width:48px;height:36px;border:1px solid var(--border);border-radius:8px;padding:2px;cursor:pointer" />
          <input class="input" id="am-color-text" value="#990099" placeholder="#990099" style="flex:1" />
        </div>
      </div>
      <div class="field-group">
        <label>Mentor (username)</label>
        <input class="input" id="am-mentor" placeholder="username mentor (opsional)..." />
        <span style="font-size:11px;color:var(--text-muted)">Diisi jika merchant memiliki mentor</span>
      </div>
      <div class="field-group">
        <label>Referrer (username)</label>
        <input class="input" id="am-referrer" placeholder="username referrer (opsional)..." />
      </div>
      <div id="am-error" style="color:var(--danger);font-size:13px;display:none"></div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" id="am-save-btn">Simpan Merchant</button>
        <button class="btn btn-outline" onclick="state.page='merchants';render()">Batal</button>
      </div>
    </div>
  </div>`;

  const colorPicker = document.getElementById('am-color');
  const colorText = document.getElementById('am-color-text');
  const typeSelect = document.getElementById('am-type');
  const levelDefaultColors = { 1: '#990099', 2: '#FF0000', 3: '#FF69B4' };
  colorPicker.oninput = () => { colorText.value = colorPicker.value; };
  colorText.oninput = () => {
    if (/^#[0-9a-fA-F]{6}$/.test(colorText.value)) colorPicker.value = colorText.value;
  };
  typeSelect.onchange = () => {
    const nextColor = levelDefaultColors[parseInt(typeSelect.value)] || '#990099';
    colorPicker.value = nextColor;
    colorText.value = nextColor;
  };

  document.getElementById('am-save-btn').onclick = async () => {
    const errEl = document.getElementById('am-error');
    errEl.style.display = 'none';
    const username = document.getElementById('am-username').value.trim();
    const displayName = document.getElementById('am-display-name').value.trim();
    const merchantType = parseInt(document.getElementById('am-type').value);
    const description = document.getElementById('am-description').value.trim();
    const category = document.getElementById('am-category').value.trim();
    const websiteUrl = document.getElementById('am-website').value.trim();
    const usernameColor = document.getElementById('am-color-text').value.trim() || '#990099';
    const mentor = document.getElementById('am-mentor').value.trim();
    const referrer = document.getElementById('am-referrer').value.trim();

    if (!username) { errEl.textContent = 'Username wajib diisi'; errEl.style.display = 'block'; return; }
    if (!displayName) { errEl.textContent = 'Display Name wajib diisi'; errEl.style.display = 'block'; return; }

    const btn = document.getElementById('am-save-btn');
    btn.textContent = 'Menyimpan...'; btn.disabled = true;

    const body = { username, displayName, merchantType, description, category, websiteUrl, usernameColor };
    if (mentor) body.mentor = mentor;
    if (referrer) body.referrer = referrer;

    const res = await api('/merchants', { method: 'POST', body });
    btn.textContent = 'Simpan Merchant'; btn.disabled = false;

    if (!res || res.error) { errEl.textContent = res?.error || 'Gagal menyimpan merchant'; errEl.style.display = 'block'; return; }
    toast('Merchant berhasil ditambahkan', 'success');
    state.page = 'merchants';
    render();
  };
}

// ─── MERCHANT TAGS ────────────────────────────────────────────────────────────
const TAG_STATUS = {0:'Inactive',1:'Active',2:'Pending'};
const TAG_TYPE = {1:'Top',2:'Non-Top'};

async function renderMerchantTags(el, page = 1) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat...</div>';
  const data = await api(`/merchants/tags?page=${page}&limit=20`);
  if (!data) return;
  const totalPages = Math.ceil(data.total / 20);
  el.innerHTML = `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Merchant</th><th>Tagged User</th><th>Tipe</th><th>Status</th><th>Jumlah</th><th>Kadaluarsa</th><th>Dibuat</th></tr></thead>
      <tbody>
        ${data.tags.length === 0 ? `<tr><td colspan="7"><div class="empty">Tidak ada tag</div></td></tr>` :
          data.tags.map(t => `
          <tr>
            <td>${esc(t.merchant_username)}</td>
            <td>${esc(t.tagged_username)}</td>
            <td><span class="badge ${t.type === 1 ? 'purple' : 'blue'}">${TAG_TYPE[t.type] || t.type}</span></td>
            <td><span class="badge ${t.status === 1 ? 'green' : t.status === 2 ? 'yellow' : 'gray'}">${TAG_STATUS[t.status] || t.status}</span></td>
            <td>${t.amount ? fmtFloat(t.amount)+' '+esc(t.currency||'') : '-'}</td>
            <td>${t.expiry ? fmtDateTime(t.expiry) : '-'}</td>
            <td>${fmtDateTime(t.created_at)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div class="pagination">
    <div class="page-info">Total: ${fmtNum(data.total)} tag | Halaman ${page} dari ${totalPages}</div>
    ${page > 1 ? `<button class="btn btn-outline btn-sm" id="prev-btn">← Prev</button>` : ''}
    ${page < totalPages ? `<button class="btn btn-outline btn-sm" id="next-btn">Next →</button>` : ''}
  </div>`;
  if (document.getElementById('prev-btn')) document.getElementById('prev-btn').onclick = () => renderMerchantTags(el, page - 1);
  if (document.getElementById('next-btn')) document.getElementById('next-btn').onclick = () => renderMerchantTags(el, page + 1);
}

// ─── BOTS ────────────────────────────────────────────────────────────────────
async function renderBots(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat...</div>';
  const [list, stats] = await Promise.all([
    api('/bots/list'),
    api('/bots/stats'),
  ]);
  const bots = list?.bots || [];
  el.innerHTML = `
  <div class="stats-grid" style="margin-bottom:16px">
    <div class="stat-card purple">
      <div class="stat-label">Total Bot Game</div>
      <div class="stat-value">${fmtNum(stats?.totalBots || 0)}</div>
      <div class="stat-sub">Terdaftar di katalog</div>
    </div>
    <div class="stat-card green">
      <div class="stat-label">Bot Aktif</div>
      <div class="stat-value">${fmtNum(stats?.activeBots || 0)}</div>
      <div class="stat-sub">Status = aktif</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-label">Group</div>
      <div class="stat-value">${fmtNum((stats?.byGroup || []).length)}</div>
      <div class="stat-sub">Jumlah grup bot</div>
    </div>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="card-title">Katalog Bot Game</div>
    <p style="font-size:13px;color:var(--text-muted);margin:-4px 0 14px 0">
      Daftar game bot yang terdaftar di sistem. Sesi runtime per chatroom di-track in-memory oleh server gateway dan dimulai via perintah <code>/bot &lt;gameType&gt;</code> di chatroom (hanya admin global).
    </p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>ID</th><th>Game</th><th>Nama Tampilan</th><th>Command</th>
          <th>Tipe</th><th>Group</th><th>Leaderboard</th><th>Status</th><th>Aksi</th>
        </tr></thead>
        <tbody>
          ${bots.length === 0 ? `<tr><td colspan="9"><div class="empty">Belum ada bot game terdaftar</div></td></tr>` :
            bots.map(b => `
            <tr>
              <td>${b.id}</td>
              <td><strong>${esc(b.game)}</strong></td>
              <td>${esc(b.display_name)}</td>
              <td>${b.command_name ? `<code>${esc(b.command_name)}</code>` : '-'}</td>
              <td>${b.type}</td>
              <td>${b.group_id}</td>
              <td>${b.leaderboards ? '<span class="badge green">Ya</span>' : '<span class="badge gray">Tidak</span>'}</td>
              <td>${b.status === 1 ? '<span class="badge green">Aktif</span>' : '<span class="badge gray">Nonaktif</span>'}</td>
              <td><button class="btn-secondary" data-toggle-bot="${b.id}">${b.status === 1 ? 'Nonaktifkan' : 'Aktifkan'}</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;

  el.querySelectorAll('[data-toggle-bot]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-toggle-bot');
      btn.disabled = true;
      const r = await api(`/bots/${id}/toggle`, { method: 'POST' });
      if (r?.ok) {
        await renderBots(el);
      } else {
        toast(r?.error || 'Gagal mengubah status', 'error');
        btn.disabled = false;
      }
    };
  });
}

// ─── AUDIT LOGIN ─────────────────────────────────────────────────────────────
async function renderAuditLogin(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat...</div>';
  const onlyFailed = state.auditOnlyFailed === true;
  const page = state.auditPage || 1;
  const [stats, data] = await Promise.all([
    api('/audit/login-stats'),
    api(`/audit/login-attempts?page=${page}&limit=50${onlyFailed ? '&failed=1' : ''}`),
  ]);
  const attempts = data?.attempts || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));
  const topIps = (stats?.topIps || []).map(t => `
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
      <code>${esc(t.ip || '-')}</code>
      <span class="badge ${t.failed_count >= 5 ? 'red' : 'gray'}">${fmtNum(t.failed_count)} gagal</span>
    </div>`).join('') || '<div class="empty" style="padding:8px 0">Belum ada percobaan gagal 24 jam terakhir</div>';

  el.innerHTML = `
  <div class="stats-grid" style="margin-bottom:16px">
    <div class="stat-card blue">
      <div class="stat-label">Percobaan 24 jam</div>
      <div class="stat-value">${fmtNum(stats?.total24h || 0)}</div>
      <div class="stat-sub">Total semua percobaan</div>
    </div>
    <div class="stat-card red">
      <div class="stat-label">Gagal 24 jam</div>
      <div class="stat-value">${fmtNum(stats?.failed24h || 0)}</div>
      <div class="stat-sub">Username/password salah</div>
    </div>
    <div class="stat-card purple">
      <div class="stat-label">IP Unik 24 jam</div>
      <div class="stat-value">${fmtNum(stats?.uniqueIps24h || 0)}</div>
      <div class="stat-sub">Sumber percobaan</div>
    </div>
  </div>
  <div class="two-col" style="margin-bottom:16px">
    <div class="card">
      <div class="card-title">Top 5 IP dengan login gagal (24 jam)</div>
      <div>${topIps}</div>
    </div>
    <div class="card">
      <div class="card-title">Filter</div>
      <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer">
        <input type="checkbox" id="audit-only-failed" ${onlyFailed ? 'checked' : ''}/>
        Tampilkan hanya percobaan gagal
      </label>
      <p style="font-size:12px;color:var(--text-muted);margin-top:10px">
        Setiap percobaan login admin (sukses maupun gagal) dicatat di tabel <code>admin_login_attempts</code>. Rate limit aktif: maks 5 percobaan gagal per IP per menit.
      </p>
    </div>
  </div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div class="card-title" style="margin:0">Riwayat Percobaan Login</div>
      <div style="font-size:13px;color:var(--text-muted)">Total: ${fmtNum(total)} · Halaman ${page}/${totalPages}</div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Waktu</th><th>Username</th><th>IP</th><th>Status</th><th>Alasan</th><th>User Agent</th></tr></thead>
        <tbody>
          ${attempts.length === 0 ? '<tr><td colspan="6"><div class="empty">Belum ada data</div></td></tr>' :
            attempts.map(a => `
            <tr>
              <td>${fmtDateTime(a.created_at)}</td>
              <td>${esc(a.username || '-')}</td>
              <td><code>${esc(a.ip || '-')}</code></td>
              <td>${a.success ? '<span class="badge green">Sukses</span>' : '<span class="badge red">Gagal</span>'}</td>
              <td>${esc(a.reason || '-')}</td>
              <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(a.user_agent || '')}">${esc((a.user_agent || '').slice(0, 60))}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:center;gap:8px;margin-top:14px">
      <button class="btn-secondary" id="audit-prev" ${page <= 1 ? 'disabled' : ''}>← Sebelumnya</button>
      <button class="btn-secondary" id="audit-next" ${page >= totalPages ? 'disabled' : ''}>Selanjutnya →</button>
    </div>
  </div>`;

  document.getElementById('audit-only-failed').onchange = (e) => {
    state.auditOnlyFailed = e.target.checked;
    state.auditPage = 1;
    renderAuditLogin(el);
  };
  document.getElementById('audit-prev').onclick = () => {
    state.auditPage = Math.max(1, page - 1);
    renderAuditLogin(el);
  };
  document.getElementById('audit-next').onclick = () => {
    state.auditPage = page + 1;
    renderAuditLogin(el);
  };
}

// ─── SYSTEM SETTINGS ─────────────────────────────────────────────────────────
async function renderSystemSettings(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat...</div>';
  const [r, regR] = await Promise.all([
    api('/settings/flood'),
    api('/settings/registration'),
  ]);
  const s = (r && r.settings) || {};
  const enabled = String(s['chat.flood.enabled'] ?? 'true') === 'true';
  const regEnabled = regR?.enabled !== false;
  const maxN = parseInt(s['chat.flood.maxMessages'] ?? '5', 10);
  const winMs = parseInt(s['chat.flood.windowMs'] ?? '3000', 10);
  const action = s['chat.flood.action'] === 'warn' ? 'warn' : 'disconnect';

  el.innerHTML = `
  <div class="card" style="max-width:720px;margin-bottom:20px">
    <div class="card-title">📝 Registrasi Akun</div>
    <p style="font-size:13px;color:var(--text-muted);margin:-4px 0 18px 0">
      Kontrol apakah user baru dapat mendaftarkan akun dari aplikasi. Jika dinonaktifkan, semua permintaan register akan ditolak dengan pesan error.
    </p>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-radius:10px;border:1px solid var(--border);background:${regEnabled ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)'};" id="reg-status-box">
      <div>
        <div style="font-size:14px;font-weight:700;color:${regEnabled ? '#16a34a' : '#dc2626'};" id="reg-status-label">
          ${regEnabled ? '✅ Registrasi AKTIF' : '🔴 Registrasi NONAKTIF'}
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:3px" id="reg-status-sub">
          ${regEnabled ? 'User baru dapat mendaftar dari aplikasi.' : 'Pendaftaran akun baru ditutup sementara.'}
        </div>
      </div>
      <label style="position:relative;display:inline-block;width:52px;height:28px;flex-shrink:0">
        <input type="checkbox" id="reg-toggle" ${regEnabled ? 'checked' : ''} style="opacity:0;width:0;height:0"/>
        <span id="reg-slider" style="position:absolute;cursor:pointer;inset:0;border-radius:28px;background:${regEnabled ? '#16a34a' : '#9ca3af'};transition:background 0.2s">
          <span style="position:absolute;content:'';height:20px;width:20px;left:${regEnabled ? '28px' : '4px'};bottom:4px;border-radius:50%;background:#fff;transition:left 0.2s;display:block;" id="reg-knob"></span>
        </span>
      </label>
    </div>
    <div style="margin-top:14px">
      <button class="btn-primary" id="reg-save" style="background:${regEnabled ? '#16a34a' : '#dc2626'}">💾 Simpan</button>
    </div>
  </div>

  <div class="card" style="max-width:720px">
    <div class="card-title">🛡️ Anti-Flood Chatroom</div>
    <p style="font-size:13px;color:var(--text-muted);margin:-4px 0 18px 0">
      Lindungi chatroom dari user yang spam pesan. Jika user melebihi batas, sistem akan memberi peringatan atau langsung memutus koneksinya. Setting ini berlaku untuk semua chatroom dan otomatis aktif maks 10 detik setelah disimpan (server polling).
    </p>

    <div class="form-group" style="margin-bottom:16px">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;font-weight:600">
        <input type="checkbox" id="ff-enabled" ${enabled ? 'checked' : ''}/>
        Aktifkan Anti-Flood
      </label>
    </div>

    <div class="form-group" style="margin-bottom:16px">
      <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">Maksimum Pesan</label>
      <input type="number" id="ff-max" min="1" max="100" value="${maxN}" style="width:140px"/>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Jumlah maksimum pesan yang boleh dikirim user dalam satu window (1–100).</div>
    </div>

    <div class="form-group" style="margin-bottom:16px">
      <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">Window (detik)</label>
      <input type="number" id="ff-window" min="1" max="60" step="1" value="${Math.round(winMs/1000)}" style="width:140px"/>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Lama window deteksi flood (1–60 detik).</div>
    </div>

    <div class="form-group" style="margin-bottom:20px">
      <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">Aksi Saat Flood Terdeteksi</label>
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px">
          <input type="radio" name="ff-action" value="disconnect" ${action === 'disconnect' ? 'checked' : ''}/>
          Putus koneksi (rekomendasi)
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px">
          <input type="radio" name="ff-action" value="warn" ${action === 'warn' ? 'checked' : ''}/>
          Hanya peringatan (pesan ditolak)
        </label>
      </div>
    </div>

    <div style="background:rgba(244,116,34,0.07);border:1px solid rgba(244,116,34,0.3);border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:13px">
      <strong style="color:#F47422">Preview:</strong>
      <span id="ff-preview"></span>
    </div>

    <button class="btn-primary" id="ff-save">💾 Simpan Pengaturan</button>
  </div>`;

  // ── Registration toggle handlers ──
  const regToggle = document.getElementById('reg-toggle');
  regToggle.onchange = function() {
    const on = regToggle.checked;
    document.getElementById('reg-slider').style.background = on ? '#16a34a' : '#9ca3af';
    document.getElementById('reg-knob').style.left = on ? '28px' : '4px';
    document.getElementById('reg-status-label').style.color = on ? '#16a34a' : '#dc2626';
    document.getElementById('reg-status-label').textContent = on ? '✅ Registrasi AKTIF' : '🔴 Registrasi NONAKTIF';
    document.getElementById('reg-status-sub').textContent = on ? 'User baru dapat mendaftar dari aplikasi.' : 'Pendaftaran akun baru ditutup sementara.';
    document.getElementById('reg-status-box').style.background = on ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)';
    document.getElementById('reg-save').style.background = on ? '#16a34a' : '#dc2626';
  };
  document.getElementById('reg-save').onclick = async () => {
    const btn = document.getElementById('reg-save');
    btn.disabled = true; btn.textContent = 'Menyimpan...';
    const on = document.getElementById('reg-toggle').checked;
    const res = await api('/settings/registration', { method: 'PUT', body: JSON.stringify({ enabled: on }) });
    btn.disabled = false; btn.textContent = '💾 Simpan';
    if (res?.ok) {
      toast(on ? 'Registrasi diaktifkan.' : 'Registrasi dinonaktifkan.', 'success');
    } else {
      toast(res?.error || 'Gagal menyimpan', 'error');
    }
  };

  function updatePreview() {
    const p = document.getElementById('ff-preview');
    const en = document.getElementById('ff-enabled').checked;
    const m = document.getElementById('ff-max').value;
    const w = document.getElementById('ff-window').value;
    const a = document.querySelector('input[name="ff-action"]:checked').value;
    if (!en) {
      p.textContent = ' Anti-flood DINONAKTIFKAN — semua user bebas spam.';
    } else {
      p.textContent = ` Jika user kirim lebih dari ${m} pesan dalam ${w} detik → ${a === 'disconnect' ? 'koneksi langsung diputus' : 'pesan ditolak dengan peringatan'}.`;
    }
  }
  ['ff-enabled','ff-max','ff-window'].forEach(id => document.getElementById(id).oninput = updatePreview);
  document.querySelectorAll('input[name="ff-action"]').forEach(r => r.onchange = updatePreview);
  updatePreview();

  document.getElementById('ff-save').onclick = async () => {
    const btn = document.getElementById('ff-save');
    btn.disabled = true; btn.textContent = 'Menyimpan...';
    const body = {
      enabled: document.getElementById('ff-enabled').checked,
      maxMessages: parseInt(document.getElementById('ff-max').value, 10),
      windowMs: Math.max(500, parseInt(document.getElementById('ff-window').value, 10) * 1000),
      action: document.querySelector('input[name="ff-action"]:checked').value,
    };
    const res = await api('/settings/flood', { method: 'PUT', body: JSON.stringify(body) });
    btn.disabled = false; btn.textContent = '💾 Simpan Pengaturan';
    if (res?.ok) {
      toast('Pengaturan tersimpan. Aktif dalam ~10 detik.', 'success');
    } else {
      toast(res?.error || 'Gagal menyimpan', 'error');
    }
  };
}

async function renderXpSettings(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat...</div>';
  const r = await api('/xp');
  if (!r || !r.config) {
    el.innerHTML = '<div class="empty">Gagal memuat konfigurasi XP.</div>';
    return;
  }
  const c = r.config;
  const d = r.defaults || c;

  function row(key, label, hint, suffix) {
    const def = d[key];
    return `
      <div class="form-group" style="margin-bottom:14px">
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">${label}
          <span style="color:var(--text-muted);font-weight:400;font-size:11px">(default: ${def}${suffix||''})</span>
        </label>
        <input type="number" data-xpkey="${key}" min="0" step="1" value="${c[key]}" style="width:160px"/>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${hint}</div>
      </div>`;
  }

  el.innerHTML = `
  <div class="card" style="max-width:820px">
    <div class="card-title">⭐ Pengaturan XP &amp; Anti-Flood</div>
    <p style="font-size:13px;color:var(--text-muted);margin:-4px 0 18px 0">
      Atur jumlah XP per aksi (chat, gift, foto, game, dll) dan throttle anti-flood untuk chat.
      Perubahan otomatis aktif di server dalam ~15 detik (cache TTL) — tidak perlu rebuild Docker.
    </p>

    <h3 style="font-size:14px;margin:14px 0 8px;color:var(--text)">XP per Aksi</h3>
    ${row('chatRoomMessage', 'Chat di chatroom (per pesan)',  'XP per pesan chat (kena throttle anti-flood di bawah)',                       ' XP')}
    ${row('privateMessage',  'Private message (per pesan)',   'XP per private message',                                                       ' XP')}
    ${row('giftSent',        'Kirim gift',                    'XP yang didapat pengirim per gift',                                            ' XP')}
    ${row('giftReceived',    'Terima gift',                   'XP yang didapat penerima per gift',                                            ' XP')}
    ${row('photoUploaded',   'Upload foto',                   'XP per foto baru',                                                             ' XP')}
    ${row('referral',        'Referral terverifikasi',        'XP per teman yang terverifikasi',                                              ' XP')}
    ${row('phoneCallSecond', 'Phone call (per detik)',        'XP per detik panggilan suara',                                                 ' XP/dtk')}
    ${row('gamePlayed',      'Game — ikut main',              'XP saat join paid game (lowcard, dice, cricket, one, tebakhati, dll)',        ' XP')}
    ${row('gameWon',         'Game — menang',                 'XP tambahan saat menang game (total per win = gamePlayed + gameWon)',         ' XP')}

    <h3 style="font-size:14px;margin:22px 0 8px;color:var(--text)">Anti-Flood Chat XP</h3>
    ${row('chatThrottleMinGapMs', 'Minimal jeda antar pesan ber-XP', 'Pesan dalam jeda lebih cepat dari ini = 0 XP. Set 0 untuk nonaktifkan.', ' ms')}
    ${row('chatThrottlePerMinCap','Max pesan ber-XP / menit',         'Pesan ke-N+1 dalam 60 detik = 0 XP. Set 0 untuk nonaktifkan.',          ' pesan')}

    <div style="background:rgba(244,116,34,0.07);border:1px solid rgba(244,116,34,0.3);border-radius:8px;padding:12px 14px;margin:18px 0;font-size:13px">
      <strong style="color:#F47422">Preview level 71 → 72:</strong>
      <span id="xp-preview"></span>
    </div>

    <div style="display:flex;gap:10px">
      <button class="btn-primary" id="xp-save">💾 Simpan</button>
      <button class="btn-secondary" id="xp-reset" style="background:#444;color:#fff;border:none;padding:10px 16px;border-radius:6px;cursor:pointer">↺ Reset ke default</button>
    </div>
  </div>`;

  function readForm() {
    const out = {};
    el.querySelectorAll('[data-xpkey]').forEach(inp => {
      const k = inp.getAttribute('data-xpkey');
      const v = Number(inp.value);
      out[k] = Number.isFinite(v) && v >= 0 ? v : d[k];
    });
    return out;
  }

  function updatePreview() {
    const v = readForm();
    const xpToL72 = 3699;
    const chatMsgs = v.chatRoomMessage > 0 ? Math.ceil(xpToL72 / v.chatRoomMessage) : '∞';
    const gifts    = v.giftSent > 0 ? Math.ceil(xpToL72 / v.giftSent) : '∞';
    const games    = (v.gamePlayed + v.gameWon) > 0 ? Math.ceil(xpToL72 / (v.gamePlayed + v.gameWon)) : '∞';
    const chatRate = v.chatThrottlePerMinCap > 0 ? `(throttled ke ${v.chatThrottlePerMinCap}/menit = ${v.chatRoomMessage * v.chatThrottlePerMinCap} XP/menit)` : '';
    document.getElementById('xp-preview').innerHTML =
      `~<b>${chatMsgs}</b> pesan chat ${chatRate} • ~<b>${gifts}</b> gift • ~<b>${games}</b> game menang.`;
  }
  el.querySelectorAll('[data-xpkey]').forEach(inp => inp.oninput = updatePreview);
  updatePreview();

  document.getElementById('xp-save').onclick = async () => {
    const btn = document.getElementById('xp-save');
    btn.disabled = true; btn.textContent = 'Menyimpan…';
    const body = readForm();
    const res = await api('/xp', { method: 'PUT', body: JSON.stringify(body) });
    btn.disabled = false; btn.textContent = '💾 Simpan';
    if (res?.ok) {
      toast('Pengaturan XP tersimpan. Aktif di server dalam ~15 detik.', 'success');
    } else {
      toast(res?.error || 'Gagal menyimpan', 'error');
    }
  };

  document.getElementById('xp-reset').onclick = async () => {
    if (!confirm('Reset semua nilai XP ke default? Aksi ini menghapus semua override.')) return;
    const res = await api('/xp/reset', { method: 'POST' });
    if (res?.ok) {
      toast('Direset ke default.', 'success');
      renderXpSettings(el);
    } else {
      toast(res?.error || 'Gagal mereset', 'error');
    }
  };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtNum(n) { return Number(n).toLocaleString('id-ID'); }
function fmtFloat(n) { return Number(n).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtD(n) { return `💎 ${Math.round(n).toLocaleString('id-ID')}`; }
function fmtIDR(d) { return `Rp ${(d * 2).toLocaleString('id-ID')}`; }
function fmtDateTime(dt) {
  if (!dt) return '-';
  return new Date(dt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
}
function fmtDate(dt) {
  if (!dt) return '-';
  return new Date(dt).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' });
}

// ─── ADMIN MANAGEMENT ────────────────────────────────────────────────────────
async function renderAdminManagement(el, search = '') {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat data administrator...</div>';

  const [data, logsData] = await Promise.all([
    api('/users?limit=200&search=' + encodeURIComponent(search)),
    api('/users/admin-logs?limit=50'),
  ]);
  if (!data) return;

  const admins = data.users.filter(u => u.is_admin);
  const nonAdmins = search ? data.users.filter(u => !u.is_admin) : [];
  const logs = logsData?.logs || [];

  el.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:20px;padding:4px 0">

    <div class="card" style="padding:20px">
      <h3 style="margin:0 0 4px;font-size:15px;font-weight:600">Administrator Aktif</h3>
      <p style="margin:0 0 16px;color:var(--text-muted);font-size:13px">Daftar pengguna dengan hak akses administrator. Kolom <strong>Super Admin</strong> hanya dapat diubah oleh Super Administrator.</p>
      ${admins.length === 0 ? '<div class="empty" style="padding:24px">Tidak ada administrator ditemukan</div>' : `
      <table class="table">
        <thead><tr><th>User</th><th>Email</th><th>Super Admin</th><th>Bergabung</th><th>Aksi</th></tr></thead>
        <tbody>
          ${admins.map(u => `
          <tr>
            <td>
              <strong>@${esc(u.username)}</strong>
              ${u.is_super_admin ? ' <span class="badge" style="background:rgba(124,58,237,0.15);color:#7c3aed;border:1px solid rgba(124,58,237,0.3);font-size:10px;padding:2px 6px;border-radius:4px">Super</span>' : ''}
              ${u.display_name ? `<br><small style="color:var(--text-muted)">${esc(u.display_name)}</small>` : ''}
            </td>
            <td><small>${esc(u.email || '-')}</small></td>
            <td style="text-align:center">
              ${state.isSuperAdmin
                ? (u.is_super_admin
                    ? `<button class="btn btn-sm" style="background:rgba(124,58,237,0.15);color:#7c3aed;border:1px solid rgba(124,58,237,0.3);font-size:11px" onclick="revokeSuperAdmin('${u.id}','${esc(u.username)}')">⭐ Super Admin</button>`
                    : `<button class="btn btn-sm btn-outline" style="font-size:11px;color:var(--text-muted)" onclick="grantSuperAdmin('${u.id}','${esc(u.username)}')">Jadikan Super</button>`)
                : (u.is_super_admin
                    ? '<span style="color:#7c3aed;font-size:13px">⭐ Ya</span>'
                    : '<span style="color:var(--text-muted);font-size:13px">—</span>')
              }
            </td>
            <td><small>${fmtDateTime(u.created_at)}</small></td>
            <td>
              <button class="btn btn-sm btn-danger" onclick="revokeAdmin('${u.id}', '${esc(u.username)}')">Cabut Admin</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`}
    </div>

    <div class="card" style="padding:20px">
      <h3 style="margin:0 0 4px;font-size:15px;font-weight:600">Tambah Administrator</h3>
      <p style="margin:0 0 16px;color:var(--text-muted);font-size:13px">Cari pengguna berdasarkan username atau email, lalu berikan hak akses administrator.</p>
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <input class="input" id="admin-search-input" type="text" placeholder="Cari username atau email..." value="${esc(search)}" style="flex:1" />
        <button class="btn btn-primary" id="admin-search-btn">Cari</button>
      </div>
      ${search && nonAdmins.length === 0 ? `<div class="empty" style="padding:20px">Tidak ada pengguna non-admin ditemukan untuk "<strong>${esc(search)}</strong>"</div>` : ''}
      ${nonAdmins.length > 0 ? `
      <table class="table">
        <thead><tr><th>User</th><th>Email</th><th>Bergabung</th><th>Aksi</th></tr></thead>
        <tbody>
          ${nonAdmins.map(u => `
          <tr>
            <td>
              <strong>@${esc(u.username)}</strong>
              ${u.display_name ? `<br><small style="color:var(--text-muted)">${esc(u.display_name)}</small>` : ''}
            </td>
            <td><small>${esc(u.email || '-')}</small></td>
            <td><small>${fmtDateTime(u.created_at)}</small></td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="grantAdmin('${u.id}', '${esc(u.username)}')">Jadikan Admin</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>` : (!search ? '<div class="empty" style="padding:20px;color:var(--text-muted);font-size:13px">Masukkan username atau email untuk mencari pengguna</div>' : '')}
    </div>

    <div class="card" style="padding:20px">
      <h3 style="margin:0 0 4px;font-size:15px;font-weight:600">Log Aktivitas Admin</h3>
      <p style="margin:0 0 16px;color:var(--text-muted);font-size:13px">Riwayat perubahan hak akses administrator — siapa melakukan apa dan kapan.</p>
      ${logs.length === 0 ? '<div class="empty" style="padding:20px">Belum ada aktivitas yang tercatat</div>' : `
      <table class="table">
        <thead><tr><th>Aksi</th><th>Target User</th><th>Dilakukan Oleh</th><th>Waktu</th></tr></thead>
        <tbody>
          ${logs.map(log => {
            const badgeMap = {
              grant:        '<span class="badge" style="background:rgba(74,222,128,0.15);color:#16a34a;border:1px solid rgba(74,222,128,0.3);font-size:11px;padding:2px 7px;border-radius:4px">Beri Admin</span>',
              revoke:       '<span class="badge" style="background:rgba(248,113,113,0.15);color:#dc2626;border:1px solid rgba(248,113,113,0.3);font-size:11px;padding:2px 7px;border-radius:4px">Cabut Admin</span>',
              grant_super:  '<span class="badge" style="background:rgba(124,58,237,0.15);color:#7c3aed;border:1px solid rgba(124,58,237,0.3);font-size:11px;padding:2px 7px;border-radius:4px">⭐ Beri Super</span>',
              revoke_super: '<span class="badge" style="background:rgba(245,158,11,0.15);color:#d97706;border:1px solid rgba(245,158,11,0.3);font-size:11px;padding:2px 7px;border-radius:4px">Cabut Super</span>',
            };
            const badge = badgeMap[log.action] || `<span class="badge" style="font-size:11px;padding:2px 7px">${esc(log.action)}</span>`;
            return `
            <tr>
              <td>${badge}</td>
              <td><strong>@${esc(log.target_username)}</strong></td>
              <td><span style="color:var(--text-muted)">@${esc(log.performed_by)}</span></td>
              <td><small style="color:var(--text-muted)">${fmtDateTime(log.created_at)}</small></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`}
    </div>

  </div>`;

  const searchInput = document.getElementById('admin-search-input');
  document.getElementById('admin-search-btn').onclick = () => {
    renderAdminManagement(el, searchInput.value.trim());
  };
  searchInput.onkeydown = (e) => {
    if (e.key === 'Enter') renderAdminManagement(el, searchInput.value.trim());
  };
}

window.grantAdmin = function(id, username) {
  confirm(
    'Jadikan Administrator',
    `Apakah Anda yakin ingin memberikan hak akses administrator kepada @${username}?`,
    async () => {
      const res = await api(`/users/${id}/admin`, { method: 'PATCH', body: { isAdmin: true } });
      if (res && res.success) {
        toast(`@${username} berhasil dijadikan administrator`, 'success');
        await renderAdminManagement(document.getElementById('content'));
      } else {
        toast(res?.error || 'Gagal memberikan hak admin', 'error');
      }
    },
    false
  );
};

window.revokeAdmin = function(id, username) {
  confirm(
    'Cabut Hak Administrator',
    `Apakah Anda yakin ingin mencabut hak akses administrator dari @${username}?`,
    async () => {
      const res = await api(`/users/${id}/admin`, { method: 'PATCH', body: { isAdmin: false } });
      if (res && res.success) {
        toast(`Hak admin @${username} berhasil dicabut`, 'success');
        await renderAdminManagement(document.getElementById('content'));
      } else {
        toast(res?.error || 'Gagal mencabut hak admin', 'error');
      }
    },
    true
  );
};

window.grantSuperAdmin = function(id, username) {
  confirm(
    'Jadikan Super Administrator',
    `Berikan hak Super Administrator kepada @${username}? Ia akan bisa mengakses Manajemen Kredit dan Kirim Diamond.`,
    async () => {
      const res = await api(`/users/${id}/super-admin`, { method: 'PATCH', body: { isSuperAdmin: true } });
      if (res && res.success) {
        toast(`@${username} berhasil dijadikan Super Administrator`, 'success');
        await renderAdminManagement(document.getElementById('content'));
      } else {
        toast(res?.error || 'Gagal memberikan hak Super Admin', 'error');
      }
    },
    false,
    'Ya, Jadikan Super'
  );
};

window.revokeSuperAdmin = function(id, username) {
  confirm(
    'Cabut Hak Super Administrator',
    `Cabut hak Super Administrator dari @${username}? Ia tidak lagi bisa mengakses Manajemen Kredit dan Kirim Diamond.`,
    async () => {
      const res = await api(`/users/${id}/super-admin`, { method: 'PATCH', body: { isSuperAdmin: false } });
      if (res && res.success) {
        toast(`Hak Super Admin @${username} berhasil dicabut`, 'success');
        await renderAdminManagement(document.getElementById('content'));
      } else {
        toast(res?.error || 'Gagal mencabut hak Super Admin', 'error');
      }
    },
    true,
    'Ya, Cabut'
  );
};

// ─── BROADCAST ───────────────────────────────────────────────────────────────
function renderBroadcast(el) {
  el.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:20px;padding:4px 0;max-width:760px">

    <!-- ── LOGIN POPUP ANNOUNCEMENT ─────────────────────────────────────── -->
    <div class="card" style="padding:20px;border-left:4px solid #6366f1">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <span style="font-size:20px">🪧</span>
        <h3 style="margin:0;font-size:15px;font-weight:600">Popup Pengumuman Login</h3>
      </div>
      <p style="margin:0 0 14px;color:var(--text-muted);font-size:13px">
        Tampilkan pengumuman sebagai popup tepat setelah pengguna berhasil login ke aplikasi.
        Setiap kali Anda menyimpan, semua pengguna akan melihat versi terbaru sekali setelah login.
      </p>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="lp-enabled" style="accent-color:#6366f1" />
          <span><strong>Aktifkan</strong> popup setelah login</span>
        </label>
      </div>

      <div class="form-group" style="margin-bottom:12px">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">Judul</label>
        <input class="input" id="lp-title" type="text" placeholder="Contoh: Selamat Datang Kembali!" maxlength="200" style="width:100%" />
      </div>

      <div class="form-group" style="margin-bottom:12px">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">Isi Pengumuman <span style="color:#e53e3e">*</span></label>
        <textarea class="input" id="lp-body" rows="4" placeholder="Tulis isi pengumuman..." maxlength="4000" style="width:100%;resize:vertical;font-family:inherit"></textarea>
        <div style="text-align:right;font-size:11px;color:var(--text-muted);margin-top:4px"><span id="lp-char-count">0</span>/4000</div>
      </div>

      <div class="form-group" style="margin-bottom:16px">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">URL Gambar <span style="color:var(--text-muted);font-weight:400">(opsional)</span></label>
        <input class="input" id="lp-image" type="url" placeholder="https://..." maxlength="1000" style="width:100%" />
      </div>

      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn btn-primary" id="lp-save-btn" style="background:#6366f1;border-color:#6366f1">Simpan Pengumuman</button>
        <span id="lp-status" style="font-size:12px;color:var(--text-muted)"></span>
      </div>
    </div>

    <!-- ── LIVE ROOM ANNOUNCEMENT ─────────────────────────────────────── -->
    <div class="card" style="padding:20px;border-left:4px solid #ec4899">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <span style="font-size:20px">📺</span>
        <h3 style="margin:0;font-size:15px;font-weight:600">Pengumuman Live Room</h3>
      </div>
      <p style="margin:0 0 14px;color:var(--text-muted);font-size:13px">
        Tampilkan teks pengumuman di dalam chat semua Live Room yang sedang aktif.
        Pengumuman ini muncul otomatis saat viewer bergabung, dan dapat di-broadcast langsung ke semua yang sedang menonton.
      </p>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="lr-enabled" style="accent-color:#ec4899" />
          <span><strong>Aktifkan</strong> pengumuman di live room</span>
        </label>
      </div>

      <div class="form-group" style="margin-bottom:16px">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">Teks Pengumuman <span style="color:#e53e3e">*</span></label>
        <textarea class="input" id="lr-text" rows="5" placeholder="Contoh: Dilarang melakukan VCS atau konten tidak pantas. Pelanggaran akan diblokir permanen." maxlength="2000" style="width:100%;resize:vertical;font-family:inherit"></textarea>
        <div style="text-align:right;font-size:11px;color:var(--text-muted);margin-top:4px"><span id="lr-char-count">0</span>/2000</div>
      </div>

      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn btn-primary" id="lr-save-btn" style="background:#ec4899;border-color:#ec4899">Simpan &amp; Broadcast</button>
        <span id="lr-status" style="font-size:12px;color:var(--text-muted)"></span>
      </div>
    </div>

    <div class="card" style="padding:20px;border-left:4px solid #F47422">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <span style="font-size:20px">📢</span>
        <h3 style="margin:0;font-size:15px;font-weight:600">Broadcast Pesan Sistem</h3>
      </div>
      <p style="margin:0;color:var(--text-muted);font-size:13px">
        Kirim pesan ke semua ruang obrolan aktif sebagai pesan sistem (warna oranye Administrator).
        Pengguna online juga akan mendapat notifikasi popup.
      </p>
    </div>

    <div class="card" style="padding:20px">
      <div class="form-group" style="margin-bottom:16px">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">Judul Notifikasi <span style="color:var(--text-muted);font-weight:400">(untuk popup alert)</span></label>
        <input class="input" id="bc-title" type="text" placeholder="Contoh: Pengumuman Penting" maxlength="80" style="width:100%" />
      </div>

      <div class="form-group" style="margin-bottom:16px">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">Pesan <span style="color:#e53e3e">*</span></label>
        <textarea class="input" id="bc-message" rows="4" placeholder="Tulis pesan siaran di sini..." maxlength="500" style="width:100%;resize:vertical;font-family:inherit"></textarea>
        <div style="text-align:right;font-size:11px;color:var(--text-muted);margin-top:4px"><span id="bc-char-count">0</span>/500</div>
      </div>

      <div class="form-group" style="margin-bottom:20px">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:8px">Mode Pengiriman</label>
        <div style="display:flex;flex-direction:column;gap:8px">
          <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px 12px;border:1px solid var(--border);border-radius:8px;transition:border-color 0.15s" id="mode-both-wrap">
            <input type="radio" name="bc-mode" value="both" checked style="margin-top:3px;accent-color:#F47422" />
            <div>
              <div style="font-size:13px;font-weight:600">Semua — Chatroom + Popup Alert</div>
              <div style="font-size:12px;color:var(--text-muted)">Pesan masuk ke semua chatroom dan muncul sebagai notifikasi popup di layar pengguna online</div>
            </div>
          </label>
          <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px 12px;border:1px solid var(--border);border-radius:8px;transition:border-color 0.15s" id="mode-rooms-wrap">
            <input type="radio" name="bc-mode" value="rooms" style="margin-top:3px;accent-color:#F47422" />
            <div>
              <div style="font-size:13px;font-weight:600">Chatroom Saja</div>
              <div style="font-size:12px;color:var(--text-muted)">Pesan masuk ke semua chatroom sebagai pesan sistem tanpa popup</div>
            </div>
          </label>
          <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px 12px;border:1px solid var(--border);border-radius:8px;transition:border-color 0.15s" id="mode-alert-wrap">
            <input type="radio" name="bc-mode" value="alert" style="margin-top:3px;accent-color:#F47422" />
            <div>
              <div style="font-size:13px;font-weight:600">Popup Alert Saja</div>
              <div style="font-size:12px;color:var(--text-muted)">Hanya kirim notifikasi popup ke semua pengguna yang sedang online</div>
            </div>
          </label>
        </div>
      </div>

      <div id="bc-preview" style="display:none;background:rgba(244,116,34,0.07);border:1px solid rgba(244,116,34,0.3);border-radius:8px;padding:12px 14px;margin-bottom:16px">
        <div style="font-size:11px;font-weight:600;color:#F47422;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em">Preview Pesan</div>
        <div style="font-size:13px;color:var(--text-primary)"><span style="color:#F47422;font-weight:600">System: </span><span id="bc-preview-text"></span></div>
      </div>

      <button class="btn btn-primary" id="bc-send-btn" style="background:#F47422;border-color:#F47422;width:100%;font-size:14px;padding:10px" disabled>
        Kirim Broadcast
      </button>
    </div>

    <div class="card" id="bc-result-card" style="padding:20px;display:none">
      <h3 style="margin:0 0 12px;font-size:14px;font-weight:600">Hasil Pengiriman</h3>
      <div id="bc-result-body"></div>
    </div>

  </div>`;

  // ── LOGIN POPUP wiring ───────────────────────────────────────────────────
  const lpEnabled  = document.getElementById('lp-enabled');
  const lpTitle    = document.getElementById('lp-title');
  const lpBody     = document.getElementById('lp-body');
  const lpImage    = document.getElementById('lp-image');
  const lpCount    = document.getElementById('lp-char-count');
  const lpSaveBtn  = document.getElementById('lp-save-btn');
  const lpStatus   = document.getElementById('lp-status');

  function lpUpdateCount() { if (lpCount && lpBody) lpCount.textContent = lpBody.value.length; }
  if (lpBody) lpBody.oninput = lpUpdateCount;

  (async () => {
    const cur = await api('/announcement');
    if (cur && !cur.error) {
      lpEnabled.checked = !!cur.enabled;
      lpTitle.value = cur.title || '';
      lpBody.value  = cur.body  || '';
      lpImage.value = cur.imageUrl || '';
      lpUpdateCount();
      if (cur.version) lpStatus.textContent = `Versi #${cur.version}`;
    }
  })();

  if (lpSaveBtn) {
    lpSaveBtn.onclick = async () => {
      const enabled = !!lpEnabled.checked;
      const body = lpBody.value.trim();
      if (enabled && !body) { toast('Isi pengumuman wajib diisi', 'error'); return; }
      lpSaveBtn.disabled = true;
      const old = lpSaveBtn.textContent;
      lpSaveBtn.textContent = 'Menyimpan...';
      const res = await api('/announcement', {
        method: 'PUT',
        body: {
          enabled,
          title: lpTitle.value.trim(),
          body,
          imageUrl: lpImage.value.trim(),
        },
      });
      lpSaveBtn.disabled = false;
      lpSaveBtn.textContent = old;
      if (res && !res.error) {
        toast(enabled ? 'Pengumuman aktif & disimpan' : 'Pengumuman dinonaktifkan', 'success');
        if (res.version) lpStatus.textContent = `Versi #${res.version}`;
      } else {
        toast(res?.error || 'Gagal menyimpan pengumuman', 'error');
      }
    };
  }

  // ── Live Room Announcement ─────────────────────────────────────────────────
  const lrEnabled  = document.getElementById('lr-enabled');
  const lrText     = document.getElementById('lr-text');
  const lrCount    = document.getElementById('lr-char-count');
  const lrSaveBtn  = document.getElementById('lr-save-btn');
  const lrStatus   = document.getElementById('lr-status');

  function lrUpdateCount() { if (lrCount && lrText) lrCount.textContent = lrText.value.length; }
  if (lrText) lrText.oninput = lrUpdateCount;

  (async () => {
    const cur = await api('/announcement/live');
    if (cur && !cur.error) {
      if (lrEnabled) lrEnabled.checked = !!cur.enabled;
      if (lrText)    lrText.value      = cur.text || '';
      lrUpdateCount();
      if (lrStatus) lrStatus.textContent = cur.enabled ? 'Aktif' : 'Nonaktif';
    }
  })();

  if (lrSaveBtn) {
    lrSaveBtn.onclick = async () => {
      const enabled = !!lrEnabled.checked;
      const text    = lrText.value.trim();
      if (enabled && !text) { toast('Teks pengumuman wajib diisi', 'error'); return; }
      lrSaveBtn.disabled  = true;
      const old = lrSaveBtn.textContent;
      lrSaveBtn.textContent = 'Menyimpan...';
      const res = await api('/announcement/live', {
        method: 'PUT',
        body:   { enabled, text },
      });
      lrSaveBtn.disabled  = false;
      lrSaveBtn.textContent = old;
      if (res && !res.error) {
        toast(enabled ? 'Pengumuman live aktif & sudah di-broadcast' : 'Pengumuman live dinonaktifkan', 'success');
        if (lrStatus) lrStatus.textContent = enabled ? 'Aktif — sudah broadcast' : 'Nonaktif';
      } else {
        toast(res?.error || 'Gagal menyimpan pengumuman live', 'error');
      }
    };
  }

  const titleEl   = document.getElementById('bc-title');
  const msgEl     = document.getElementById('bc-message');
  const charCount = document.getElementById('bc-char-count');
  const preview   = document.getElementById('bc-preview');
  const previewTxt= document.getElementById('bc-preview-text');
  const sendBtn   = document.getElementById('bc-send-btn');
  const resultCard= document.getElementById('bc-result-card');
  const resultBody= document.getElementById('bc-result-body');

  function updateState() {
    const txt = msgEl.value.trim();
    charCount.textContent = msgEl.value.length;
    sendBtn.disabled = !txt;
    if (txt) {
      preview.style.display = 'block';
      previewTxt.textContent = txt;
    } else {
      preview.style.display = 'none';
    }
  }

  msgEl.oninput = updateState;

  sendBtn.onclick = () => {
    const message = msgEl.value.trim();
    const title   = titleEl.value.trim() || 'Pengumuman';
    const mode    = document.querySelector('input[name="bc-mode"]:checked')?.value || 'both';

    if (!message) return;

    const modeLabel = { both: 'Chatroom + Popup Alert', rooms: 'Chatroom Saja', alert: 'Popup Alert Saja' }[mode] || mode;

    confirm(
      'Kirim Broadcast',
      `Anda akan mengirim pesan ke semua ruang obrolan aktif (mode: ${modeLabel}). Lanjutkan?`,
      async () => {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Mengirim...';
        resultCard.style.display = 'none';

        const res = await api('/broadcast', { method: 'POST', body: { message, title, mode } });

        sendBtn.disabled = false;
        sendBtn.textContent = 'Kirim Broadcast';

        if (!res || res.error) {
          toast(res?.error || 'Gagal mengirim broadcast', 'error');
          return;
        }

        const toastMsg = res.note
          ? `Broadcast tersimpan ke ${res.roomsReached ?? 0} chatroom (mode offline)`
          : `Broadcast berhasil dikirim ke ${res.roomsReached ?? 0} chatroom`;
        toast(toastMsg, 'success');

        resultCard.style.display = 'block';
        const failedRooms = (res.results || []).filter(r => !r.ok);
        resultBody.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
            <div style="background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.25);border-radius:8px;padding:12px;text-align:center">
              <div style="font-size:22px;font-weight:700;color:#16a34a">${res.roomsReached ?? 0}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Chatroom berhasil</div>
            </div>
            <div style="background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.25);border-radius:8px;padding:12px;text-align:center">
              <div style="font-size:22px;font-weight:700;color:#dc2626">${failedRooms.length}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Chatroom gagal</div>
            </div>
            <div style="background:rgba(244,116,34,0.1);border:1px solid rgba(244,116,34,0.25);border-radius:8px;padding:12px;text-align:center">
              <div style="font-size:22px;font-weight:700;color:#F47422">${res.onlineUsers ?? 0}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Pengguna online</div>
            </div>
          </div>
          ${failedRooms.length > 0 ? `
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
            <strong>Chatroom yang gagal:</strong> ${failedRooms.map(r => esc(r.roomName)).join(', ')}
          </div>` : ''}
          <div style="font-size:12px;color:var(--text-muted);margin-top:8px">
            Mode: <strong>${esc(modeLabel)}</strong> &nbsp;·&nbsp; Pesan: "<em>${esc(message.length > 80 ? message.substring(0,80)+'…' : message)}</em>"
          </div>
          ${res.note ? `<div style="margin-top:10px;padding:8px 12px;background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.3);border-radius:6px;font-size:12px;color:#92400e">⚠️ ${esc(res.note)}</div>` : ''}`;
      },
      false
    );
  };
}

// ─── APK RELEASES ─────────────────────────────────────────────────────────────
let releasesData = [];
let trafficData   = null;

function convertDriveUrl(url) {
  if (!url) return url;
  // https://drive.google.com/file/d/FILE_ID/view...
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([^/?&#]+)/);
  if (fileMatch) return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
  // https://drive.google.com/open?id=FILE_ID
  const openMatch = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (openMatch) return `https://drive.google.com/uc?export=download&id=${openMatch[1]}`;
  // Already a direct uc download link — leave as-is
  return url;
}

async function renderReleases(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat rilis APK...</div>';
  const [data, traffic] = await Promise.all([api('/releases'), api('/releases/traffic')]);
  if (!data) return;
  releasesData = data.releases || [];
  trafficData  = traffic || null;
  drawReleasesPage(el);
}

function fmtFileSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function drawReleasesPage(el) {
  const activeRelease = releasesData.find(r => r.is_active);
  el.innerHTML = `
    <div style="max-width:900px">
      <!-- UPLOAD FORM -->
      <div class="card" style="margin-bottom:24px">
        <h2 style="margin-bottom:20px;font-size:17px;font-weight:700">📤 Upload Rilis APK Baru</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-muted)">Nama Versi *</label>
            <input id="rel-version-name" class="form-input" type="text" placeholder="Contoh: 1.2.3" />
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-muted)">Kode Versi *</label>
            <input id="rel-version-code" class="form-input" type="number" placeholder="Contoh: 42" />
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-muted)">Min Android API</label>
            <input id="rel-min-android" class="form-input" type="number" placeholder="7 (Android 7.0)" value="7" />
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-muted)">File APK</label>
            <input id="rel-file" class="form-input" type="file" accept=".apk" style="padding:6px" />
          </div>
          <div style="grid-column:span 2">
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-muted)">Atau URL Download Langsung (termasuk Google Drive)</label>
            <input id="rel-url" class="form-input" type="text" placeholder="https://drive.google.com/file/d/xxxx/view  atau  https://cdn.example.com/app.apk" oninput="previewDriveUrl(this)" />
            <div id="rel-url-preview" style="font-size:11px;color:#60a5fa;margin-top:4px;word-break:break-all"></div>
          </div>
          <div style="grid-column:span 2">
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-muted)">Changelog (opsional)</label>
            <textarea id="rel-changelog" class="form-input" rows="3" placeholder="Daftar perubahan di versi ini..." style="resize:vertical"></textarea>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:12px;align-items:center">
          <button class="btn btn-primary" id="rel-upload-btn" onclick="submitRelease()">
            <span id="rel-upload-label">📦 Upload & Aktifkan</span>
          </button>
          <span id="rel-upload-status" style="font-size:13px;color:var(--text-muted)"></span>
        </div>
        <div id="rel-progress-wrap" style="display:none;margin-top:12px">
          <div style="height:8px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden">
            <div id="rel-progress-bar" style="height:100%;width:0%;background:#60a5fa;border-radius:4px;transition:width 0.2s"></div>
          </div>
          <div id="rel-progress-pct" style="font-size:12px;color:#60a5fa;margin-top:4px">0%</div>
        </div>
        <div style="margin-top:10px;font-size:12px;color:var(--text-muted)">
          ⚠️ Mengunggah rilis baru akan otomatis menonaktifkan rilis yang sedang aktif.
        </div>
      </div>

      <!-- ACTIVE RELEASE -->
      ${activeRelease ? `
      <div class="card" style="margin-bottom:24px;border:1px solid rgba(100,200,100,0.3);background:rgba(20,60,20,0.3)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <div style="width:10px;height:10px;border-radius:50%;background:#4ade80"></div>
          <span style="font-size:15px;font-weight:700;color:#4ade80">Rilis Aktif</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">
          <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">Versi</div><div style="font-weight:700;font-size:16px">v${esc(String(activeRelease.version_name))}</div></div>
          <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">Build</div><div style="font-weight:600">${esc(String(activeRelease.version_code))}</div></div>
          <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">Ukuran</div><div style="font-weight:600">${fmtFileSize(activeRelease.file_size)}</div></div>
          <div><div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">Min Android</div><div style="font-weight:600">API ${esc(String(activeRelease.min_android || 7))}</div></div>
        </div>
        ${activeRelease.changelog ? `<div style="margin-top:12px;font-size:13px;color:var(--text-muted);border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;white-space:pre-line">${esc(activeRelease.changelog)}</div>` : ''}
        <div style="margin-top:12px">
          <a href="${esc(activeRelease.download_url)}" target="_blank" style="font-size:13px;color:#60a5fa;text-decoration:underline;word-break:break-all">${esc(activeRelease.download_url)}</a>
        </div>
      </div>
      ` : '<div class="card" style="margin-bottom:24px;color:var(--text-muted);text-align:center;padding:32px">Belum ada rilis APK aktif.</div>'}

      <!-- TRAFFIC DOWNLOAD -->
      <div class="card" style="margin-bottom:24px">
        <h2 style="margin-bottom:4px;font-size:17px;font-weight:700">📊 Trafik Download (30 Hari Terakhir)</h2>
        ${buildTrafficChart()}
      </div>

      <!-- RELEASE HISTORY -->
      <div class="card">
        <h2 style="margin-bottom:16px;font-size:17px;font-weight:700">📋 Riwayat Rilis</h2>
        ${releasesData.length === 0 ? '<div class="empty">Belum ada rilis.</div>' : `
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.1)">
              <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:600">Versi</th>
              <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:600">Build</th>
              <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:600">Ukuran</th>
              <th style="text-align:right;padding:8px 12px;color:var(--text-muted);font-weight:600">⬇ Download</th>
              <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:600">Status</th>
              <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:600">Tanggal</th>
              <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:600">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${releasesData.map(r => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05)">
              <td style="padding:10px 12px;font-weight:700">v${esc(String(r.version_name))}</td>
              <td style="padding:10px 12px;color:var(--text-muted)">${esc(String(r.version_code))}</td>
              <td style="padding:10px 12px;color:var(--text-muted)">${fmtFileSize(r.file_size)}</td>
              <td style="padding:10px 12px;text-align:right;font-weight:700;color:#60a5fa">${Number(r.download_count || 0).toLocaleString('id-ID')}</td>
              <td style="padding:10px 12px">
                <span style="display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:50px;font-size:11px;font-weight:700;${r.is_active ? 'background:rgba(74,222,128,0.15);color:#4ade80' : 'background:rgba(255,255,255,0.07);color:var(--text-muted)'}">
                  ${r.is_active ? '● Aktif' : '○ Tidak Aktif'}
                </span>
              </td>
              <td style="padding:10px 12px;color:var(--text-muted)">${new Date(r.created_at).toLocaleDateString('id-ID')}</td>
              <td style="padding:10px 12px">
                <div style="display:flex;gap:6px">
                  ${!r.is_active ? `<button class="btn btn-sm" onclick="activateRelease(${r.id})" style="font-size:11px;padding:4px 10px">Aktifkan</button>` : ''}
                  <a href="${esc(r.download_url)}" target="_blank" class="btn btn-sm" style="font-size:11px;padding:4px 10px;background:rgba(96,165,250,0.15);color:#60a5fa;text-decoration:none">Unduh</a>
                  <button class="btn btn-sm" onclick="deleteRelease(${r.id})" style="font-size:11px;padding:4px 10px;background:rgba(248,113,113,0.15);color:#f87171">Hapus</button>
                </div>
              </td>
            </tr>
            `).join('')}
          </tbody>
        </table>
        `}
      </div>
    </div>
  `;
}

function buildTrafficChart() {
  const daily = (trafficData && trafficData.daily) || [];
  const byRelease = (trafficData && trafficData.by_release) || [];

  const totalDl = byRelease.reduce((s, r) => s + Number(r.download_count || 0), 0);

  if (daily.length === 0) {
    return `
      <div style="margin-top:16px">
        <div style="display:flex;gap:24px;margin-bottom:20px;flex-wrap:wrap">
          <div>
            <div style="font-size:11px;color:var(--text-muted);font-weight:600;margin-bottom:4px">TOTAL DOWNLOAD</div>
            <div style="font-size:28px;font-weight:800;color:#60a5fa">${totalDl.toLocaleString('id-ID')}</div>
          </div>
        </div>
        <div style="color:var(--text-muted);font-size:13px;padding:24px;text-align:center;background:rgba(255,255,255,0.03);border-radius:12px">Belum ada data trafik download.</div>
      </div>`;
  }

  const counts = daily.map(d => Number(d.downloads));
  const max    = Math.max(...counts, 1);
  const W = 800, H = 100, PAD = 4;
  const barW = Math.max(4, Math.floor((W - PAD * (daily.length + 1)) / daily.length));
  const gap   = Math.floor((W - barW * daily.length) / (daily.length + 1));

  let bars = '';
  daily.forEach((d, i) => {
    const h = Math.max(3, Math.round((Number(d.downloads) / max) * H));
    const x = gap + i * (barW + gap);
    const y = H - h;
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="2" fill="#60a5fa" opacity="0.85">
      <title>${d.day}: ${Number(d.downloads).toLocaleString('id-ID')} download</title>
    </rect>`;
  });

  const firstDay = daily[0]?.day?.slice(5) || '';
  const lastDay  = daily[daily.length - 1]?.day?.slice(5) || '';

  const topReleasesHtml = byRelease.slice(0, 5).map(r =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
      <span style="color:var(--text-muted);font-size:12px">v${esc(String(r.version_name))}</span>
      <span style="font-weight:700;color:#60a5fa;font-size:13px">${Number(r.download_count||0).toLocaleString('id-ID')}</span>
    </div>`
  ).join('');

  return `
    <div style="margin-top:16px">
      <div style="display:flex;gap:32px;margin-bottom:20px;flex-wrap:wrap">
        <div>
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;margin-bottom:4px">TOTAL DOWNLOAD</div>
          <div style="font-size:28px;font-weight:800;color:#60a5fa">${totalDl.toLocaleString('id-ID')}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;margin-bottom:4px">HARI INI</div>
          <div style="font-size:28px;font-weight:800;color:#a78bfa">${Number(daily[daily.length-1]?.downloads||0).toLocaleString('id-ID')}</div>
        </div>
      </div>
      <div style="overflow:hidden;border-radius:10px;background:rgba(255,255,255,0.03);padding:16px">
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="80" preserveAspectRatio="none" style="display:block">${bars}</svg>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-top:4px;padding:0 4px">
          <span>${firstDay}</span><span>${lastDay}</span>
        </div>
      </div>
      ${byRelease.length > 0 ? `
      <div style="margin-top:16px">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:8px">DOWNLOAD PER VERSI</div>
        ${topReleasesHtml}
      </div>` : ''}
    </div>`;
}

function previewDriveUrl(input) {
  const preview = document.getElementById('rel-url-preview');
  if (!preview) return;
  const converted = convertDriveUrl(input.value.trim());
  if (converted && converted !== input.value.trim()) {
    preview.textContent = '→ Akan disimpan sebagai: ' + converted;
  } else {
    preview.textContent = '';
  }
}

async function submitRelease() {
  const versionName = document.getElementById('rel-version-name').value.trim();
  const versionCode = document.getElementById('rel-version-code').value.trim();
  const minAndroid  = document.getElementById('rel-min-android').value.trim();
  const changelog   = document.getElementById('rel-changelog').value.trim();
  const rawUrl      = document.getElementById('rel-url').value.trim();
  const urlInput    = convertDriveUrl(rawUrl);
  const fileInput   = document.getElementById('rel-file');
  const file        = fileInput.files[0];

  if (!versionName || !versionCode) {
    toast('Nama versi dan kode versi wajib diisi', 'error'); return;
  }
  if (!file && !urlInput) {
    toast('Pilih file APK atau masukkan URL download', 'error'); return;
  }

  const btn         = document.getElementById('rel-upload-btn');
  const label       = document.getElementById('rel-upload-label');
  const status      = document.getElementById('rel-upload-status');
  const progWrap    = document.getElementById('rel-progress-wrap');
  const progBar     = document.getElementById('rel-progress-bar');
  const progPct     = document.getElementById('rel-progress-pct');

  btn.disabled = true;
  label.textContent = '⏳ Mengunggah...';
  status.textContent = '';

  const resetUI = () => {
    btn.disabled = false;
    label.textContent = '📦 Upload & Aktifkan';
    status.textContent = '';
    if (progWrap) { progWrap.style.display = 'none'; progBar.style.width = '0%'; progPct.textContent = '0%'; }
  };

  try {
    let resJson;

    if (file) {
      status.textContent = 'Mengunggah file ke server...';
      if (progWrap) progWrap.style.display = 'block';

      const fd = new FormData();
      fd.append('apk_file', file);
      fd.append('version_name', versionName);
      fd.append('version_code', versionCode);
      fd.append('min_android', minAndroid || '7');
      if (changelog) fd.append('changelog', changelog);
      if (urlInput)  fd.append('download_url', urlInput);

      resJson = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/releases');
        if (state.token) xhr.setRequestHeader('Authorization', 'Bearer ' + state.token);

        xhr.upload.onprogress = e => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            progBar.style.width = pct + '%';
            progPct.textContent = pct + '%';
            status.textContent = `Mengunggah... ${pct}%`;
          }
        };

        xhr.onload = () => {
          if (xhr.status === 401) { logout(); reject(new Error('Unauthorized')); return; }
          try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('Respons tidak valid')); }
        };
        xhr.onerror = () => reject(new Error('Koneksi gagal'));
        xhr.ontimeout = () => reject(new Error('Upload timeout'));
        xhr.timeout = 10 * 60 * 1000;
        xhr.send(fd);
      });
    } else {
      status.textContent = 'Menyimpan...';
      resJson = await api('/releases', {
        method: 'POST',
        body: {
          version_name: versionName,
          version_code: versionCode,
          min_android:  minAndroid || '7',
          changelog:    changelog || null,
          download_url: urlInput,
        },
      });
    }

    resetUI();

    if (resJson && resJson.release) {
      toast(resJson.message || 'Rilis APK berhasil disimpan', 'success');
      document.getElementById('rel-version-name').value = '';
      document.getElementById('rel-version-code').value = '';
      document.getElementById('rel-changelog').value = '';
      document.getElementById('rel-url').value = '';
      fileInput.value = '';
      const data = await api('/releases');
      if (data) { releasesData = data.releases || []; drawReleasesPage(document.getElementById('content')); }
    } else {
      toast((resJson && resJson.error) || 'Gagal menyimpan rilis', 'error');
    }
  } catch (err) {
    resetUI();
    toast('Upload gagal: ' + err.message, 'error');
  }
}

async function activateRelease(id) {
  const res = await api(`/releases/${id}/activate`, { method: 'PATCH' });
  if (res && res.release) {
    toast(res.message || 'Rilis diaktifkan', 'success');
    const data = await api('/releases');
    if (data) { releasesData = data.releases || []; drawReleasesPage(document.getElementById('content')); }
  }
}

async function deleteRelease(id) {
  confirm('Hapus Rilis APK', 'Hapus rilis APK ini? File terkait juga akan dihapus.', async () => {
    const res = await api(`/releases/${id}`, { method: 'DELETE' });
    if (res && !res.error) {
      toast(res.message || 'Rilis dihapus', 'success');
      releasesData = releasesData.filter(r => String(r.id) !== String(id));
      drawReleasesPage(document.getElementById('content'));
    } else if (res && res.error) {
      toast(res.error || 'Gagal menghapus rilis', 'error');
    }
  });
}

// ─── CREDIT HISTORY PANEL ────────────────────────────────────────────────────
let _historyUsername = '';
let _historyPage = 1;
const HISTORY_LIMIT = 40;

function openHistoryPanel() {
  document.getElementById('history-backdrop').classList.add('open');
  document.getElementById('history-panel').classList.add('open');
}
window.closeHistoryPanel = function() {
  document.getElementById('history-backdrop').classList.remove('open');
  document.getElementById('history-panel').classList.remove('open');
};

function formatHistoryItem(t) {
  const desc = t.description || '';
  const type = parseInt(t.type);
  const amount = parseFloat(t.amount);
  const absAmt = Math.round(Math.abs(amount));
  const cur = t.currency || 'IDR';
  const isIn = amount >= 0;
  const dir = isIn ? 'in' : 'out';
  const sign = isIn ? '+' : '-';
  let icon = '📋';
  let label = '';

  if (type === 33) {                        // GAME_BET
    const game = desc.replace('Game bet: ', '').replace('Game bet:', '').trim();
    label = `Game bet (${game})`;
    icon = '🎮';
  } else if (type === 34) {                 // GAME_REWARD / WIN
    const game = desc.replace('Game win: ', '').replace('Game win:', '').trim();
    label = `Game win (${game})`;
    icon = '🏆';
  } else if (type === 10) {                 // GAME_REFUND
    const game = desc.replace('Game refund: ', '').replace('Game refund:', '').trim();
    label = `Game out / refund (${game})`;
    icon = '↩️';
  } else if (type === 14) {                 // TRANSFER
    if (desc.startsWith('Transfer to ')) {
      const to = desc.slice('Transfer to '.length);
      label = `Transfer to ${to}`;
      icon = '➡️';
    } else if (desc.startsWith('Received from ')) {
      const from = desc.slice('Received from '.length);
      label = `Received from ${from}`;
      icon = '⬅️';
    } else if (desc.toLowerCase().includes('fee')) {
      label = desc;
      icon = '💸';
    } else {
      label = desc || 'Transfer';
      icon = '↔️';
    }
  } else if (type === 41) {                 // VIRTUAL_GIFT_PURCHASE (sent)
    const m = desc.match(/Gift "(.+)" dikirim ke @(.+)/);
    if (m) {
      label = `Send gift to ${m[2]} — ${m[1]}`;
    } else if (desc.startsWith('Beli gift:')) {
      label = desc;
    } else {
      label = desc || 'Virtual Gift';
    }
    icon = '🎁';
  } else if (type === 9) {                  // BONUS / TOP-UP
    label = desc || 'Bonus / Top-up';
    icon = '🎉';
  } else {
    label = desc || (TX_TYPES[type] || `Tipe ${type}`);
    icon = '📋';
  }

  const balance = t.running_balance != null ? `Saldo: ${cur} ${Math.round(parseFloat(t.running_balance)).toLocaleString('id-ID')}` : '';
  return { icon, label, dir, sign, absAmt, cur, isIn, balance, date: t.created_at };
}

function formatGiftReceivedItem(g) {
  const giftName = g.gift_name || 'Gift';
  const price = g.gift_price != null ? Math.round(parseFloat(g.gift_price)) : 0;
  const cur = g.gift_currency || 'IDR';
  const sender = g.sender || '?';
  const label = `Received gift from ${sender} — ${giftName}`;
  return { icon: '💝', label, dir: 'in', sign: '', absAmt: price, cur, isIn: true, balance: '', date: g.created_at };
}

function renderHistoryItems(items) {
  if (!items.length) return '<div class="empty">Tidak ada transaksi</div>';
  return items.map(item => `
    <div class="history-item">
      <div class="history-icon ${item.dir}">${item.icon}</div>
      <div class="history-label">
        <div class="hl-main">${esc(item.label)}</div>
        <div class="hl-sub">${fmtDateTime(item.date)}${item.balance ? ' · ' + esc(item.balance) : ''}</div>
      </div>
      <div class="history-amount ${item.dir}">
        ${item.absAmt > 0 ? item.sign + ' ' + item.cur + ' ' + item.absAmt.toLocaleString('id-ID') : '—'}
      </div>
    </div>`).join('');
}

window.showUserHistory = async function(username, page = 1) {
  _historyUsername = username;
  _historyPage = page;
  document.getElementById('history-panel-title').textContent = `Riwayat Kredit — @${username}`;
  document.getElementById('history-panel-body').innerHTML = '<div class="loading"><div class="spinner"></div>Memuat...</div>';
  document.getElementById('history-page-info').textContent = '';
  document.getElementById('history-prev-btn').style.display = 'none';
  document.getElementById('history-next-btn').style.display = 'none';
  openHistoryPanel();

  const data = await api(`/credits/user-history/${encodeURIComponent(username)}?page=${page}&limit=${HISTORY_LIMIT}`);
  if (!data) { document.getElementById('history-panel-body').innerHTML = '<div class="empty">Gagal memuat data</div>'; return; }

  // Format transactions
  const txItems = (data.transactions || []).map(formatHistoryItem);

  // Merge gifts received on page 1 (they are a separate static list)
  let allItems = [...txItems];
  if (page === 1 && data.giftsReceived && data.giftsReceived.length > 0) {
    const giftItems = data.giftsReceived.map(formatGiftReceivedItem);
    // Merge & sort by date descending
    allItems = [...txItems, ...giftItems].sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  document.getElementById('history-panel-body').innerHTML = renderHistoryItems(allItems);

  const total = data.total || 0;
  const totalPages = Math.ceil(total / HISTORY_LIMIT);
  document.getElementById('history-page-info').textContent = `${total} transaksi · Hal. ${page}/${Math.max(1, totalPages)}`;

  const prevBtn = document.getElementById('history-prev-btn');
  const nextBtn = document.getElementById('history-next-btn');
  prevBtn.style.display = page > 1 ? '' : 'none';
  nextBtn.style.display = page < totalPages ? '' : 'none';
  prevBtn.onclick = () => showUserHistory(_historyUsername, _historyPage - 1);
  nextBtn.onclick = () => showUserHistory(_historyUsername, _historyPage + 1);
};

// ─── IP CHECK + BULK SUSPEND ──────────────────────────────────────────────────
window.checkUserIp = async function(username) {
  // Build / reuse a dedicated overlay so we don't fight the confirm modal.
  let overlay = document.getElementById('ip-check-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ip-check-modal';
    overlay.className = 'modal';
    overlay.innerHTML = `
      <div class="modal-content" style="max-width:760px;width:92%">
        <div class="modal-header">
          <div class="modal-title" id="ip-check-title">Cek IP</div>
          <button class="modal-close" onclick="document.getElementById('ip-check-modal').classList.remove('open')">×</button>
        </div>
        <div class="modal-body" id="ip-check-body" style="max-height:60vh;overflow:auto"></div>
        <div class="modal-footer" id="ip-check-footer" style="display:flex;gap:8px;justify-content:flex-end;padding-top:12px"></div>
      </div>`;
    document.body.appendChild(overlay);
  }
  document.getElementById('ip-check-title').textContent = `Cek IP — @${username}`;
  document.getElementById('ip-check-body').innerHTML = '<div class="loading"><div class="spinner"></div>Memuat...</div>';
  document.getElementById('ip-check-footer').innerHTML = '';
  overlay.classList.add('open');

  const data = await api(`/users/${encodeURIComponent(username)}/ip-related`);
  if (!data) {
    document.getElementById('ip-check-body').innerHTML = '<div class="empty">Gagal memuat data</div>';
    return;
  }

  const ipsHtml = (data.ips || []).length === 0
    ? '<div class="empty" style="padding:8px 0">Tidak ada catatan IP untuk user ini.</div>'
    : `<div style="margin-bottom:14px">
         <div style="font-size:13px;color:var(--text-muted);margin-bottom:6px">IP yang pernah dipakai user ini:</div>
         ${(data.ips || []).map(r => `<span class="badge" style="margin:2px 4px 2px 0">${esc(r.ip_address)}</span>`).join('')}
       </div>`;

  const related = data.related || [];
  const relatedHtml = related.length === 0
    ? '<div class="empty" style="padding:8px 0">Tidak ada akun lain yang berbagi IP.</div>'
    : `<div class="table-wrap">
         <table>
           <thead>
             <tr>
               <th style="width:34px"><input type="checkbox" id="ip-check-all" /></th>
               <th>Username</th>
               <th>IP yang dibagi</th>
               <th>Status</th>
               <th>Terakhir</th>
             </tr>
           </thead>
           <tbody>
             ${related.map(r => {
               const userId = r.user_id;
               if (!userId) return '';
               const checked = !r.is_admin && !r.is_suspended ? 'checked' : '';
               const disabled = r.is_admin ? 'disabled' : '';
               return `<tr>
                 <td><input type="checkbox" class="ip-check-row" value="${userId}" data-username="${esc(r.username)}" ${checked} ${disabled} /></td>
                 <td><strong>${esc(r.username)}</strong>${r.is_admin ? ' <span class="badge purple">Admin</span>' : ''}<br><small style="color:var(--text-muted)">${esc(r.email || '')}</small></td>
                 <td>${(r.shared_ips || []).map(ip => `<span class="badge" style="margin:1px 2px">${esc(ip)}</span>`).join('')}</td>
                 <td><span class="badge ${r.is_suspended ? 'red' : 'green'}">${r.is_suspended ? 'Suspended' : 'Aktif'}</span></td>
                 <td>${fmtDateTime(r.last_seen)}</td>
               </tr>`;
             }).join('')}
           </tbody>
         </table>
       </div>`;

  document.getElementById('ip-check-body').innerHTML = ipsHtml + relatedHtml;

  if (related.length > 0) {
    document.getElementById('ip-check-footer').innerHTML = `
      <button class="btn btn-outline" onclick="document.getElementById('ip-check-modal').classList.remove('open')">Tutup</button>
      <button class="btn btn-warning" id="ip-bulk-disconnect-btn" title="Paksa keluar dari semua chatroom + blokir join 1 jam (broadcast 'has left')">Disconnect &amp; Blokir 1 Jam</button>
      <button class="btn btn-danger" id="ip-bulk-suspend-btn">Suspend Semua Terpilih</button>
    `;
    const checkAll = document.getElementById('ip-check-all');
    if (checkAll) {
      checkAll.onchange = (e) => {
        document.querySelectorAll('.ip-check-row').forEach((cb) => {
          if (!cb.disabled) cb.checked = e.target.checked;
        });
      };
    }
    document.getElementById('ip-bulk-disconnect-btn').onclick = async () => {
      const checked = Array.from(document.querySelectorAll('.ip-check-row:checked'));
      const usernames = checked.map(cb => cb.getAttribute('data-username')).filter(Boolean);
      if (usernames.length === 0) { alert('Pilih minimal 1 akun untuk di-disconnect.'); return; }
      confirm(
        'Disconnect Massal',
        `Yakin paksa keluar ${usernames.length} akun yang berbagi IP dengan @${username} dari semua chatroom & blokir join ulang selama 1 jam?\n\nBroadcast akan tampil sebagai "has left" biasa.`,
        async () => {
          const res = await api('/users/disconnect-by-ip', { method: 'POST', body: { usernames, cooldownMs: 60 * 60 * 1000 } });
          if (res && res.success) {
            const ok = (res.upstream?.results || []).filter(r => r.ok).length;
            const skip = (res.upstream?.results || []).filter(r => !r.ok).length;
            alert(`Disconnect selesai. Berhasil: ${ok}, dilewati/gagal: ${skip}. Blokir join: 1 jam.`);
            document.getElementById('ip-check-modal').classList.remove('open');
          }
        },
        true,
      );
    };
    document.getElementById('ip-bulk-suspend-btn').onclick = async () => {
      const ids = Array.from(document.querySelectorAll('.ip-check-row:checked')).map(cb => cb.value);
      if (ids.length === 0) { alert('Pilih minimal 1 akun untuk di-suspend.'); return; }
      confirm(
        'Suspend Massal',
        `Yakin suspend ${ids.length} akun yang berbagi IP dengan @${username}?`,
        async () => {
          const res = await api('/users/suspend-bulk', { method: 'POST', body: { userIds: ids, isSuspended: true } });
          if (res && res.success) {
            alert(`Berhasil men-suspend ${res.affected} akun.`);
            document.getElementById('ip-check-modal').classList.remove('open');
            // Refresh user list view if open
            const root = document.getElementById('page-content');
            if (root && state.currentPage === 'users') renderUsers(root, 1, '');
          }
        },
        true,
      );
    };
  } else {
    document.getElementById('ip-check-footer').innerHTML = `
      <button class="btn btn-outline" onclick="document.getElementById('ip-check-modal').classList.remove('open')">Tutup</button>
    `;
  }
};

// ─── PARTY LIVE ──────────────────────────────────────────────────────────────
let partyGiftsData = [];
let partyGiftFilter = 'all';
let partyGiftContentEl = null;
let currentPartyGiftId = null;
let partyActiveTab = 'gifts';
let partyStickersData = [];
let currentPartyStickerEditId = null;
let _stickerPendingLottieText = null;

async function renderPartyLive(el) {
  partyGiftContentEl = el;
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat data Party Live...</div>';
  await loadAndDrawPartyLive(el);
}

async function loadAndDrawPartyLive(el) {
  const [giftsRes, statsRes, stickersRes] = await Promise.all([
    api('/party/gifts'),
    api('/party/stats'),
    api('/party/stickers'),
  ]);
  partyGiftsData = giftsRes?.gifts || [];
  partyStickersData = stickersRes?.stickers || [];
  const stats = statsRes || {};
  drawPartyLivePage(el, stats);
}

async function drawPartyLivePage(el, stats = {}) {
  el.innerHTML = `
  <!-- Tab Bar -->
  <div class="store-tab-bar" style="margin-bottom:20px">
    <button class="store-tab${partyActiveTab==='gifts'?' active':''}" onclick="switchPartyTab('gifts')">🎁 Gift Party</button>
    <button class="store-tab${partyActiveTab==='stickers'?' active':''}" onclick="switchPartyTab('stickers')">🎭 Stiker</button>
    <button class="store-tab${partyActiveTab==='rooms'?' active':''}" onclick="switchPartyTab('rooms')">🎤 Party Rooms</button>
    <button class="store-tab${partyActiveTab==='stats'?' active':''}" onclick="switchPartyTab('stats')">📊 Statistik</button>
    <button class="store-tab${partyActiveTab==='livekit'?' active':''}" onclick="switchPartyTab('livekit')">⚡ LiveKit</button>
  </div>
  <div id="party-tab-content"></div>

  `;

  // Wire up sticker lottie file input (done once at page level)
  const psmLottieFile = document.getElementById('psm-lottie-file');
  if (psmLottieFile) {
    psmLottieFile.value = '';
    psmLottieFile.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast('File terlalu besar. Maks 5MB.', 'error'); return; }
      const text = await file.text();
      try { JSON.parse(text); } catch { toast('File bukan JSON yang valid.', 'error'); psmLottieFile.value = ''; return; }
      _stickerPendingLottieText = text;
      document.getElementById('psm-lottie-status').innerHTML = `✅ <strong>${esc(file.name)}</strong> — siap diupload`;
    };
  }

  window.switchPartyTab = async (tab) => {
    partyActiveTab = tab;
    const tc = document.getElementById('party-tab-content');
    if (tab === 'gifts') drawPartyGiftsTab(tc);
    else if (tab === 'stickers') await drawPartyStickersTab(tc);
    else if (tab === 'rooms') await drawPartyRoomsTab(tc);
    else if (tab === 'stats') drawPartyStatsTab(tc, stats);
    else if (tab === 'livekit') await drawPartyLivekitTab(tc);
    const labelMap = { gifts: 'Gift', stickers: 'Stiker', rooms: 'Rooms', stats: 'Statistik', livekit: 'LiveKit' };
    document.querySelectorAll('.store-tab').forEach(b => b.classList.toggle('active', b.textContent.includes(labelMap[tab] || tab)));
  };

  // Init active tab
  const tc = document.getElementById('party-tab-content');
  if (partyActiveTab === 'gifts') drawPartyGiftsTab(tc);
  else if (partyActiveTab === 'stickers') await drawPartyStickersTab(tc);
  else if (partyActiveTab === 'rooms') await drawPartyRoomsTab(tc);
  else if (partyActiveTab === 'livekit') await drawPartyLivekitTab(tc);
  else drawPartyStatsTab(tc, stats);
}

// ── Gift Party Tab ────────────────────────────────────────────────────────────
function drawPartyGiftsTab(tc) {
  const cats = ['all', ...new Set(partyGiftsData.map(g => g.category || 'Populer'))];
  const filtered = partyGiftFilter === 'all' ? partyGiftsData : partyGiftsData.filter(g => g.category === partyGiftFilter);

  tc.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
    <div>
      <h2 style="font-size:16px;font-weight:600">Gift Party Voice</h2>
      <p style="font-size:13px;color:var(--text-muted)">${partyGiftsData.length} gift terdaftar · support gambar PNG/WEBP/GIF + animasi Lottie</p>
    </div>
    <button class="btn btn-primary" onclick="openPartyGiftModal(null)">＋ Tambah Gift</button>
  </div>
  <div class="cat-tabs">
    ${cats.map(c => `
      <div class="cat-tab${partyGiftFilter===c?' active':''}" onclick="filterPartyGifts('${c}')">
        ${c === 'all' ? `Semua (${partyGiftsData.length})` : `${esc(c)} (${partyGiftsData.filter(g=>g.category===c).length})`}
      </div>`).join('')}
  </div>
  <div class="gift-grid" id="party-gift-grid">
    ${filtered.length === 0
      ? '<div class="empty" style="grid-column:1/-1">Belum ada gift party. Klik "+ Tambah Gift" untuk mulai.</div>'
      : filtered.map(g => renderPartyGiftCard(g)).join('')}
  </div>`;

  window.filterPartyGifts = (cat) => { partyGiftFilter = cat; drawPartyGiftsTab(document.getElementById('party-tab-content')); };

  // Init Lottie previews after DOM is ready
  requestAnimationFrame(() => initPartyGiftLotties());
}

function renderPartyGiftCard(g) {
  const hasVideo  = !!g.video_url;
  const hasLottie = !!g.lottie_url;
  const hasImg    = !!g.image_url;

  // ── Preview area: video > lottie > image > emoji ──────────────────────────
  let previewEl;
  let wrapStyle = 'width:100px;height:100px;margin:0 auto 10px;border-radius:10px;background:var(--bg);display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--border);';

  if (hasVideo) {
    previewEl = `
      <video
        src="${esc(g.video_url)}"
        autoplay muted loop playsinline
        style="width:100%;height:100%;object-fit:cover;"
        onerror="this.style.display='none'"
      ></video>`;
  } else if (hasLottie) {
    previewEl = `<div class="lottie-preview" data-url="${esc(g.lottie_url)}" style="width:100%;height:100%"></div>`;
  } else if (hasImg) {
    previewEl = `
      <img src="${esc(g.image_url)}?t=${Date.now()}" alt="${esc(g.name)}"
        style="width:100%;height:100%;object-fit:contain;"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
      <span style="display:none;font-size:38px">${esc(g.emoji||'🎁')}</span>`;
  } else {
    previewEl = `<span style="font-size:38px">${esc(g.emoji||'🎁')}</span>`;
    wrapStyle += 'background:transparent;border:none;';
  }

  // ── Badge row ─────────────────────────────────────────────────────────────
  let badges = '';
  if (hasVideo)       badges += `<span style="font-size:10px;color:#0ea5e9;font-weight:600;background:#e0f2fe;padding:2px 6px;border-radius:4px">🎬 WebM</span>`;
  if (hasLottie)      badges += `<span style="font-size:10px;color:#7c3aed;font-weight:600;background:#ede9fe;padding:2px 6px;border-radius:4px">✨ Lottie</span>`;
  if (hasImg)         badges += `<span style="font-size:10px;color:#16a34a;font-weight:600;background:#dcfce7;padding:2px 6px;border-radius:4px">🖼 Gambar</span>`;
  if (!hasVideo && !hasLottie && !hasImg) badges += `<span style="font-size:10px;color:var(--text-muted)">Belum ada media</span>`;

  return `
  <div class="gift-card" id="pgcard-${g.id}">
    ${g.is_premium ? '<div class="vip-ribbon">PREMIUM</div>' : ''}
    <div style="${wrapStyle}">${previewEl}</div>
    <div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap;margin-bottom:6px">${badges}</div>
    <div class="gift-name">${esc(g.name)}</div>
    <div class="gift-price">🪙 ${fmtFloat(g.price)}</div>
    <div style="margin-bottom:6px">
      <span class="badge ${g.is_active ? 'green' : 'gray'}" style="font-size:10px">${g.is_active ? 'Aktif' : 'Nonaktif'}</span>
      <span class="badge blue" style="font-size:10px">${esc(g.category||'Populer')}</span>
    </div>
    <div class="gift-actions">
      <button class="btn btn-sm btn-outline" onclick="openPartyGiftModal('${g.id}')">✏️ Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deletePartyGift('${g.id}','${esc(g.name)}')">🗑️</button>
    </div>
  </div>`;
}

function initPartyGiftLotties() {
  if (typeof lottie === 'undefined') return;
  document.querySelectorAll('#party-gift-grid .lottie-preview').forEach(el => {
    if (el.dataset.initialized) return;
    el.dataset.initialized = '1';
    lottie.loadAnimation({
      container: el,
      renderer:  'svg',
      loop:      true,
      autoplay:  true,
      path:      el.dataset.url,
    });
  });
}

// ── Party Rooms Tab ───────────────────────────────────────────────────────────
async function drawPartyRoomsTab(tc) {
  tc.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat rooms...</div>';
  const data = await api('/party/rooms');
  const rooms = data?.rooms || [];
  tc.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
    <div>
      <h2 style="font-size:16px;font-weight:600">Party Rooms Aktif</h2>
      <p style="font-size:13px;color:var(--text-muted)">${rooms.length} room ditemukan</p>
    </div>
    <button class="btn btn-outline btn-sm" onclick="refreshPartyRooms()">↻ Refresh</button>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Nama Room</th><th>Kreator</th><th>Seats</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>
      <tbody>
        ${rooms.length === 0
          ? `<tr><td colspan="6"><div class="empty">Tidak ada room party aktif</div></td></tr>`
          : rooms.map(r => `
          <tr>
            <td><strong>${esc(r.name)}</strong><br><small style="color:var(--text-muted)">${esc(r.description||'')}</small></td>
            <td>${esc(r.creator_username||'-')}</td>
            <td>${r.occupied_seats||0}/${r.max_seats||8}</td>
            <td><span class="badge ${r.is_active?'green':'gray'}">${r.is_active?'Aktif':'Nonaktif'}</span></td>
            <td>${fmtDateTime(r.created_at)}</td>
            <td>
              <button class="btn btn-sm btn-danger" data-rid="${esc(r.id)}" data-rname="${esc(r.name)}" onclick="deletePartyRoom(this.dataset.rid,this.dataset.rname)">🗑️ Hapus</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>`;

  window.refreshPartyRooms = () => drawPartyRoomsTab(document.getElementById('party-tab-content'));
  window.deletePartyRoom = (id, title) => {
    confirm('Hapus Party Room', `Yakin hapus room "${title}"? Semua seat akan dihapus.`, async () => {
      const res = await api(`/party/rooms/${id}`, { method: 'DELETE' });
      if (res?.success) { toast('Room berhasil dihapus', 'success'); refreshPartyRooms(); }
      else toast(res?.error || 'Gagal hapus room', 'error');
    });
  };
}

// ── LiveKit Status Tab ────────────────────────────────────────────────────────
async function drawPartyLivekitTab(tc) {
  tc.innerHTML = '<div class="loading"><div class="spinner"></div>Mengecek status LiveKit...</div>';
  const data = await api('/party/livekit-status');
  if (!data) {
    tc.innerHTML = '<div class="empty">Gagal menghubungi backend. Pastikan server berjalan.</div>';
    return;
  }

  const active = data.active || data.activeProvider || 'unknown';
  const mode   = data.mode || 'auto';
  const cloud  = data.cloud || {};
  const self   = data.self || {};

  function providerCard(id, label, icon, configured, url, isActive) {
    const borderColor = isActive ? 'var(--primary)' : 'var(--border)';
    const badgeHtml   = isActive
      ? `<span class="badge green" style="margin-left:8px">● Aktif</span>`
      : `<span class="badge gray"  style="margin-left:8px">○ Standby</span>`;
    const configBadge = configured
      ? `<span class="badge green">✓ Terkonfigurasi</span>`
      : `<span class="badge gray">✗ Belum dikonfigurasi</span>`;
    return `
    <div style="border:2px solid ${borderColor};border-radius:12px;padding:20px;flex:1;min-width:260px;background:var(--bg-card);transition:border-color .2s">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <span style="font-size:24px">${icon}</span>
        <span style="font-size:16px;font-weight:600">${label}</span>
        ${badgeHtml}
      </div>
      <div style="margin-bottom:10px">${configBadge}</div>
      ${url ? `<div style="font-size:12px;color:var(--text-muted);word-break:break-all;margin-bottom:14px">🔗 ${esc(url)}</div>` : '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">URL belum diset</div>'}
      ${configured && !isActive ? `<button class="btn btn-sm btn-primary" onclick="livekitSwitch('${id}')">⚡ Pakai ${label}</button>` : ''}
      ${isActive ? `<div style="font-size:12px;color:var(--success,#22c55e);font-weight:500">Provider ini sedang digunakan semua user</div>` : ''}
    </div>`;
  }

  const modeLabels = { auto: '🔄 Auto', cloud: '☁️ Cloud', selfhosted: '🖥️ Self-hosted' };

  tc.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
    <div>
      <h2 style="font-size:16px;font-weight:600">Status LiveKit</h2>
      <p style="font-size:13px;color:var(--text-muted)">Mode config: <strong>${modeLabels[mode] || mode}</strong> &nbsp;·&nbsp; Provider aktif: <strong>${active === 'cloud' ? '☁️ Cloud' : '🖥️ Self-hosted'}</strong></p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="drawPartyLivekitTab(document.getElementById('party-tab-content'))">↻ Refresh</button>
      <button class="btn btn-sm ${mode==='auto'?'btn-primary':'btn-outline'}" onclick="livekitSwitch('auto')">🔄 Auto</button>
    </div>
  </div>

  <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px">
    ${providerCard('cloud',      '☁️ LiveKit Cloud',      '☁️', cloud.configured, cloud.url, active === 'cloud')}
    ${providerCard('selfhosted', '🖥️ Self-hosted (Docker)', '🖥️', self.configured,  self.url,  active === 'selfhosted')}
  </div>

  <div class="card" style="padding:16px">
    <div class="card-title" style="margin-bottom:10px">Panduan Switch Provider</div>
    <div style="font-size:13px;color:var(--text-muted);line-height:1.7">
      <p>• <strong>Auto</strong>: Otomatis pakai Cloud jika credentials tersedia, fallback ke Self-hosted.</p>
      <p>• <strong>Cloud</strong>: Paksa pakai LiveKit Cloud. Butuh <code>LIVEKIT_CLOUD_*</code> di .env</p>
      <p>• <strong>Self-hosted</strong>: Paksa pakai server Docker. Butuh <code>LIVEKIT_URL</code>, <code>LIVEKIT_API_KEY</code>, <code>LIVEKIT_API_SECRET</code> di .env</p>
      <p style="margin-top:8px;color:var(--warning,#f59e0b)">⚠️ Switch provider langsung aktif tanpa restart server. Token yang sudah diissue tetap valid sampai expire (1 jam).</p>
    </div>
  </div>`;

  window.livekitSwitch = async (targetMode) => {
    const modeLabel = { auto: 'Auto', cloud: 'Cloud', selfhosted: 'Self-hosted' }[targetMode] || targetMode;
    const res = await api('/party/livekit-switch', { method: 'POST', body: { mode: targetMode } });
    if (res?.ok) {
      toast(`LiveKit provider berhasil switch ke ${modeLabel}`, 'success');
      await drawPartyLivekitTab(tc);
    } else {
      toast(res?.error || 'Gagal switch provider', 'error');
    }
  };
}

// ── Stats Tab ─────────────────────────────────────────────────────────────────
function drawPartyStatsTab(tc, stats) {
  const cats = stats.categories || [];
  const maxCat = Math.max(...cats.map(c => parseInt(c.count)), 1);
  tc.innerHTML = `
  <div class="stats-grid">
    <div class="stat-card purple"><div class="stat-label">Total Gift Party</div><div class="stat-value">${stats.totalGifts||0}</div></div>
    <div class="stat-card green"><div class="stat-label">Gift Aktif</div><div class="stat-value">${stats.activeGifts||0}</div></div>
    <div class="stat-card orange"><div class="stat-label">Gift Premium</div><div class="stat-value">${stats.premiumGifts||0}</div></div>
    <div class="stat-card blue"><div class="stat-label">Total Rooms</div><div class="stat-value">${stats.totalRooms||0}</div></div>
    <div class="stat-card green"><div class="stat-label">Rooms Aktif</div><div class="stat-value">${stats.activeRooms||0}</div></div>
  </div>
  ${cats.length > 0 ? `
  <div class="card">
    <div class="card-title">Gift Per Kategori</div>
    <div class="chart-bar-wrap">
      ${cats.map(c => `
      <div class="chart-bar-row">
        <div class="chart-bar-label">${esc(c.category||'?')}</div>
        <div class="chart-bar-bg"><div class="chart-bar-fill" style="width:${(parseInt(c.count)/maxCat*100).toFixed(1)}%"></div></div>
        <div class="chart-bar-val">${c.count}</div>
      </div>`).join('')}
    </div>
  </div>` : ''}`;
}

// ── Party Gift Modal ──────────────────────────────────────────────────────────
window.openPartyGiftModal = async (giftId) => {
  currentPartyGiftId = giftId;
  document.getElementById('pgm-title').textContent = giftId ? 'Edit Gift Party' : 'Tambah Gift Party';

  // Reset form
  document.getElementById('pgm-name').value = '';
  document.getElementById('pgm-emoji').value = '';
  document.getElementById('pgm-price').value = '';
  document.getElementById('pgm-category').value = 'Populer';
  document.getElementById('pgm-sort').value = '99';
  document.getElementById('pgm-premium').checked = false;
  document.getElementById('pgm-active').checked = true;
  document.getElementById('pgm-img-preview').innerHTML = '<span class="preview-emoji" id="pgm-img-emoji">🎁</span>';
  document.getElementById('pgm-del-img-btn').style.display = 'none';
  document.getElementById('pgm-del-lottie-btn').style.display = 'none';
  document.getElementById('pgm-del-video-btn').style.display = 'none';
  document.getElementById('pgm-img-progress').style.display = 'none';
  document.getElementById('pgm-lottie-progress').style.display = 'none';
  document.getElementById('pgm-video-progress').style.display = 'none';
  // Reset lottie preview — re-inject the spans so they always exist in DOM
  document.getElementById('pgm-lottie-preview').innerHTML =
    '<span id="pgm-lottie-status-icon" style="font-size:36px">📄</span>' +
    '<span id="pgm-lottie-status-text" style="font-size:12px;color:var(--text-muted)">Belum ada Lottie</span>';
  // Reset video preview — re-inject the spans so they always exist in DOM
  document.getElementById('pgm-video-preview').innerHTML =
    '<span id="pgm-video-status-icon" style="font-size:36px">🎬</span>' +
    '<span id="pgm-video-status-text" style="font-size:12px;color:var(--text-muted)">Belum ada video</span>';

  if (giftId) {
    const g = partyGiftsData.find(x => String(x.id) === String(giftId));
    if (g) {
      document.getElementById('pgm-name').value = g.name || '';
      document.getElementById('pgm-emoji').value = g.emoji || '';
      document.getElementById('pgm-price').value = g.price || '';
      document.getElementById('pgm-category').value = g.category || 'Populer';
      document.getElementById('pgm-sort').value = g.sort_order || 99;
      document.getElementById('pgm-premium').checked = !!g.is_premium;
      document.getElementById('pgm-active').checked = g.is_active !== false;
      if (g.image_url) {
        document.getElementById('pgm-img-preview').innerHTML = `<img src="${esc(g.image_url)}" style="width:100%;height:100%;object-fit:contain" />`;
        document.getElementById('pgm-del-img-btn').style.display = '';
      }
      if (g.lottie_url) {
        document.getElementById('pgm-lottie-status-icon').textContent = '✨';
        document.getElementById('pgm-lottie-status-text').textContent = 'Lottie tersedia';
        document.getElementById('pgm-del-lottie-btn').style.display = '';
      }
      if (g.video_url) {
        // Replace preview with video — status spans are gone, that's fine
        const _prevEl = document.getElementById('pgm-video-preview');
        _prevEl.style.background = g.video_url?.endsWith('.webm') ? 'repeating-conic-gradient(#aaa 0% 25%,#fff 0% 50%) 0 0/16px 16px' : '#000';
        _prevEl.innerHTML =
          `<video src="${esc(g.video_url)}" style="width:100%;height:100%;object-fit:contain" muted autoplay loop playsinline></video>`;
        document.getElementById('pgm-del-video-btn').style.display = '';
        pgmCaptureThumbnail();
      }
    }
  }

  // Image upload handler
  const imgFile = document.getElementById('pgm-img-file');
  imgFile.value = '';
  imgFile.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Gambar terlalu besar (maks 5MB)', 'error'); return; }
    const base64Data = await fileToBase64(file);
    if (!currentPartyGiftId) {
      // Preview saja, upload setelah save
      document.getElementById('pgm-img-preview').innerHTML = `<img src="data:${file.type};base64,${base64Data}" style="width:100%;height:100%;object-fit:contain" />`;
      document.getElementById('pgm-img-preview')._pendingBase64 = base64Data;
      document.getElementById('pgm-img-preview')._pendingMime = file.type;
      return;
    }
    await uploadPartyGiftImage(currentPartyGiftId, base64Data, file.type);
  };

  const imgZone = document.getElementById('pgm-img-zone');
  imgZone.ondragover = (e) => { e.preventDefault(); imgZone.classList.add('drag-over'); };
  imgZone.ondragleave = () => imgZone.classList.remove('drag-over');
  imgZone.ondrop = async (e) => {
    e.preventDefault(); imgZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    imgFile.files = e.dataTransfer.files;
    imgFile.onchange({ target: { files: e.dataTransfer.files } });
  };

  // Lottie upload handler
  const lottieFile = document.getElementById('pgm-lottie-file');
  lottieFile.value = '';
  lottieFile.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast('File Lottie terlalu besar (maks 10MB)', 'error'); return; }
    const text = await file.text();
    try { JSON.parse(text); } catch { toast('File bukan JSON valid', 'error'); return; }
    if (!currentPartyGiftId) {
      document.getElementById('pgm-lottie-preview')._pendingJson = text;
      document.getElementById('pgm-lottie-status-icon').textContent = '✨';
      document.getElementById('pgm-lottie-status-text').textContent = `${file.name} (belum diupload)`;
      return;
    }
    await uploadPartyGiftLottie(currentPartyGiftId, text);
  };

  const lottieZone = document.getElementById('pgm-lottie-zone');
  lottieZone.ondragover = (e) => { e.preventDefault(); lottieZone.classList.add('drag-over'); };
  lottieZone.ondragleave = () => lottieZone.classList.remove('drag-over');
  lottieZone.ondrop = async (e) => {
    e.preventDefault(); lottieZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) lottieFile.onchange({ target: { files: e.dataTransfer.files } });
  };

  // Video upload handler
  let _pendingVideoBase64 = null;
  let _pendingVideoMime   = null;

  const videoFile = document.getElementById('pgm-video-file');
  videoFile.value = '';
  videoFile.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { toast('Video terlalu besar (maks 50MB)', 'error'); return; }
    const base64Data = await fileToBase64(file);
    _pendingVideoBase64 = base64Data;
    _pendingVideoMime   = file.type;
    const prevEl = document.getElementById('pgm-video-preview');
    // Show local preview
    prevEl.style.background = '#000';
    prevEl.innerHTML = `<video src="data:${file.type};base64,${base64Data}" style="width:100%;height:100%;object-fit:contain" muted autoplay loop playsinline></video>`;
    pgmCaptureThumbnail();
    // Enable convert button
    const cb = document.getElementById('pgm-convert-btn');
    cb.disabled = false;
    cb.textContent = '🪄 Convert & Upload Transparan';
    if (!currentPartyGiftId) {
      prevEl._pendingBase64 = base64Data;
      prevEl._pendingMime = file.type;
      return;
    }
    await uploadPartyGiftVideo(currentPartyGiftId, base64Data, file.type);
  };

  const videoZone = document.getElementById('pgm-video-zone');
  videoZone.ondragover = (e) => { e.preventDefault(); videoZone.classList.add('drag-over'); };
  videoZone.ondragleave = () => videoZone.classList.remove('drag-over');
  videoZone.ondrop = async (e) => {
    e.preventDefault(); videoZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) videoFile.onchange({ target: { files: e.dataTransfer.files } });
  };

  // Chroma preset selector syncs with color picker
  document.getElementById('pgm-chroma-preset').onchange = (e) => {
    document.getElementById('pgm-chroma-color').value = e.target.value;
    const v = e.target.value.toLowerCase();
    const chromaColors = ['#00ff00', '#0000ff'];
    const darkColors   = ['#000000', '#1a1a2e'];
    if (chromaColors.includes(v))    pgmSetFilterMode('chromakey');
    else if (darkColors.includes(v)) pgmSetFilterMode('colorkey');
    else                             pgmSetFilterMode('colorkey'); // grey/white → colorkey; user can switch to checkerboard manually
  };
  document.getElementById('pgm-chroma-color').oninput = (e) => {
    const select = document.getElementById('pgm-chroma-preset');
    const opts = [...select.options];
    const match = opts.find(o => o.value.toLowerCase() === e.target.value.toLowerCase());
    if (match) select.value = match.value;
  };

  // Convert button handler
  document.getElementById('pgm-convert-btn').onclick = async () => {
    if (!_pendingVideoBase64) { toast('Pilih file video terlebih dahulu', 'error'); return; }
    if (!await pgmEnsureGiftSaved()) return;
    await convertPartyGiftVideo(currentPartyGiftId, _pendingVideoBase64, _pendingVideoMime || 'video/mp4');
  };

  // Delete handlers
  document.getElementById('pgm-del-img-btn').onclick = () => {
    confirm('Hapus Gambar', 'Yakin hapus gambar gift ini?', async () => {
      if (!currentPartyGiftId) return;
      const res = await api(`/party/gifts/${currentPartyGiftId}/image`, { method: 'DELETE' });
      if (res?.success) {
        document.getElementById('pgm-img-preview').innerHTML = '<span class="preview-emoji">🎁</span>';
        document.getElementById('pgm-del-img-btn').style.display = 'none';
        toast('Gambar dihapus', 'success');
        await reloadPartyGifts();
      }
    });
  };
  document.getElementById('pgm-del-lottie-btn').onclick = () => {
    confirm('Hapus Lottie', 'Yakin hapus animasi Lottie?', async () => {
      if (!currentPartyGiftId) return;
      const res = await api(`/party/gifts/${currentPartyGiftId}/lottie`, { method: 'DELETE' });
      if (res?.success) {
        document.getElementById('pgm-lottie-status-icon').textContent = '📄';
        document.getElementById('pgm-lottie-status-text').textContent = 'Belum ada Lottie';
        document.getElementById('pgm-del-lottie-btn').style.display = 'none';
        toast('Lottie dihapus', 'success');
        await reloadPartyGifts();
      }
    });
  };
  document.getElementById('pgm-del-video-btn').onclick = () => {
    confirm('Hapus Video', 'Yakin hapus video animasi gift ini?', async () => {
      if (!currentPartyGiftId) return;
      const res = await api(`/party/gifts/${currentPartyGiftId}/video`, { method: 'DELETE' });
      if (res?.success) {
        // Re-inject status spans since innerHTML was replaced when video loaded
        const _delPrev = document.getElementById('pgm-video-preview');
        _delPrev.style.background = '#000';
        _delPrev.innerHTML =
          '<span id="pgm-video-status-icon" style="font-size:36px">🎬</span>' +
          '<span id="pgm-video-status-text" style="font-size:12px;color:var(--text-muted)">Belum ada video</span>';
        document.getElementById('pgm-del-video-btn').style.display = 'none';
        pgmClearThumbnail();
        toast('Video dihapus', 'success');
        await reloadPartyGifts();
      }
    });
  };

  document.getElementById('party-gift-modal').classList.add('open');
};

window.closePartyGiftModal = () => {
  document.getElementById('party-gift-modal').classList.remove('open');
  currentPartyGiftId = null;
};

async function pgmEnsureGiftSaved() {
  if (currentPartyGiftId) return true;
  const name = document.getElementById('pgm-name').value.trim();
  if (!name) { toast('Isi nama gift dulu sebelum convert', 'error'); return false; }
  const body = {
    name,
    emoji:     document.getElementById('pgm-emoji').value.trim() || '🎁',
    price:     parseFloat(document.getElementById('pgm-price').value) || 0,
    category:  document.getElementById('pgm-category').value,
    sortOrder: parseInt(document.getElementById('pgm-sort').value) || 99,
    isPremium: document.getElementById('pgm-premium').checked,
    isActive:  document.getElementById('pgm-active').checked,
  };
  const res = await api('/party/gifts', { method: 'POST', body });
  if (!res || res.error) { toast(res?.error || 'Gagal menyimpan gift otomatis', 'error'); return false; }
  currentPartyGiftId = res.gift?.id;
  toast('Gift disimpan otomatis — lanjut convert...', 'success');
  await reloadPartyGifts();
  return true;
}

window.savePartyGift = async () => {
  const name = document.getElementById('pgm-name').value.trim();
  if (!name) { toast('Nama gift wajib diisi', 'error'); return; }

  const body = {
    name,
    emoji:     document.getElementById('pgm-emoji').value.trim() || '🎁',
    price:     parseFloat(document.getElementById('pgm-price').value) || 0,
    category:  document.getElementById('pgm-category').value,
    sortOrder: parseInt(document.getElementById('pgm-sort').value) || 99,
    isPremium: document.getElementById('pgm-premium').checked,
    isActive:  document.getElementById('pgm-active').checked,
  };

  const btn = document.getElementById('pgm-save-btn');
  btn.disabled = true; btn.textContent = 'Menyimpan...';

  let giftId = currentPartyGiftId;
  let res;
  if (giftId) {
    res = await api(`/party/gifts/${giftId}`, { method: 'PATCH', body });
  } else {
    res = await api('/party/gifts', { method: 'POST', body });
  }

  btn.disabled = false; btn.textContent = 'Simpan';

  if (!res || res.error) { toast(res?.error || 'Gagal menyimpan gift', 'error'); return; }

  giftId = res.gift?.id || giftId;
  currentPartyGiftId = giftId;
  toast(currentPartyGiftId ? 'Gift diperbarui!' : 'Gift ditambahkan!', 'success');

  // Upload pending image/lottie/video jika ada
  const imgPrev = document.getElementById('pgm-img-preview');
  if (imgPrev._pendingBase64 && giftId) {
    await uploadPartyGiftImage(giftId, imgPrev._pendingBase64, imgPrev._pendingMime);
    delete imgPrev._pendingBase64; delete imgPrev._pendingMime;
  }
  const lottiePrev = document.getElementById('pgm-lottie-preview');
  if (lottiePrev._pendingJson && giftId) {
    await uploadPartyGiftLottie(giftId, lottiePrev._pendingJson);
    delete lottiePrev._pendingJson;
  }
  const videoPrev = document.getElementById('pgm-video-preview');
  if (videoPrev._pendingBase64 && giftId) {
    await uploadPartyGiftVideo(giftId, videoPrev._pendingBase64, videoPrev._pendingMime);
    delete videoPrev._pendingBase64; delete videoPrev._pendingMime;
  }

  closePartyGiftModal();
  await reloadPartyGifts();
};

async function uploadPartyGiftImage(giftId, base64Data, mimeType) {
  const prog = document.getElementById('pgm-img-progress');
  const bar  = document.getElementById('pgm-img-bar');
  const msg  = document.getElementById('pgm-img-msg');
  prog.style.display = ''; bar.style.width = '30%'; msg.className = 'upload-msg'; msg.textContent = 'Mengupload...';

  const res = await api(`/party/gifts/${giftId}/upload-image`, {
    method: 'POST',
    body: { base64Data, mimeType },
  });

  if (res?.success) {
    bar.style.width = '100%';
    msg.className = 'upload-msg success'; msg.textContent = '✓ Gambar berhasil diupload ke ImageKit';
    document.getElementById('pgm-img-preview').innerHTML = `<img src="${esc(res.imageUrl)}" style="width:100%;height:100%;object-fit:contain" />`;
    document.getElementById('pgm-del-img-btn').style.display = '';
    toast('Gambar berhasil diupload!', 'success');
    await reloadPartyGifts();
  } else {
    bar.style.width = '0%';
    msg.className = 'upload-msg error'; msg.textContent = '✗ ' + (res?.error || 'Upload gagal');
    toast(res?.error || 'Upload gambar gagal', 'error');
  }
}

async function uploadPartyGiftLottie(giftId, lottieJson) {
  const prog = document.getElementById('pgm-lottie-progress');
  const bar  = document.getElementById('pgm-lottie-bar');
  const msg  = document.getElementById('pgm-lottie-msg');
  prog.style.display = ''; bar.style.width = '30%'; msg.className = 'upload-msg'; msg.textContent = 'Mengupload Lottie...';

  const res = await api(`/party/gifts/${giftId}/upload-lottie`, {
    method: 'POST',
    body: { lottieJson: typeof lottieJson === 'string' ? lottieJson : JSON.stringify(lottieJson) },
  });

  if (res?.success) {
    bar.style.width = '100%';
    msg.className = 'upload-msg success'; msg.textContent = '✓ Lottie berhasil diupload';
    document.getElementById('pgm-lottie-status-icon').textContent = '✨';
    document.getElementById('pgm-lottie-status-text').textContent = 'Lottie aktif';
    document.getElementById('pgm-del-lottie-btn').style.display = '';
    toast('Lottie berhasil diupload!', 'success');
    await reloadPartyGifts();
  } else {
    bar.style.width = '0%';
    msg.className = 'upload-msg error'; msg.textContent = '✗ ' + (res?.error || 'Upload gagal');
    toast(res?.error || 'Upload Lottie gagal', 'error');
  }
}

async function uploadPartyGiftVideo(giftId, base64Data, mimeType) {
  const prog = document.getElementById('pgm-video-progress');
  const bar  = document.getElementById('pgm-video-bar');
  const msg  = document.getElementById('pgm-video-msg');
  prog.style.display = ''; bar.style.width = '30%'; msg.className = 'upload-msg'; msg.textContent = 'Mengupload video...';

  const res = await api(`/party/gifts/${giftId}/upload-video`, {
    method: 'POST',
    body: { base64Data, mimeType },
  });

  if (res?.success) {
    bar.style.width = '100%';
    msg.className = 'upload-msg success'; msg.textContent = '✓ Video berhasil diupload';
    const _upPrev = document.getElementById('pgm-video-preview');
    _upPrev.style.background = '#000';
    _upPrev.innerHTML = `<video src="${esc(res.videoUrl)}" style="width:100%;height:100%;object-fit:contain" muted autoplay loop playsinline></video>`;
    document.getElementById('pgm-del-video-btn').style.display = '';
    pgmCaptureThumbnail();
    toast('Video berhasil diupload!', 'success');
    await reloadPartyGifts();
  } else {
    bar.style.width = '0%';
    msg.className = 'upload-msg error'; msg.textContent = '✗ ' + (res?.error || 'Upload gagal');
    toast(res?.error || 'Upload video gagal', 'error');
  }
}

function pgmCaptureThumbnail() {
  const preview = document.getElementById('pgm-video-preview');
  const wrap    = document.getElementById('pgm-thumb-wrap');
  const img     = document.getElementById('pgm-video-thumb');
  if (!preview || !wrap || !img) return;
  const video = preview.querySelector('video');
  if (!video) { wrap.style.display = 'none'; return; }
  const doCapture = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width  = 160; canvas.height = 90;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, 160, 90);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      if (dataUrl && dataUrl.length > 100) {
        img.src = dataUrl;
        wrap.style.display = '';
      }
    } catch(e) { wrap.style.display = 'none'; }
  };
  const seek = () => {
    video.currentTime = Math.min(1, isFinite(video.duration) && video.duration > 0 ? video.duration * 0.1 : 1);
    video.addEventListener('seeked', doCapture, { once: true });
  };
  if (video.readyState >= 2) { seek(); }
  else { video.addEventListener('loadeddata', seek, { once: true }); }
}
function pgmClearThumbnail() {
  const wrap = document.getElementById('pgm-thumb-wrap');
  const img  = document.getElementById('pgm-video-thumb');
  if (wrap) wrap.style.display = 'none';
  if (img)  img.src = '';
}

let _pgmFilterMode = 'chromakey';
window.pgmSetFilterMode = function(mode) {
  _pgmFilterMode = mode;
  const btnChroma   = document.getElementById('pgm-mode-chroma');
  const btnColor    = document.getElementById('pgm-mode-color');
  const btnChecker  = document.getElementById('pgm-mode-checker');
  const hint        = document.getElementById('pgm-mode-hint');
  const colorRow    = document.getElementById('pgm-color-row');
  if (!btnChroma || !btnColor || !hint) return;

  // Reset all buttons
  btnChroma.style.background  = 'var(--border)'; btnChroma.style.color  = 'var(--text)';
  btnColor.style.background   = 'var(--border)'; btnColor.style.color   = 'var(--text)';
  if (btnChecker) { btnChecker.style.background = 'var(--border)'; btnChecker.style.color = 'var(--text)'; }

  if (mode === 'checkerboard') {
    if (btnChecker) { btnChecker.style.background = '#10b981'; btnChecker.style.color = '#fff'; }
    if (colorRow) colorRow.style.display = 'none';
    hint.innerHTML = '<b>Checkerboard</b> — untuk video dari <b>Alight Motion / CapCut</b> yang backgroundnya abu-abu+putih kotak-kotak. FFmpeg hapus <b>3 warna sekaligus</b> (abu-abu, terang, putih)';
    // Set default tolerance higher for checkerboard since we need more aggressive removal
    const slider = document.getElementById('pgm-chroma-similarity');
    if (slider && parseFloat(slider.value) < 0.4) {
      slider.value = '0.45';
      const val = document.getElementById('pgm-chroma-sim-val');
      if (val) val.textContent = '0.45';
    }
  } else if (mode === 'colorkey') {
    btnColor.style.background  = '#10b981'; btnColor.style.color  = '#fff';
    if (colorRow) colorRow.style.display = '';
    hint.innerHTML = '<b>Color Key</b> — cocok untuk background <b>gelap / hitam / abu-abu / putih</b> atau warna solid apapun';
  } else {
    btnChroma.style.background = '#10b981'; btnChroma.style.color = '#fff';
    if (colorRow) colorRow.style.display = '';
    hint.innerHTML = '<b>Chroma Key</b> — cocok untuk <b>Green Screen / Blue Screen</b> (warna jenuh terang)';
  }
};

async function convertPartyGiftVideo(giftId, base64Data, mimeType) {
  const prog   = document.getElementById('pgm-convert-progress');
  const bar    = document.getElementById('pgm-convert-bar');
  const msg    = document.getElementById('pgm-convert-msg');
  const btn    = document.getElementById('pgm-convert-btn');
  const chromaColor  = document.getElementById('pgm-chroma-color').value;
  const similarity   = parseFloat(document.getElementById('pgm-chroma-similarity').value);

  prog.style.display = '';
  bar.style.width = '10%';
  msg.className = 'upload-msg';
  msg.textContent = '📤 Mengirim video ke server...';
  btn.disabled = true;
  btn.textContent = '⏳ Sedang diproses...';

  // Simulate progress during FFmpeg processing (can take 10-60s)
  let fakeProgress = 10;
  const ticker = setInterval(() => {
    if (fakeProgress < 80) { fakeProgress += Math.random() * 5; bar.style.width = fakeProgress + '%'; }
    if (fakeProgress > 20 && msg.textContent.startsWith('📤')) {
      msg.textContent = '🔧 FFmpeg memproses chroma key + VP9 encode...';
    }
  }, 1200);

  try {
    const res = await api(`/party/gifts/${giftId}/convert-video`, {
      method: 'POST',
      body: { base64Data, mimeType, chromaColor, similarity, blend: 0.05, filterMode: _pgmFilterMode },
    });

    clearInterval(ticker);

    if (res?.success) {
      bar.style.width = '100%';
      msg.className = 'upload-msg success';
      msg.textContent = '✓ WebM transparan berhasil dibuat dan diupload!';
      const _convPrev = document.getElementById('pgm-video-preview');
      _convPrev.style.background = 'repeating-conic-gradient(#aaa 0% 25%,#fff 0% 50%) 0 0/16px 16px';
      _convPrev.innerHTML =
        `<video src="${esc(res.videoUrl)}" style="width:100%;height:100%;object-fit:contain" muted autoplay loop playsinline></video>`;
      document.getElementById('pgm-del-video-btn').style.display = '';
      pgmCaptureThumbnail();
      btn.textContent = '✓ Selesai';
      toast('Video transparan berhasil dikonversi!', 'success');
      await reloadPartyGifts();
    } else {
      bar.style.width = '0%';
      msg.className = 'upload-msg error';
      msg.textContent = '✗ ' + (res?.error || 'Konversi gagal');
      btn.disabled = false;
      btn.textContent = '🪄 Coba Lagi';
      toast(res?.error || 'Konversi video gagal', 'error');
    }
  } catch (err) {
    clearInterval(ticker);
    bar.style.width = '0%';
    msg.className = 'upload-msg error';
    msg.textContent = '✗ Koneksi gagal — coba lagi';
    btn.disabled = false;
    btn.textContent = '🪄 Coba Lagi';
  }
}

window.deletePartyGift = (id, name) => {
  confirm('Hapus Gift Party', `Yakin hapus gift "${name}"?`, async () => {
    const res = await api(`/party/gifts/${id}`, { method: 'DELETE' });
    if (res?.success) { toast('Gift dihapus', 'success'); await reloadPartyGifts(); }
    else toast(res?.error || 'Gagal hapus gift', 'error');
  });
};

async function reloadPartyGifts() {
  const res = await api('/party/gifts');
  partyGiftsData = res?.gifts || [];
  soloGiftsData = partyGiftsData;
  const tc = document.getElementById('party-tab-content');
  if (tc && partyActiveTab === 'gifts') drawPartyGiftsTab(tc);
  const tcSolo = document.getElementById('solo-tab-content');
  if (tcSolo && soloActiveTab === 'gifts') drawSoloGiftsTab(tcSolo);
}

// ── Party Stickers Tab (list only — modal is at page level) ──────────────────
async function drawPartyStickersTab(tc) {
  const res = await api('/party/stickers');
  partyStickersData = res?.stickers || [];
  tc.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
    <div>
      <h3 style="margin:0;font-size:16px">🎭 Party Stiker</h3>
      <p style="font-size:13px;color:var(--text-muted);margin:4px 0 0">${partyStickersData.length} stiker terdaftar</p>
    </div>
    <button class="btn btn-primary" onclick="openPartyStickerModal(null)">＋ Tambah Stiker</button>
  </div>
  ${partyStickersData.length === 0
    ? `<div class="empty-state"><div class="empty-icon">🎭</div><p>Belum ada stiker. Tambahkan stiker Lottie untuk party room.</p></div>`
    : `<div class="gift-grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px">
        ${partyStickersData.map(s => `
          <div class="gift-card" style="text-align:center;padding:14px">
            <div style="width:80px;height:80px;margin:0 auto 8px;border-radius:12px;background:var(--bg-2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:36px">
              ${s.lottie_url ? '✨' : '🎭'}
            </div>
            <div style="font-weight:600;font-size:13px;margin-bottom:4px">${esc(s.name)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">${s.lottie_url ? '✅ Lottie' : '⚠️ Belum ada Lottie'} · ${s.is_active ? 'Aktif' : 'Nonaktif'}</div>
            <div style="display:flex;gap:6px;justify-content:center">
              <button class="btn btn-sm btn-outline" onclick="openPartyStickerModal(${s.id})">✏️ Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deletePartySticker(${s.id},'${esc(s.name)}')">🗑️</button>
            </div>
          </div>`).join('')}
      </div>`}`;
}

function openPartyStickerModal(stickerId) {
  currentPartyStickerEditId = stickerId;
  _stickerPendingLottieText = null;

  document.getElementById('psm-title').textContent = stickerId ? 'Edit Stiker Party' : 'Tambah Stiker Party';
  document.getElementById('psm-name').value = '';
  document.getElementById('psm-sort').value = '99';
  document.getElementById('psm-active').checked = true;
  document.getElementById('psm-lottie-status').innerHTML = '📄 Belum ada file Lottie';
  document.getElementById('psm-lottie-progress').style.display = 'none';
  document.getElementById('psm-lottie-actions').style.display = 'none';
  const fi = document.getElementById('psm-lottie-file');
  if (fi) fi.value = '';

  if (stickerId) {
    const s = partyStickersData.find(x => x.id === stickerId);
    if (s) {
      document.getElementById('psm-name').value = s.name || '';
      document.getElementById('psm-sort').value = s.sort_order ?? 99;
      document.getElementById('psm-active').checked = !!s.is_active;
      if (s.lottie_url) {
        document.getElementById('psm-lottie-status').innerHTML =
          `✅ Lottie sudah ada di CDN · <a href="${s.lottie_url}" target="_blank" style="color:var(--primary)">Lihat</a>`;
        document.getElementById('psm-lottie-actions').style.display = 'flex';
      }
    }
  }
  document.getElementById('party-sticker-modal').style.display = 'flex';
}

function closePartyStickerModal() {
  document.getElementById('party-sticker-modal').style.display = 'none';
}

async function savePartySticker() {
  const name = document.getElementById('psm-name').value.trim();
  if (!name) { toast('Nama stiker wajib diisi', 'error'); return; }
  const sortOrder = parseInt(document.getElementById('psm-sort').value) || 99;
  const isActive = document.getElementById('psm-active').checked;
  const saveBtn = document.getElementById('psm-save-btn');
  saveBtn.disabled = true;
  try {
    let stickerId = currentPartyStickerEditId;
    if (stickerId) {
      const res = await api(`/party/stickers/${stickerId}`, { method: 'PATCH', body: { name, sortOrder, isActive } });
      if (!res?.success) { toast(res?.error || 'Gagal menyimpan', 'error'); return; }
    } else {
      const res = await api('/party/stickers', { method: 'POST', body: { name, sortOrder } });
      if (!res?.success) { toast(res?.error || 'Gagal membuat stiker', 'error'); return; }
      stickerId = res.sticker.id;
      currentPartyStickerEditId = stickerId;
    }

    // Upload lottie if pending
    if (_stickerPendingLottieText) {
      const prog = document.getElementById('psm-lottie-progress');
      const bar = document.getElementById('psm-lottie-bar');
      const msg = document.getElementById('psm-lottie-msg');
      if (prog) { prog.style.display = 'block'; bar.style.width = '30%'; msg.textContent = 'Mengupload Lottie...'; }
      const res2 = await api(`/party/stickers/${stickerId}/upload-lottie`, {
        method: 'POST',
        body: { lottieJson: _stickerPendingLottieText },
      });
      if (res2?.success) {
        if (bar) { bar.style.width = '100%'; msg.textContent = '✅ Lottie berhasil diupload!'; }
        setTimeout(() => { if (prog) prog.style.display = 'none'; }, 2000);
        _stickerPendingLottieText = null;
      } else {
        if (msg) msg.textContent = '❌ ' + (res2?.error || 'Upload gagal');
        toast(res2?.error || 'Gagal upload Lottie', 'error');
        return;
      }
    }

    toast('Stiker berhasil disimpan!', 'success');
    closePartyStickerModal();
    const tc = document.getElementById('party-tab-content');
    if (tc) await drawPartyStickersTab(tc);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

async function deletePartySticker(id, name) {
  if (!confirm(`Hapus stiker "${name}"? Tindakan ini tidak bisa dibatalkan.`)) return;
  const res = await api(`/party/stickers/${id}`, { method: 'DELETE' });
  if (res?.success) { toast('Stiker berhasil dihapus', 'success'); const tc = document.getElementById('party-tab-content'); if (tc) await drawPartyStickersTab(tc); }
  else toast(res?.error || 'Gagal hapus stiker', 'error');
}

async function deleteStickerLottie() {
  if (!currentPartyStickerEditId) { toast('Simpan stiker terlebih dahulu', 'error'); return; }
  if (!confirm('Hapus file Lottie dari CDN untuk stiker ini?')) return;
  const res = await api(`/party/stickers/${currentPartyStickerEditId}/lottie`, { method: 'DELETE' });
  if (res?.success) {
    toast('Lottie berhasil dihapus', 'success');
    document.getElementById('psm-lottie-status').innerHTML = '📄 Belum ada file Lottie';
    document.getElementById('psm-lottie-actions').style.display = 'none';
    _stickerPendingLottieText = null;
    const idx = partyStickersData.findIndex(x => x.id === currentPartyStickerEditId);
    if (idx !== -1) partyStickersData[idx].lottie_url = null;
  } else toast(res?.error || 'Gagal hapus Lottie', 'error');
}

// Helper: file → base64 (tanpa prefix data:...)
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── SOLO LIVE ────────────────────────────────────────────────────────────────
let soloGiftsData = [];
let soloGiftFilter = 'all';
let soloActiveTab = 'gifts';

async function renderSoloLive(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat data Solo Live...</div>';
  await loadAndDrawSoloLive(el);
}

async function loadAndDrawSoloLive(el) {
  const [giftsRes, streamsRes] = await Promise.all([
    api('/party/gifts'),
    api('/live/streams/admin/list').catch(() => null),
  ]);
  soloGiftsData = giftsRes?.gifts || [];
  const streams = streamsRes?.streams || [];
  drawSoloLivePage(el, streams);
}

async function reloadSoloGifts() {
  const res = await api('/party/gifts');
  soloGiftsData = res?.gifts || [];
  const tc = document.getElementById('solo-tab-content');
  if (tc && soloActiveTab === 'gifts') drawSoloGiftsTab(tc);
}

function drawSoloLivePage(el, streams = []) {
  el.innerHTML = `
  <div style="background:linear-gradient(135deg,rgba(139,92,246,0.12),rgba(236,72,153,0.08));border:1px solid rgba(139,92,246,0.25);border-radius:14px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:12px">
    <span style="font-size:28px">📹</span>
    <div>
      <div style="font-weight:800;font-size:15px;margin-bottom:2px">Gift Solo Live — dikelola di sini</div>
      <div style="font-size:12px;color:var(--text-muted)">Gift yang ditambah / diedit di sini <b>otomatis muncul di modal gift Solo Live</b> (host & viewer). Gift sama juga dipakai oleh Party Room — satu katalog bersama.</div>
    </div>
  </div>

  <div class="store-tab-bar" style="margin-bottom:20px">
    <button class="store-tab${soloActiveTab==='gifts'?' active':''}" onclick="switchSoloTab('gifts')">🎁 Kelola Gift</button>
    <button class="store-tab${soloActiveTab==='streams'?' active':''}" onclick="switchSoloTab('streams')">📡 Live Aktif</button>
  </div>
  <div id="solo-tab-content"></div>
  `;

  window.switchSoloTab = (tab) => {
    soloActiveTab = tab;
    const tc = document.getElementById('solo-tab-content');
    if (!tc) return;
    if (tab === 'gifts') drawSoloGiftsTab(tc);
    else drawSoloStreamsTab(tc, streams);
  };

  const tc = document.getElementById('solo-tab-content');
  if (soloActiveTab === 'gifts') drawSoloGiftsTab(tc);
  else drawSoloStreamsTab(tc, streams);
}

function drawSoloGiftsTab(tc) {
  const cats = ['all', ...new Set(soloGiftsData.map(g => g.category || 'Populer'))];
  const filtered = soloGiftFilter === 'all' ? soloGiftsData : soloGiftsData.filter(g => g.category === soloGiftFilter);
  tc.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
    <div>
      <div style="font-size:18px;font-weight:800">🎁 Gift Catalog</div>
      <p style="font-size:13px;color:var(--text-muted)">${soloGiftsData.length} gift terdaftar · PNG/WEBP/GIF + Lottie + Video WebM transparan</p>
    </div>
    <button class="btn btn-primary" onclick="openPartyGiftModal(null)">＋ Tambah Gift</button>
  </div>
  <div class="store-tab-bar" style="margin-bottom:16px;flex-wrap:wrap">
    ${cats.map(c => `
      <div class="cat-tab${soloGiftFilter===c?' active':''}" onclick="filterSoloGifts('${c}')">
        ${c === 'all' ? `Semua (${soloGiftsData.length})` : `${esc(c)} (${soloGiftsData.filter(g=>g.category===c).length})`}
      </div>`).join('')}
  </div>
  <div class="gift-grid" id="solo-gift-grid">
    ${filtered.length === 0
      ? '<div class="empty" style="padding:40px 0;grid-column:1/-1">Tidak ada gift di kategori ini</div>'
      : filtered.map(g => renderSoloGiftCard(g)).join('')}
  </div>
  `;

  window.filterSoloGifts = (cat) => {
    soloGiftFilter = cat;
    drawSoloGiftsTab(document.getElementById('solo-tab-content'));
  };

  requestAnimationFrame(() => initSoloGiftLotties());
}

function renderSoloGiftCard(g) {
  const hasImg    = !!g.image_url;
  const hasLottie = !!g.lottie_url;
  const hasVideo  = !!g.video_url;
  const badgeColor = !g.is_active ? 'var(--danger)' : g.is_premium ? '#f59e0b' : 'var(--success)';
  const badgeText  = !g.is_active ? 'Nonaktif' : g.is_premium ? '⭐ Premium' : 'Aktif';
  return `
  <div class="gift-card" style="position:relative">
    <div style="position:absolute;top:8px;left:8px;z-index:2;background:${badgeColor};color:#fff;font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px">${badgeText}</div>
    <div class="gift-preview" style="height:90px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:var(--bg-card);margin-bottom:10px;overflow:hidden;position:relative">
      ${hasVideo
        ? `<video src="${g.video_url}" autoplay loop muted playsinline style="width:80px;height:80px;object-fit:contain" />`
        : hasLottie
          ? `<div class="lottie-preview" data-src="${g.lottie_url}" style="width:72px;height:72px"></div>`
          : hasImg
            ? `<img src="${g.image_url}" style="width:72px;height:72px;object-fit:contain" />`
            : `<span style="font-size:40px">${esc(g.emoji || '🎁')}</span>`}
    </div>
    <div style="font-weight:700;font-size:13px;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g.name)}</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">🪙 ${Number(g.price).toLocaleString()} · ${esc(g.category || 'Populer')}</div>
    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      ${hasImg    ? '<span style="font-size:9px;background:rgba(16,185,129,0.15);color:#10b981;padding:2px 6px;border-radius:10px;font-weight:600">🖼️ Gambar</span>' : ''}
      ${hasLottie ? '<span style="font-size:9px;background:rgba(139,92,246,0.15);color:#8b5cf6;padding:2px 6px;border-radius:10px;font-weight:600">✨ Lottie</span>' : ''}
      ${hasVideo  ? '<span style="font-size:9px;background:rgba(236,72,153,0.15);color:#ec4899;padding:2px 6px;border-radius:10px;font-weight:600">🎬 Video</span>' : ''}
    </div>
    <div style="display:flex;gap:6px;margin-top:10px">
      <button class="btn btn-sm btn-outline" style="flex:1" onclick="openPartyGiftModal('${g.id}')">✏️ Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deleteSoloGift('${g.id}','${esc(g.name)}')">🗑️</button>
    </div>
  </div>`;
}

function initSoloGiftLotties() {
  document.querySelectorAll('#solo-gift-grid .lottie-preview').forEach(el => {
    if (el.dataset.initialized) return;
    el.dataset.initialized = '1';
    const src = el.dataset.src;
    if (!src) return;
    fetch(src).then(r => r.json()).then(data => {
      if (typeof lottie !== 'undefined') {
        lottie.loadAnimation({ container: el, animationData: data, renderer: 'svg', loop: true, autoplay: true });
      }
    }).catch(() => {});
  });
}

function drawSoloStreamsTab(tc, streams = []) {
  tc.innerHTML = `
  <div style="font-size:18px;font-weight:800;margin-bottom:14px">📡 Solo Live Aktif / Terbaru</div>
  ${streams.length === 0
    ? `<div class="empty" style="padding:60px 0;text-align:center">
        <div style="font-size:48px;margin-bottom:12px">📺</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:6px">Tidak ada data stream</div>
        <div style="font-size:13px;color:var(--text-muted)">Data stream muncul setelah ada host yang live</div>
      </div>`
    : `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid var(--border);font-size:12px;color:var(--text-muted)">
          <th style="padding:10px;text-align:left">Host</th>
          <th style="padding:10px;text-align:left">Judul</th>
          <th style="padding:10px;text-align:center">Viewers</th>
          <th style="padding:10px;text-align:center">Status</th>
          <th style="padding:10px;text-align:right">Mulai</th>
        </tr></thead>
        <tbody>${streams.map(s => `
          <tr style="border-bottom:1px solid var(--border);font-size:13px">
            <td style="padding:10px;font-weight:600">${esc(s.host_username || s.username || '—')}</td>
            <td style="padding:10px;color:var(--text-muted)">${esc(s.title || '—')}</td>
            <td style="padding:10px;text-align:center">${s.viewer_count ?? 0}</td>
            <td style="padding:10px;text-align:center">
              <span style="background:${s.status==='live'?'rgba(16,185,129,0.15)':'rgba(107,114,128,0.15)'};color:${s.status==='live'?'#10b981':'#6b7280'};padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">
                ${s.status==='live'?'🔴 LIVE':'⚫ Selesai'}
              </span>
            </td>
            <td style="padding:10px;text-align:right;color:var(--text-muted);font-size:11px">${s.created_at ? new Date(s.created_at).toLocaleString('id-ID') : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`}
  `;
}

window.deleteSoloGift = async (id, name) => {
  if (!confirm(`Hapus gift "${name}"? Gift ini juga tidak akan muncul di Party Room.`)) return;
  const res = await api(`/party/gifts/${id}`, { method: 'DELETE' });
  if (res?.success || res === null) {
    toast('Gift dihapus', 'success');
    await reloadSoloGifts();
  } else {
    toast(res?.error || 'Gagal menghapus', 'error');
  }
};

// ─── SHOP FRAMES ─────────────────────────────────────────────────────────────
let shopFramesData = [];
let shopSubTab = 'frames'; // 'frames' | 'effects'

async function renderShopFrames(content) {
  content.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat data...</div>';
  if (shopSubTab === 'frames') {
    const res = await api('/shop-frames');
    shopFramesData = res?.frames || [];
    drawShopFrames(content);
  } else {
    await renderEntryEffects(content, true);
  }
}

function drawShopFramesSubTabs(content) {
  const tabBar = `
  <div style="display:flex;gap:0;border-bottom:2px solid rgba(255,255,255,0.1);margin-bottom:20px">
    <button onclick="switchShopSubTab('frames')" style="padding:10px 24px;font-size:14px;font-weight:600;border:none;cursor:pointer;border-bottom:3px solid ${shopSubTab==='frames'?'#7C3AED':'transparent'};color:${shopSubTab==='frames'?'#7C3AED':'#888'};background:transparent;transition:all 0.2s">🪞 Bingkai Avatar</button>
    <button onclick="switchShopSubTab('effects')" style="padding:10px 24px;font-size:14px;font-weight:600;border:none;cursor:pointer;border-bottom:3px solid ${shopSubTab==='effects'?'#7C3AED':'transparent'};color:${shopSubTab==='effects'?'#7C3AED':'#888'};background:transparent;transition:all 0.2s">✨ Efek Masuk</button>
  </div>`;
  return tabBar;
}

window.switchShopSubTab = async (tab) => {
  shopSubTab = tab;
  await renderShopFrames(document.getElementById('content'));
};

function drawShopFrames(content) {
  content.innerHTML = drawShopFramesSubTabs(content) + `
  <div class="section-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
    <h2 style="margin:0">Bingkai Avatar (${shopFramesData.length})</h2>
    <button class="btn btn-primary" onclick="openAddFrameModal()">+ Tambah Bingkai</button>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px">
    ${shopFramesData.map(f => `
    <div class="card" style="padding:16px;text-align:center;position:relative">
      <div style="position:absolute;top:8px;right:8px;display:flex;gap:4px">
        <button class="btn btn-sm" onclick="openEditFrameModal('${f.id}')" style="padding:4px 8px;font-size:11px">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteFrame('${f.id}','${f.name}')" style="padding:4px 8px;font-size:11px">Hapus</button>
      </div>
      <div style="width:100%;height:140px;display:flex;align-items:center;justify-content:center;background:#1a1a2e;border-radius:8px;margin-bottom:10px;overflow:hidden;position:relative">
        ${f.frame_type === 'lottie'
          ? `<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><span style="font-size:38px">🎬</span><span style="color:#a78bfa;font-size:11px;font-weight:600">Lottie Animation</span></div>`
          : f.image_url
            ? `<img src="${f.image_url}" style="max-width:120px;max-height:120px;object-fit:contain" onerror="this.style.display='none'">`
            : '<span style="color:#666;font-size:12px">Belum ada gambar</span>'
        }
      </div>
      <div style="font-weight:700;margin-bottom:4px">${f.name}</div>
      <div style="font-size:12px;color:#888;margin-bottom:8px">Kategori: ${f.category}</div>
      <div style="font-size:11px;color:#f59e0b">
        1 hari: ${Number(f.price_1d).toLocaleString()}<br>
        7 hari: ${Number(f.price_7d).toLocaleString()}<br>
        30 hari: ${Number(f.price_30d).toLocaleString()}
      </div>
      <div style="margin-top:8px">
        <span class="badge ${f.is_active ? 'badge-success' : 'badge-error'}">${f.is_active ? 'Aktif' : 'Non-Aktif'}</span>
      </div>
      <div style="margin-top:10px">
        <label style="font-size:12px;color:#888;display:block;margin-bottom:4px">Upload Gambar</label>
        <input type="file" accept="image/*" style="font-size:11px;width:100%" onchange="uploadFrameImage('${f.id}', this)">
        <div id="upload-status-${f.id}" style="font-size:11px;margin-top:4px"></div>
      </div>
    </div>`).join('')}
  </div>

  <!-- Add/Edit Frame Modal -->
  <div id="frame-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:460px;max-height:92vh;overflow-y:auto;padding:24px">
      <h3 id="frame-modal-title" style="margin-top:0">Tambah Bingkai</h3>

      <!-- Upload + Live Preview side by side -->
      <div style="display:grid;grid-template-columns:1fr 160px;gap:14px;margin-bottom:16px">

        <!-- Left: upload dropzone -->
        <div>
          <label style="font-size:13px;font-weight:600;color:#444;display:block;margin-bottom:6px">Gambar Bingkai</label>
          <div id="fm-img-area" onclick="document.getElementById('fm-img-input').click()"
            style="width:100%;height:130px;border:2px dashed #7C3AED;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;background:#f8f5ff;gap:6px;position:relative;overflow:hidden">
            <img id="fm-img-preview" src="" style="display:none;width:100%;height:100%;object-fit:contain;position:absolute;inset:0">
            <div id="fm-img-placeholder" style="display:flex;flex-direction:column;align-items:center;gap:4px">
              <span style="font-size:28px">🖼️</span>
              <span style="color:#7C3AED;font-weight:600;font-size:12px">Klik untuk upload</span>
              <span style="color:#888;font-size:10px">PNG, JPG, WebP, JSON Lottie · maks 5MB</span>
            </div>
            <div id="fm-img-change" style="display:none;position:absolute;bottom:0;left:0;right:0;background:rgba(124,58,237,0.85);color:#fff;text-align:center;padding:5px;font-size:11px;font-weight:600">
              Klik untuk ganti
            </div>
          </div>
          <input type="file" id="fm-img-input" accept="image/*,application/json,.json" style="display:none" onchange="onFmImageSelect(this)">
          <div id="fm-img-status" style="font-size:11px;margin-top:4px;color:#888"></div>
        </div>

        <!-- Right: live avatar preview -->
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
          <label style="font-size:13px;font-weight:600;color:#444">Preview</label>
          <!-- Avatar preview container -->
          <div style="position:relative;width:120px;height:120px">
            <!-- Checkerboard background to show transparency -->
            <div style="position:absolute;inset:0;border-radius:50%;overflow:hidden;background:
              repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 0 / 12px 12px">
            </div>
            <!-- Sample avatar circle -->
            <div style="position:absolute;inset:10px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#7C3AED);display:flex;align-items:center;justify-content:center">
              <span style="color:#fff;font-size:24px;font-weight:700">U</span>
            </div>
            <!-- Frame overlay: static image -->
            <img id="fm-live-frame" src="" style="display:none;position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none">
            <!-- Frame overlay: lottie animation -->
            <div id="fm-live-lottie" style="display:none;position:absolute;inset:-15%;width:130%;height:130%;pointer-events:none"></div>
          </div>
          <div id="fm-preview-label" style="font-size:10px;color:#aaa;text-align:center">Pilih gambar<br>untuk preview</div>
        </div>

      </div>

      <div class="form-group">
        <label>Nama Bingkai *</label>
        <input class="input" id="fm-name" placeholder="Nama bingkai">
      </div>
      <div class="form-group">
        <label>Kategori</label>
        <select class="input" id="fm-cat">
          <option value="Bingkai">Bingkai</option>
          <option value="Efek Masuk">Efek Masuk</option>
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="form-group">
          <label style="font-size:12px">Harga 1 Hari</label>
          <input class="input" id="fm-p1" type="number" placeholder="880000" style="font-size:13px">
        </div>
        <div class="form-group">
          <label style="font-size:12px">Harga 7 Hari</label>
          <input class="input" id="fm-p7" type="number" placeholder="5544000" style="font-size:13px">
        </div>
        <div class="form-group">
          <label style="font-size:12px">Harga 30 Hari</label>
          <input class="input" id="fm-p30" type="number" placeholder="21120000" style="font-size:13px">
        </div>
      </div>
      <div class="form-group">
        <label>Urutan Tampil</label>
        <input class="input" id="fm-sort" type="number" placeholder="0">
      </div>
      <div class="form-group" id="fm-status-row" style="display:none">
        <label>Status</label>
        <select class="input" id="fm-active">
          <option value="true">Aktif</option>
          <option value="false">Non-Aktif</option>
        </select>
      </div>
      <div id="fm-error" class="error-msg" style="display:none"></div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn btn-primary" id="fm-save-btn" style="flex:1">Simpan</button>
        <button class="btn" onclick="closeFrameModal()">Batal</button>
      </div>
    </div>
  </div>
  `;
}

// Track selected image file for modal
let fmSelectedFile = null;
let fmLottieInstance = null; // tracks active lottie-web animation

function destroyFmLottie() {
  if (fmLottieInstance) { try { fmLottieInstance.destroy(); } catch (_) {} fmLottieInstance = null; }
  const el = document.getElementById('fm-live-lottie');
  if (el) { el.innerHTML = ''; el.style.display = 'none'; }
}

function setLiveFramePreview(src, isLottie, animationData) {
  const liveFrame = document.getElementById('fm-live-frame');
  const liveLottie = document.getElementById('fm-live-lottie');
  const label = document.getElementById('fm-preview-label');
  destroyFmLottie();
  if (!src) {
    liveFrame.src = ''; liveFrame.style.display = 'none';
    if (label) { label.innerHTML = 'Pilih gambar<br>untuk preview'; }
    return;
  }
  if (label) label.textContent = '';
  if (isLottie && animationData && typeof lottie !== 'undefined') {
    liveFrame.style.display = 'none';
    liveLottie.style.display = 'block';
    fmLottieInstance = lottie.loadAnimation({
      container: liveLottie,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData,
    });
  } else {
    liveFrame.src = src;
    liveFrame.style.display = 'block';
  }
}

function isJsonFile(file) {
  return file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
}

window.onFmImageSelect = (input) => {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    document.getElementById('fm-img-status').textContent = '✗ Ukuran file melebihi 5MB';
    document.getElementById('fm-img-status').style.color = '#ef4444';
    input.value = ''; return;
  }
  fmSelectedFile = file;
  const lottieFile = isJsonFile(file);
  const reader = new FileReader();
  reader.onload = (e) => {
    const result = e.target.result;
    // Dropzone preview
    const preview = document.getElementById('fm-img-preview');
    document.getElementById('fm-img-placeholder').style.display = 'none';
    document.getElementById('fm-img-change').style.display = 'block';
    document.getElementById('fm-img-status').textContent = `✓ ${file.name} (${(file.size/1024).toFixed(0)} KB)`;
    document.getElementById('fm-img-status').style.color = '#16a34a';
    if (lottieFile) {
      // Show Lottie badge in dropzone
      preview.style.display = 'none';
      const existingBadge = document.getElementById('fm-lottie-badge');
      if (!existingBadge) {
        const badge = document.createElement('div');
        badge.id = 'fm-lottie-badge';
        badge.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:#1e1b4b;border-radius:10px';
        badge.innerHTML = '<div style="font-size:36px">🎬</div><div style="color:#a78bfa;font-weight:700;font-size:13px">Lottie Animation</div><div style="color:#7c3aed;font-size:10px">' + file.name + '</div>';
        document.getElementById('fm-img-area').appendChild(badge);
      }
      // Render Lottie in live preview
      try {
        const animationData = JSON.parse(result);
        setLiveFramePreview(file.name, true, animationData);
      } catch { setLiveFramePreview(null); }
    } else {
      // Remove lottie badge if switching to image
      const b = document.getElementById('fm-lottie-badge');
      if (b) b.remove();
      preview.src = result;
      preview.style.display = 'block';
      setLiveFramePreview(result, false, null);
    }
  };
  if (lottieFile) { reader.readAsText(file); }
  else { reader.readAsDataURL(file); }
};

function resetFmImage(existingUrl, existingType) {
  fmSelectedFile = null;
  document.getElementById('fm-img-input').value = '';
  document.getElementById('fm-img-status').textContent = '';
  const badge = document.getElementById('fm-lottie-badge');
  if (badge) badge.remove();
  const preview = document.getElementById('fm-img-preview');
  if (existingUrl) {
    const isLottie = existingType === 'lottie' || existingUrl.includes('/lottie');
    if (isLottie) {
      preview.style.display = 'none';
      // Show lottie badge for existing lottie frame
      const b = document.createElement('div');
      b.id = 'fm-lottie-badge';
      b.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:#1e1b4b;border-radius:10px';
      b.innerHTML = '<div style="font-size:36px">🎬</div><div style="color:#a78bfa;font-weight:700;font-size:13px">Lottie Animation</div><div style="color:#7c3aed;font-size:10px">Klik area untuk ganti</div>';
      document.getElementById('fm-img-area').appendChild(b);
      // Fetch and render the existing lottie
      fetch(existingUrl).then(r => r.json()).then(data => setLiveFramePreview(existingUrl, true, data)).catch(() => {});
    } else {
      preview.src = existingUrl;
      preview.style.display = 'block';
      setLiveFramePreview(existingUrl, false, null);
    }
    document.getElementById('fm-img-placeholder').style.display = 'none';
    document.getElementById('fm-img-change').style.display = 'block';
    document.getElementById('fm-img-status').textContent = 'File saat ini. Klik area untuk ganti.';
    document.getElementById('fm-img-status').style.color = '#888';
  } else {
    preview.src = ''; preview.style.display = 'none';
    document.getElementById('fm-img-placeholder').style.display = 'flex';
    document.getElementById('fm-img-change').style.display = 'none';
    setLiveFramePreview(null);
  }
}

window.openAddFrameModal = () => {
  document.getElementById('frame-modal-title').textContent = 'Tambah Bingkai';
  document.getElementById('fm-name').value = '';
  document.getElementById('fm-cat').value = 'Bingkai';
  document.getElementById('fm-p1').value = '880000';
  document.getElementById('fm-p7').value = '5544000';
  document.getElementById('fm-p30').value = '21120000';
  document.getElementById('fm-sort').value = '0';
  document.getElementById('fm-status-row').style.display = 'none';
  document.getElementById('fm-error').style.display = 'none';
  resetFmImage(null, null);
  document.getElementById('fm-save-btn').onclick = saveNewFrame;
  document.getElementById('frame-modal').style.display = 'flex';
};

window.openEditFrameModal = async (id) => {
  const frame = shopFramesData.find(f => f.id === id);
  if (!frame) return;
  document.getElementById('frame-modal-title').textContent = 'Edit Bingkai';
  document.getElementById('fm-name').value = frame.name;
  document.getElementById('fm-cat').value = frame.category;
  document.getElementById('fm-p1').value = frame.price_1d;
  document.getElementById('fm-p7').value = frame.price_7d;
  document.getElementById('fm-p30').value = frame.price_30d;
  document.getElementById('fm-sort').value = frame.sort_order;
  document.getElementById('fm-active').value = String(frame.is_active);
  document.getElementById('fm-status-row').style.display = '';
  document.getElementById('fm-error').style.display = 'none';
  resetFmImage(frame.image_url || null, frame.frame_type || 'image');
  document.getElementById('fm-save-btn').onclick = () => saveEditFrame(id);
  document.getElementById('frame-modal').style.display = 'flex';
};

window.closeFrameModal = () => {
  document.getElementById('frame-modal').style.display = 'none';
  fmSelectedFile = null;
  destroyFmLottie();
  const badge = document.getElementById('fm-lottie-badge');
  if (badge) badge.remove();
};

async function uploadFmImage(frameId) {
  if (!fmSelectedFile) return true;
  const statusEl = document.getElementById('fm-img-status');
  const lottieFile = isJsonFile(fmSelectedFile);
  statusEl.textContent = lottieFile ? 'Mengupload Lottie JSON...' : 'Mengupload gambar...';
  statusEl.style.color = '#888';
  let base64, mimeType;
  if (lottieFile) {
    // Read JSON as text → encode to base64
    const text = await fmSelectedFile.text();
    base64 = btoa(unescape(encodeURIComponent(text)));
    mimeType = 'application/json';
  } else {
    base64 = await fileToBase64(fmSelectedFile);
    mimeType = fmSelectedFile.type;
  }
  const res = await api(`/shop-frames/${frameId}/upload`, {
    method: 'POST',
    body: { base64, mimeType },
  });
  if (res?.success) {
    statusEl.textContent = lottieFile ? '✓ Lottie JSON berhasil diupload' : '✓ Gambar berhasil diupload';
    statusEl.style.color = '#16a34a';
    return true;
  } else {
    statusEl.textContent = '✗ Upload gambar gagal — bingkai tetap tersimpan'; statusEl.style.color = '#ef4444';
    return false;
  }
}

async function saveNewFrame() {
  const name = document.getElementById('fm-name').value.trim();
  if (!name) { showFmError('Nama wajib diisi'); return; }
  const btn = document.getElementById('fm-save-btn');
  btn.disabled = true; btn.textContent = 'Menyimpan...';
  const res = await api('/shop-frames', { method: 'POST', body: {
    name,
    category: document.getElementById('fm-cat').value,
    price1d:  document.getElementById('fm-p1').value,
    price7d:  document.getElementById('fm-p7').value,
    price30d: document.getElementById('fm-p30').value,
    sortOrder:document.getElementById('fm-sort').value,
  }});
  if (res?.success) {
    if (fmSelectedFile) {
      btn.textContent = 'Upload gambar...';
      await uploadFmImage(res.id);
    }
    toast('Bingkai ditambahkan', 'success');
    closeFrameModal();
    await renderShopFrames(document.getElementById('content'));
  } else {
    btn.disabled = false; btn.textContent = 'Simpan';
    showFmError(res?.error || 'Gagal menyimpan');
  }
}

async function saveEditFrame(id) {
  const name = document.getElementById('fm-name').value.trim();
  if (!name) { showFmError('Nama wajib diisi'); return; }
  const btn = document.getElementById('fm-save-btn');
  btn.disabled = true; btn.textContent = 'Menyimpan...';
  const res = await api(`/shop-frames/${id}`, { method: 'PATCH', body: {
    name,
    category: document.getElementById('fm-cat').value,
    price1d:  document.getElementById('fm-p1').value,
    price7d:  document.getElementById('fm-p7').value,
    price30d: document.getElementById('fm-p30').value,
    sortOrder:document.getElementById('fm-sort').value,
    isActive: document.getElementById('fm-active').value === 'true',
  }});
  if (res?.success) {
    if (fmSelectedFile) {
      btn.textContent = 'Upload gambar...';
      await uploadFmImage(id);
    }
    toast('Bingkai diperbarui', 'success');
    closeFrameModal();
    await renderShopFrames(document.getElementById('content'));
  } else {
    btn.disabled = false; btn.textContent = 'Simpan';
    showFmError(res?.error || 'Gagal menyimpan');
  }
}

function showFmError(msg) {
  const el = document.getElementById('fm-error');
  el.textContent = msg; el.style.display = 'block';
}

window.deleteFrame = (id, name) => {
  confirm('Hapus Bingkai', `Yakin hapus bingkai "${name}"? Semua pengguna yang memiliki bingkai ini akan terpengaruh.`, async () => {
    const res = await api(`/shop-frames/${id}`, { method: 'DELETE' });
    if (res?.success) { toast('Bingkai dihapus', 'success'); await renderShopFrames(document.getElementById('content')); }
    else toast('Gagal hapus', 'error');
  });
};

window.uploadFrameImage = async (frameId, input) => {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById(`upload-status-${frameId}`);
  statusEl.textContent = 'Mengupload...'; statusEl.style.color = '#888';
  const base64 = await fileToBase64(file);
  const res = await api(`/shop-frames/${frameId}/upload`, { method: 'POST', body: { base64, mimeType: file.type } });
  if (res?.success) {
    statusEl.textContent = '✓ Gambar berhasil diupload'; statusEl.style.color = '#4ade80';
    toast('Gambar bingkai diupload!', 'success');
    await renderShopFrames(document.getElementById('content'));
  } else {
    statusEl.textContent = '✗ Upload gagal'; statusEl.style.color = '#ef4444';
    toast('Upload gagal', 'error');
  }
};

// ─── ENTRY EFFECTS (Efek Masuk) ──────────────────────────────────────────────

let entryEffectsData = [];
let eeSelectedFile = null;
let eeLottieInstance = null;

async function renderEntryEffects(content, includeSubTabs = true) {
  if (includeSubTabs) {
    content.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat data...</div>';
  }
  const res = await api('/shop-entry-effects');
  entryEffectsData = res?.effects || [];
  drawEntryEffects(content, includeSubTabs);
}

function drawEntryEffects(content, includeSubTabs = true) {
  const subTabs = includeSubTabs ? drawShopFramesSubTabs(content) : '';
  content.innerHTML = subTabs + `
  <div class="section-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
    <h2 style="margin:0">Efek Masuk Party (${entryEffectsData.length})</h2>
    <button class="btn btn-primary" onclick="openAddEffectModal()">+ Tambah Efek</button>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px">
    ${entryEffectsData.map(e => `
    <div class="card" style="padding:16px;text-align:center;position:relative">
      <div style="position:absolute;top:8px;right:8px;display:flex;gap:4px">
        <button class="btn btn-sm" onclick="openEditEffectModal('${e.id}')" style="padding:4px 8px;font-size:11px">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteEffect('${e.id}','${e.name}')" style="padding:4px 8px;font-size:11px">Hapus</button>
      </div>
      <div style="width:100%;height:140px;display:flex;align-items:center;justify-content:center;background:#1a1a2e;border-radius:8px;margin-bottom:10px;overflow:hidden">
        ${e.lottie_url
          ? `<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><span style="font-size:38px">🎬</span><span style="color:#a78bfa;font-size:11px;font-weight:600">Lottie Animation</span></div>`
          : '<span style="color:#666;font-size:12px">Belum ada file</span>'
        }
      </div>
      <div style="font-weight:700;margin-bottom:4px">${e.name}</div>
      <div style="font-size:11px;color:#f59e0b">
        1 hari: ${Number(e.price_1d).toLocaleString()}<br>
        7 hari: ${Number(e.price_7d).toLocaleString()}<br>
        30 hari: ${Number(e.price_30d).toLocaleString()}
      </div>
      <div style="margin-top:8px">
        <span class="badge ${e.is_active ? 'badge-success' : 'badge-error'}">${e.is_active ? 'Aktif' : 'Non-Aktif'}</span>
      </div>
      <div style="margin-top:10px">
        <label style="font-size:12px;color:#888;display:block;margin-bottom:4px">Upload Lottie JSON</label>
        <input type="file" accept="application/json,.json" style="font-size:11px;width:100%" onchange="quickUploadEffect('${e.id}', this)">
        <div id="ee-upload-status-${e.id}" style="font-size:11px;margin-top:4px"></div>
      </div>
    </div>`).join('')}
  </div>

  <!-- Add/Edit Effect Modal -->
  <div id="effect-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:460px;max-height:92vh;overflow-y:auto;padding:24px">
      <h3 id="effect-modal-title" style="margin-top:0">Tambah Efek Masuk</h3>

      <div style="display:grid;grid-template-columns:1fr 160px;gap:14px;margin-bottom:16px">
        <div>
          <label style="font-size:13px;font-weight:600;color:#444;display:block;margin-bottom:6px">File Lottie JSON</label>
          <div id="ee-img-area" onclick="document.getElementById('ee-file-input').click()"
            style="width:100%;height:130px;border:2px dashed #7C3AED;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;background:#f8f5ff;gap:6px;position:relative;overflow:hidden">
            <div id="ee-img-placeholder" style="display:flex;flex-direction:column;align-items:center;gap:4px">
              <span style="font-size:28px">🎬</span>
              <span style="color:#7C3AED;font-weight:600;font-size:12px">Klik untuk upload</span>
              <span style="color:#888;font-size:10px">Lottie JSON · maks 5MB</span>
            </div>
            <div id="ee-img-change" style="display:none;position:absolute;bottom:0;left:0;right:0;background:rgba(124,58,237,0.85);color:#fff;text-align:center;padding:5px;font-size:11px;font-weight:600">
              Klik untuk ganti
            </div>
          </div>
          <input type="file" id="ee-file-input" accept="application/json,.json" style="display:none" onchange="onEeFileSelect(this)">
          <div id="ee-file-status" style="font-size:11px;margin-top:4px;color:#888"></div>
        </div>

        <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
          <label style="font-size:13px;font-weight:600;color:#444">Preview</label>
          <div id="ee-lottie-preview" style="width:130px;height:130px;background:#1a1a2e;border-radius:12px;overflow:hidden;display:flex;align-items:center;justify-content:center">
            <span style="color:#666;font-size:11px;text-align:center;padding:8px">Upload file<br>untuk preview</span>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label>Nama Efek *</label>
        <input class="input" id="ee-name" placeholder="Nama efek masuk">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="form-group">
          <label style="font-size:12px">Harga 1 Hari</label>
          <input class="input" id="ee-p1" type="number" placeholder="880000" style="font-size:13px">
        </div>
        <div class="form-group">
          <label style="font-size:12px">Harga 7 Hari</label>
          <input class="input" id="ee-p7" type="number" placeholder="5544000" style="font-size:13px">
        </div>
        <div class="form-group">
          <label style="font-size:12px">Harga 30 Hari</label>
          <input class="input" id="ee-p30" type="number" placeholder="21120000" style="font-size:13px">
        </div>
      </div>
      <div class="form-group">
        <label>Urutan Tampil</label>
        <input class="input" id="ee-sort" type="number" placeholder="0">
      </div>
      <div class="form-group" id="ee-status-row" style="display:none">
        <label>Status</label>
        <select class="input" id="ee-active">
          <option value="true">Aktif</option>
          <option value="false">Non-Aktif</option>
        </select>
      </div>
      <div id="ee-error" class="error-msg" style="display:none"></div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn btn-primary" id="ee-save-btn" style="flex:1">Simpan</button>
        <button class="btn" onclick="closeEffectModal()">Batal</button>
      </div>
    </div>
  </div>
  `;
}

function destroyEeLottie() {
  if (eeLottieInstance) { try { eeLottieInstance.destroy(); } catch (_) {} eeLottieInstance = null; }
  const el = document.getElementById('ee-lottie-preview');
  if (el) { el.innerHTML = '<span style="color:#666;font-size:11px;text-align:center;padding:8px">Upload file<br>untuk preview</span>'; }
}

window.onEeFileSelect = (input) => {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    document.getElementById('ee-file-status').textContent = '✗ Ukuran file melebihi 5MB';
    document.getElementById('ee-file-status').style.color = '#ef4444';
    input.value = ''; return;
  }
  eeSelectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    document.getElementById('ee-img-placeholder').style.display = 'none';
    document.getElementById('ee-img-change').style.display = 'block';
    document.getElementById('ee-file-status').textContent = `✓ ${file.name} (${(file.size/1024).toFixed(0)} KB)`;
    document.getElementById('ee-file-status').style.color = '#16a34a';
    destroyEeLottie();
    try {
      const animData = JSON.parse(text);
      const container = document.getElementById('ee-lottie-preview');
      if (container && typeof lottie !== 'undefined') {
        container.innerHTML = '';
        eeLottieInstance = lottie.loadAnimation({ container, renderer: 'svg', loop: true, autoplay: true, animationData: animData });
      }
    } catch {}
  };
  reader.readAsText(file);
};

window.openAddEffectModal = () => {
  document.getElementById('effect-modal-title').textContent = 'Tambah Efek Masuk';
  document.getElementById('ee-name').value = '';
  document.getElementById('ee-p1').value = '880000';
  document.getElementById('ee-p7').value = '5544000';
  document.getElementById('ee-p30').value = '21120000';
  document.getElementById('ee-sort').value = '0';
  document.getElementById('ee-status-row').style.display = 'none';
  document.getElementById('ee-error').style.display = 'none';
  document.getElementById('ee-img-placeholder').style.display = 'flex';
  document.getElementById('ee-img-change').style.display = 'none';
  document.getElementById('ee-file-status').textContent = '';
  document.getElementById('ee-file-input').value = '';
  eeSelectedFile = null;
  destroyEeLottie();
  document.getElementById('ee-save-btn').onclick = saveNewEffect;
  document.getElementById('effect-modal').style.display = 'flex';
};

window.openEditEffectModal = async (id) => {
  const effect = entryEffectsData.find(e => e.id === id);
  if (!effect) return;
  document.getElementById('effect-modal-title').textContent = 'Edit Efek Masuk';
  document.getElementById('ee-name').value = effect.name;
  document.getElementById('ee-p1').value = effect.price_1d;
  document.getElementById('ee-p7').value = effect.price_7d;
  document.getElementById('ee-p30').value = effect.price_30d;
  document.getElementById('ee-sort').value = effect.sort_order;
  document.getElementById('ee-active').value = String(effect.is_active);
  document.getElementById('ee-status-row').style.display = '';
  document.getElementById('ee-error').style.display = 'none';
  eeSelectedFile = null;
  destroyEeLottie();
  if (effect.lottie_url) {
    document.getElementById('ee-img-placeholder').style.display = 'none';
    document.getElementById('ee-img-change').style.display = 'block';
    document.getElementById('ee-file-status').textContent = 'File Lottie sudah ada. Klik area untuk ganti.';
    document.getElementById('ee-file-status').style.color = '#888';
    fetch(effect.lottie_url).then(r => r.json()).then(data => {
      const container = document.getElementById('ee-lottie-preview');
      if (container && typeof lottie !== 'undefined') {
        container.innerHTML = '';
        eeLottieInstance = lottie.loadAnimation({ container, renderer: 'svg', loop: true, autoplay: true, animationData: data });
      }
    }).catch(() => {});
  } else {
    document.getElementById('ee-img-placeholder').style.display = 'flex';
    document.getElementById('ee-img-change').style.display = 'none';
    document.getElementById('ee-file-status').textContent = '';
  }
  document.getElementById('ee-save-btn').onclick = () => saveEditEffect(id);
  document.getElementById('effect-modal').style.display = 'flex';
};

window.closeEffectModal = () => {
  document.getElementById('effect-modal').style.display = 'none';
  eeSelectedFile = null;
  destroyEeLottie();
};

async function uploadEeFile(effectId) {
  if (!eeSelectedFile) return true;
  const statusEl = document.getElementById('ee-file-status');
  statusEl.textContent = 'Mengupload Lottie JSON...'; statusEl.style.color = '#888';
  const text = await eeSelectedFile.text();
  const base64 = btoa(unescape(encodeURIComponent(text)));
  const res = await api(`/shop-entry-effects/${effectId}/upload`, {
    method: 'POST', body: { base64, mimeType: 'application/json' },
  });
  if (res?.success) {
    statusEl.textContent = '✓ Lottie JSON berhasil diupload'; statusEl.style.color = '#16a34a';
    return true;
  }
  statusEl.textContent = '✗ Upload gagal'; statusEl.style.color = '#ef4444';
  return false;
}

async function saveNewEffect() {
  const name = document.getElementById('ee-name').value.trim();
  if (!name) { showEeError('Nama wajib diisi'); return; }
  const btn = document.getElementById('ee-save-btn');
  btn.disabled = true; btn.textContent = 'Menyimpan...';
  const res = await api('/shop-entry-effects', { method: 'POST', body: {
    name,
    price1d:  document.getElementById('ee-p1').value,
    price7d:  document.getElementById('ee-p7').value,
    price30d: document.getElementById('ee-p30').value,
    sortOrder:document.getElementById('ee-sort').value,
  }});
  if (res?.success) {
    if (eeSelectedFile) { btn.textContent = 'Upload file...'; await uploadEeFile(res.id); }
    toast('Efek masuk ditambahkan', 'success');
    closeEffectModal();
    await renderEntryEffects(document.getElementById('content'));
  } else {
    btn.disabled = false; btn.textContent = 'Simpan';
    showEeError(res?.error || 'Gagal menyimpan');
  }
}

async function saveEditEffect(id) {
  const name = document.getElementById('ee-name').value.trim();
  if (!name) { showEeError('Nama wajib diisi'); return; }
  const btn = document.getElementById('ee-save-btn');
  btn.disabled = true; btn.textContent = 'Menyimpan...';
  const res = await api(`/shop-entry-effects/${id}`, { method: 'PATCH', body: {
    name,
    price1d:  document.getElementById('ee-p1').value,
    price7d:  document.getElementById('ee-p7').value,
    price30d: document.getElementById('ee-p30').value,
    sortOrder:document.getElementById('ee-sort').value,
    isActive: document.getElementById('ee-active').value === 'true',
  }});
  if (res?.success) {
    if (eeSelectedFile) { btn.textContent = 'Upload file...'; await uploadEeFile(id); }
    toast('Efek masuk diperbarui', 'success');
    closeEffectModal();
    await renderEntryEffects(document.getElementById('content'));
  } else {
    btn.disabled = false; btn.textContent = 'Simpan';
    showEeError(res?.error || 'Gagal menyimpan');
  }
}

function showEeError(msg) {
  const el = document.getElementById('ee-error');
  el.textContent = msg; el.style.display = 'block';
}

window.deleteEffect = (id, name) => {
  confirm('Hapus Efek', `Yakin hapus efek masuk "${name}"?`, async () => {
    const res = await api(`/shop-entry-effects/${id}`, { method: 'DELETE' });
    if (res?.success) { toast('Efek dihapus', 'success'); await renderEntryEffects(document.getElementById('content')); }
    else toast('Gagal hapus', 'error');
  });
};

window.quickUploadEffect = async (effectId, input) => {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById(`ee-upload-status-${effectId}`);
  statusEl.textContent = 'Mengupload...'; statusEl.style.color = '#888';
  const text = await file.text();
  const base64 = btoa(unescape(encodeURIComponent(text)));
  const res = await api(`/shop-entry-effects/${effectId}/upload`, { method: 'POST', body: { base64, mimeType: 'application/json' } });
  if (res?.success) {
    statusEl.textContent = '✓ Berhasil diupload'; statusEl.style.color = '#4ade80';
    toast('Lottie efek masuk diupload!', 'success');
    await renderEntryEffects(document.getElementById('content'));
  } else {
    statusEl.textContent = '✗ Upload gagal'; statusEl.style.color = '#ef4444';
  }
};

// ─── LEADERBOARD EDITOR ──────────────────────────────────────────────────────

const LB_TYPES = {
  'LB:Party:GiftReceived:': 'Party – Diamond Diterima (Host)',
  'LB:Party:GiftSent:':     'Party – Koin Dikirim (Pengirim)',
  'LB:GiftReceived:':       'Chatroom – Gift Diterima',
  'LB:GiftSent:':           'Chatroom – Gift Dikirim',
  'LB:MigLevel:':           'Level User',
  'LB:UserLikes:':          'User Likes',
  'LB:PaintPoints:':        'Paint Wars',
  'LB:MostWins:LowCard:':   'Low Card – Wins',
  'LB:MostWins:Dice:':      'Dice – Wins',
  'LB:MostWins:Total:':     'Total Games Won',
};
const LB_PERIODS = ['DAILY', 'WEEKLY', 'MONTHLY', 'ALL_TIME', 'PREVIOUS_DAILY', 'PREVIOUS_WEEKLY', 'PREVIOUS_MONTHLY'];

let lbState = { type: 'LB:Party:GiftReceived:', period: 'WEEKLY', search: '', page: 0, limit: 30 };

async function renderLeaderboardEditor(el) {
  el.innerHTML = `
  <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:18px;">
    <div>
      <label style="font-size:12px;color:#888;display:block;margin-bottom:4px;">Tipe Leaderboard</label>
      <select id="lb-type" class="input" style="min-width:260px;">
        ${Object.entries(LB_TYPES).map(([v,l])=>`<option value="${v}"${v===lbState.type?' selected':''}>${l}</option>`).join('')}
      </select>
    </div>
    <div>
      <label style="font-size:12px;color:#888;display:block;margin-bottom:4px;">Periode</label>
      <select id="lb-period" class="input">
        ${LB_PERIODS.map(p=>`<option value="${p}"${p===lbState.period?' selected':''}>${p}</option>`).join('')}
      </select>
    </div>
    <div>
      <label style="font-size:12px;color:#888;display:block;margin-bottom:4px;">Cari Username</label>
      <input id="lb-search" class="input" placeholder="username..." value="${lbState.search}" style="width:160px;">
    </div>
    <button class="btn btn-primary" id="lb-search-btn">Cari</button>
  </div>
  <div style="background:#1e1e2e;border-radius:10px;padding:16px;margin-bottom:18px;">
    <h3 style="margin:0 0 10px;font-size:14px;color:#aaa;">Recalculate dari Transaksi Diamond</h3>
    <p style="font-size:12px;color:#888;margin:0 0 10px;">Koreksi skor leaderboard diamond berdasarkan data transaksi nyata di database untuk satu user.</p>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <input id="lb-recalc-user" class="input" placeholder="username" style="width:180px;">
      <select id="lb-recalc-period" class="input">
        ${['DAILY','WEEKLY','MONTHLY','ALL_TIME'].map(p=>`<option value="${p}"${p==='WEEKLY'?' selected':''}>${p}</option>`).join('')}
      </select>
      <button class="btn btn-primary" onclick="doRecalc()">Recalculate</button>
    </div>
    <div id="lb-recalc-result" style="margin-top:8px;font-size:13px;"></div>
  </div>
  <div id="lb-table-wrap"><div class="loading"><div class="spinner"></div>Memuat...</div></div>`;

  document.getElementById('lb-search-btn').onclick = async () => {
    lbState.type   = document.getElementById('lb-type').value;
    lbState.period = document.getElementById('lb-period').value;
    lbState.search = document.getElementById('lb-search').value.trim();
    lbState.page   = 0;
    await loadLbTable();
  };
  document.getElementById('lb-search').onkeydown = (e) => {
    if (e.key === 'Enter') document.getElementById('lb-search-btn').click();
  };
  await loadLbTable();
}

async function loadLbTable() {
  const wrap = document.getElementById('lb-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat...</div>';
  const params = new URLSearchParams({
    type: lbState.type, period: lbState.period,
    search: lbState.search,
    limit: String(lbState.limit),
    offset: String(lbState.page * lbState.limit),
  });
  const data = await api(`/leaderboard-admin/entries?${params}`);
  if (!data) return;

  const totalPages = Math.ceil(data.total / lbState.limit);
  wrap.innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
    <span style="font-size:13px;color:#aaa;">Total: <b>${fmtNum(data.total)}</b> entri</span>
    <div style="display:flex;gap:6px;">
      <button class="btn" onclick="lbPage(-1)" ${lbState.page===0?'disabled':''}>‹ Prev</button>
      <span style="font-size:13px;padding:6px 10px;color:#aaa;">Hal ${lbState.page+1}/${Math.max(1,totalPages)}</span>
      <button class="btn" onclick="lbPage(1)" ${lbState.page>=totalPages-1?'disabled':''}>Next ›</button>
    </div>
  </div>
  <table class="table">
    <thead><tr>
      <th>#</th><th>Username</th><th>Skor Sekarang</th><th>Terakhir Diupdate</th><th>Aksi</th>
    </tr></thead>
    <tbody>
      ${data.entries.length === 0 ? `<tr><td colspan="5" style="text-align:center;color:#888;padding:24px;">Tidak ada data</td></tr>` :
        data.entries.map((e, i) => `
        <tr id="lb-row-${e.id}">
          <td style="color:#666;">${lbState.page * lbState.limit + i + 1}</td>
          <td><b>${e.username}</b></td>
          <td>
            <span id="lb-score-${e.id}">${fmtNum(e.score)}</span>
            <span style="color:#888;font-size:11px;"> 💎</span>
          </td>
          <td style="color:#666;font-size:12px;">${new Date(e.updated_at).toLocaleString('id-ID')}</td>
          <td style="display:flex;gap:6px;align-items:center;">
            <input id="lb-new-${e.id}" class="input" type="number" min="0" value="${e.score}" style="width:110px;padding:4px 8px;font-size:13px;">
            <button class="btn btn-primary" style="padding:4px 10px;font-size:12px;" onclick="saveLbScore(${e.id})">Simpan</button>
            <button class="btn btn-danger" style="padding:4px 10px;font-size:12px;" onclick="deleteLbEntry(${e.id},'${e.username}')">Hapus</button>
          </td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

window.lbPage = async (dir) => {
  lbState.page = Math.max(0, lbState.page + dir);
  await loadLbTable();
};

window.saveLbScore = async (id) => {
  const inp = document.getElementById(`lb-new-${id}`);
  const newScore = parseFloat(inp.value);
  if (isNaN(newScore) || newScore < 0) { toast('Skor tidak valid', 'error'); return; }
  const reason = prompt('Alasan koreksi (opsional):') ?? '';
  const res = await api(`/leaderboard-admin/entries/${id}`, {
    method: 'PATCH', body: { score: newScore, reason },
  });
  if (res?.success) {
    document.getElementById(`lb-score-${id}`).textContent = fmtNum(newScore);
    toast(`Skor dikoreksi: ${fmtNum(res.old)} → ${fmtNum(res.new)}`, 'success');
  } else {
    toast(res?.error || 'Gagal menyimpan', 'error');
  }
};

window.deleteLbEntry = (id, username) => {
  confirm('Hapus Entry Leaderboard', `Yakin hapus skor leaderboard milik ${username}? Skor akan menjadi 0 (entry dihapus).`, async () => {
    const res = await api(`/leaderboard-admin/entries/${id}`, { method: 'DELETE' });
    if (res?.success) {
      const row = document.getElementById(`lb-row-${id}`);
      if (row) row.remove();
      toast('Entry dihapus', 'success');
    } else {
      toast(res?.error || 'Gagal hapus', 'error');
    }
  });
};

window.doRecalc = async () => {
  const username = document.getElementById('lb-recalc-user').value.trim();
  const period   = document.getElementById('lb-recalc-period').value;
  const resultEl = document.getElementById('lb-recalc-result');
  if (!username) { toast('Username wajib diisi', 'error'); return; }
  resultEl.textContent = 'Menghitung...'; resultEl.style.color = '#aaa';
  const res = await api('/leaderboard-admin/recalc', { method: 'POST', body: { username, period } });
  if (res?.success) {
    resultEl.innerHTML = `✓ Skor ${username} periode ${period} dikoreksi menjadi <b>${fmtNum(res.recalcScore)}</b> diamond (berdasarkan transaksi nyata).`;
    resultEl.style.color = '#4ade80';
    toast('Recalculate berhasil', 'success');
  } else {
    resultEl.textContent = res?.error || 'Gagal recalculate';
    resultEl.style.color = '#ef4444';
  }
};

// ─── AGENCIES ─────────────────────────────────────────────────────────────────
const agState = { page: 1, status: 'all', search: '' };

async function renderAgencies(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
  await loadAgencies(el);
}

async function loadAgencies(el) {
  const params = new URLSearchParams({
    page: String(agState.page),
    limit: '20',
    status: agState.status,
    search: agState.search,
  });
  const data = await api(`/agencies?${params}`);
  if (!data) return;

  const { agencies, total, stats } = data;
  const totalPages = Math.ceil(total / 20);
  const s = stats || {};

  const commissionLabel = v => '10%';
  const statusBadge = st => ({
    pending:  '<span class="badge yellow">⏳ Pending</span>',
    approved: '<span class="badge green">✅ Approved</span>',
    rejected: '<span class="badge red">❌ Rejected</span>',
  }[st] || `<span class="badge gray">${esc(st)}</span>`);

  el.innerHTML = `
  <!-- Stats row -->
  <div class="stats-grid" style="margin-bottom:20px">
    <div class="stat-card blue">
      <div class="stat-label">Total Agencies</div>
      <div class="stat-value">${fmtNum(s.total || 0)}</div>
    </div>
    <div class="stat-card yellow" style="border-left-color:#d97706">
      <div class="stat-label">Pending Review</div>
      <div class="stat-value" style="color:#d97706">${fmtNum(s.pending || 0)}</div>
    </div>
    <div class="stat-card green">
      <div class="stat-label">Approved</div>
      <div class="stat-value" style="color:#16a34a">${fmtNum(s.approved || 0)}</div>
    </div>
    <div class="stat-card red">
      <div class="stat-label">Rejected</div>
      <div class="stat-value" style="color:#dc2626">${fmtNum(s.rejected || 0)}</div>
    </div>
  </div>

  <!-- Toolbar -->
  <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
    <input class="input" id="ag-search" placeholder="Search agency name..." value="${esc(agState.search)}" style="max-width:260px" />
    <select class="input" id="ag-status" style="max-width:160px">
      <option value="all"     ${agState.status==='all'     ?'selected':''}>All Status</option>
      <option value="pending" ${agState.status==='pending' ?'selected':''}>Pending</option>
      <option value="approved"${agState.status==='approved'?'selected':''}>Approved</option>
      <option value="rejected"${agState.status==='rejected'?'selected':''}>Rejected</option>
    </select>
    <button class="btn btn-primary" id="ag-search-btn">Search</button>
    <button class="btn btn-success" id="ag-add-btn" style="margin-left:auto">+ Add Agency</button>
    <button class="btn btn-primary" id="ag-join-req-btn" style="background:#0891b2;border-color:#0891b2">📥 Join Requests</button>
    ${state.isSuperAdmin ? `<button class="btn btn-primary" id="ag-send-diamond-btn" style="background:#7c3aed;border-color:#7c3aed">💎 Kirim Diamond</button>` : ''}
    <button class="btn btn-outline" id="ag-export-btn" style="border-color:#16a34a;color:#16a34a">⬇ Export CSV</button>
  </div>

  <!-- Join Requests Panel -->
  <div id="ag-join-req-panel" style="display:none;margin-bottom:20px;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h3 style="margin:0;font-size:17px">📥 Join Requests</h3>
      <div style="display:flex;gap:8px;align-items:center">
        <select id="ag-jr-filter" class="input" style="max-width:140px;padding:6px 10px;font-size:13px">
          <option value="all">All Status</option>
          <option value="pending" selected>Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <button class="btn" style="background:var(--bg);border:1px solid var(--border);font-size:13px" onclick="agLoadJoinRequests()">🔄 Refresh</button>
        <button class="btn" style="background:transparent;border:none;font-size:18px;cursor:pointer;padding:2px 6px" onclick="document.getElementById('ag-join-req-panel').style.display='none'">✕</button>
      </div>
    </div>
    <div id="ag-jr-body"><div style="text-align:center;padding:24px;color:var(--text-muted)">Loading...</div></div>
  </div>

  <!-- Table -->
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Logo</th>
          <th>Agency Name</th>
          <th>WhatsApp</th>
          <th>Country</th>
          <th>Members</th>
          <th>Commission</th>
          <th style="text-align:right">💎 Total Earned</th>
          <th>Status</th>
          <th>Registered</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${agencies.length === 0
          ? `<tr><td colspan="10"><div class="empty">No agencies found</div></td></tr>`
          : agencies.map(a => `
          <tr id="ag-row-${a.id}">
            <td>
              ${a.logo_url
                ? `<img src="${esc(a.logo_url)}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;border:1px solid var(--border)" onerror="this.style.display='none'" />`
                : `<div style="width:40px;height:40px;border-radius:8px;background:var(--bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:20px">🏢</div>`}
            </td>
            <td>
              <strong style="cursor:pointer;color:var(--primary);text-decoration:underline"
                onclick="agViewHosts(${a.id},'${esc(a.agency_name)}')">${esc(a.agency_name)}</strong>
              ${a.registered_by ? `<br><small style="color:var(--text-muted)">👤 @${esc(a.registered_by)}</small>` : '<br><small style="color:#ef4444">⚠ No owner</small>'}
              ${a.notes ? `<br><small style="color:var(--text-muted);max-width:180px;display:inline-block;white-space:normal">${esc(a.notes)}</small>` : ''}
            </td>
            <td><a href="https://wa.me/${esc(String(a.whatsapp).replace(/\D/g,''))}" target="_blank" style="color:var(--primary)">${esc(a.whatsapp)}</a></td>
            <td>${esc(a.country)}</td>
            <td style="text-align:center"><strong>${a.member_count}</strong></td>
            <td><span class="badge purple">${commissionLabel(a.commission)}</span></td>
            <td style="text-align:right;white-space:nowrap">
              <div style="font-family:monospace;font-weight:700;color:#60e0ff">${fmtD(Number(a.total_host_earned??0))}</div>
              <div style="font-size:11px;color:var(--text-muted)">${fmtIDR(Number(a.total_host_earned??0))}</div>
            </td>
            <td>${statusBadge(a.status)}</td>
            <td style="font-size:12px;color:var(--text-muted)">${fmtDate(a.registered_at)}${a.reviewed_by ? `<br><small>by ${esc(a.reviewed_by)}</small>` : ''}</td>
            <td style="white-space:nowrap;display:flex;gap:4px;flex-wrap:wrap">
              ${a.status !== 'approved' ? `<button class="btn btn-sm btn-success" onclick="agApprove(${a.id})">Approve</button>` : ''}
              ${a.status !== 'rejected' ? `<button class="btn btn-sm btn-danger"  onclick="agReject(${a.id})">Reject</button>`  : ''}
              ${a.status === 'pending'  ? `<button class="btn btn-sm btn-outline" onclick="agEdit(${a.id})">Edit</button>` : ''}
              <button class="btn btn-sm" style="background:#ede9fe;color:#5b21b6" onclick="agViewHosts(${a.id},'${esc(a.agency_name)}')">👥 Hosts</button>
              <button class="btn btn-sm" style="background:#f1f5f9;color:#475569" onclick="agDelete(${a.id},'${esc(a.agency_name)}')">Delete</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <!-- Pagination -->
  <div class="pagination">
    <div class="page-info">Total: ${fmtNum(total)} agencies | Page ${agState.page} of ${Math.max(1, totalPages)}</div>
    ${agState.page > 1            ? `<button class="btn btn-outline btn-sm" id="ag-prev">← Prev</button>` : ''}
    ${agState.page < totalPages   ? `<button class="btn btn-outline btn-sm" id="ag-next">Next →</button>` : ''}
  </div>

  <!-- Send Diamond Modal (Super Admin only) -->
  ${state.isSuperAdmin ? `<div class="modal-overlay" id="ag-send-diamond-modal" style="z-index:600">` : '<div id="ag-send-diamond-modal" style="display:none">'}
    <div class="modal" style="max-width:440px;width:90%">
      <h3 style="margin-bottom:18px">💎 Kirim Diamond ke Agency</h3>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="field-group">
          <label>Username Penerima *</label>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--primary);font-weight:700">@</span>
            <input class="input" id="ag-dt-username" type="text" placeholder="username agency owner" style="flex:1" autocomplete="off" />
          </div>
        </div>
        <div class="field-group">
          <label>Jumlah Diamond * <small style="color:var(--text-muted);font-weight:400">(user withdraw seperti biasa)</small></label>
          <input class="input" id="ag-dt-amount" type="number" min="1" max="10000000" placeholder="e.g. 50000" />
          <small id="ag-dt-idr" style="color:var(--text-muted);display:block;margin-top:4px"></small>
        </div>
        <div class="field-group">
          <label>Pesan / Keterangan (opsional)</label>
          <input class="input" id="ag-dt-message" type="text" placeholder="e.g. Komisi bulan Mei 2026" maxlength="200" />
        </div>
      </div>
      <div id="ag-dt-err" class="error-msg" style="display:none;margin-top:10px"></div>
      <div class="modal-actions" style="margin-top:20px">
        <button class="btn btn-outline" onclick="document.getElementById('ag-send-diamond-modal').style.display='none'">Batal</button>
        <button class="btn btn-primary" id="ag-dt-save-btn" style="background:#7c3aed;border-color:#7c3aed">💎 Kirim Sekarang</button>
      </div>
    </div>
  </div>

  <!-- Add Agency Modal -->
  <div class="modal-overlay" id="ag-modal" style="z-index:600">
    <div class="modal" style="max-width:520px;width:90%">
      <h3 id="ag-modal-title">Add Agency</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">
        <div class="field-group" style="grid-column:span 2">
          <label>Owner Username * <small style="color:var(--text-muted);font-weight:400">(username pemilik agency)</small></label>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--primary);font-weight:700">@</span>
            <input class="input" id="ag-f-registered-by" type="text" placeholder="username" style="flex:1" maxlength="60" autocomplete="off" />
          </div>
          <small style="color:var(--text-muted)">Isi username member yang akan menjadi pemilik agency. Setelah di-approve, dashboard agency otomatis muncul di app mereka.</small>
        </div>
        <div class="field-group" style="grid-column:span 2">
          <label>Agency Name *</label>
          <input class="input" id="ag-f-name" type="text" placeholder="e.g. StarNight Agency" maxlength="120" />
        </div>
        <div class="field-group">
          <label>WhatsApp *</label>
          <input class="input" id="ag-f-wa" type="tel" placeholder="+62 8xx xxxx xxxx" />
        </div>
        <div class="field-group">
          <label>Country *</label>
          <select class="input" id="ag-f-country">
            <option value="">-- Select --</option>
            ${['Indonesia','Malaysia','Thailand','Vietnam','Philippines','Singapore','Brunei','Myanmar','Cambodia','Laos'].map(c=>`<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="field-group">
          <label>Member Count</label>
          <input class="input" id="ag-f-members" type="number" min="1" placeholder="e.g. 10" />
        </div>
        <div class="field-group">
          <label>Commission Tier</label>
          <select class="input" id="ag-f-commission" disabled>
            <option value="10" selected>10% (Fixed)</option>
          </select>
        </div>
        <div class="field-group" style="grid-column:span 2">
          <label>Logo URL (optional)</label>
          <input class="input" id="ag-f-logo" type="url" placeholder="https://..." />
        </div>
        <div class="field-group" style="grid-column:span 2">
          <label>Notes (optional)</label>
          <input class="input" id="ag-f-notes" type="text" placeholder="Internal notes..." />
        </div>
      </div>
      <div id="ag-modal-err" class="error-msg" style="display:none;margin-top:8px"></div>
      <div class="modal-actions" style="margin-top:20px">
        <button class="btn btn-outline" onclick="closeAgModal()">Cancel</button>
        <button class="btn btn-primary" id="ag-modal-save-btn">Save Agency</button>
      </div>
    </div>
  </div>`;

  // Toolbar events
  const el_content = el;
  document.getElementById('ag-search-btn').onclick = () => {
    agState.search = document.getElementById('ag-search').value.trim();
    agState.status = document.getElementById('ag-status').value;
    agState.page = 1;
    loadAgencies(el_content);
  };
  document.getElementById('ag-search').onkeydown = (e) => {
    if (e.key === 'Enter') document.getElementById('ag-search-btn').click();
  };
  document.getElementById('ag-status').onchange = () => document.getElementById('ag-search-btn').click();
  document.getElementById('ag-add-btn').onclick = () => openAgModal();
  document.getElementById('ag-join-req-btn').onclick = () => {
    const panel = document.getElementById('ag-join-req-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') agLoadJoinRequests();
  };
  document.getElementById('ag-jr-filter').onchange = () => agLoadJoinRequests();
  if (document.getElementById('ag-prev')) document.getElementById('ag-prev').onclick = () => { agState.page--; loadAgencies(el_content); };
  if (document.getElementById('ag-next')) document.getElementById('ag-next').onclick = () => { agState.page++; loadAgencies(el_content); };
  document.getElementById('ag-modal-save-btn').onclick = () => saveAgency(el_content);

  // Export CSV
  document.getElementById('ag-export-btn').onclick = async () => {
    const btn = document.getElementById('ag-export-btn');
    const origText = btn.textContent;
    btn.textContent = '⏳ Exporting...';
    btn.disabled = true;
    try {
      const params = new URLSearchParams({ status: agState.status });
      const res = await fetch(`/api/agencies/export?${params}`, {
        headers: { Authorization: 'Bearer ' + state.token },
      });
      if (!res.ok) { toast('Gagal export CSV', 'error'); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const cd   = res.headers.get('Content-Disposition') ?? '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : `agencies-export.csv`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('CSV berhasil didownload!', 'success');
    } catch (e) {
      toast('Error saat export', 'error');
    } finally {
      btn.textContent = origText;
      btn.disabled = false;
    }
  };

  // Send Diamond modal (Super Admin only)
  if (state.isSuperAdmin && document.getElementById('ag-send-diamond-btn')) document.getElementById('ag-send-diamond-btn').onclick = () => {
    document.getElementById('ag-dt-username').value = '';
    document.getElementById('ag-dt-amount').value = '';
    document.getElementById('ag-dt-message').value = '';
    document.getElementById('ag-dt-idr').textContent = '';
    document.getElementById('ag-dt-err').style.display = 'none';
    document.getElementById('ag-send-diamond-modal').style.display = 'flex';
  };
  document.getElementById('ag-dt-amount').oninput = () => {
    const val = parseFloat(document.getElementById('ag-dt-amount').value);
    document.getElementById('ag-dt-idr').textContent =
      val > 0 ? `≈ Rp ${(val * 2).toLocaleString('id-ID')} nilai withdraw` : '';
  };
  document.getElementById('ag-dt-save-btn').onclick = async () => {
    const username = document.getElementById('ag-dt-username').value.trim();
    const amount   = parseInt(document.getElementById('ag-dt-amount').value);
    const message  = document.getElementById('ag-dt-message').value.trim();
    const errEl    = document.getElementById('ag-dt-err');
    const saveBtn  = document.getElementById('ag-dt-save-btn');
    errEl.style.display = 'none';
    if (!username) { errEl.textContent = 'Username wajib diisi'; errEl.style.display = 'block'; return; }
    if (!amount || amount <= 0) { errEl.textContent = 'Jumlah diamond harus lebih dari 0'; errEl.style.display = 'block'; return; }
    saveBtn.disabled = true; saveBtn.textContent = '⏳ Mengirim...';
    try {
      const res = await api('/agencies/send-diamond', { method: 'POST', body: { username, amount, message } });
      if (res?.success) {
        document.getElementById('ag-send-diamond-modal').style.display = 'none';
        toast(`✅ ${res.message}`, 'success');
      } else {
        errEl.textContent = res?.error ?? 'Gagal mengirim diamond';
        errEl.style.display = 'block';
      }
    } catch (e) {
      errEl.textContent = 'Error: ' + e.message;
      errEl.style.display = 'block';
    }
    saveBtn.disabled = false; saveBtn.textContent = '💎 Kirim Sekarang';
  };

  // Row actions
  window.agApprove = (id) => {
    confirm('Approve Agency', 'Approve this agency? They will be notified via their WhatsApp.', async () => {
      const res = await api(`/agencies/${id}/status`, { method: 'PATCH', body: { status: 'approved' } });
      if (res?.success) { toast('Agency approved', 'success'); loadAgencies(el_content); }
      else toast(res?.error || 'Failed', 'error');
    }, false);
  };
  window.agReject = (id) => {
    const reason = prompt('Reason for rejection (optional):') ?? '';
    confirm('Reject Agency', 'Reject this agency registration?', async () => {
      const res = await api(`/agencies/${id}/status`, { method: 'PATCH', body: { status: 'rejected', notes: reason } });
      if (res?.success) { toast('Agency rejected', 'success'); loadAgencies(el_content); }
      else toast(res?.error || 'Failed', 'error');
    });
  };
  window.agDelete = (id, name) => {
    confirm('Delete Agency', `Permanently delete "${name}"? This cannot be undone.`, async () => {
      const res = await api(`/agencies/${id}`, { method: 'DELETE' });
      if (res?.success) { document.getElementById(`ag-row-${id}`)?.remove(); toast('Agency deleted', 'success'); }
      else toast(res?.error || 'Failed', 'error');
    });
  };
  window.agEdit = (id) => openAgModal(id);

  window.agLoadJoinRequests = async () => {
    const body = document.getElementById('ag-jr-body');
    const filter = document.getElementById('ag-jr-filter')?.value ?? 'pending';
    body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted)">Loading...</div>';
    try {
      const data = await api(`/agencies/join-requests?status=${filter}`);
      const reqs = data?.requests ?? [];
      if (reqs.length === 0) {
        body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted)">Tidak ada join request untuk filter ini.</div>';
        return;
      }
      const statusBadge = (s) => {
        if (s === 'pending')  return `<span style="background:#f59e0b20;color:#f59e0b;border:1px solid #f59e0b50;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">⏳ Pending</span>`;
        if (s === 'approved') return `<span style="background:#22c55e20;color:#22c55e;border:1px solid #22c55e50;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">✅ Diterima</span>`;
        return `<span style="background:#ef444420;color:#ef4444;border:1px solid #ef444450;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">❌ Ditolak</span>`;
      };
      body.innerHTML = `
        <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:1px solid var(--border)">
              <th style="text-align:left;padding:8px 12px;font-size:12px;color:var(--text-muted)">Username</th>
              <th style="text-align:left;padding:8px 12px;font-size:12px;color:var(--text-muted)">Agency</th>
              <th style="text-align:left;padding:8px 12px;font-size:12px;color:var(--text-muted)">Pesan</th>
              <th style="text-align:left;padding:8px 12px;font-size:12px;color:var(--text-muted)">Waktu</th>
              <th style="text-align:left;padding:8px 12px;font-size:12px;color:var(--text-muted)">Status</th>
              <th style="text-align:left;padding:8px 12px;font-size:12px;color:var(--text-muted)">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${reqs.map(r => `
            <tr id="ag-jr-row-${r.id}" style="border-bottom:1px solid var(--border)">
              <td style="padding:10px 12px;font-weight:600">@${esc(r.username)}</td>
              <td style="padding:10px 12px;font-size:13px">${esc(r.agency_name)}<br><span style="color:var(--text-muted);font-size:11px">${esc(r.agency_code ?? '')}</span></td>
              <td style="padding:10px 12px;font-size:12px;color:var(--text-muted);max-width:200px">${r.message ? `"${esc(r.message)}"` : '-'}</td>
              <td style="padding:10px 12px;font-size:12px;white-space:nowrap">${new Date(r.requested_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}</td>
              <td style="padding:10px 12px">${statusBadge(r.status)}</td>
              <td style="padding:10px 12px">
                ${r.status === 'pending' ? `
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-sm btn-success" style="font-size:12px" onclick="agReviewJoinReq('${r.id}','approved')">✅ Terima</button>
                    <button class="btn btn-sm" style="background:#ef444420;color:#ef4444;border:1px solid #ef444450;font-size:12px" onclick="agReviewJoinReq('${r.id}','rejected')">❌ Tolak</button>
                  </div>
                ` : '<span style="color:var(--text-muted);font-size:12px">—</span>'}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
        </div>`;
    } catch (err) {
      body.innerHTML = `<div style="text-align:center;padding:24px;color:#ef4444">Gagal memuat: ${err.message}</div>`;
    }
  };

  window.agReviewJoinReq = async (reqId, action) => {
    const row = document.getElementById(`ag-jr-row-${reqId}`);
    if (row) {
      const btns = row.querySelectorAll('button');
      btns.forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
    }
    try {
      const res = await api(`/agencies/join-requests/${reqId}`, {
        method: 'PATCH',
        body: { status: action },
      });
      if (res?.success) {
        toast(action === 'approved' ? 'Request diterima' : 'Request ditolak', 'success');
        agLoadJoinRequests();
        loadAgencies(el_content);
      } else {
        toast(res?.error || 'Gagal', 'error');
        if (row) {
          const btns = row.querySelectorAll('button');
          btns.forEach(b => { b.disabled = false; b.style.opacity = '1'; });
        }
      }
    } catch {
      toast('Tidak bisa terhubung ke server', 'error');
    }
  };

  window.agViewHosts = async (agencyId, agencyName) => {
    const existing = document.getElementById('ag-hosts-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ag-hosts-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;width:100%;max-width:720px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden">
        <div style="padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <div>
            <h3 style="margin:0;font-size:17px">👥 Hosts & Komisi — ${esc(agencyName)}</h3>
            <p id="ag-hs-summary" style="margin:4px 0 0;font-size:13px;color:var(--text-muted)">Memuat...</p>
          </div>
          <button onclick="document.getElementById('ag-hosts-overlay').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-muted);line-height:1">×</button>
        </div>
        <div id="ag-hs-body" style="overflow-y:auto;padding:20px;flex:1">
          <div style="text-align:center;padding:40px;color:var(--text-muted)">⏳ Memuat data host...</div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const fmtD   = n => `💎 ${Math.round(n).toLocaleString('id-ID')}`;
    const fmtIDR = d => `Rp ${(d * 2).toLocaleString('id-ID')}`;

    const renderHosts = (data) => {
      const { hosts, totalEarned, commissionEarned, commissionPaid, commissionOwed, ownerUsername } = data;

      document.getElementById('ag-hs-summary').textContent =
        `${hosts.length} host · Total earned: ${fmtD(totalEarned)} · Komisi agency: ${fmtD(commissionEarned)} · Owner: @${ownerUsername || '-'}`;

      // ── Commission card ──
      const commColor  = commissionOwed > 0 ? '#ef4444' : '#22c55e';
      const commCard = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px">
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Total Earned Host</div>
            <div style="font-size:15px;font-weight:700;font-family:monospace;color:#60e0ff">${fmtD(totalEarned)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${fmtIDR(totalEarned)}</div>
          </div>
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px">
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Komisi Agency (10%)</div>
            <div style="font-size:15px;font-weight:700;font-family:monospace;color:#f59e0b">${fmtD(commissionEarned)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:3px">Sudah dibayar: ${fmtD(commissionPaid)}</div>
          </div>
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px">
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Belum Dibayar ke Owner</div>
            <div style="font-size:15px;font-weight:700;font-family:monospace;color:${commColor}">${fmtD(commissionOwed)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:3px">@${ownerUsername || '-'}</div>
          </div>
        </div>
        ${commissionOwed > 0 ? `
        <div style="margin-bottom:20px;display:flex;gap:12px;align-items:center;background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;padding:12px 16px">
          <span style="font-size:13px;color:#92400e;flex:1">
            Platform belum membayar komisi <strong>${fmtD(commissionOwed)}</strong> (≈ ${fmtIDR(commissionOwed)}) ke <strong>@${ownerUsername}</strong>
          </span>
          <button id="ag-pay-comm-btn"
            onclick="agPayCommission(${agencyId}, '${ownerUsername}', ${commissionOwed}, '${esc(agencyName)}')"
            style="background:#f59e0b;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap">
            💸 Bayar Komisi
          </button>
        </div>` : `
        <div style="margin-bottom:20px;padding:10px 16px;background:#f0fdf4;border:1px solid #22c55e;border-radius:10px;font-size:13px;color:#166534">
          ✅ Komisi agency sudah lunas dibayarkan ke @${ownerUsername}
        </div>`}`;

      // ── Host cards ──
      const medals = ['🥇','🥈','🥉'];
      const hostCards = !hosts.length
        ? `<div style="text-align:center;padding:40px;color:var(--text-muted)">Belum ada host di agency ini.</div>`
        : `<div style="display:flex;flex-direction:column;gap:10px">
            ${hosts.map((h, i) => {
              const initials = h.username.slice(0,2).toUpperCase();
              const avatarEl = h.avatar_url
                ? `<img src="${esc(h.avatar_url)}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid var(--border);flex-shrink:0" onerror="this.outerHTML='<div style=&quot;width:52px;height:52px;border-radius:50%;background:#7c3aed22;border:2px solid #7c3aed44;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#7c3aed;flex-shrink:0&quot;>${initials}</div>'" />`
                : `<div style="width:52px;height:52px;border-radius:50%;background:#7c3aed22;border:2px solid #7c3aed44;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#7c3aed;flex-shrink:0">${initials}</div>`;
              const joinDate = h.added_at ? new Date(h.added_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
              const rankLabel = i < 3 ? medals[i] : `#${i+1}`;
              const partyHrs  = Number(h.party_hours ?? 0).toFixed(1);
              const partyCnt  = h.party_count ?? 0;
              return `
              <div style="display:flex;align-items:center;gap:14px;background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:14px">
                <div style="font-size:20px;width:28px;text-align:center;flex-shrink:0">${rankLabel}</div>
                ${avatarEl}
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <strong style="font-size:14px">@${esc(h.username)}</strong>
                    <span class="badge purple" style="font-size:10px">${esc(h.role)}</span>
                    <span class="badge ${h.status==='active'?'green':'yellow'}" style="font-size:10px">${h.status}</span>
                  </div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:3px">Bergabung: ${joinDate}</div>
                  <div style="display:flex;gap:16px;margin-top:8px;flex-wrap:wrap">
                    <div>
                      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">💎 Earned</div>
                      <div style="font-size:13px;font-weight:700;color:#60e0ff;font-family:monospace">${fmtD(h.total_earned)}</div>
                      <div style="font-size:10px;color:var(--text-muted)">${fmtIDR(h.total_earned)}</div>
                    </div>
                    <div style="width:1px;background:var(--border)"></div>
                    <div>
                      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">⏱ Live Party</div>
                      <div style="font-size:13px;font-weight:700;color:#a78bfa">${partyHrs} jam</div>
                      <div style="font-size:10px;color:var(--text-muted)">${partyCnt} room</div>
                    </div>
                    <div style="width:1px;background:var(--border)"></div>
                    <div>
                      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">Komisi (10%)</div>
                      <div style="font-size:13px;font-weight:700;color:#f59e0b;font-family:monospace">${fmtD(Math.floor(h.total_earned*0.1))}</div>
                    </div>
                  </div>
                </div>
              </div>`;
            }).join('')}
            <div style="padding:10px 14px;background:var(--surface);border-radius:10px;border:1px solid var(--border);font-size:12px;color:var(--text-muted);display:flex;gap:20px;flex-wrap:wrap">
              <span>Total earned semua host: <strong style="color:#60e0ff">${fmtD(totalEarned)}</strong></span>
              <span>Total komisi agency: <strong style="color:#f59e0b">${fmtD(commissionEarned)}</strong> (${fmtIDR(commissionEarned)})</span>
            </div>
          </div>`;

      document.getElementById('ag-hs-body').innerHTML = commCard + hostCards;
    };

    try {
      const data = await api(`/agencies/${agencyId}/hosts`);
      if (!data || data.error) {
        document.getElementById('ag-hs-body').innerHTML = `<p style="color:red">${data?.error || 'Gagal memuat'}</p>`;
        return;
      }
      renderHosts(data);
    } catch (e) {
      document.getElementById('ag-hs-body').innerHTML = `<p style="color:red">Error: ${e.message}</p>`;
    }
  };

  window.agPayCommission = async (agencyId, ownerUsername, commissionOwed, agencyName) => {
    if (!confirm(`Bayar komisi ${Math.round(commissionOwed).toLocaleString('id-ID')} 💎 ke @${ownerUsername}?\n\nDiamond akan langsung ditambahkan ke balance @${ownerUsername}.`)) return;
    const btn = document.getElementById('ag-pay-comm-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Memproses...'; }
    try {
      const result = await api(`/agencies/${agencyId}/pay-commission`, { method: 'POST' });
      if (result?.success) {
        toast(result.message ?? 'Komisi berhasil dikirim', 'success');
        // Refresh the overlay data
        const data = await api(`/agencies/${agencyId}/hosts`);
        if (data && !data.error) {
          const body = document.getElementById('ag-hs-body');
          if (body) {
            const fn = document.getElementById('ag-hosts-overlay')?.__renderHosts;
            // re-render by calling agViewHosts pattern
            const overlay = document.getElementById('ag-hosts-overlay');
            if (overlay) {
              const bodyEl = document.getElementById('ag-hs-body');
              const summaryEl = document.getElementById('ag-hs-summary');
              if (bodyEl && summaryEl) {
                const fmtD2   = n => `💎 ${Math.round(n).toLocaleString('id-ID')}`;
                summaryEl.textContent = `${data.hosts.length} host · Komisi sudah lunas ✅`;
                bodyEl.innerHTML = `<div style="padding:30px;text-align:center;color:#22c55e;font-size:18px;font-weight:700">✅ Komisi berhasil dikirim ke @${ownerUsername}!</div>`;
                setTimeout(() => {
                  overlay.remove();
                  agViewHosts(agencyId, agencyName);
                }, 1200);
              }
            }
          }
        }
      } else {
        toast(result?.error ?? 'Gagal membayar komisi', 'error');
        if (btn) { btn.disabled = false; btn.textContent = '💸 Bayar Komisi'; }
      }
    } catch (e) {
      toast('Error: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '💸 Bayar Komisi'; }
    }
  };
}

let agEditId = null;
function openAgModal(id = null) {
  agEditId = id;
  document.getElementById('ag-modal-title').textContent = id ? 'Edit Agency' : 'Add Agency';
  document.getElementById('ag-f-registered-by').value = '';
  document.getElementById('ag-f-name').value = '';
  document.getElementById('ag-f-wa').value = '';
  document.getElementById('ag-f-country').value = '';
  document.getElementById('ag-f-members').value = '';
  document.getElementById('ag-f-commission').value = '10';
  document.getElementById('ag-f-logo').value = '';
  document.getElementById('ag-f-notes').value = '';
  document.getElementById('ag-modal-err').style.display = 'none';

  if (id) {
    api(`/agencies/${id}`).then(a => {
      if (!a) return;
      document.getElementById('ag-f-registered-by').value = a.registered_by || '';
      document.getElementById('ag-f-name').value    = a.agency_name || '';
      document.getElementById('ag-f-wa').value      = a.whatsapp || '';
      document.getElementById('ag-f-country').value = a.country || '';
      document.getElementById('ag-f-members').value = a.member_count || '';
      document.getElementById('ag-f-commission').value = '10';
      document.getElementById('ag-f-logo').value    = a.logo_url || '';
      document.getElementById('ag-f-notes').value   = a.notes || '';
    });
  }
  document.getElementById('ag-modal').classList.add('open');
}

window.closeAgModal = () => {
  document.getElementById('ag-modal').classList.remove('open');
  agEditId = null;
};

async function saveAgency(el_content) {
  const registeredBy = document.getElementById('ag-f-registered-by').value.trim();
  const name    = document.getElementById('ag-f-name').value.trim();
  const wa      = document.getElementById('ag-f-wa').value.trim();
  const country = document.getElementById('ag-f-country').value;
  const members = document.getElementById('ag-f-members').value;
  const logo    = document.getElementById('ag-f-logo').value.trim();
  const notes   = document.getElementById('ag-f-notes').value.trim();
  const errEl   = document.getElementById('ag-modal-err');

  if (!registeredBy) { errEl.textContent = 'Owner username is required'; errEl.style.display = 'block'; return; }
  if (!name) { errEl.textContent = 'Agency name is required'; errEl.style.display = 'block'; return; }
  if (!wa)   { errEl.textContent = 'WhatsApp number is required'; errEl.style.display = 'block'; return; }
  if (!country) { errEl.textContent = 'Please select a country'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';

  const body = { registered_by: registeredBy, agency_name: name, whatsapp: wa, country, member_count: members || 0, commission: 10, logo_url: logo || null, notes: notes || null };
  const btn = document.getElementById('ag-modal-save-btn');
  btn.textContent = 'Saving...'; btn.disabled = true;

  let res;
  if (agEditId) {
    res = await api(`/agencies/${agEditId}`, { method: 'PATCH', body });
  } else {
    res = await api('/agencies', { method: 'POST', body });
  }
  btn.textContent = 'Save Agency'; btn.disabled = false;

  if (res?.success || res?.agency) {
    toast(agEditId ? 'Agency updated' : 'Agency added', 'success');
    closeAgModal();
    loadAgencies(el_content);
  } else {
    errEl.textContent = res?.error || 'Failed to save agency';
    errEl.style.display = 'block';
  }
}

// ─── WITHDRAW REQUESTS ───────────────────────────────────────────────────────
async function renderWithdrawRequests(el, page = 1, statusFilter = 'all', search = '') {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat...</div>';
  const data = await api(`/withdrawals?page=${page}&limit=30&status=${statusFilter}&search=${encodeURIComponent(search)}`);
  if (!data) return;

  const stats = data.stats || {};
  const totalPages = Math.ceil(data.total / 30);
  const fmtD = n => `💎 ${Number(n).toLocaleString('id-ID')}`;
  const fmtIDRW = n => `Rp ${Number(n).toLocaleString('id-ID')}`;

  const statusBadge = s => {
    if (s === 'pending')  return `<span class="badge yellow">Pending</span>`;
    if (s === 'approved') return `<span class="badge green">Approved</span>`;
    if (s === 'rejected') return `<span class="badge red">Rejected</span>`;
    return `<span class="badge">${esc(s)}</span>`;
  };

  el.innerHTML = `
  <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:18px">
    <div class="stat-card yellow">
      <div class="stat-label">Pending</div>
      <div class="stat-value">${fmtNum(stats.pending ?? 0)}</div>
      <div class="stat-sub">${fmtIDRW(stats.pending_idr ?? 0)}</div>
    </div>
    <div class="stat-card green">
      <div class="stat-label">Approved</div>
      <div class="stat-value">${fmtNum(stats.approved ?? 0)}</div>
      <div class="stat-sub">${fmtIDRW(stats.approved_idr ?? 0)}</div>
    </div>
    <div class="stat-card red">
      <div class="stat-label">Rejected</div>
      <div class="stat-value">${fmtNum(stats.rejected ?? 0)}</div>
      <div class="stat-sub">&nbsp;</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-label">Total</div>
      <div class="stat-value">${fmtNum(stats.total ?? 0)}</div>
      <div class="stat-sub">semua request</div>
    </div>
  </div>

  <div class="search-row" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
    <input class="input" id="wd-search" placeholder="Cari username..." value="${esc(search)}" style="flex:1;min-width:180px" />
    <select class="input" id="wd-status-filter" style="width:auto">
      <option value="all"      ${statusFilter==='all'      ? 'selected':''}>Semua Status</option>
      <option value="pending"  ${statusFilter==='pending'  ? 'selected':''}>Pending</option>
      <option value="approved" ${statusFilter==='approved' ? 'selected':''}>Approved</option>
      <option value="rejected" ${statusFilter==='rejected' ? 'selected':''}>Rejected</option>
    </select>
    <button class="btn btn-primary" id="wd-filter-btn">Filter</button>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Waktu</th>
          <th>Username</th>
          <th>Agent / Agency</th>
          <th>Diamond</th>
          <th>IDR</th>
          <th>Bank</th>
          <th>No. Rekening</th>
          <th>Nama Rekening</th>
          <th>Status</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody>
        ${data.requests.length === 0
          ? `<tr><td colspan="10"><div class="empty">Tidak ada data</div></td></tr>`
          : data.requests.map(r => `
          <tr id="wr-row-${esc(r.id)}">
            <td style="white-space:nowrap;font-size:12px">${fmtDateTime(r.created_at)}</td>
            <td>
              <strong>${esc(r.username)}</strong>
              ${r.display_name ? `<br><small style="color:var(--text-muted)">${esc(r.display_name)}</small>` : ''}
              <br><small style="color:var(--text-muted);font-size:10px">${esc(r.ref_id)}</small>
            </td>
            <td>${r.agent_name ? `<span class="badge purple">${esc(r.agent_name)}</span>` : '<span style="color:var(--text-muted);font-size:12px">—</span>'}</td>
            <td style="font-weight:700;color:#60e0ff;white-space:nowrap">${fmtD(r.amount)}</td>
            <td style="font-weight:700;white-space:nowrap">${fmtIDRW(r.idr_value)}</td>
            <td><strong>${esc(r.bank_name)}</strong></td>
            <td style="font-family:monospace">${esc(r.account_number)}</td>
            <td>${esc(r.account_name)}</td>
            <td>
              ${statusBadge(r.status)}
              ${r.processed_by ? `<br><small style="font-size:10px;color:var(--text-muted)">oleh ${esc(r.processed_by)}</small>` : ''}
              ${r.notes ? `<br><small style="font-size:10px;color:var(--text-muted)">${esc(r.notes)}</small>` : ''}
            </td>
            <td style="white-space:nowrap">
              ${r.status === 'pending' ? `
                <button class="btn btn-sm btn-primary" onclick="wdApprove('${esc(r.id)}', '${esc(r.username)}', ${Number(r.amount)}, ${Number(r.idr_value)}, '${esc(r.bank_name)}', '${esc(r.account_number)}', '${esc(r.account_name)}')">✅ ACC</button>
                <button class="btn btn-sm btn-danger" onclick="wdReject('${esc(r.id)}', '${esc(r.username)}', ${Number(r.amount)})">❌ Tolak</button>
              ` : `<span style="color:var(--text-muted);font-size:12px">—</span>`}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <div class="pagination">
    <div class="page-info">Total: ${fmtNum(data.total)} request | Halaman ${page} dari ${Math.max(1,totalPages)}</div>
    ${page > 1 ? `<button class="btn btn-outline btn-sm" id="wd-prev-btn">← Prev</button>` : ''}
    ${page < totalPages ? `<button class="btn btn-outline btn-sm" id="wd-next-btn">Next →</button>` : ''}
  </div>

  <div id="wd-detail-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;display:none;align-items:center;justify-content:center"></div>`;

  const doFilter = () => {
    const s = document.getElementById('wd-search').value;
    const f = document.getElementById('wd-status-filter').value;
    renderWithdrawRequests(el, 1, f, s);
  };
  document.getElementById('wd-filter-btn').onclick = doFilter;
  document.getElementById('wd-search').onkeydown = e => { if (e.key === 'Enter') doFilter(); };
  if (document.getElementById('wd-prev-btn')) document.getElementById('wd-prev-btn').onclick = () => renderWithdrawRequests(el, page - 1, statusFilter, search);
  if (document.getElementById('wd-next-btn')) document.getElementById('wd-next-btn').onclick = () => renderWithdrawRequests(el, page + 1, statusFilter, search);

  window.wdApprove = async (id, username, amount, idrValue, bankName, accNum, accName) => {
    const notes = window.prompt(
      `ACC Withdraw @${username}\n\n` +
      `💎 ${Number(amount).toLocaleString('id-ID')} = Rp ${Number(idrValue).toLocaleString('id-ID')}\n` +
      `Bank  : ${bankName}\n` +
      `Rek   : ${accNum}\n` +
      `Nama  : ${accName}\n\n` +
      `Catatan transfer (opsional, tekan OK untuk lanjut):`
    );
    if (notes === null) return;
    const res = await api(`/withdrawals/${id}/approve`, { method: 'PATCH', body: { notes: notes.trim() || null } });
    if (res?.success) {
      toast(`✅ Withdraw @${username} disetujui`, 'success');
      const row = document.getElementById(`wr-row-${id}`);
      if (row) {
        row.cells[8].innerHTML = `<span class="badge green">Approved</span>`;
        row.cells[9].innerHTML = `<span style="color:var(--text-muted);font-size:12px">—</span>`;
      }
    } else {
      toast(res?.error ?? 'Gagal menyetujui', 'error');
    }
  };

  window.wdReject = async (id, username, amount) => {
    const notes = window.prompt(
      `TOLAK Withdraw @${username}\n` +
      `💎 ${Number(amount).toLocaleString('id-ID')} akan dikembalikan ke saldo user.\n\n` +
      `Alasan penolakan (wajib):`
    );
    if (notes === null) return;
    if (!notes.trim()) { toast('Alasan penolakan wajib diisi', 'error'); return; }
    const res = await api(`/withdrawals/${id}/reject`, { method: 'PATCH', body: { notes: notes.trim() } });
    if (res?.success) {
      toast(`❌ Withdraw @${username} ditolak. 💎 ${Number(amount).toLocaleString('id-ID')} dikembalikan.`, 'info');
      const row = document.getElementById(`wr-row-${id}`);
      if (row) {
        row.cells[8].innerHTML = `<span class="badge red">Rejected</span><br><small style="font-size:10px;color:var(--text-muted)">${esc(notes.trim())}</small>`;
        row.cells[9].innerHTML = `<span style="color:var(--text-muted);font-size:12px">—</span>`;
      }
    } else {
      toast(res?.error ?? 'Gagal menolak', 'error');
    }
  };
}

// ─── PAYROLL MINGGUAN ────────────────────────────────────────────────────────
async function renderPayroll(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat data payroll...</div>';

  let weeks = [], summary = { agencies: [], totals: {} }, payments = [], dailyData = { daily_summary: [], rows: [] }, curWeek = { agencies: [], totals: {}, current_week: {}, prev_week: {} };
  try {
    const [d1, d2, d3, d4, d5] = await Promise.all([
      api('/agencies/payroll/weekly-detail').catch(() => ({ weeks: [] })),
      api('/agencies/payroll/summary').catch(() => ({ agencies: [], totals: {} })),
      api('/agencies/payroll/manual-history').catch(() => ({ payments: [] })),
      api('/agencies/payroll/daily-earnings?days=30').catch(() => ({ daily_summary: [], rows: [] })),
      api('/agencies/payroll/current-week').catch(() => ({ agencies: [], totals: {}, current_week: {}, prev_week: {} })),
    ]);
    weeks     = d1.weeks    || [];
    summary   = d2;
    payments  = d3.payments || [];
    dailyData = d4;
    curWeek   = d5;
  } catch {}

  const fmtD   = n => Number(n || 0).toLocaleString('id-ID') + ' 💎';
  const fmtIDR = n => 'Rp ' + (Number(n || 0) * 2).toLocaleString('id-ID');
  const fmtDt  = s => s ? new Date(s).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  function fmtWeekRange(start, end) {
    if (!start || !end) return '—';
    const s = new Date(start), e = new Date(end);
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}`;
    return `${fmt(s)} - ${fmt(e)}`;
  }

  // Format tanggal WIB dari UTC ISO string
  function fmtDateWIB(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    const wib = new Date(d.getTime() + 7*3600000);
    const pad = n => String(n).padStart(2,'0');
    return `${wib.getUTCFullYear()}/${pad(wib.getUTCMonth()+1)}/${pad(wib.getUTCDate())}`;
  }
  function fmtDateShortWIB(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    const wib = new Date(d.getTime() + 7*3600000);
    const names = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
    const pad = n => String(n).padStart(2,'0');
    return `${names[wib.getUTCDay()]} ${pad(wib.getUTCDate())}/${pad(wib.getUTCMonth()+1)}`;
  }

  const totals          = summary.totals  || {};
  const summaryAgencies = summary.agencies || [];
  const curAgencies     = curWeek.agencies || [];
  const curTotals       = curWeek.totals   || {};
  const cw              = curWeek.current_week || {};
  const pw              = curWeek.prev_week    || {};
  const prevWeekLabel   = (pw.start && pw.end) ? `${fmtDateWIB(pw.start)} — ${fmtDateWIB(pw.end)}` : 'minggu lalu';
  const curWeekLabel    = (cw.start) ? `Senin ${fmtDateWIB(cw.start)} → sekarang` : 'minggu ini';

  el.innerHTML = `
    <div style="max-width:1000px;margin:0 auto">

      <!-- Header info card -->
      <div style="background:linear-gradient(135deg,#1e3a5f,#0f2440);border-radius:16px;padding:24px 28px;margin-bottom:20px;color:#fff">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
          <div style="font-size:36px">💵</div>
          <div>
            <div style="font-size:19px;font-weight:700">Payroll Gaji Agency — Senin s/d Minggu</div>
            <div style="font-size:12px;opacity:.75;margin-top:3px"><strong>Manual</strong> — admin kirim diamond ke agency · Periode: <strong>Senin 00:00 → Minggu 23:59 WIB</strong> · Data harian update otomatis 00:01 WIB</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
          <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:12px 14px">
            <div style="font-size:10px;opacity:.7;margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">Minggu Ini (berjalan)</div>
            <div style="font-size:13px;font-weight:700">${fmtD(curTotals.total_earned)}</div>
            <div style="font-size:10px;opacity:.6;margin-top:2px">${curWeekLabel}</div>
          </div>
          <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:12px 14px">
            <div style="font-size:10px;opacity:.7;margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">Total Komisi Minggu Ini</div>
            <div style="font-size:13px;font-weight:700;color:#fde047">${fmtD(curTotals.total_commission)}</div>
          </div>
          <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:12px 14px">
            <div style="font-size:10px;opacity:.7;margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">Total Komisi Dibayar</div>
            <div style="font-size:13px;font-weight:700">${fmtD(totals.commission_paid)}</div>
          </div>
          <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:12px 14px">
            <div style="font-size:10px;opacity:.7;margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">Komisi Belum Dibayar</div>
            <div style="font-size:13px;font-weight:700;${Number(totals.commission_owed||0)>0?'color:#fca5a5':''}">${fmtD(totals.commission_owed)}</div>
          </div>
        </div>
      </div>

      <!-- Data Minggu Berjalan -->
      <div style="background:var(--card);border:2px solid #059669;border-radius:12px;overflow:hidden;margin-bottom:20px">
        <div style="padding:14px 20px;background:#f0fdf4;border-bottom:1px solid #bbf7d0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-weight:700;font-size:15px;color:#065f46">📊 Minggu Berjalan — Data Live</div>
            <div style="font-size:12px;color:#047857;margin-top:2px">Periode: <strong>${curWeekLabel}</strong> · Update real-time</div>
          </div>
          <button onclick="renderPayroll(document.getElementById('content'))" class="btn btn-sm" style="background:#059669;color:#fff;font-size:12px">🔄 Refresh</button>
        </div>
        ${curAgencies.length === 0
          ? `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">Belum ada agency approved.</div>`
          : `<div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="font-size:11px;text-transform:uppercase;color:#065f46;background:#f0fdf4">
                  <th style="padding:10px 16px;text-align:left;font-weight:600">Agency</th>
                  <th style="padding:10px 10px;text-align:center;font-weight:600">Host Aktif</th>
                  <th style="padding:10px 12px;text-align:right;font-weight:600">Pendapatan Minggu Ini</th>
                  <th style="padding:10px 12px;text-align:right;font-weight:600">Komisi (${curAgencies[0]?.commission_pct||10}%)</th>
                  <th style="padding:10px 12px;text-align:right;font-weight:600">Pendapatan Mgg Lalu</th>
                  <th style="padding:10px 16px;text-align:center;font-weight:600">Status Mgg Lalu</th>
                </tr>
              </thead>
              <tbody>
                ${curAgencies.map((a, i) => `
                  <tr style="border-top:1px solid #dcfce7${i%2===1?';background:#f7fef9':''}">
                    <td style="padding:10px 16px">
                      <div style="font-weight:600">${esc(a.agency_name)}</div>
                      <div style="font-size:11px;color:var(--text-muted)">@${esc(a.owner_username||'—')}</div>
                    </td>
                    <td style="padding:10px 10px;text-align:center;color:var(--text-muted)">${a.host_count}</td>
                    <td style="padding:10px 12px;text-align:right;font-family:monospace;font-weight:600">${Number(a.current_week_earned).toLocaleString('id-ID')} 💎</td>
                    <td style="padding:10px 12px;text-align:right;font-family:monospace;font-weight:700;color:#059669">${Number(a.current_week_comm).toLocaleString('id-ID')} 💎</td>
                    <td style="padding:10px 12px;text-align:right;font-family:monospace;color:var(--text-muted)">${Number(a.prev_week_earned).toLocaleString('id-ID')} 💎</td>
                    <td style="padding:10px 16px;text-align:center">
                      ${a.prev_week_paid
                        ? '<span style="font-size:11px;background:#d1fae5;color:#065f46;padding:3px 8px;border-radius:99px;font-weight:600">✅ Sudah Dibayar</span>'
                        : (Number(a.prev_week_earned)>0
                          ? '<span style="font-size:11px;background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:99px;font-weight:600">⏳ Belum Dibayar</span>'
                          : '<span style="font-size:11px;color:var(--text-muted)">—</span>')}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr style="border-top:2px solid #bbf7d0;background:#f0fdf4;font-weight:700">
                  <td colspan="2" style="padding:10px 16px;font-size:12px;color:#065f46">TOTAL (${curAgencies.length} agency)</td>
                  <td style="padding:10px 12px;text-align:right;font-family:monospace">${Number(curTotals.total_earned||0).toLocaleString('id-ID')} 💎</td>
                  <td style="padding:10px 12px;text-align:right;font-family:monospace;color:#059669">${Number(curTotals.total_commission||0).toLocaleString('id-ID')} 💎</td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>`
        }
      </div>

      <!-- Manual trigger — Bayar Minggu Lalu -->
      <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:220px">
          <div style="font-weight:700;font-size:14px;margin-bottom:3px">⚡ Kirim Diamond — Gaji Minggu Lalu</div>
          <div style="font-size:12px;color:var(--text-muted)">
            Periode: <strong style="color:var(--text)">${prevWeekLabel}</strong> WIB<br>
            Hitung total GIFT_RECEIVED semua host, kirim 10% komisi ke setiap agency owner. Notifikasi in-app + real-time dikirim otomatis.
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <button id="payroll-run-btn" class="btn" style="background:#059669;color:#fff;font-weight:700;padding:9px 20px;font-size:13px;white-space:nowrap">
            💸 Kirim Sekarang
          </button>
        </div>
        <div id="payroll-run-status" style="width:100%;font-size:12px;color:var(--text-muted);margin-top:2px"></div>
      </div>

      <!-- Ringkasan Komisi per Agency (All-time) -->
      <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <div style="font-weight:700;font-size:15px">📊 Ringkasan Komisi per Agency (All-time)</div>
          <div style="font-size:12px;color:var(--text-muted)">Total pendapatan host & komisi terakumulasi</div>
        </div>
        ${summaryAgencies.length === 0
          ? `<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">Belum ada agency yang approved.</div>`
          : `<div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="font-size:11px;text-transform:uppercase;color:var(--text-muted);background:var(--bg)">
                  <th style="padding:10px 16px;text-align:left;font-weight:600">Agency</th>
                  <th style="padding:10px 12px;text-align:center;font-weight:600">Hosts</th>
                  <th style="padding:10px 12px;text-align:right;font-weight:600">Total Pendapatan Host</th>
                  <th style="padding:10px 12px;text-align:right;font-weight:600">Komisi (10%)</th>
                  <th style="padding:10px 12px;text-align:right;font-weight:600">Sudah Dibayar</th>
                  <th style="padding:10px 16px;text-align:right;font-weight:600">Belum Dibayar</th>
                </tr>
              </thead>
              <tbody>
                ${summaryAgencies.map((a, i) => `
                  <tr style="border-top:1px solid var(--border)${i%2===1?';background:var(--bg)':''}">
                    <td style="padding:10px 16px">
                      <div style="font-weight:600">${esc(a.agency_name)}</div>
                      <div style="font-size:11px;color:var(--text-muted)">@${esc(a.owner_username||'—')}</div>
                    </td>
                    <td style="padding:10px 12px;text-align:center;color:var(--text-muted)">${a.active_hosts}</td>
                    <td style="padding:10px 12px;text-align:right;font-family:monospace">${Number(a.total_host_earned).toLocaleString('id-ID')} 💎<br><span style="font-size:10px;color:var(--text-muted)">${fmtIDR(a.total_host_earned)}</span></td>
                    <td style="padding:10px 12px;text-align:right;font-family:monospace;color:#f59e0b;font-weight:700">${Number(a.commission_total).toLocaleString('id-ID')} 💎</td>
                    <td style="padding:10px 12px;text-align:right;font-family:monospace;color:#059669">${Number(a.commission_paid).toLocaleString('id-ID')} 💎</td>
                    <td style="padding:10px 16px;text-align:right;font-family:monospace;font-weight:700;${Number(a.commission_owed)>0?'color:#ef4444':'color:var(--text-muted)'}">
                      ${Number(a.commission_owed)>0 ? Number(a.commission_owed).toLocaleString('id-ID') + ' 💎' : '✅ Lunas'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr style="border-top:2px solid var(--border);background:var(--card);font-weight:700">
                  <td colspan="2" style="padding:10px 16px;font-size:12px">TOTAL (${summaryAgencies.length} agency)</td>
                  <td style="padding:10px 12px;text-align:right;font-family:monospace">${Number(totals.total_host_earned||0).toLocaleString('id-ID')} 💎</td>
                  <td style="padding:10px 12px;text-align:right;font-family:monospace;color:#f59e0b">${Number(totals.commission_total||0).toLocaleString('id-ID')} 💎</td>
                  <td style="padding:10px 12px;text-align:right;font-family:monospace;color:#059669">${Number(totals.commission_paid||0).toLocaleString('id-ID')} 💎</td>
                  <td style="padding:10px 16px;text-align:right;font-family:monospace;${Number(totals.commission_owed||0)>0?'color:#ef4444':'color:#059669'}">${Number(totals.commission_owed||0)>0?Number(totals.commission_owed).toLocaleString('id-ID')+' 💎':'✅ Semua Lunas'}</td>
                </tr>
              </tfoot>
            </table>
          </div>`
        }
      </div>

      <!-- Pendapatan Harian Agency (30 hari terakhir) -->
      <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-weight:700;font-size:15px">📈 Pendapatan Harian Host per Agency (30 hari terakhir)</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Snapshot otomatis tiap 00:01 WIB — seperti sistem Fancy Live</div>
          </div>
          <button id="snapshot-btn" class="btn btn-sm" style="background:#7c3aed;color:#fff;white-space:nowrap;font-size:12px">📸 Snapshot Hari Ini</button>
        </div>
        ${(dailyData.daily_summary || []).length === 0
          ? `<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">
              <div style="font-size:32px;margin-bottom:12px">📭</div>
              <div style="font-weight:600;margin-bottom:6px">Belum ada data snapshot harian</div>
              <div style="font-size:12px">Klik "Snapshot Hari Ini" untuk memulai.</div>
            </div>`
          : `<div style="overflow-x:auto">
              <table style="width:100%;border-collapse:collapse;font-size:13px">
                <thead>
                  <tr style="font-size:11px;text-transform:uppercase;color:var(--text-muted);background:var(--bg)">
                    <th style="padding:10px 16px;text-align:left;font-weight:600">Tanggal</th>
                    <th style="padding:10px 12px;text-align:center;font-weight:600">Agency</th>
                    <th style="padding:10px 12px;text-align:right;font-weight:600">Total Pendapatan Host</th>
                    <th style="padding:10px 16px;text-align:right;font-weight:600">Komisi Agency (10%)</th>
                  </tr>
                </thead>
                <tbody>
                  ${(dailyData.daily_summary || []).map((d, i) => `
                    <tr style="border-top:1px solid var(--border)${i%2===1?';background:var(--bg)':''}">
                      <td style="padding:10px 16px;font-family:monospace;font-weight:600">${d.date}</td>
                      <td style="padding:10px 12px;text-align:center;color:var(--text-muted)">${d.agency_count} agency</td>
                      <td style="padding:10px 12px;text-align:right;font-family:monospace">${Number(d.total_earned).toLocaleString('id-ID')} 💎</td>
                      <td style="padding:10px 16px;text-align:right;font-family:monospace;font-weight:700;color:#f59e0b">${Number(d.total_commission).toLocaleString('id-ID')} 💎</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`
        }
      </div>

      <!-- Riwayat Payroll Mingguan (Accordion) -->
      <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <div style="font-weight:700;font-size:15px">📅 Riwayat Payroll Mingguan (Manual)</div>
          <div style="font-size:12px;color:var(--text-muted)">${weeks.length} payroll run</div>
        </div>
        ${weeks.length === 0
          ? `<div style="text-align:center;padding:56px 24px;color:var(--text-muted)">
              <div style="font-size:40px;margin-bottom:14px">📭</div>
              <div style="font-size:14px;font-weight:600;margin-bottom:6px">Belum ada data payroll</div>
              <div style="font-size:12px">Gunakan tombol "Jalankan Sekarang" di atas untuk mengirim komisi ke agency owner.</div>
            </div>`
          : `<div id="payroll-accordion">
              ${weeks.map((w, idx) => {
                const weekLabel = fmtWeekRange(w.period_start, w.period_end);
                const hasAgencies = w.agencies && w.agencies.length > 0;
                const triggerBadge = w.triggered_by === 'cron'
                  ? `<span style="font-size:10px;background:#dbeafe;color:#1d4ed8;padding:2px 7px;border-radius:99px;margin-left:8px">auto</span>`
                  : `<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:99px;margin-left:8px">manual</span>`;
                return `
                  <div class="payroll-week-item" style="border-top:${idx===0?'none':'1px solid var(--border)'}">
                    <div class="payroll-week-header" onclick="togglePayrollWeek(${idx})"
                      style="display:flex;align-items:center;padding:16px 20px;cursor:pointer;user-select:none;transition:background .15s">
                      <div style="flex:1">
                        <div style="display:flex;align-items:center;gap:6px">
                          <span style="font-size:14px;font-weight:600;font-family:monospace;color:var(--text)">${weekLabel}</span>
                          ${triggerBadge}
                        </div>
                        <div style="font-size:11px;color:var(--text-muted);margin-top:3px">
                          ${Number(w.agencies_paid)} agency dibayar · ${fmtD(w.total_diamonds)} · Dijalankan: ${fmtDt(w.run_at)}
                        </div>
                      </div>
                      <div style="display:flex;align-items:center;gap:12px">
                        <span style="font-size:13px;font-weight:700;color:#f59e0b;font-family:monospace">${fmtD(w.total_diamonds)}</span>
                        <span id="payroll-chevron-${idx}" style="font-size:18px;color:var(--text-muted);transition:transform .2s">∨</span>
                      </div>
                    </div>
                    <div id="payroll-week-body-${idx}" style="display:none;background:var(--bg);border-top:1px solid var(--border);padding:0">
                      ${!hasAgencies
                        ? `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">Tidak ada data per-agency untuk minggu ini.</div>`
                        : `<div style="overflow-x:auto">
                          <table style="width:100%;border-collapse:collapse;font-size:13px">
                            <thead>
                              <tr style="font-size:11px;text-transform:uppercase;color:var(--text-muted);background:var(--card)">
                                <th style="padding:10px 20px;text-align:left;font-weight:600">Agency</th>
                                <th style="padding:10px 16px;text-align:left;font-weight:600">Owner</th>
                                <th style="padding:10px 16px;text-align:right;font-weight:600">Pendapatan Host</th>
                                <th style="padding:10px 16px;text-align:center;font-weight:600">Rate</th>
                                <th style="padding:10px 20px;text-align:right;font-weight:600">Komisi Dikirim</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${w.agencies.map((a, ai) => `
                                <tr style="border-top:1px solid var(--border)${ai%2===1?';background:var(--card)':''}">
                                  <td style="padding:11px 20px;font-weight:600">${esc(a.agency_name)}</td>
                                  <td style="padding:11px 16px;color:var(--text-muted)">@${esc(a.owner_username)}</td>
                                  <td style="padding:11px 16px;text-align:right;font-family:monospace">${Number(a.total_host_earned).toLocaleString('id-ID')} 💎</td>
                                  <td style="padding:11px 16px;text-align:center">
                                    <span style="background:#f0fdf4;color:#16a34a;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px">${a.commission_pct}%</span>
                                  </td>
                                  <td style="padding:11px 20px;text-align:right;font-weight:700;color:#f59e0b;font-family:monospace">${Number(a.commission_diamonds).toLocaleString('id-ID')} 💎</td>
                                </tr>
                              `).join('')}
                            </tbody>
                            <tfoot>
                              <tr style="border-top:2px solid var(--border);background:var(--card)">
                                <td colspan="2" style="padding:10px 20px;font-size:12px;color:var(--text-muted)">Total minggu ini</td>
                                <td style="padding:10px 16px;text-align:right;font-family:monospace;font-size:12px;color:var(--text-muted)">${w.agencies.reduce((s,a)=>s+Number(a.total_host_earned),0).toLocaleString('id-ID')} 💎</td>
                                <td></td>
                                <td style="padding:10px 20px;text-align:right;font-weight:700;color:#f59e0b;font-family:monospace">${fmtD(w.total_diamonds)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>`
                      }
                    </div>
                  </div>
                `;
              }).join('')}
            </div>`
        }
      </div>

      <!-- Riwayat Semua Pembayaran Komisi -->
      <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <div style="font-weight:700;font-size:15px">🧾 Riwayat Semua Pembayaran Komisi</div>
          <div style="font-size:12px;color:var(--text-muted)">${payments.length} transaksi (auto + manual)</div>
        </div>
        ${payments.length === 0
          ? `<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">Belum ada pembayaran komisi.</div>`
          : `<div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="font-size:11px;text-transform:uppercase;color:var(--text-muted);background:var(--bg)">
                  <th style="padding:10px 16px;text-align:left;font-weight:600">Tanggal</th>
                  <th style="padding:10px 12px;text-align:left;font-weight:600">Agency</th>
                  <th style="padding:10px 12px;text-align:left;font-weight:600">Owner</th>
                  <th style="padding:10px 12px;text-align:right;font-weight:600">Pendapatan Host</th>
                  <th style="padding:10px 12px;text-align:right;font-weight:600">Komisi Dibayar</th>
                  <th style="padding:10px 16px;text-align:center;font-weight:600">Tipe</th>
                  <th style="padding:10px 16px;text-align:left;font-weight:600">Oleh</th>
                </tr>
              </thead>
              <tbody>
                ${payments.map((p, i) => {
                  const typeBadge = (p.payment_type === 'weekly_auto')
                    ? '<span style="font-size:10px;background:#dbeafe;color:#1d4ed8;padding:2px 7px;border-radius:99px">auto</span>'
                    : '<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:99px">manual</span>';
                  return `<tr style="border-top:1px solid var(--border)${i%2===1?';background:var(--bg)':''}">
                    <td style="padding:9px 16px;font-size:11px;color:var(--text-muted);white-space:nowrap">${fmtDt(p.created_at)}</td>
                    <td style="padding:9px 12px;font-weight:600">${esc(p.agency_name || 'Agency #'+p.agency_id)}</td>
                    <td style="padding:9px 12px;color:var(--text-muted)">@${esc(p.owner_username||'—')}</td>
                    <td style="padding:9px 12px;text-align:right;font-family:monospace">${Number(p.total_host_earned||0).toLocaleString('id-ID')} 💎</td>
                    <td style="padding:9px 12px;text-align:right;font-family:monospace;font-weight:700;color:#f59e0b">${Number(p.commission_diamonds||0).toLocaleString('id-ID')} 💎</td>
                    <td style="padding:9px 16px;text-align:center">${typeBadge}</td>
                    <td style="padding:9px 16px;font-size:11px;color:var(--text-muted)">${esc(p.paid_by_admin||'—')}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`
        }
      </div>
    </div>
  `;

  window.togglePayrollWeek = (idx) => {
    const body    = document.getElementById(`payroll-week-body-${idx}`);
    const chevron = document.getElementById(`payroll-chevron-${idx}`);
    const header  = body?.previousElementSibling;
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display    = isOpen ? 'none' : 'block';
    if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
    if (header)  header.style.background = isOpen ? '' : 'rgba(59,130,246,.06)';
  };

  if (weeks.length > 0) window.togglePayrollWeek(0);

  // Snapshot button handler
  const snapshotBtn = document.getElementById('snapshot-btn');
  if (snapshotBtn) {
    snapshotBtn.onclick = async () => {
      snapshotBtn.disabled = true;
      snapshotBtn.textContent = '⏳ Memproses...';
      try {
        const d = await api('/agencies/payroll/snapshot-today', { method: 'POST' });
        if (d.success) {
          toast(`Snapshot selesai! ${d.agenciesProcessed} agency, ${Number(d.totalEarned||0).toLocaleString('id-ID')} 💎 earned hari ini`, 'success');
          setTimeout(() => renderPayroll(el), 1500);
        } else {
          toast(d.error || d.message || 'Gagal snapshot', 'error');
        }
      } catch (e) {
        toast('Network error saat snapshot', 'error');
      } finally {
        snapshotBtn.disabled = false;
        snapshotBtn.textContent = '📸 Snapshot Hari Ini';
      }
    };
  }

  const runBtn    = document.getElementById('payroll-run-btn');
  const runStatus = document.getElementById('payroll-run-status');
  if (runBtn) {
    runBtn.onclick = async () => {
      if (!confirm(`Kirim diamond gaji agency?\n\nPeriode: ${prevWeekLabel} WIB\n\nSistem akan menghitung total GIFT_RECEIVED semua host periode Senin–Minggu lalu, lalu mengirim 10% komisi ke setiap agency owner.\nNotifikasi real-time & in-app otomatis dikirim.\n\nJika periode ini sudah pernah dibayar, sistem akan MENOLAK otomatis (tidak bisa double bayar).`)) return;
      runBtn.disabled  = true;
      runBtn.textContent = '⏳ Memproses...';
      runStatus.textContent = '';
      try {
        const d = await api('/agencies/payroll/run', { method: 'POST' });
        if (d.alreadyRan) {
          const prev = d.existingRun || {};
          const prevDate = prev.run_at
            ? new Date(prev.run_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
            : '—';
          runStatus.innerHTML = `
            <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:10px 14px;margin-top:6px;display:flex;align-items:flex-start;gap:10px">
              <span style="font-size:18px;line-height:1">⚠️</span>
              <div>
                <div style="font-weight:700;color:#854d0e;font-size:13px">Payroll minggu ini sudah dijalankan — ditolak</div>
                <div style="color:#713f12;font-size:12px;margin-top:3px">
                  Dijalankan pada <strong>${prevDate}</strong> oleh <strong>${esc(prev.triggered_by || '—')}</strong>
                  · ${Number(prev.agencies_paid||0)} agency · ${Number(prev.total_diamonds||0).toLocaleString('id-ID')} 💎
                </div>
                <div style="color:#713f12;font-size:11px;margin-top:4px;opacity:.8">Tunggu periode minggu berikutnya.</div>
              </div>
            </div>`;
          toast('Payroll ditolak — minggu ini sudah dibayar', 'error');
          return;
        }
        if (d.success || d.agenciesPaid !== undefined) {
          runStatus.innerHTML = `<span style="color:#059669">✅ Berhasil! ${d.agenciesPaid} agency dibayar, total <strong>${Number(d.totalDiamonds||0).toLocaleString('id-ID')} 💎</strong> · Notifikasi dikirim ke semua owner.</span>`;
          toast(`Payroll selesai! ${d.agenciesPaid} agency, ${Number(d.totalDiamonds||0).toLocaleString('id-ID')} 💎 dibayar`, 'success');
          setTimeout(() => renderPayroll(el), 1800);
        } else {
          runStatus.innerHTML = `<span style="color:#ef4444">❌ ${d.message || 'Gagal menjalankan payroll'}</span>`;
          toast(d.message || 'Gagal', 'error');
        }
      } catch (e) {
        runStatus.innerHTML = `<span style="color:#ef4444">❌ Network error</span>`;
        toast('Network error', 'error');
      } finally {
        runBtn.disabled = false;
        runBtn.textContent = '▶ Jalankan Sekarang';
      }
    };
  }
}

// ─── BANNER BERANDA ──────────────────────────────────────────────────────────
async function renderHomeBanners(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat banner...</div>';
  let banners = [];
  try {
    const d = await api('/banners');
    banners = d.banners || [];
  } catch (e) {
    el.innerHTML = `<div class="empty">Gagal memuat banner: ${e.message}</div>`;
    return;
  }

  function renderList() {
    const rows = banners.map(b => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border);border-radius:10px;margin-bottom:10px;background:var(--card)">
        <img src="${b.image_url}" alt="${b.title||''}" style="width:90px;height:52px;object-fit:cover;border-radius:8px;border:1px solid var(--border);flex-shrink:0" onerror="this.style.display='none'"/>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px;color:var(--text);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.title || '<i style="color:var(--text-muted)">Tanpa judul</i>'}</div>
          ${b.link_url ? `<div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🔗 ${b.link_url}</div>` : ''}
          <div style="font-size:11px;margin-top:4px">Urutan: ${b.sort_order} &nbsp;|&nbsp; <span style="color:${b.is_active?'#059669':'#ef4444'}">${b.is_active?'✅ Aktif':'⛔ Nonaktif'}</span></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
          <button onclick="toggleBanner(${b.id},${!b.is_active})" class="btn btn-sm" style="font-size:11px;padding:4px 10px;background:${b.is_active?'#f59e0b':'#059669'};color:#fff;border:none">${b.is_active?'Nonaktifkan':'Aktifkan'}</button>
          <button onclick="deleteBanner(${b.id})" class="btn btn-sm" style="font-size:11px;padding:4px 10px;background:#ef4444;color:#fff;border:none">🗑 Hapus</button>
        </div>
      </div>`).join('') || '<div class="empty" style="padding:32px 0;color:var(--text-muted)">Belum ada banner. Tambahkan banner pertama!</div>';

    el.innerHTML = `
      <div style="max-width:680px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <h2 style="margin:0;font-size:18px">🖼️ Banner Beranda</h2>
          <button onclick="showAddBannerForm()" class="btn" style="background:var(--primary);color:#fff;font-weight:600;padding:8px 18px">+ Tambah Banner</button>
        </div>
        <div id="banner-form-area"></div>
        <div id="banner-list">${rows}</div>
      </div>`;

    document.getElementById('banner-form-area')._showForm = showAddBannerForm;
  }

  async function showAddBannerForm() {
    const area = document.getElementById('banner-form-area');
    area.innerHTML = `
      <div style="border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:18px;background:var(--card)">
        <h3 style="margin:0 0 14px;font-size:15px">Tambah Banner Baru</h3>
        <div style="margin-bottom:10px">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Judul (opsional)</label>
          <input id="bn-title" type="text" class="form-control" placeholder="Contoh: Promo Ramadan" style="width:100%;font-size:13px"/>
        </div>
        <div style="margin-bottom:10px">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Gambar Banner <span style="color:#ef4444">*</span></label>
          <div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap">
            <input id="bn-url" type="text" class="form-control" placeholder="https://... (URL gambar)" style="flex:1;min-width:180px;font-size:13px"/>
            <label class="btn btn-sm" style="background:var(--bg);border:1px solid var(--border);cursor:pointer;padding:6px 12px;font-size:12px;white-space:nowrap">
              📁 Upload File
              <input type="file" accept="image/*" style="display:none" onchange="handleBannerFileUpload(event)"/>
            </label>
          </div>
          <div id="bn-preview" style="margin-top:8px"></div>
        </div>
        <div style="margin-bottom:10px">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Link URL (opsional)</label>
          <input id="bn-link" type="text" class="form-control" placeholder="https://... (klik banner menuju ke sini)" style="width:100%;font-size:13px"/>
        </div>
        <div style="margin-bottom:14px;display:flex;gap:16px">
          <div>
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Urutan</label>
            <input id="bn-order" type="number" class="form-control" value="0" min="0" style="width:80px;font-size:13px"/>
          </div>
          <div style="display:flex;align-items:flex-end;margin-bottom:2px">
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
              <input id="bn-active" type="checkbox" checked style="width:16px;height:16px"/> Langsung aktif
            </label>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="submitAddBanner()" class="btn" style="background:#059669;color:#fff;font-weight:600;padding:8px 20px">💾 Simpan Banner</button>
          <button onclick="document.getElementById('banner-form-area').innerHTML=''" class="btn btn-sm" style="background:var(--bg);border:1px solid var(--border)">Batal</button>
        </div>
      </div>`;
  }

  window.handleBannerFileUpload = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const preview = document.getElementById('bn-preview');
    const urlInput = document.getElementById('bn-url');
    preview.innerHTML = '<span style="font-size:12px;color:var(--text-muted)">⏳ Mengupload gambar...</span>';
    urlInput.value = '';
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      const base64Data = dataUrl.split(',')[1];
      const mimeType = file.type || 'image/png';
      try {
        const res = await api('/banners/upload-image', {
          method: 'POST',
          body: { base64Data, mimeType, fileName: file.name },
        });
        if (res && res.imageUrl) {
          urlInput.value = res.imageUrl;
          preview.innerHTML = `<img src="${res.imageUrl}" style="max-width:200px;max-height:100px;border-radius:6px;border:1px solid var(--border);margin-top:4px"/> <span style="font-size:11px;color:#059669;display:block;margin-top:4px">✅ Upload berhasil</span>`;
        } else {
          preview.innerHTML = `<span style="font-size:12px;color:#ef4444">❌ ${res?.error || 'Upload gagal'}</span>`;
        }
      } catch (err) {
        preview.innerHTML = `<span style="font-size:12px;color:#ef4444">❌ Upload gagal: ${err.message}</span>`;
      }
    };
    reader.readAsDataURL(file);
  };

  window.submitAddBanner = async function() {
    const image_url = document.getElementById('bn-url').value.trim();
    if (!image_url) { toast('Gambar banner wajib diisi', 'error'); return; }
    try {
      await api('/banners', {
        method: 'POST',
        body: {
          title:      document.getElementById('bn-title').value.trim(),
          image_url,
          link_url:   document.getElementById('bn-link').value.trim(),
          is_active:  document.getElementById('bn-active').checked,
          sort_order: parseInt(document.getElementById('bn-order').value, 10) || 0,
        }
      });
      toast('Banner berhasil ditambahkan!', 'success');
      await renderHomeBanners(el);
    } catch (e) {
      toast(e.message || 'Gagal menyimpan banner', 'error');
    }
  };

  window.toggleBanner = async function(id, newActive) {
    try {
      await api(`/banners/${id}`, { method: 'PATCH', body: { is_active: newActive } });
      toast(newActive ? 'Banner diaktifkan' : 'Banner dinonaktifkan', 'success');
      const d = await api('/banners');
      banners = d.banners || [];
      renderList();
    } catch (e) {
      toast(e.message || 'Gagal update banner', 'error');
    }
  };

  window.deleteBanner = function(id) {
    confirm('Hapus Banner', 'Yakin ingin menghapus banner ini?', async () => {
      try {
        await api(`/banners/${id}`, { method: 'DELETE' });
        toast('Banner dihapus', 'success');
        banners = banners.filter(b => b.id !== id);
        renderList();
      } catch (e) {
        toast(e.message || 'Gagal hapus banner', 'error');
      }
    }, true);
  };

  window.showAddBannerForm = showAddBannerForm;
  renderList();
}

// ─── LOCAL UPLOADS ───────────────────────────────────────────────────────────
async function renderLocalUploads(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat daftar file...</div>';

  const data = await api('/uploads');
  if (!data) return;

  const files = data.files || [];
  const totalSize = data.totalSize || 0;

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
  function fmtDate(iso) {
    return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  }
  function typeIcon(type) {
    return type === 'image' ? '🖼️' : type === 'video' ? '🎬' : type === 'json' ? '📋' : '📄';
  }

  function renderGrid() {
    if (files.length === 0) {
      return `<div class="empty" style="margin-top:40px">
        <div style="font-size:48px;margin-bottom:12px">💾</div>
        <div>Tidak ada file lokal tersimpan</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:6px">File muncul di sini saat ImageKit tidak tersedia atau gagal</div>
      </div>`;
    }
    return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-top:4px">
      ${files.map(f => `
      <div class="card" style="padding:0;overflow:hidden;display:flex;flex-direction:column">
        <div style="height:130px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden">
          ${f.type === 'image'
            ? `<img src="${f.url}" style="max-width:100%;max-height:130px;object-fit:contain" onerror="this.parentElement.innerHTML='<span style=font-size:40px>🖼️</span>'">`
            : f.type === 'video'
            ? `<video src="${f.url}" style="max-width:100%;max-height:130px" muted></video>`
            : `<span style="font-size:40px">${typeIcon(f.type)}</span>`
          }
          <span style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.55);color:#fff;font-size:11px;padding:2px 7px;border-radius:20px">${fmtSize(f.size)}</span>
        </div>
        <div style="padding:10px 12px;flex:1;display:flex;flex-direction:column;gap:4px">
          <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${f.name}">${typeIcon(f.type)} ${f.name}</div>
          <div style="font-size:11px;color:var(--text-muted)">${fmtDate(f.modifiedAt)}</div>
          <div style="display:flex;gap:6px;margin-top:6px">
            <a href="${f.url}" target="_blank" class="btn btn-secondary" style="flex:1;text-align:center;font-size:12px;padding:4px 0">Lihat</a>
            <button class="btn btn-danger" style="flex:1;font-size:12px;padding:4px 0" onclick="deleteUploadFile('${encodeURIComponent(f.name)}')">Hapus</button>
          </div>
        </div>
      </div>`).join('')}
    </div>`;
  }

  el.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px">
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <div class="stat-card" style="min-width:140px">
        <div class="stat-value">${files.length}</div>
        <div class="stat-label">Total File</div>
      </div>
      <div class="stat-card" style="min-width:140px">
        <div class="stat-value">${fmtSize(totalSize)}</div>
        <div class="stat-label">Total Ukuran</div>
      </div>
      <div class="stat-card" style="min-width:140px">
        <div class="stat-value">${files.filter(f=>f.type==='image').length}</div>
        <div class="stat-label">Gambar</div>
      </div>
      <div class="stat-card" style="min-width:140px">
        <div class="stat-value">${files.filter(f=>f.type==='video').length}</div>
        <div class="stat-label">Video</div>
      </div>
    </div>
    ${files.length > 0 ? `<button class="btn btn-danger" onclick="deleteAllUploads()">🗑️ Hapus Semua</button>` : ''}
  </div>

  <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:10px 14px;font-size:13px;color:#713f12;margin-bottom:20px">
    ⚠️ File-file ini tersimpan di server lokal sebagai fallback saat ImageKit tidak tersedia.
    Setelah ImageKit aktif kembali, Anda bisa hapus file lama untuk menghemat disk.
    Direktori: <code style="background:#fef08a;padding:1px 5px;border-radius:3px">${data.dir}</code>
  </div>

  <div id="upload-grid">${renderGrid()}</div>`;

  window.deleteUploadFile = async function(encodedName) {
    const name = decodeURIComponent(encodedName);
    confirm('Hapus File', `Hapus file "${name}" dari server?`, async () => {
      const res = await api(`/uploads/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (res?.success) {
        toast('File dihapus', 'success');
        const idx = files.findIndex(f => f.name === name);
        if (idx !== -1) files.splice(idx, 1);
        document.getElementById('upload-grid').innerHTML = renderGrid();
      } else {
        toast(res?.error || 'Gagal hapus file', 'error');
      }
    });
  };

  window.deleteAllUploads = function() {
    confirm('Hapus Semua File Lokal', `Hapus semua ${files.length} file dari server lokal? Aksi ini tidak bisa dibatalkan.`, async () => {
      const res = await api('/uploads', { method: 'DELETE' });
      if (res?.success) {
        toast(`${res.deleted} file dihapus`, 'success');
        files.length = 0;
        document.getElementById('upload-grid').innerHTML = renderGrid();
      } else {
        toast(res?.error || 'Gagal hapus file', 'error');
      }
    });
  };
}


  // ─── HOST GAJI POKOK ──────────────────────────────────────────────────────────
  const HS_LEVELS = {
    A1: { target_coin:120000, target_diamond:0, valid_hours:10, valid_days:5, salary_diamond:14400, reward_diamond:0 },
    S1: { target_coin:600000, target_diamond:0, valid_hours:15, valid_days:5, salary_diamond:50000, reward_diamond:0 },
  };
  const HS_LVL_COLOR = { A1:'#3b82f6', S1:'#f59e0b' };
  let _hsEditId = null;

  async function renderHostSalary(el) {
    el.innerHTML = '<div class="loading"><div class="spinner"></div>Memuat data host gaji pokok...</div>';

    let contracts = [];
    try { const d = await api('/host-salary/contracts'); contracts = d.contracts || []; } catch {}

    const fmtN   = n => Number(n||0).toLocaleString('id-ID');
    const fmtD   = n => Number(n||0).toLocaleString('id-ID') + ' 💎';
    const fmtIDR = n => 'Rp ' + (Number(n||0) * 2).toLocaleString('id-ID');

    const activeCount  = contracts.filter(c => c.status === 'active').length;
    const inactCount   = contracts.filter(c => c.status === 'inactive').length;
    const totalDiamond = contracts.reduce((a,c) => a + Number(c.this_week_diamond||0), 0);
    const metCount     = contracts.filter(c => c.this_week_met).length;

    el.innerHTML = `
      <div style="max-width:1040px;margin:0 auto">
        <div style="background:linear-gradient(135deg,#1a1035,#2d1b69);border-radius:16px;padding:22px 26px;margin-bottom:20px;color:#fff">
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;flex-wrap:wrap">
            <div style="font-size:34px">🎙️</div>
            <div style="flex:1">
              <div style="font-size:18px;font-weight:700">Host Gaji Pokok (Gapok)</div>
              <div style="font-size:12px;opacity:.75;margin-top:2px">Kontrak host dengan target coin dan jam live mingguan</div>
            </div>
            <button onclick="hsOpenAdd()" class="btn" style="background:#7c3aed;color:#fff;font-weight:700;padding:9px 18px;font-size:13px;white-space:nowrap">+ Tambah Host</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
            <div style="background:rgba(255,255,255,.1);border-radius:10px;padding:12px 14px">
              <div style="font-size:10px;opacity:.7;margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">Host Aktif</div>
              <div style="font-size:22px;font-weight:700">${activeCount}</div>
            </div>
            <div style="background:rgba(255,255,255,.1);border-radius:10px;padding:12px 14px">
              <div style="font-size:10px;opacity:.7;margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">Nonaktif</div>
              <div style="font-size:22px;font-weight:700">${inactCount}</div>
            </div>
            <div style="background:rgba(255,255,255,.1);border-radius:10px;padding:12px 14px">
              <div style="font-size:10px;opacity:.7;margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">Target Terpenuhi Minggu Ini</div>
              <div style="font-size:22px;font-weight:700">${metCount} / ${activeCount}</div>
            </div>
            <div style="background:rgba(255,255,255,.1);border-radius:10px;padding:12px 14px">
              <div style="font-size:10px;opacity:.7;margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">Total Diamond Minggu Ini</div>
              <div style="font-size:16px;font-weight:700">${fmtD(totalDiamond)}</div>
            </div>
          </div>
        </div>

        <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:20px">
          <div style="font-weight:700;font-size:12px;margin-bottom:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Tabel Level Gapok</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            ${Object.entries(HS_LEVELS).map(([lvl, L]) => `
              <div style="background:var(--bg);border-radius:10px;padding:14px 16px;border-left:4px solid ${HS_LVL_COLOR[lvl]||'#7c3aed'}">
                <div style="font-size:15px;font-weight:800;color:${HS_LVL_COLOR[lvl]||'#7c3aed'};margin-bottom:8px">Level ${lvl}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:12px">
                  <div><span style="color:var(--text-muted)">Target coin:</span> <strong>${fmtN(L.target_coin)}</strong></div>
                  <div><span style="color:var(--text-muted)">Jam/minggu:</span> <strong>${L.valid_hours} jam (${L.valid_days} hari)</strong></div>
                  <div><span style="color:var(--text-muted)">Gaji pokok:</span> <strong style="color:#7c3aed">${fmtD(L.salary_diamond)}</strong></div>
                  <div><span style="color:var(--text-muted)">Reward room:</span> <strong style="color:#059669">${fmtD(L.reward_diamond)}</strong></div>
                  <div><span style="color:var(--text-muted)">Total/minggu:</span> <strong style="color:#dc2626">${fmtD(L.salary_diamond+L.reward_diamond)}</strong></div>
                  <div><span style="color:var(--text-muted)">IDR:</span> <strong>${fmtIDR(L.salary_diamond+L.reward_diamond)}</strong></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
          <button onclick="hsRefreshReport()" class="btn btn-sm" style="background:#059669;color:#fff;font-weight:700">⟳ Refresh Data Minggu Ini</button>
          <button onclick="renderHostSalary(document.getElementById('content'))" class="btn btn-sm btn-outline">🔄 Reload</button>
          <span id="hs-report-status" style="font-size:12px;color:var(--text-muted)"></span>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Host</th><th>Agency</th><th>Room</th><th>Level</th>
                <th>Coin Minggu Ini</th><th>Hari & Jam Live</th>
                <th>Total Diamond</th><th>Status Bayar</th><th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${contracts.length === 0
                ? '<tr><td colspan="9"><div class="empty">Belum ada host yang didaftarkan. Klik "+ Tambah Host" untuk memulai.</div></td></tr>'
                : contracts.map(c => {
                    const lvl  = c.salary_level || 'A1';
                    const ld   = HS_LEVELS[lvl] || HS_LEVELS['A1'];
                    const coinVal    = Number(c.this_week_coin||0);
                    const hrsVal     = Number(c.this_week_hours||0);
                    const activeDays = Number(c.this_week_active_days||0);
                    const coinMet    = !!c.this_week_coin_met  || coinVal >= ld.target_coin;
                    const hoursMet   = !!c.this_week_hours_met || hrsVal >= ld.valid_hours;
                    const daysMet    = !!c.this_week_days_met  || activeDays >= ld.valid_days;
                    const coinPct  = Math.min(100, Math.round((coinVal/ld.target_coin)*100));
                    const daysPct  = Math.min(100, Math.round((activeDays/ld.valid_days)*100));
                    const hrsPct   = Math.min(100, Math.round((hrsVal/ld.valid_hours)*100));
                    const metBadge = c.this_week_met
                      ? '<span class="badge green">\u2713 Terpenuhi</span>'
                      : '<span class="badge yellow">\u23f3 Progress</span>';
                    const payBadge = c.this_week_pay_status === 'paid'
                      ? '<span class="badge green">\u2713 Dibayar</span>'
                      : c.this_week_met
                        ? '<span class="badge red">Belum Dibayar</span>'
                        : '<span class="badge gray">\u2014</span>';
                    const statusBadge = c.status === 'active'
                      ? '<span class="badge green" style="font-size:10px">aktif</span>'
                      : '<span class="badge red" style="font-size:10px">nonaktif</span>';
                    const lc = HS_LVL_COLOR[lvl] || '#7c3aed';
                    const failReasons = !c.this_week_met ? [
                      !coinMet  ? '<span style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700">\u274c Coin kurang</span>' : '',
                      !hoursMet ? '<span style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700">\u274c Jam kurang</span>' : '',
                      !daysMet  ? '<span style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700">\u274c Hari kurang</span>' : '',
                    ].filter(Boolean).join(' ') : '';
                    return `<tr style="${c.status==='inactive'?'opacity:.5':''}">
                      <td><div style="font-weight:600">@${c.username}</div>${statusBadge}</td>
                      <td style="font-size:13px;color:var(--text-muted)">${c.agency_name||'\u2014'}</td>
                      <td style="font-size:13px">${c.room_voice_name||'\u2014'}</td>
                      <td><span style="font-weight:800;color:${lc};font-size:13px">${lvl}</span></td>
                      <td>
                        <div style="display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700;margin-bottom:4px">
                          ${fmtN(coinVal)} / ${fmtN(ld.target_coin)}
                          ${coinMet ? '<span style="color:#16a34a;font-size:11px">\u2713</span>' : '<span style="color:#dc2626;font-size:11px">\u2717</span>'}
                        </div>
                        <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;width:120px">
                          <div style="height:100%;width:${coinPct}%;background:${coinMet?'#16a34a':'#7c3aed'};border-radius:3px"></div>
                        </div>
                        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${coinPct}%</div>
                      </td>
                      <td>
                        <div style="margin-bottom:5px">
                          <div style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;margin-bottom:2px">
                            <span style="color:var(--text-muted)">Hari:</span> ${activeDays} / ${ld.valid_days}
                            ${daysMet ? '<span style="color:#16a34a">\u2713</span>' : '<span style="color:#dc2626">\u2717</span>'}
                          </div>
                          <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden;width:80px">
                            <div style="height:100%;width:${daysPct}%;background:${daysMet?'#16a34a':'#f59e0b'};border-radius:3px"></div>
                          </div>
                        </div>
                        <div>
                          <div style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;margin-bottom:2px">
                            <span style="color:var(--text-muted)">Jam:</span> ${hrsVal.toFixed(1)} / ${ld.valid_hours}
                            ${hoursMet ? '<span style="color:#16a34a">\u2713</span>' : ''}
                          </div>
                          <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden;width:80px">
                            <div style="height:100%;width:${hrsPct}%;background:${hoursMet?'#16a34a':'#f59e0b'};border-radius:3px"></div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style="font-size:13px;font-weight:700;color:${c.this_week_met?'#059669':'var(--text-muted)'}">
                          ${fmtD(c.this_week_diamond)}
                        </div>
                        <div style="font-size:10px;color:var(--text-muted)">${fmtIDR(c.this_week_diamond)}</div>
                        ${metBadge}
                        ${failReasons ? '<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:3px">' + failReasons + '</div>' : ''}
                      </td>
                      <td>
                        ${payBadge}
                        ${(c.this_week_met && c.this_week_pay_status !== 'paid' && c.this_week_log_id)
                          ? '<br><button onclick="hsMarkPaid(' + c.this_week_log_id + ')" class="btn btn-sm btn-success" style="margin-top:5px;font-size:11px">\u2713 Tandai Dibayar</button>'
                          : ''}
                      </td>
                      <td>
                        <div style="display:flex;gap:5px;flex-wrap:wrap">
                          <button onclick="hsOpenEdit('${c.id}')" class="btn btn-sm btn-outline" style="font-size:11px">\u270f Edit</button>
                          <button onclick="hsOpenHistory('${c.username}')" class="btn btn-sm btn-outline" style="font-size:11px">\ud83d\udcca Riwayat</button>
                          ${c.status === 'active'
                            ? '<button onclick="hsToggleStatus(' + c.id + ',\'inactive\')" class="btn btn-sm btn-danger" style="font-size:11px">&#x23F8;</button>'
                            : '<button onclick="hsToggleStatus(' + c.id + ',\'active\')" class="btn btn-sm btn-success" style="font-size:11px">&#x25BA;</button>'}
                        </div>
                      </td>
                    </tr>`;
                  }).join('')
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="modal-overlay" id="hs-modal">
        <div class="modal" style="max-width:480px;width:95%">
          <h3 id="hs-modal-title">Tambah Host Gaji Pokok</h3>
          <div style="display:flex;flex-direction:column;gap:12px;margin-top:14px">
            <div class="form-group">
              <label>Username Host <span style="color:var(--danger)">*</span></label>
              <input class="input" id="hs-username" placeholder="Contoh: max777" />
            </div>
            <div class="form-group">
              <label>Nama Agency</label>
              <input class="input" id="hs-agency" placeholder="Nama agency (opsional)" />
            </div>
            <div class="form-group">
              <label>Nama Room Voice</label>
              <input class="input" id="hs-room" placeholder="Nama party room host" />
            </div>
            <div class="form-group">
              <label>Level Gapok <span style="color:var(--danger)">*</span></label>
              <select class="input" id="hs-level">
                <option value="A1">A1 — 120K coin · 10 jam/minggu · 14,400 💎 (Rp 28,800)</option>
                <option value="S1">S1 — 600K coin · 15 jam/minggu · 50,000 💎 (Rp 100,000)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Catatan (opsional)</label>
              <textarea class="input" id="hs-notes" rows="2" placeholder="Catatan tambahan..."></textarea>
            </div>
            <div id="hs-form-err" style="color:var(--danger);font-size:13px;display:none"></div>
          </div>
          <div class="modal-actions" style="margin-top:16px">
            <button class="btn btn-outline" onclick="document.getElementById('hs-modal').classList.remove('open')">Batal</button>
            <button class="btn btn-primary" id="hs-save-btn" onclick="hsSave()">Simpan</button>
          </div>
        </div>
      </div>

      <div class="modal-overlay" id="hs-history-modal">
        <div class="modal" style="max-width:720px;width:95%;max-height:85vh;overflow-y:auto">
          <h3 id="hs-history-title">Riwayat Gaji Pokok</h3>
          <div id="hs-history-body" style="margin-top:14px"></div>
          <div class="modal-actions" style="margin-top:16px">
            <button class="btn btn-outline" onclick="document.getElementById('hs-history-modal').classList.remove('open')">Tutup</button>
          </div>
        </div>
      </div>
    `;

    window._hsContracts = contracts;

    window.hsRefreshReport = async function() {
      const st = document.getElementById('hs-report-status');
      if (st) st.textContent = 'Menarik data terbaru...';
      try {
        await api('/host-salary/weekly-report');
        if (st) st.textContent = 'Data diperbarui!';
        setTimeout(() => renderHostSalary(document.getElementById('content')), 700);
      } catch(e) { if (st) st.textContent = 'Gagal: ' + e.message; }
    };

    window.hsToggleStatus = async function(id, newStatus) {
      const lbl = newStatus === 'inactive' ? 'Nonaktifkan' : 'Aktifkan kembali';
      if (!confirm(lbl + ' host ini dari sistem gapok?')) return;
      const res = await api('/host-salary/contracts/' + id, { method:'PATCH', body:{status:newStatus} });
      if (res && res.success) { toast('Status berhasil diubah', 'success'); renderHostSalary(document.getElementById('content')); }
      else toast((res && res.error) || 'Gagal', 'error');
    };

    window.hsMarkPaid = async function(logId) {
      if (!confirm('Tandai diamond minggu ini sudah dibayar di luar app?')) return;
      const res = await api('/host-salary/weekly-logs/' + logId + '/pay', { method:'POST' });
      if (res && res.success) { toast('Pembayaran dicatat!', 'success'); renderHostSalary(document.getElementById('content')); }
      else toast((res && res.error) || 'Gagal', 'error');
    };

    window.hsOpenHistory = async function(username) {
      const fmtN2   = n => Number(n||0).toLocaleString('id-ID');
      const fmtD2   = n => Number(n||0).toLocaleString('id-ID') + ' 💎';
      const fmtIDR2 = n => 'Rp ' + (Number(n||0) * 2).toLocaleString('id-ID');
      document.getElementById('hs-history-title').textContent = 'Riwayat Gapok: @' + username;
      document.getElementById('hs-history-modal').classList.add('open');
      const body = document.getElementById('hs-history-body');
      body.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
      try {
        const d = await api('/host-salary/history/' + username);
        const history = d.history || [];
        if (!history.length) { body.innerHTML = '<div class="empty">Belum ada riwayat pembayaran</div>'; return; }
        body.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Periode</th><th>Level</th><th>Coin</th><th>Jam Live</th><th>Target</th><th>Total 💎</th><th>IDR</th><th>Status</th></tr></thead><tbody>' +
          history.map(h => '<tr>' +
            '<td style="font-size:12px;font-family:monospace">' + h.week_start + ' – ' + h.week_end + '</td>' +
            '<td><span style="font-weight:800;color:' + (HS_LVL_COLOR[h.salary_level]||'#7c3aed') + '">' + h.salary_level + '</span></td>' +
            '<td style="font-size:12px">' + fmtN2(h.coin_aktual) + '</td>' +
            '<td style="font-size:12px">' + Number(h.jam_live_aktual||0).toFixed(1) + ' jam</td>' +
            '<td>' + (h.target_terpenuhi ? '<span class="badge green">✓</span>' : '<span class="badge yellow">✗</span>') + '</td>' +
            '<td style="font-weight:700">' + fmtD2(h.total_diamond_earned) + '</td>' +
            '<td style="font-size:12px">' + fmtIDR2(h.total_diamond_earned) + '</td>' +
            '<td>' + (h.payment_status==='paid' ? '<span class="badge green">Dibayar</span>' : '<span class="badge gray">Pending</span>') + '</td>' +
            '</tr>').join('') +
          '</tbody></table></div>';
      } catch { body.innerHTML = '<div class="empty">Gagal memuat riwayat</div>'; }
    };

    window.hsOpenEdit = function(id) {
      const c = (window._hsContracts || []).find(x => String(x.id) === String(id));
      if (!c) return;
      _hsEditId = c.id;
      document.getElementById('hs-modal-title').textContent = 'Edit Kontrak Host';
      document.getElementById('hs-username').value = c.username || '';
      document.getElementById('hs-username').disabled = true;
      document.getElementById('hs-agency').value = c.agency_name || '';
      document.getElementById('hs-room').value = c.room_voice_name || '';
      document.getElementById('hs-level').value = c.salary_level || 'A1';
      document.getElementById('hs-notes').value = c.notes || '';
      document.getElementById('hs-form-err').style.display = 'none';
      document.getElementById('hs-modal').classList.add('open');
    };
  }

  window.hsOpenAdd = function() {
    _hsEditId = null;
    document.getElementById('hs-modal-title').textContent = 'Tambah Host Gaji Pokok';
    document.getElementById('hs-username').value = '';
    document.getElementById('hs-username').disabled = false;
    document.getElementById('hs-agency').value = '';
    document.getElementById('hs-room').value = '';
    document.getElementById('hs-level').value = 'A1';
    document.getElementById('hs-notes').value = '';
    document.getElementById('hs-form-err').style.display = 'none';
    document.getElementById('hs-modal').classList.add('open');
  };

  window.hsSave = async function() {
    const errEl = document.getElementById('hs-form-err');
    const btn   = document.getElementById('hs-save-btn');
    const body  = {
      username:        document.getElementById('hs-username').value.trim(),
      agency_name:     document.getElementById('hs-agency').value.trim(),
      room_voice_name: document.getElementById('hs-room').value.trim(),
      salary_level:    document.getElementById('hs-level').value,
      notes:           document.getElementById('hs-notes').value.trim() || null,
    };
    if (!body.username) { errEl.textContent = 'Username wajib diisi'; errEl.style.display = 'block'; return; }
    btn.disabled = true; btn.textContent = 'Menyimpan...';
    try {
      const res = _hsEditId
        ? await api('/host-salary/contracts/' + _hsEditId, { method:'PATCH', body })
        : await api('/host-salary/contracts', { method:'POST', body });
      if (res && res.error) { errEl.textContent = res.error; errEl.style.display = 'block'; return; }
      toast(_hsEditId ? 'Kontrak diperbarui!' : 'Host berhasil ditambahkan!', 'success');
      document.getElementById('hs-modal').classList.remove('open');
      renderHostSalary(document.getElementById('content'));
    } catch(e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
    finally { btn.disabled = false; btn.textContent = 'Simpan'; }
  };
  
// ─── INIT ─────────────────────────────────────────────────────────────────────
render();
