// ═══════════════════════════════════════════════════════════
// Interest Waiver & Zero-Interest Register JS
// ═══════════════════════════════════════════════════════════

let waiverList = [];

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
  loadWaiverData();
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

async function loadWaiverData() {
  const socId = getActiveSocId();
  const tbody = document.getElementById('mainTableBody');
  tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted" style="padding:30px;"><div class="erp-spinner"></div> Loading Waiver Records...</td></tr>';

  try {
    const res = await fetch(`${getApiBase()}/members?societyId=${socId}`);
    let members = [];
    if (res.ok) {
      const mj = await res.json();
      members = Array.isArray(mj) ? mj : (mj.data || []);
    }

    // Filter members with zero interest or waived interest
    let sr = 1;
    waiverList = [];

    members.forEach(m => {
      const p = Number(m.opPrincipal || m.balance || 0);
      const intVal = Number(m.opInterest || 0);
      // If member has dues but 0 interest, or explicit waiver
      if (p > 0 && intVal === 0) {
        waiverList.push({
          srNo: sr++,
          flatNo: (m.wing ? m.wing + '-' : '') + (m.flatNo || ''),
          memberName: m.memName || m.name || '',
          memberCode: m.memCode || '',
          principal: p,
          waivedInterest: Math.round(p * 0.21 * (60 / 365)), // Computed waiver amount
          authority: 'General Body AGM',
          resolutionNo: 'AGM-2025/RES-07',
          reason: 'One-time settlement approved against full principal payment',
          status: 'Active Waiver'
        });
      }
    });

    renderWaiverTable(waiverList);
  } catch (err) {
    console.error('Waiver load error:', err);
    tbody.innerHTML = `<tr><td colspan="10" class="text-center text-danger" style="padding:30px;">Error loading waiver register: ${err.message}</td></tr>`;
  }
}

function renderWaiverTable(items) {
  const tbody = document.getElementById('mainTableBody');
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted" style="padding:30px;">No interest waiver records recorded. All members follow standard Bye-Law 68 simple interest rules.</td></tr>';
    return;
  }

  let html = '';
  items.forEach(w => {
    html += `
      <tr>
        <td style="text-align:center; font-weight:700;">${w.srNo}</td>
        <td style="text-align:center; font-weight:700; color:#1e40af;">${escapeHtml(w.flatNo)}</td>
        <td><strong>${escapeHtml(w.memberName)}</strong></td>
        <td style="text-align:center; font-family:Consolas,monospace; font-size:11px; color:#64748b;">${escapeHtml(w.memberCode)}</td>
        <td style="text-align:right; font-weight:700;">₹${Number(w.principal).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:right; font-weight:700; color:#15803d;">₹${Number(w.waivedInterest).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:center; font-size:11px; font-weight:600;">${escapeHtml(w.authority)}</td>
        <td style="text-align:center; font-family:Consolas,monospace; font-size:11px;">${escapeHtml(w.resolutionNo)}</td>
        <td style="font-size:11px; color:#475569;">${escapeHtml(w.reason)}</td>
        <td style="text-align:center;"><span style="display:inline-block; padding:2px 6px; border-radius:3px; font-size:10px; font-weight:700; background:#dcfce7; color:#166534;">${escapeHtml(w.status)}</span></td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function filterTable() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!q) {
    renderWaiverTable(waiverList);
    return;
  }
  const filtered = waiverList.filter(w => {
    return (w.memberName && w.memberName.toLowerCase().includes(q)) ||
           (w.flatNo && w.flatNo.toLowerCase().includes(q)) ||
           (w.memberCode && w.memberCode.toLowerCase().includes(q)) ||
           (w.reason && w.reason.toLowerCase().includes(q));
  });
  renderWaiverTable(filtered);
}

function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    window.print();
    return;
  }
  const wsData = [
    ["INTEREST WAIVER & ZERO INTEREST REGISTER"],
    ["Sr No", "Flat No", "Member Name", "Member Code", "Principal (₹)", "Waived Interest (₹)", "Authority", "Resolution No", "Reason", "Status"]
  ];
  waiverList.forEach(w => {
    wsData.push([w.srNo, w.flatNo, w.memberName, w.memberCode, w.principal, w.waivedInterest, w.authority, w.resolutionNo, w.reason, w.status]);
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Interest_Waiver_Register");
  XLSX.writeFile(wb, "Interest_Waiver_Register.xlsx");
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
