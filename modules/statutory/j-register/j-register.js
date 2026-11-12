// ═══════════════════════════════════════════════════════════
// Form 'J' Register of Shares — Statutory Engine JS
// Connects to /api/statutory/form-j (100% DB Driven)
// ═══════════════════════════════════════════════════════════

let formJData = [];

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
  loadFormJData();
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

async function loadFormJData() {
  const socId = getActiveSocId();
  const tbody = document.getElementById('mainTableBody');
  tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted" style="padding:30px;"><div class="erp-spinner"></div> Loading Statutory Form J Register...</td></tr>';

  try {
    const res = await fetch(`${getApiBase()}/statutory/form-j?societyId=${socId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.success && Array.isArray(json.data)) {
      formJData = json.data;
      if (json.society && json.society.SocietyName) {
        document.getElementById('societyNameDisplay').textContent = `${json.society.SocietyName} (Reg: ${json.society.RegistrationNo || '—'})`;
      }
      if (json.summary) {
        document.getElementById('sumMembers').textContent = json.summary.totalMembers;
        document.getElementById('sumShares').textContent = json.summary.totalShares;
        document.getElementById('sumCapital').textContent = `₹${Number(json.summary.totalSubscribedCapital || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}`;
      }
      renderFormJTable(formJData);
    } else {
      tbody.innerHTML = '<tr><td colspan="12" class="text-center text-danger" style="padding:30px;">No share records found for this society.</td></tr>';
    }
  } catch (err) {
    console.error('Failed to load Form J:', err);
    tbody.innerHTML = `<tr><td colspan="12" class="text-center text-danger" style="padding:30px;">Error loading Form J: ${err.message}</td></tr>`;
  }
}

function renderFormJTable(items) {
  const tbody = document.getElementById('mainTableBody');
  const countEl = document.getElementById('recordCount');
  if (countEl) countEl.textContent = `Total Records: ${items.length}`;

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted" style="padding:30px;">No matching records found.</td></tr>';
    return;
  }

  let html = '';
  items.forEach(m => {
    html += `
      <tr>
        <td style="text-align:center; font-weight:700;">${m.srNo}</td>
        <td style="text-align:center; font-family:Consolas,monospace; font-weight:600; color:#475569;">${escapeHtml(m.memberCode)}</td>
        <td><strong>${escapeHtml(m.memberName)}</strong></td>
        <td style="text-align:center; font-weight:700; color:#1e40af;">${escapeHtml(m.flatNo)}</td>
        <td style="text-align:center; font-weight:700; font-family:Consolas,monospace;">${escapeHtml(m.folioNo)}</td>
        <td style="text-align:center; font-weight:700; color:#047857; font-family:Consolas,monospace;">${escapeHtml(m.shareCertNo)}</td>
        <td style="text-align:center; font-family:Consolas,monospace; font-size:11px;">${escapeHtml(m.distinctiveRange)}</td>
        <td style="text-align:center; font-weight:700;">${m.sharesCount}</td>
        <td style="text-align:right;">₹${Number(m.nominalValue || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:right; font-weight:700; color:#15803d;">₹${Number(m.amountPaid || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:center;">${m.dateOfAdmission}</td>
        <td style="text-align:center;"><span class="stat-badge">Fully Paid</span></td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function filterTable() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!q) {
    renderFormJTable(formJData);
    return;
  }
  const filtered = formJData.filter(m => {
    return (m.memberName && m.memberName.toLowerCase().includes(q)) ||
           (m.memberCode && m.memberCode.toLowerCase().includes(q)) ||
           (m.flatNo && m.flatNo.toLowerCase().includes(q)) ||
           (m.folioNo && m.folioNo.toLowerCase().includes(q)) ||
           (m.shareCertNo && m.shareCertNo.toLowerCase().includes(q));
  });
  renderFormJTable(filtered);
}

function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    window.print();
    return;
  }
  const wsData = [
    ["FORM 'J' — REGISTER OF SHARES (Under Rule 33 of MCS Rules 1961)"],
    ["Sr No", "Member Code", "Member Name", "Flat No", "Folio No", "Share Cert No", "Distinctive Range", "Shares", "Nominal Value (₹)", "Paid-Up (₹)", "Admission Date", "Status"]
  ];
  formJData.forEach(m => {
    wsData.push([
      m.srNo, m.memberCode, m.memberName, m.flatNo, m.folioNo, m.shareCertNo, m.distinctiveRange, m.sharesCount, m.nominalValue, m.amountPaid, m.dateOfAdmission, "Fully Paid"
    ]);
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Form_J_Register");
  XLSX.writeFile(wb, "Form_J_Register_of_Shares.xlsx");
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
