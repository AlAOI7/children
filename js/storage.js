// ===== API LAYER (Flask Backend) =====
// Replaces localStorage — all data persisted in MySQL via Flask

const API_BASE = 'http://localhost:5000/api';

// ===== TOKEN MANAGEMENT =====
const Auth = {
  getToken()        { return sessionStorage.getItem('scba_token'); },
  setToken(t)       { sessionStorage.setItem('scba_token', t); },
  clearToken()      { sessionStorage.removeItem('scba_token'); sessionStorage.removeItem('scba_user'); },
  getUser()         { const u = sessionStorage.getItem('scba_user'); return u ? JSON.parse(u) : null; },
  setUser(u)        { sessionStorage.setItem('scba_user', JSON.stringify(u)); }
};

// ===== FETCH WRAPPER =====
async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(API_BASE + path, { ...options, headers });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: 'تعذّر الاتصال بالخادم — تأكد من تشغيل Flask' } };
  }
}

// ===== DB object — keeps same interface as old localStorage version =====
const DB = {

  // ── AUTH ──────────────────────────────────────────────
  async registerUser(name, email, password, role) {
    const r = await apiFetch('/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role })
    });
    if (r.ok) {
      Auth.setToken(r.data.token);
      Auth.setUser(r.data.user);
      return { ok: true, user: r.data.user };
    }
    return { ok: false, msg: r.data.error || 'خطأ في التسجيل' };
  },

  async loginUser(email, password) {
    const r = await apiFetch('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (r.ok) {
      Auth.setToken(r.data.token);
      Auth.setUser(r.data.user);
      return { ok: true, user: r.data.user };
    }
    return { ok: false, msg: r.data.error || 'البيانات غير صحيحة' };
  },

  getCurrentUser() {
    return Auth.getUser();
  },

  logout() {
    Auth.clearToken();
  },

  // ── CHILDREN ──────────────────────────────────────────
  async getChildren() {
    const r = await apiFetch('/children');
    return r.ok ? r.data : [];
  },

  async addChild(userId, data) {
    const r = await apiFetch('/children', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return r.ok ? { ...data, id: r.data.child_id, child_id: r.data.child_id } : null;
  },

  async getChild(childId) {
    const r = await apiFetch(`/children/${childId}`);
    return r.ok ? r.data : null;
  },

  async deleteChild(childId) {
    await apiFetch(`/children/${childId}`, { method: 'DELETE' });
  },

  // ── RESULTS ───────────────────────────────────────────
  async saveResult(childId, answers, total, level, categories) {
    const r = await apiFetch('/assessment', {
      method: 'POST',
      body: JSON.stringify({ child_id: childId, total, level, categories, answers })
    });
    return r.ok ? { id: r.data.report_id, childId, total, level, categories, date: new Date().toISOString() } : null;
  },

  async getResults(childId) {
    const r = await apiFetch(`/assessment/${childId}`);
    if (!r.ok) return [];
    return r.data.map(row => ({
      id:         String(row.report_id),
      childId:    String(row.child_id),
      total:      row.total_score,
      level:      row.level,
      categories: {
        attention:    row.score_attention,
        hyperactivity: row.score_hyperactive,
        social:       row.score_social
      },
      scores:  row.answers_json || {},
      date:    row.report_date
    }));
  },

  async getLatestResult(childId) {
    const results = await this.getResults(childId);
    return results.length ? results[0] : null;
  },

  async getAllResults(userId) {
    // Not used with backend — returns empty (each page fetches its own data)
    return [];
  },

  // ── CAMERA SESSIONS ───────────────────────────────────
  async saveCameraResult(childId, cameraData) {
    const r = await apiFetch('/camera/save_session', {
      method: 'POST',
      body: JSON.stringify({ child_id: childId, frames: cameraData.frames || [] })
    });
    return r.ok ? r.data : null;
  },

  async getCameraResults(childId) {
    const r = await apiFetch(`/camera/${childId}`);
    return r.ok ? r.data : [];
  },

  async getLatestCameraResult(childId) {
    const results = await this.getCameraResults(childId);
    return results.length ? results[0] : null;
  }
};

// ===== AUTH GUARD =====
function requireAuth() {
  const user = DB.getCurrentUser();
  if (!user) {
    window.location.href = 'index.html';
    return null;
  }
  return user;
}

function redirectIfLoggedIn() {
  if (DB.getCurrentUser()) {
    window.location.href = 'dashboard.html';
  }
}

// ===== TOAST =====
function showToast(msg, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-msg">${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.4s';
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// ===== NAVBAR RENDER =====
function renderNavbar(activePage) {
  const user = DB.getCurrentUser();
  if (!user) return;
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  navbar.innerHTML = `
    <a href="dashboard.html" class="nav-brand">
      <div class="logo-icon">🧠</div>
      <span>تحليل سلوك الأطفال</span>
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

function logoutUser() {
  DB.logout();
  window.location.href = 'index.html';
}

// ===== HELPERS =====
function getQueryParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
}

function getLevelInfo(level) {
  const map = {
    normal:      { label: 'طبيعي',                    color: '#10b981', badge: 'badge-normal',      emoji: '🟢', className: 'normal' },
    attention:   { label: 'تشتت الانتباه (ADHD)',      color: '#f59e0b', badge: 'badge-attention',   emoji: '🟡', className: 'attention' },
    hyperactive: { label: 'فرط الحركة (ADHD)',         color: '#ef4444', badge: 'badge-hyperactive', emoji: '🔴', className: 'hyperactive' },
    autism:      { label: 'طيف التوحد (ASD)',           color: '#a855f7', badge: 'badge-autism',      emoji: '🟣', className: 'autism' }
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
  if (total <= 35) return 'normal';
  if (total <= 70) return 'attention';
  return 'hyperactive';
}
