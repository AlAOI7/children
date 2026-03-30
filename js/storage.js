// ===== HYBRID STORAGE: localStorage (instant) + Flask sync (background) =====
// All operations are instant via localStorage
// Flask/MySQL sync happens silently in background
// Camera works 100% offline

const API_BASE = 'http://localhost:5000/api';

// ===== TOKEN / AUTH =====
const Auth = {
  getToken()  { return localStorage.getItem('scba_token'); },
  setToken(t) { localStorage.setItem('scba_token', t); },
  clearToken(){ localStorage.removeItem('scba_token'); localStorage.removeItem('scba_user'); },
  getUser()   { const u = localStorage.getItem('scba_user'); try { return u ? JSON.parse(u) : null; } catch { return null; } },
  setUser(u)  { localStorage.setItem('scba_user', JSON.stringify(u)); }
};

// ===== SILENT FETCH (never blocks, only logs errors) =====
async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res  = await fetch(API_BASE + path, { ...options, headers, signal: AbortSignal.timeout(6000) });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}

// ===== LOCAL DATA HELPERS =====
function lsGet(key, def = []) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
}
function lsSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ===== DB OBJECT =====
const DB = {

  // ── AUTH ──────────────────────────────────────────────────────
  async registerUser(name, email, password, role) {
    // Save locally first (instant)
    const users = lsGet('scba_users');
    if (users.find(u => u.email === email)) return { ok: false, msg: 'البريد مسجل مسبقاً' };
    const user = { id: uid(), name, email, role };
    users.push({ ...user, password });
    lsSet('scba_users', users);
    Auth.setUser(user);
    Auth.setToken('local_' + btoa(email + ':' + Date.now()));

    // Sync to server silently
    apiFetch('/register', { method: 'POST', body: JSON.stringify({ name, email, password, role }) })
      .then(r => { if (r.ok) { Auth.setToken(r.data.token); Auth.setUser(r.data.user || user); } });

    return { ok: true, user };
  },

  async loginUser(email, password) {
    // Try localStorage first
    const users = lsGet('scba_users');
    const local  = users.find(u => u.email === email && u.password === password);
    if (local) {
      const user = { id: local.id, name: local.name, email: local.email, role: local.role };
      Auth.setUser(user);
      if (!Auth.getToken() || Auth.getToken().startsWith('local_')) {
        Auth.setToken('local_' + btoa(email + ':' + Date.now()));
      }

      // Try to get real token from server
      apiFetch('/login', { method: 'POST', body: JSON.stringify({ email, password }) })
        .then(r => { if (r.ok) { Auth.setToken(r.data.token); if(r.data.user) Auth.setUser(r.data.user); } });

      return { ok: true, user };
    }

    // Try server if not in localStorage
    const r = await apiFetch('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (r.ok) {
      Auth.setToken(r.data.token);
      const user = r.data.user || { email };
      Auth.setUser(user);
      // Cache locally
      if (!users.find(u => u.email === email)) {
        users.push({ ...user, email, password });
        lsSet('scba_users', users);
      }
      return { ok: true, user };
    }
    return { ok: false, msg: r.data.error || 'البريد أو كلمة المرور غير صحيحة' };
  },

  getCurrentUser() { return Auth.getUser(); },
  logout()        { Auth.clearToken(); },

  // ── CHILDREN ──────────────────────────────────────────────────
  async getChildren() {
    const user = Auth.getUser();
    const local = lsGet('scba_children').filter(c => c.userId === (user?.id || user?.user_id));

    // Sync from server in background
    apiFetch('/children').then(r => {
      if (r.ok && Array.isArray(r.data)) {
        const all = lsGet('scba_children').filter(c => c.userId !== (user?.id || user?.user_id));
        const serverChildren = r.data.map(c => ({
          id: String(c.child_id || c.id), child_id: c.child_id || c.id,
          userId: user?.id, name: c.name, age: c.age,
          gender: c.gender, grade: c.grade, school: c.school, notes: c.notes
        }));
        lsSet('scba_children', [...all, ...serverChildren]);
      }
    });

    return local;
  },

  async addChild(userId, data) {
    const user = Auth.getUser();
    const child = { id: uid(), child_id: uid(), userId: user?.id || userId, ...data };
    const children = lsGet('scba_children');
    children.push(child);
    lsSet('scba_children', children);

    // Sync to server
    apiFetch('/children', { method: 'POST', body: JSON.stringify(data) })
      .then(r => {
        if (r.ok && r.data.child_id) {
          const all = lsGet('scba_children');
          const idx = all.findIndex(c => c.id === child.id);
          if (idx >= 0) {
            all[idx].child_id = r.data.child_id;
            all[idx].serverId = r.data.child_id;
            lsSet('scba_children', all);
          }
        }
      });

    return child;
  },

  async getChild(childId) {
    // Check localStorage first (instant)
    const local = lsGet('scba_children').find(c =>
      String(c.id) === String(childId) || String(c.child_id) === String(childId)
    );
    if (local) return local;

    // Fallback to server
    const r = await apiFetch(`/children/${childId}`);
    if (r.ok) {
      const child = {
        id: String(r.data.child_id || r.data.id || childId),
        child_id: r.data.child_id || childId,
        userId: Auth.getUser()?.id,
        name: r.data.name, age: r.data.age,
        gender: r.data.gender, grade: r.data.grade,
        school: r.data.school, notes: r.data.notes
      };
      // Cache it
      const children = lsGet('scba_children');
      if (!children.find(c => String(c.child_id) === String(child.child_id))) {
        children.push(child);
        lsSet('scba_children', children);
      }
      return child;
    }
    return null;
  },

  async deleteChild(childId) {
    const children = lsGet('scba_children').filter(c =>
      String(c.id) !== String(childId) && String(c.child_id) !== String(childId)
    );
    lsSet('scba_children', children);
    apiFetch(`/children/${childId}`, { method: 'DELETE' });
  },

  // ── RESULTS ───────────────────────────────────────────────────
  async saveResult(childId, answers, total, level, categories) {
    const result = {
      id: uid(), report_id: uid(),
      childId: String(childId), total, level, categories,
      scores: answers, date: new Date().toISOString()
    };
    const results = lsGet('scba_results');
    results.unshift(result);
    lsSet('scba_results', results);

    // Sync to server
    apiFetch('/assessment', {
      method: 'POST',
      body: JSON.stringify({ child_id: childId, total, level, categories, answers })
    }).then(r => {
      if (r.ok && r.data.report_id) {
        const all = lsGet('scba_results');
        const idx = all.findIndex(x => x.id === result.id);
        if (idx >= 0) { all[idx].server_id = r.data.report_id; lsSet('scba_results', all); }
      }
    });

    return result;
  },

  async getResults(childId) {
    const local = lsGet('scba_results').filter(r =>
      String(r.childId) === String(childId) || String(r.child_id) === String(childId)
    );

    // Background sync
    apiFetch(`/assessment/${childId}`).then(r => {
      if (r.ok && Array.isArray(r.data)) {
        const all = lsGet('scba_results').filter(x =>
          String(x.childId) !== String(childId) && String(x.child_id) !== String(childId)
        );
        const serverResults = r.data.map(row => ({
          id: String(row.report_id), report_id: row.report_id,
          childId: String(row.child_id),
          total: row.total_score, level: row.level,
          categories: {
            attention: row.score_attention,
            hyperactivity: row.score_hyperactive,
            social: row.score_social
          },
          scores: row.answers_json || {},
          date: row.report_date
        }));
        lsSet('scba_results', [...all, ...serverResults]);
      }
    });

    return local;
  },

  async getLatestResult(childId) {
    const results = await this.getResults(childId);
    return results.length ? results[0] : null;
  },

  async getAllResults(userId) { return lsGet('scba_results'); },

  // ── CAMERA SESSIONS ───────────────────────────────────────────
  async saveCameraResult(childId, cameraData) {
    const session = {
      id: uid(), childId: String(childId),
      level: cameraData.level, metrics: cameraData.metrics,
      avg_movement: cameraData.metrics?.avgMovement || 0,
      avg_neutral:  cameraData.metrics?.avgNeutral  || 0,
      sample_count: cameraData.metrics?.sampleCount || 0,
      date: new Date().toISOString()
    };
    const sessions = lsGet('scba_camera');
    sessions.unshift(session);
    lsSet('scba_camera', sessions);

    // Background sync
    apiFetch('/camera/save_session', {
      method: 'POST',
      body: JSON.stringify({ child_id: childId, frames: cameraData.frames || [] })
    });

    return session;
  },

  async getCameraResults(childId) {
    return lsGet('scba_camera').filter(s =>
      String(s.childId) === String(childId) || String(s.child_id) === String(childId)
    );
  },

  async getLatestCameraResult(childId) {
    const results = await this.getCameraResults(childId);
    return results.length ? results[0] : null;
  }
};

