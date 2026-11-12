// ═══════════════════════════════════════════════════════════
// Share Certificate Register JS
// Connects to /api/statutory/form-j (100% DB Driven)
// ═══════════════════════════════════════════════════════════

let shareData = [];

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
  loadShareData();
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

async function loadShareData() {
  const socId = getActiveSocId();
  const tbody = document.getElementById('mainTableBody');
  tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted" style="padding:30px;"><div class="erp-spinner"></div> Loading Share Certificates...</td></tr>';

  try {
    const res = await fetch(`${getApiBase()}/statutory/form-j?societyId=${socId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.success && Array.isArray(json.data)) {
      shareData = json.data;
      if (json.society && json.society.SocietyName) {
        document.getElementById('societyNameDisplay').textContent = `${json.society.SocietyName} (Reg: ${json.society.RegistrationNo || '—'})`;
      }
      if (json.summary) {
        document.getElementById('sumCerts').textContent = json.summary.totalMembers;
        document.getElementById('sumShares').textContent = json.summary.totalShares;
        document.getElementById('sumCapital').textContent = `₹${Number(json.summary.totalSubscribedCapital || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}`;
      }
      renderShareTable(shareData);
    } else {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center text-danger" style="padding:30px;">No share certificate records found.</td></tr>';
    }
  } catch (err) {
    console.error('Failed to load Share Register:', err);
    tbody.innerHTML = `<tr><td colspan="10" class="text-center text-danger" style="padding:30px;">Error loading Share Certificates: ${err.message}</td></tr>`;
  }
}

function renderShareTable(items) {
  const tbody = document.getElementById('mainTableBody');
  const countEl = document.getElementById('recordCount');
  if (countEl) countEl.textContent = `Total Records: ${items.length}`;

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted" style="padding:30px;">No matching share certificates found.</td></tr>';
    return;
  }

  let html = '';
  items.forEach(m => {
    html += `
      <tr>
        <td style="text-align:center; font-weight:700; color:#1e40af; font-family:Consolas,monospace;">${escapeHtml(m.shareCertNo)}</td>
        <td style="text-align:center; font-weight:600; font-family:Consolas,monospace;">${escapeHtml(m.folioNo)}</td>
        <td><strong>${escapeHtml(m.memberName)}</strong><br><span style="font-size:9.5px; color:#64748b;">Code: ${escapeHtml(m.memberCode)}</span></td>
        <td style="text-align:center; font-weight:700;">${escapeHtml(m.flatNo)}</td>
        <td style="text-align:center; font-family:Consolas,monospace; font-size:11px;">${escapeHtml(m.distinctiveRange)}</td>
        <td style="text-align:center; font-weight:700;">${m.sharesCount}</td>
        <td style="text-align:right;">₹50.00</td>
        <td style="text-align:right; font-weight:700; color:#15803d;">₹${Number(m.amountPaid || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:center;">${m.dateOfAdmission}</td>
        <td style="text-align:center;"><span class="stat-badge">Original Issued</span></td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function filterTable() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!q) {
    renderShareTable(shareData);
    return;
  }
  const filtered = shareData.filter(m => {
    return (m.memberName && m.memberName.toLowerCase().includes(q)) ||
           (m.memberCode && m.memberCode.toLowerCase().includes(q)) ||
           (m.flatNo && m.flatNo.toLowerCase().includes(q)) ||
           (m.folioNo && m.folioNo.toLowerCase().includes(q)) ||
           (m.shareCertNo && m.shareCertNo.toLowerCase().includes(q));
  });
  renderShareTable(filtered);
}

function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    window.print();
    return;
  }
  const wsData = [
    ["STATUTORY SHARE CERTIFICATE REGISTER & FOLIO LEDGER"],
    ["Cert No", "Folio No", "Member Name", "Flat No", "Distinctive Range", "Shares Count", "Face Value", "Total Value", "Date of Issue", "Status"]
  ];
  shareData.forEach(m => {
    wsData.push([
      m.shareCertNo, m.folioNo, m.memberName, m.flatNo, m.distinctiveRange, m.sharesCount, 50.00, m.amountPaid, m.dateOfAdmission, "Original Issued"
    ]);
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Share_Register");
  XLSX.writeFile(wb, "Share_Certificate_Register.xlsx");
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
