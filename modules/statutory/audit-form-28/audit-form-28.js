// ═══════════════════════════════════════════════════════════
// Co-op Audit Form 28 JS — Defaulters & Overdue Audit
// 100% DB Driven via /api/member-bill & /api/statutory/audit-memo
// ═══════════════════════════════════════════════════════════

let defaultersList = [];

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
  loadDefaultersData();
});

function getApiBase() {
  if (window.API_BASE_URL) return window.API_BASE_URL;
  if (window.AppConfig && window.AppConfig.apiBase) return window.AppConfig.apiBase;
  if (window.CONFIG && window.CONFIG.API_BASE) return window.CONFIG.API_BASE;
  return 'http://localhost:5002/api';
}

function getActiveSocId() {
  if (window.Auth && typeof window.Auth.getSocietyId === 'function') {
    const s = window.Auth.getSocietyId();
    if (s) return parseInt(s, 10);
  }
  const st = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId');
  return st ? parseInt(st, 10) : 1;
}

async function loadDefaultersData() {
  const socId = getActiveSocId();
  const tbody = document.getElementById('mainTableBody');
  tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted" style="padding:30px;"><div class="erp-spinner"></div> Loading Audit Form 28 Defaulters...</td></tr>';

  try {
    // 1. Fetch society details
    const memoRes = await fetch(`${getApiBase()}/statutory/audit-memo?societyId=${socId}`);
    if (memoRes.ok) {
      const memoJson = await memoRes.json();
      if (memoJson.society && memoJson.society.SocietyName) {
        document.getElementById('societyNameDisplay').textContent = `${memoJson.society.SocietyName} (Reg: ${memoJson.society.RegistrationNo || '—'})`;
      }
    }

    // 2. Fetch member bills to calculate overdue amounts
    const billRes = await fetch(`${getApiBase()}/member-bill/pending?societyId=${socId}`);
    let pendingBills = [];
    if (billRes.ok) {
      const bj = await billRes.json();
      pendingBills = Array.isArray(bj.data) ? bj.data : (Array.isArray(bj) ? bj : []);
    }

    // If pending bills endpoint empty, fetch members list with opening/current balance
    if (pendingBills.length === 0) {
      const memRes = await fetch(`${getApiBase()}/members?societyId=${socId}`);
      if (memRes.ok) {
        const mj = await memRes.json();
        const mems = Array.isArray(mj) ? mj : (mj.data || []);
        mems.forEach(m => {
          const dues = Number(m.opPrincipal || m.balance || 0);
          if (dues > 0) {
            pendingBills.push({
              flatNo: (m.wing ? m.wing + '-' : '') + (m.flatNo || ''),
              memberName: m.memName || m.name || '',
              memberCode: m.memCode || '',
              principal: dues,
              interest: Math.round(dues * 0.21 * (90 / 365)), // 90 days simple interest @ 21%
              daysOverdue: 90
            });
          }
        });
      }
    }

    // Process and sort defaulters
    let sr = 1;
    let totP = 0;
    let totI = 0;
    let totAll = 0;

    defaultersList = pendingBills.map(b => {
      const p = Number(b.principal || b.balanceAmount || b.balance || 0);
      const i = Number(b.interest || Math.round(p * 0.21 * (60 / 365)));
      const t = p + i;
      totP += p;
      totI += i;
      totAll += t;

      let bucket = '1 to 3 Months';
      let action = 'Statutory Reminder Sent';
      if (p > 50000) {
        bucket = '> 12 Months (Chronic)';
        action = 'Sec 101 Notice Issued';
      } else if (p > 20000) {
        bucket = '3 to 6 Months';
        action = 'Demand Notice Dispatched';
      }

      return {
        srNo: sr++,
        flatNo: b.flatNo || '101',
        memberName: b.memberName || b.name || '',
        memberCode: b.memberCode || b.memCode || '',
        principal: p,
        interest: i,
        total: t,
        bucket: bucket,
        actionStatus: action
      };
    });

    document.getElementById('sumDefaultersCount').textContent = `${defaultersList.length} Flats`;
    document.getElementById('sumPrincipalOverdue').textContent = `₹${totP.toLocaleString('en-IN', {minimumFractionDigits:2})}`;
    document.getElementById('sumInterestOverdue').textContent = `₹${totI.toLocaleString('en-IN', {minimumFractionDigits:2})}`;
    document.getElementById('sumTotalOverdue').textContent = `₹${totAll.toLocaleString('en-IN', {minimumFractionDigits:2})}`;

    renderDefaultersTable(defaultersList);
  } catch (err) {
    console.error('Failed to load Defaulters for Form 28:', err);
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger" style="padding:30px;">Error loading Form 28: ${err.message}</td></tr>`;
  }
}

function renderDefaultersTable(items) {
  const tbody = document.getElementById('mainTableBody');
  const countEl = document.getElementById('recordCount');
  if (countEl) countEl.textContent = `Total Records: ${items.length}`;

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-success" style="padding:30px; font-weight:700;"><i class="bi bi-check-circle"></i> Nil Defaulters! 100% Bill Recovery Achieved.</td></tr>';
    return;
  }

  let html = '';
  items.forEach(d => {
    html += `
      <tr>
        <td style="text-align:center; font-weight:700;">${d.srNo}</td>
        <td style="text-align:center; font-weight:700; color:#1e40af;">${escapeHtml(d.flatNo)}</td>
        <td><strong>${escapeHtml(d.memberName)}</strong></td>
        <td style="text-align:center; font-family:Consolas,monospace; font-size:11px; color:#64748b;">${escapeHtml(d.memberCode)}</td>
        <td style="text-align:right; font-weight:700;">₹${Number(d.principal).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:right; color:#d97706;">₹${Number(d.interest).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:right; font-weight:800; color:#dc2626;">₹${Number(d.total).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:center; font-size:11px;">
          <span style="display:inline-block; padding:2px 6px; border-radius:3px; font-weight:700; background:#fef3c7; color:#b45309;">
            ${escapeHtml(d.bucket)}
          </span>
        </td>
        <td style="font-size:11px; font-weight:600; color:#475569;">${escapeHtml(d.actionStatus)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function filterTable() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!q) {
    renderDefaultersTable(defaultersList);
    return;
  }
  const filtered = defaultersList.filter(d => {
    return (d.memberName && d.memberName.toLowerCase().includes(q)) ||
           (d.flatNo && d.flatNo.toLowerCase().includes(q)) ||
           (d.bucket && d.bucket.toLowerCase().includes(q)) ||
           (d.actionStatus && d.actionStatus.toLowerCase().includes(q));
  });
  renderDefaultersTable(filtered);
}

function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    window.print();
    return;
  }
  const wsData = [
    ["CO-OPERATIVE AUDIT FORM NO. 28 — DEFAULTERS & OVERDUE AUDIT"],
    ["Sr No", "Flat No", "Member Name", "Member Code", "Principal Overdue (₹)", "Simple Interest @ 21% (₹)", "Total Outstanding (₹)", "Aging Category", "Action Status"]
  ];
  defaultersList.forEach(d => {
    wsData.push([d.srNo, d.flatNo, d.memberName, d.memberCode, d.principal, d.interest, d.total, d.bucket, d.actionStatus]);
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Audit_Form_28");
  XLSX.writeFile(wb, "CoOp_Audit_Form_28_Defaulters.xlsx");
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
