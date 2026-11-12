// ═══════════════════════════════════════════════════════════
// Statutory Investment Register JS
// Connects to /api/statutory/investment-register (Section 70 / Form M)
// ═══════════════════════════════════════════════════════════

let investmentData = [];

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
  loadInvestmentData();
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

async function loadInvestmentData() {
  const socId = getActiveSocId();
  const tbody = document.getElementById('mainTableBody');
  tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted" style="padding:30px;"><div class="erp-spinner"></div> Loading Investment Register...</td></tr>';

  try {
    const res = await fetch(`${getApiBase()}/statutory/investment-register?societyId=${socId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.success && Array.isArray(json.data)) {
      investmentData = json.data;
      if (json.society && json.society.SocietyName) {
        document.getElementById('societyNameDisplay').textContent = `${json.society.SocietyName} (Reg: ${json.society.RegistrationNo || '—'})`;
      }
      if (json.summary) {
        document.getElementById('sumCount').textContent = `${json.summary.totalInvestmentsCount} Fixed Deposits`;
        document.getElementById('sumPrincipal').textContent = `₹${Number(json.summary.totalPrincipalInvested || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}`;
        document.getElementById('sumMaturity').textContent = `₹${Number(json.summary.totalMaturityValue || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}`;
      }
      renderInvestmentTable(investmentData);
    } else {
      tbody.innerHTML = '<tr><td colspan="11" class="text-center text-danger" style="padding:30px;">No investment records found.</td></tr>';
    }
  } catch (err) {
    console.error('Failed to load Investment Register:', err);
    tbody.innerHTML = `<tr><td colspan="11" class="text-center text-danger" style="padding:30px;">Error loading Investment Register: ${err.message}</td></tr>`;
  }
}

function renderInvestmentTable(items) {
  const tbody = document.getElementById('mainTableBody');
  const countEl = document.getElementById('recordCount');
  if (countEl) countEl.textContent = `Total FDRs: ${items.length}`;

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted" style="padding:30px;">No matching investments found.</td></tr>';
    return;
  }

  let html = '';
  items.forEach(inv => {
    html += `
      <tr>
        <td style="text-align:center; font-weight:700;">${inv.srNo}</td>
        <td><strong>${escapeHtml(inv.fundName)}</strong></td>
        <td>${escapeHtml(inv.bankName)}</td>
        <td style="font-family:Consolas,monospace; font-weight:600; text-align:center; color:#3730a3;">${escapeHtml(inv.fdrNo)}</td>
        <td style="text-align:center;">${escapeHtml(inv.startDate)}</td>
        <td style="text-align:center; font-weight:600;">${escapeHtml(inv.maturityDate)}</td>
        <td style="text-align:center; font-weight:700; color:#0d9488;">${Number(inv.interestRate).toFixed(2)}%</td>
        <td style="text-align:right; font-weight:700;">₹${Number(inv.principalAmount || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:right; color:#15803d;">₹${Number(inv.expectedInterest || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:right; font-weight:800; color:#1e40af;">₹${Number(inv.maturityAmount || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:center;"><span class="stat-badge-sec70"><i class="bi bi-check-circle"></i> Sec 70 OK</span></td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function filterTable() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!q) {
    renderInvestmentTable(investmentData);
    return;
  }
  const filtered = investmentData.filter(inv => {
    return (inv.fundName && inv.fundName.toLowerCase().includes(q)) ||
           (inv.bankName && inv.bankName.toLowerCase().includes(q)) ||
           (inv.fdrNo && inv.fdrNo.toLowerCase().includes(q));
  });
  renderInvestmentTable(filtered);
}

function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    window.print();
    return;
  }
  const wsData = [
    ["STATUTORY INVESTMENT REGISTER (Under Section 70 of MCS Act / Form M)"],
    ["Sr No", "Fund Name", "Bank Name", "FDR No", "Deposit Date", "Maturity Date", "Interest Rate (%)", "Principal (₹)", "Expected Interest (₹)", "Maturity (₹)", "Compliance"]
  ];
  investmentData.forEach(inv => {
    wsData.push([
      inv.srNo, inv.fundName, inv.bankName, inv.fdrNo, inv.startDate, inv.maturityDate,
      inv.interestRate, inv.principalAmount, inv.expectedInterest, inv.maturityAmount, "Sec 70 Compliant"
    ]);
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Investments_Sec70");
  XLSX.writeFile(wb, "Statutory_Investment_Register_Sec70.xlsx");
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
