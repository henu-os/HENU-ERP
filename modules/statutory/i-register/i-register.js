// ═══════════════════════════════════════════════════════════
// Form 'I' Register of Members — Statutory Engine JS
// Connects to /api/statutory/form-i (100% DB Driven)
// ═══════════════════════════════════════════════════════════

let formIData = [];

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
  loadFormIData();
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

async function loadFormIData() {
  const socId = getActiveSocId();
  const tbody = document.getElementById('mainTableBody');
  tbody.innerHTML = '<tr><td colspan="15" class="text-center text-muted" style="padding:30px;"><div class="erp-spinner"></div> Loading Statutory Form I Register...</td></tr>';

  try {
    const res = await fetch(`${getApiBase()}/statutory/form-i?societyId=${socId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.success && Array.isArray(json.data)) {
      formIData = json.data;
      if (json.society && json.society.SocietyName) {
        document.getElementById('societyNameDisplay').textContent = `${json.society.SocietyName} (Reg: ${json.society.RegistrationNo || '—'})`;
      }
      renderFormITable(formIData);
    } else {
      tbody.innerHTML = '<tr><td colspan="15" class="text-center text-danger" style="padding:30px;">No member records found for this society.</td></tr>';
    }
  } catch (err) {
    console.error('Failed to load Form I:', err);
    tbody.innerHTML = `<tr><td colspan="15" class="text-center text-danger" style="padding:30px;">Error loading Form I: ${err.message}</td></tr>`;
  }
}

function renderFormITable(items) {
  const tbody = document.getElementById('mainTableBody');
  const countEl = document.getElementById('recordCount');
  if (countEl) countEl.textContent = `Total Members: ${items.length}`;

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="15" class="text-center text-muted" style="padding:30px;">No matching records found.</td></tr>';
    return;
  }

  let html = '';
  items.forEach(m => {
    html += `
      <tr>
        <td style="text-align:center; font-weight:700;">${m.srNo}</td>
        <td style="text-align:center;">${m.admissionDate}</td>
        <td style="text-align:center;">${m.entranceFeeDate}</td>
        <td><strong>${escapeHtml(m.memberName)}</strong><br><span style="font-size:9px; color:#64748b;">Code: ${escapeHtml(m.memberCode)}</span></td>
        <td style="font-size:10px; color:#475569;">${escapeHtml(m.coOwner || '—')}</td>
        <td style="text-align:center; font-weight:700; color:#1e40af;">${escapeHtml(m.flatNo)}</td>
        <td style="text-align:right;">${m.carpetArea}</td>
        <td>${escapeHtml(m.nomineeName)}</td>
        <td style="text-align:center;">${escapeHtml(m.nomineeRelation || '—')}</td>
        <td style="text-align:center; font-weight:700;">${escapeHtml(m.shareCertNo)}</td>
        <td style="text-align:center; font-size:10px;">${escapeHtml(m.distinctiveRange)}</td>
        <td style="text-align:center;">${m.sharesHeld}</td>
        <td style="text-align:right; font-weight:700;">₹${Number(m.totalShareCapital || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:center;">${escapeHtml(m.folioNo)}</td>
        <td style="text-align:center;"><span class="stat-badge">${escapeHtml(m.status)}</span></td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function filterTable() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!q) {
    renderFormITable(formIData);
    return;
  }
  const filtered = formIData.filter(m => {
    return (m.memberName && m.memberName.toLowerCase().includes(q)) ||
           (m.memberCode && m.memberCode.toLowerCase().includes(q)) ||
           (m.flatNo && m.flatNo.toLowerCase().includes(q)) ||
           (m.panNo && m.panNo.toLowerCase().includes(q));
  });
  renderFormITable(filtered);
}

function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    window.print();
    return;
  }
  const wsData = [
    ["FORM 'I' — REGISTER OF MEMBERS (Under Rule 32 of MCS Rules 1961)"],
    ["Sr No", "Admission Date", "Entrance Fee Date", "Member Name", "Co-Owners", "Flat No", "Carpet Area", "Nominee Name", "Relationship", "Share Cert No", "Distinctive Range", "Shares", "Share Capital", "Folio No", "Status"]
  ];
  formIData.forEach(m => {
    wsData.push([
      m.srNo, m.admissionDate, m.entranceFeeDate, m.memberName, m.coOwner, m.flatNo, m.carpetArea,
      m.nomineeName, m.nomineeRelation, m.shareCertNo, m.distinctiveRange, m.sharesHeld, m.totalShareCapital, m.folioNo, m.status
    ]);
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Form_I_Register");
  XLSX.writeFile(wb, "Form_I_Register_of_Members.xlsx");
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
