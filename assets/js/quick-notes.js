// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — SOCIETY QUICK NOTES & DASHBOARD REMINDERS
// ═══════════════════════════════════════════════════════════
// - Scoped strictly per-Society (Society A notes ≠ Society B notes)
// - Permanent persistence (stored in localStorage / SafeStorage.local,
//   survives logout/login, browser reloads until manually deleted)
// - Reminds on Dashboard if unread
// - Shortcut: Alt+N
// ═══════════════════════════════════════════════════════════

(() => {
  const STORAGE_PREFIX = 'jeevika_quick_notes_soc_';
  let activeTab = 'all'; // 'all' or 'unread'
  let selectedPriority = 'normal';
  let currentActiveSocId = null;

  // ── Storage Helpers ──────────────────────────────────────────
  function getStorage() {
    if (window.SafeStorage && window.SafeStorage.local) {
      return window.SafeStorage.local;
    }
    return window.localStorage;
  }

  function getActiveSociety() {
    let socId = (window.Auth && typeof window.Auth.getSocietyId === 'function') ? window.Auth.getSocietyId() : null;
    if (!socId || isNaN(parseInt(socId, 10))) {
      try {
        socId = (window.sessionStorage && window.sessionStorage.getItem('activeSocietyId')) ||
                (window.localStorage && window.localStorage.getItem('activeSocietyId')) || '1';
      } catch (_) {
        socId = '1';
      }
    }
    let socName = (window.Auth && typeof window.Auth.getSocietyName === 'function') ? window.Auth.getSocietyName() : null;
    if (!socName || socName === '—') {
      try {
        socName = (window.sessionStorage && window.sessionStorage.getItem('activeSocietyName')) ||
                  (window.localStorage && window.localStorage.getItem('activeSocietyName')) || 'Active Society';
      } catch (_) {
        socName = 'Active Society';
      }
    }
    return { id: String(socId), name: socName };
  }

  function getUserName() {
    let userName = (window.Auth && typeof window.Auth.getUserName === 'function') ? window.Auth.getUserName() : null;
    if (!userName) {
      try {
        userName = (window.sessionStorage && window.sessionStorage.getItem('userName')) ||
                   (window.localStorage && window.localStorage.getItem('userName')) || 'ADMIN';
      } catch (_) {
        userName = 'ADMIN';
      }
    }
    return userName;
  }

  function getStorageKey(socId) {
    return STORAGE_PREFIX + (socId || '1');
  }

  function getNotes(socId) {
    const key = getStorageKey(socId);
    try {
      const raw = getStorage().getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[QuickNotes] Error reading notes:', e);
      return [];
    }
  }

  function saveNotes(notes, socId) {
    const key = getStorageKey(socId);
    try {
      getStorage().setItem(key, JSON.stringify(notes || []));
    } catch (e) {
      console.error('[QuickNotes] Error saving notes to persistent storage:', e);
    }
  }

  // ── Core Operations ──────────────────────────────────────────
  function addNote(text, priority = 'normal', showOnDashboard = true) {
    if (!text || !text.trim()) return null;
    const soc = getActiveSociety();
    const notes = getNotes(soc.id);

    const newNote = {
      id: 'qn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      societyId: soc.id,
      societyName: soc.name,
      text: text.trim(),
      priority: priority || 'normal',
      showOnDashboard: showOnDashboard !== false,
      isRead: false,
      author: getUserName(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    notes.unshift(newNote); // newest at the top
    saveNotes(notes, soc.id);

    refreshUI();
    return newNote;
  }

  function updateNote(noteId, updates) {
    const soc = getActiveSociety();
    const notes = getNotes(soc.id);
    const idx = notes.findIndex(n => n.id === noteId);
    if (idx === -1) return false;

    notes[idx] = {
      ...notes[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    saveNotes(notes, soc.id);
    refreshUI();
    return true;
  }

  function deleteNote(noteId) {
    if (!confirm('Are you sure you want to delete this note? It cannot be recovered.')) {
      return false;
    }
    const soc = getActiveSociety();
    const notes = getNotes(soc.id);
    const filtered = notes.filter(n => n.id !== noteId);
    saveNotes(filtered, soc.id);
    refreshUI();
    return true;
  }

  function toggleReadStatus(noteId) {
    const soc = getActiveSociety();
    const notes = getNotes(soc.id);
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    note.isRead = !note.isRead;
    note.updatedAt = new Date().toISOString();
    saveNotes(notes, soc.id);
    refreshUI();
  }

  function markAsRead(noteId) {
    const soc = getActiveSociety();
    const notes = getNotes(soc.id);
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    note.isRead = true;
    note.updatedAt = new Date().toISOString();
    saveNotes(notes, soc.id);
    refreshUI();
  }

  // ── UI Refresh & Rendering ───────────────────────────────────
  function refreshUI() {
    const soc = getActiveSociety();
    currentActiveSocId = soc.id;

    renderFloatingWidgetHeader(soc);
    renderNotesList(soc.id);
    updateStatusBarBadge(soc.id);
    renderDashboardNotification(soc.id);
  }

  function renderFloatingWidgetHeader(soc) {
    const tag = document.getElementById('fnSocTag');
    if (tag) {
      tag.textContent = soc.name || 'Society';
      tag.title = soc.name;
    }
  }

  function updateStatusBarBadge(socId) {
    const soc = socId ? { id: socId } : getActiveSociety();
    const notes = getNotes(soc.id);
    const unreadCount = notes.filter(n => !n.isRead).length;

    const badge = document.getElementById('sbNotesBadge');
    const pill = document.getElementById('sbNotesBtn');

    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }

    if (pill) {
      if (unreadCount > 0) {
        pill.classList.add('has-unread');
      } else {
        pill.classList.remove('has-unread');
      }
    }
  }

  function renderNotesList(socId) {
    const listEl = document.getElementById('fnNotesList');
    if (!listEl) return;

    const soc = socId ? { id: socId } : getActiveSociety();
    const allNotes = getNotes(soc.id);
    const displayNotes = activeTab === 'unread'
      ? allNotes.filter(n => !n.isRead)
      : allNotes;

    // Update tab counts
    const tabAllCount = document.getElementById('fnTabAllCount');
    const tabUnreadCount = document.getElementById('fnTabUnreadCount');
    if (tabAllCount) tabAllCount.textContent = `(${allNotes.length})`;
    if (tabUnreadCount) {
      const uCount = allNotes.filter(n => !n.isRead).length;
      tabUnreadCount.textContent = `(${uCount})`;
    }

    if (displayNotes.length === 0) {
      listEl.innerHTML = `
        <div class="fn-empty-state">
          <i class="bi bi-journal-check"></i>
          <div>${activeTab === 'unread' ? 'No unread notes for this society!' : 'No quick notes added for this society yet.'}</div>
          <div style="font-size:11px; margin-top:4px; color:#94a3b8;">Use the input box above to jot down society reminders.</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = displayNotes.map(n => {
      const pClass = n.priority === 'urgent' ? 'priority-urgent' : (n.priority === 'important' ? 'priority-important' : '');
      const pBadgeClass = n.priority === 'urgent' ? 'urgent' : (n.priority === 'important' ? 'important' : 'normal');
      const unreadClass = !n.isRead ? 'is-unread' : '';
      const dateFormatted = formatNoteTime(n.createdAt);

      return `
        <div class="fn-card ${pClass} ${unreadClass}" id="card_${n.id}">
          <div class="fn-card-top">
            <div class="fn-card-meta">
              <span class="fn-card-badge ${pBadgeClass}">${escapeHtml(n.priority || 'Normal')}</span>
              ${!n.isRead ? '<span class="fn-unread-pill"><i class="bi bi-bell-fill"></i> UNREAD</span>' : '<span style="color:#10b981; font-size:10px;"><i class="bi bi-check-circle"></i> Read</span>'}
              <span>•</span>
              <span title="${escapeHtml(n.createdAt)}">${dateFormatted}</span>
            </div>
            <span style="font-size:10px; color:#94a3b8;">by ${escapeHtml(n.author || 'User')}</span>
          </div>

          <div class="fn-card-text">${escapeHtml(n.text)}</div>

          <div class="fn-card-actions">
            <button type="button" class="fn-btn-action read-toggle" onclick="QuickNotes.toggleReadStatus('${n.id}')" title="${n.isRead ? 'Mark as Unread (Will alert on Dashboard)' : 'Mark as Read (Dismiss Dashboard Alert)'}">
              <i class="bi ${n.isRead ? 'bi-bell' : 'bi-check-circle-fill'}"></i>
              <span>${n.isRead ? 'Mark Unread' : 'Mark as Read'}</span>
            </button>
            <button type="button" class="fn-btn-action delete-btn" onclick="QuickNotes.deleteNote('${n.id}')" title="Permanently delete note">
              <i class="bi bi-trash"></i>
              <span>Delete</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Dashboard Notification Banner ────────────────────────────
  function renderDashboardNotification(socId) {
    const bannerContainer = document.getElementById('dashNotesAlertBanner');
    if (!bannerContainer) return;

    const soc = socId ? { id: socId, name: getActiveSociety().name } : getActiveSociety();
    const notes = getNotes(soc.id);
    const unreadNotes = notes.filter(n => !n.isRead && n.showOnDashboard !== false);

    if (unreadNotes.length === 0) {
      bannerContainer.style.display = 'none';
      bannerContainer.innerHTML = '';
      return;
    }

    // Top prioritized unread note (urgent first, then newest)
    const sorted = [...unreadNotes].sort((a, b) => {
      const order = { urgent: 3, important: 2, normal: 1 };
      const pDiff = (order[b.priority] || 1) - (order[a.priority] || 1);
      if (pDiff !== 0) return pDiff;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const activeNote = sorted[0];
    const totalCount = sorted.length;
    const countBadge = totalCount > 1 ? `<span class="dash-notes-banner-meta">+${totalCount - 1} more pending</span>` : '';
    const dateFormatted = formatNoteTime(activeNote.createdAt);

    bannerContainer.style.display = 'flex';
    bannerContainer.innerHTML = `
      <div class="dash-notes-banner-left">
        <div class="dash-notes-banner-icon">
          <i class="bi bi-pin-angle-fill"></i>
        </div>
        <div class="dash-notes-banner-content">
          <div class="dash-notes-banner-header">
            <span class="dash-notes-banner-title">
              <i class="bi bi-sticky-fill" style="margin-right:4px;"></i> Society Quick Note Reminder [${escapeHtml(soc.name)}]
            </span>
            <span class="dash-notes-banner-meta">${escapeHtml(activeNote.priority.toUpperCase())}</span>
            <span class="dash-notes-banner-meta">${dateFormatted}</span>
            ${countBadge}
          </div>
          <div class="dash-notes-banner-text">${escapeHtml(activeNote.text)}</div>
        </div>
      </div>

      <div class="dash-notes-banner-actions">
        <button type="button" class="dash-notes-banner-btn primary" onclick="QuickNotes.toggle(true)" title="Open Quick Notes Drawer">
          <i class="bi bi-journal-text"></i> Open Notes (${totalCount})
        </button>
        <button type="button" class="dash-notes-banner-btn outline" onclick="QuickNotes.markAsRead('${activeNote.id}')" title="Acknowledge note and dismiss reminder from Dashboard">
          <i class="bi bi-check2-circle"></i> Mark as Read
        </button>
        <button type="button" class="dash-notes-banner-btn dismiss" onclick="QuickNotes.dismissBannerForSession()" title="Dismiss for now">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
    `;
  }

  function dismissBannerForSession() {
    const banner = document.getElementById('dashNotesAlertBanner');
    if (banner) banner.style.display = 'none';
  }

  // ── Toggle & Drag Window ─────────────────────────────────────
  function toggleQuickNotes(forceState) {
    const widget = document.getElementById('floatingNotesWidget');
    const pill = document.getElementById('sbNotesBtn');
    if (!widget) return;

    const shouldShow = (typeof forceState === 'boolean')
      ? forceState
      : (widget.style.display === 'none' || !widget.classList.contains('show'));

    if (shouldShow) {
      widget.style.display = 'flex';
      widget.classList.add('show');
      if (pill) pill.classList.add('active');
      refreshUI();
      const ta = document.getElementById('fnInputText');
      if (ta) ta.focus();
    } else {
      widget.classList.remove('show');
      widget.style.display = 'none';
      if (pill) pill.classList.remove('active');
    }
  }

  function setupDraggable() {
    const widget = document.getElementById('floatingNotesWidget');
    const header = document.getElementById('fnHeader');
    if (!widget || !header) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let initRight = 0, initBottom = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button') || e.target.closest('.fn-hbtn')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = widget.getBoundingClientRect();
      initRight = window.innerWidth - rect.right;
      initBottom = window.innerHeight - rect.bottom;

      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newRight = initRight - dx;
      let newBottom = initBottom - dy;

      newRight = Math.max(10, Math.min(window.innerWidth - widget.offsetWidth - 10, newRight));
      newBottom = Math.max(34, Math.min(window.innerHeight - widget.offsetHeight - 10, newBottom));

      widget.style.right = `${newRight}px`;
      widget.style.bottom = `${newBottom}px`;
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.userSelect = '';
      }
    });
  }

  function setupKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
      // Toggle shortcut: Alt + N
      if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        toggleQuickNotes();
        return;
      }

      // Close on Esc if open
      const widget = document.getElementById('floatingNotesWidget');
      const isVisible = widget && widget.classList.contains('show');
      if (isVisible && e.key === 'Escape') {
        toggleQuickNotes(false);
      }
    });

    // Ctrl+Enter to save in textarea
    const ta = document.getElementById('fnInputText');
    if (ta) {
      ta.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          handleSaveClick();
        }
      });
    }
  }

  function handleSaveClick() {
    const ta = document.getElementById('fnInputText');
    if (!ta) return;
    const text = ta.value;
    if (!text || !text.trim()) {
      ta.focus();
      return;
    }

    addNote(text, selectedPriority, true);
    ta.value = '';
    ta.focus();
  }

  function setPriority(pri) {
    selectedPriority = pri;
    ['normal', 'important', 'urgent'].forEach(p => {
      const btn = document.getElementById('fnPri_' + p);
      if (btn) {
        if (p === pri) btn.classList.add('active', p);
        else btn.classList.remove('active', 'normal', 'important', 'urgent');
      }
    });
  }

  function setTab(tab) {
    activeTab = tab;
    const tabAll = document.getElementById('fnTabAll');
    const tabUnread = document.getElementById('fnTabUnread');
    if (tabAll) tabAll.classList.toggle('active', tab === 'all');
    if (tabUnread) tabUnread.classList.toggle('active', tab === 'unread');
    renderNotesList();
  }

  // ── Helpers ──────────────────────────────────────────────────
  function formatNoteTime(isoStr) {
    try {
      const d = new Date(isoStr);
      const now = new Date();
      const diffMs = now - d;
      const diffMin = Math.floor(diffMs / 60000);
      const diffHr = Math.floor(diffMin / 60);

      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHr < 24 && d.getDate() === now.getDate()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    } catch (_) {
      return '';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Society Change Listener ──────────────────────────────────
  function onSocietyChange() {
    const soc = getActiveSociety();
    if (soc.id !== currentActiveSocId) {
      currentActiveSocId = soc.id;
      refreshUI();
    }
  }

  function init() {
    setupDraggable();
    setupKeyboardListeners();
    refreshUI();

    // Listen for society changes
    window.addEventListener('society-changed', onSocietyChange);
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.startsWith(STORAGE_PREFIX)) {
        refreshUI();
      }
    });
  }

  // Expose API
  window.QuickNotes = {
    init,
    toggle: toggleQuickNotes,
    addNote,
    updateNote,
    deleteNote,
    markAsRead,
    toggleReadStatus,
    dismissBannerForSession,
    setPriority,
    setTab,
    handleSaveClick,
    refresh: refreshUI,
    onSocietyChange,
    renderDashboardNotification
  };

  window.toggleQuickNotes = toggleQuickNotes;

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
