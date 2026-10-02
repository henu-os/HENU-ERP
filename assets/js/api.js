// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — CENTRAL API CLIENT
// All HTTP calls go through this file.
// Never use raw fetch() in modules — always use API.*
// ═══════════════════════════════════════════════════════════

const API = (() => {

  // ── Build request headers ──────────────────────────────
  function _headers(extra = {}) {
    const token = (typeof Auth !== 'undefined' && Auth.getToken)
      ? Auth.getToken()
      : (sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken'));
    const societyId = (typeof Auth !== 'undefined' && Auth.getSocietyId)
      ? Auth.getSocietyId()
      : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId'));
    const fyId = (typeof Auth !== 'undefined' && Auth.getFYId)
      ? Auth.getFYId()
      : (sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId'));

    const headers = {
      'Content-Type': 'application/json',
      ...extra
    };

    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (societyId && String(societyId) !== 'false') headers['X-Society-Id'] = societyId;
    if (fyId && String(fyId) !== 'false') headers['X-FY-Id'] = fyId;

    return headers;
  }

  // ── Build full URL ─────────────────────────────────────
  function _url(endpoint) {
    let base = window.APP_CONFIG?.API_BASE || 'http://localhost:5002/api';
    if (!endpoint.startsWith('/')) endpoint = '/' + endpoint;
    if (base.endsWith('/api') && endpoint.startsWith('/api/')) {
      endpoint = endpoint.substring(4);
    }
    return base + endpoint;
  }

  function _isViewOnlyBlocked(method, endpoint) {
    if (method === 'GET') return false;

    const isViewOnly = (typeof Auth !== 'undefined' && typeof Auth.isViewOnly === 'function')
      ? Auth.isViewOnly()
      : (() => {
          const prim = sessionStorage.getItem('primaryActiveSocietyId') || localStorage.getItem('primaryActiveSocietyId');
          const curr = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId');
          return !!(prim && curr && String(prim) !== String(curr));
        })();

    if (!isViewOnly) return false;

    const ep = (endpoint || '').toLowerCase();
    if (ep.includes('/auth') || ep.includes('/login')) return false;

    const isSocietyMasterPage = typeof window !== 'undefined' && window.location.pathname.toLowerCase().includes('society-master');
    if (isSocietyMasterPage && ep.includes('/societies')) return false;

    return true;
  }

  function _triggerViewOnlyAlert() {
    const socName = (typeof Auth !== 'undefined' && Auth.getSocietyName)
      ? Auth.getSocietyName()
      : (sessionStorage.getItem('activeSocietyName') || 'this society');

    if (typeof WorkspaceBridge !== 'undefined' && WorkspaceBridge.showViewOnlyModal) {
      WorkspaceBridge.showViewOnlyModal(socName);
    } else if (window.parent && window.parent !== window && window.parent.WorkspaceManager && window.parent.WorkspaceManager.showViewOnlyModal) {
      window.parent.WorkspaceManager.showViewOnlyModal(socName);
    } else if (typeof window.WorkspaceManager !== 'undefined' && window.WorkspaceManager.showViewOnlyModal) {
      window.WorkspaceManager.showViewOnlyModal(socName);
    } else {
      alert(`[VIEW-ONLY MODE]\n\nYou are viewing "${socName}" in View-Only mode.\nTo make changes or create entries, please switch to this society from Society Master.`);
    }
  }

  // ── Core fetch wrapper ─────────────────────────────────
  async function _request(method, endpoint, body = null, raw = false) {
    if (_isViewOnlyBlocked(method, endpoint)) {
      _triggerViewOnlyAlert();
      const err = new Error('Action blocked: Viewing in read-only mode. Switch to this society from Society Master to make changes.');
      err.isViewOnlyBlocked = true;
      throw err;
    }

    const opts = {
      method,
      headers: _headers()
    };

    if (body !== null && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }

    try {
      const res = await fetch(_url(endpoint), opts);

      // Handle 401 Unauthorized → redirect to login
      if (res.status === 401) {
        if (window.SafeStorage) window.SafeStorage.session.clear(); else try { sessionStorage.clear(); } catch(e){}
        if (!window.location.pathname.includes('login.html')) {
          const target = typeof resolveRootPath === 'function' ? resolveRootPath('login.html') : 'login.html';
          window.location.href = target;
        }
        throw new Error('Session expired. Please login again.');
      }

      // Handle non-OK responses
      if (!res.ok) {
        let errMsg = `Server error (${res.status})`;
        let errData = null;
        try {
          errData = await res.json();
          errMsg = errData.message || errData.error || errData.report?.statusMessage || errMsg;
        } catch (_) {}
        const err = new Error(errMsg);
        if (errData) err.data = errData;
        throw err;
      }

      if (raw) return res;
      return await res.json();

    } catch (err) {
      // Network error
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error('Cannot connect to server. Is the backend running?');
      }
      throw err;
    }
  }

  // ── Public Methods ─────────────────────────────────────
  return {

    // GET /api/endpoint
    get(endpoint) {
      return _request('GET', endpoint);
    },

    // POST /api/endpoint with body
    post(endpoint, body) {
      return _request('POST', endpoint, body);
    },

    // PUT /api/endpoint with body
    put(endpoint, body) {
      return _request('PUT', endpoint, body);
    },

    // DELETE /api/endpoint
    delete(endpoint) {
      return _request('DELETE', endpoint);
    },

    // Build query string from params object
    // e.g. API.query('/groups', { societyId: 1, fyId: 3 })
    // → GET /api/groups?societyId=1&fyId=3
    query(endpoint, params = {}) {
      const qs = Object.entries(params)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      return _request('GET', qs ? `${endpoint}?${qs}` : endpoint);
    },

    isViewOnly() {
      return _isViewOnlyBlocked('POST', '/api/test');
    }
  };

})();

// ── Intercept raw window.fetch so even modules using fetch() directly are protected ──
if (typeof window !== 'undefined' && window.fetch && !window._jeevikaFetchPatched) {
  window._jeevikaFetchPatched = true;
  const _originalFetch = window.fetch;
  window.fetch = async function (resource, options) {
    const method = (options && options.method ? options.method : 'GET').toUpperCase();
    const url = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');

    if (method !== 'GET' && method !== 'HEAD') {
      const prim = sessionStorage.getItem('primaryActiveSocietyId') || localStorage.getItem('primaryActiveSocietyId');
      const curr = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId');
      const isViewOnly = !!(prim && curr && String(prim) !== String(curr));

      if (isViewOnly) {
        const ep = url.toLowerCase();
        const isAuth = ep.includes('/auth') || ep.includes('/login');
        const isSocMaster = window.location.pathname.toLowerCase().includes('society-master');
        const isSocietyMgmt = isSocMaster && ep.includes('/societies');

        if (!isAuth && !isSocietyMgmt) {
          const socName = sessionStorage.getItem('activeSocietyName') || localStorage.getItem('activeSocietyName') || 'this society';
          if (typeof WorkspaceBridge !== 'undefined' && WorkspaceBridge.showViewOnlyModal) {
            WorkspaceBridge.showViewOnlyModal(socName);
          } else if (window.parent && window.parent !== window && window.parent.WorkspaceManager && window.parent.WorkspaceManager.showViewOnlyModal) {
            window.parent.WorkspaceManager.showViewOnlyModal(socName);
          } else if (window.WorkspaceManager && window.WorkspaceManager.showViewOnlyModal) {
            window.WorkspaceManager.showViewOnlyModal(socName);
          } else {
            alert(`[READ-ONLY VIEW MODE]\n\nYou are viewing "${socName}" in View-Only mode.\nTo make changes or create entries, please switch to this society from Society Master.`);
          }

          const err = new Error('Action blocked: Viewing in read-only mode. Switch to this society from Society Master to make changes.');
          err.isViewOnlyBlocked = true;
          return Promise.reject(err);
        }
      }
    }

    return _originalFetch.apply(this, arguments);
  };
}

if (typeof window !== 'undefined') {
  window.API = API;
  window.Api = API;
}
const Api = API;