// ===== AUTH GUARD =====
function requireAuth() {
  const user = DB.getCurrentUser();
  if (!user) { window.location.href = 'index.html'; return null; }
  return user;
}
function redirectIfLoggedIn() {
  if (DB.getCurrentUser()) window.location.href = 'dashboard.html';
}

// ===== TOAST =====
function showToast(msg, type = 'success') {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span class="toast-msg">${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity 0.4s'; setTimeout(()=>t.remove(),400); }, 3000);
}

// ===== NAVBAR =====
function renderNavbar(activePage) {
  const user = DB.getCurrentUser();
  if (!user) return;
  const el = document.getElementById('navbar');
  if (!el) return;
  el.innerHTML = `
    <a href="dashboard.html" class="nav-brand">
      <div class="logo-icon">🧠</div><span>تحليل سلوك الأطفال</span>
    </a>
    <ul class="nav-links">
      <li><a href="dashboard.html" ${activePage==='dashboard'?'style="color:var(--primary-light)"':''}>لوحة التحكم</a></li>
      <li><a href="add-child.html" ${activePage==='add-child'?'style="color:var(--primary-light)"':''}>إضافة طفل</a></li>
      <li><a href="history.html" ${activePage==='history'?'style="color:var(--primary-light)"':''}>السجلات</a></li>
      <li><a href="about.html" ${activePage==='about'?'style="color:var(--primary-light)"':''}>عن المشروع</a></li>
    </ul>
    <div class="nav-user">
      <div class="user-avatar" title="${user.name}">${user.name.charAt(0)}</div>
      <button class="btn btn-outline btn-sm" onclick="logoutUser()">تسجيل خروج</button>
    </div>
  `;
}
function logoutUser() { DB.logout(); window.location.href = 'index.html'; }

// ===== HELPERS =====
function getQueryParam(k) { return new URLSearchParams(window.location.search).get(k); }
function formatDate(iso) {
  try { return new Date(iso).toLocaleDateString('ar-SA',{year:'numeric',month:'long',day:'numeric'}); }
  catch { return iso || ''; }
}
function getLevelInfo(level) {
  const map = {
    normal:      { label:'طبيعي',               color:'#10b981', badge:'badge-normal',      emoji:'🟢', className:'normal' },
    attention:   { label:'تشتت الانتباه (ADHD)', color:'#f59e0b', badge:'badge-attention',   emoji:'🟡', className:'attention' },
    hyperactive: { label:'فرط الحركة (ADHD)',    color:'#ef4444', badge:'badge-hyperactive', emoji:'🔴', className:'hyperactive' },
    autism:      { label:'طيف التوحد (ASD)',      color:'#a855f7', badge:'badge-autism',      emoji:'🟣', className:'autism' }
  };
  return map[level] || map.normal;
}
function classifyScore(total, categories) {
  if (typeof CATEGORY_MAX !== 'undefined' && categories) {
    if (total <= 35) return 'normal';
    const attPct = ((categories.attention     || 0) / CATEGORY_MAX.attention)     * 100;
    const hypPct = ((categories.hyperactivity || 0) / CATEGORY_MAX.hyperactivity) * 100;
    const socPct = ((categories.social        || 0) / CATEGORY_MAX.social)        * 100;
    if (socPct >= 65 && socPct > hypPct && socPct > attPct) return 'autism';
    if (hypPct >= 65 && hypPct >= attPct) return 'hyperactive';
    if (total <= 70) return 'attention';
    return 'hyperactive';
  }
  if (total <= 35) return 'normal'; if (total <= 70) return 'attention'; return 'hyperactive';
}
