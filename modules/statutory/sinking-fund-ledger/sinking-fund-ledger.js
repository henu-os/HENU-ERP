// ═══════════════════════════════════════════════════════════
// Sinking & Repair Fund Statutory Ledger JS
// Connects to /api/statutory/sinking-fund-ledger (Bye-Laws 13 & 14)
// ═══════════════════════════════════════════════════════════

let ledgerData = null;

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
  loadSinkingData();
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

async function loadSinkingData() {
  const socId = getActiveSocId();
  try {
    const res = await fetch(`${getApiBase()}/statutory/sinking-fund-ledger?societyId=${socId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.success) {
      ledgerData = json;
      if (json.society && json.society.SocietyName) {
        document.getElementById('societyNameDisplay').textContent = `${json.society.SocietyName} (Reg: ${json.society.RegistrationNo || '—'})`;
      }
      renderLedger(json);
    }
  } catch (err) {
    console.error('Failed to load Sinking Fund Ledger:', err);
    document.getElementById('complianceNotice').textContent = `Error loading ledger: ${err.message}`;
    document.getElementById('complianceNotice').style.color = '#ef4444';
  }
}

function renderLedger(d) {
  document.getElementById('sumSinking').textContent = `₹${Number(d.sinkingFundBalance || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}`;
  document.getElementById('sumRepair').textContent = `₹${Number(d.repairFundBalance || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}`;
  document.getElementById('sumReserves').textContent = `₹${Number(d.totalStatutoryReserves || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}`;
  document.getElementById('sumActiveFds').textContent = `₹${Number(d.totalInvestedFds || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}`;
  
  const shortfallEl = document.getElementById('sumShortfall');
  const cardEl = document.getElementById('shortfallCard');
  const titleEl = document.getElementById('shortfallTitle');
  const noticeEl = document.getElementById('complianceNotice');

  if (d.statutoryShortfall > 0) {
    shortfallEl.textContent = `₹${Number(d.statutoryShortfall).toLocaleString('en-IN', {minimumFractionDigits:2})}`;
    shortfallEl.style.color = '#dc2626';
    cardEl.style.borderColor = '#fca5a5';
    cardEl.style.background = '#fef2f2';
    titleEl.textContent = 'Statutory Shortfall (Action Required)';
    noticeEl.innerHTML = `<i class="bi bi-exclamation-triangle-fill text-danger me-2"></i> ${d.complianceNote}`;
    noticeEl.style.color = '#b91c1c';
  } else {
    shortfallEl.textContent = '₹0.00 (Fully Invested)';
    shortfallEl.style.color = '#15803d';
    cardEl.style.borderColor = '#86efac';
    cardEl.style.background = '#f0fdf4';
    titleEl.textContent = 'Statutory Compliance Status';
    titleEl.style.color = '#166534';
    noticeEl.innerHTML = `<i class="bi bi-check-circle-fill text-success me-2"></i> ${d.complianceNote}`;
    noticeEl.style.color = '#15803d';
  }

  // Summary Matrix
  const sumBody = document.getElementById('summaryTableBody');
  const sf = Number(d.sinkingFundBalance || 0);
  const rf = Number(d.repairFundBalance || 0);
  const fds = Number(d.totalInvestedFds || 0);
  const sfFd = Math.min(sf, fds);
  const rfFd = Math.max(0, Math.min(rf, fds - sf));

  sumBody.innerHTML = `
    <tr>
      <td><strong>Sinking Fund (Capital Replacement)</strong></td>
      <td>Model Bye-Law No. 13 (0.25% p.a. on construction cost)</td>
      <td style="text-align:right; font-weight:700;">₹${sf.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
      <td style="text-align:center;">100% in Co-op / Nationalized Bank FDs</td>
      <td style="text-align:right; color:#0284c7; font-weight:700;">₹${sfFd.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
      <td style="text-align:right; color:${sf - sfFd > 0 ? '#dc2626' : '#15803d'}; font-weight:700;">₹${Math.max(0, sf - sfFd).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
      <td style="text-align:center;">
        <span style="display:inline-block; padding:2px 8px; border-radius:3px; font-weight:700; font-size:10px; background:${sf - sfFd > 0 ? '#fee2e2; color:#991b1b;' : '#dcfce7; color:#166534;'}">
          ${sf - sfFd > 0 ? 'Shortfall Warning' : 'Compliant'}
        </span>
      </td>
    </tr>
    <tr>
      <td><strong>Building Repair Fund (Structural Repairs)</strong></td>
      <td>Model Bye-Law No. 14 (0.75% p.a. on construction cost)</td>
      <td style="text-align:right; font-weight:700;">₹${rf.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
      <td style="text-align:center;">100% in Co-op / Nationalized Bank FDs</td>
      <td style="text-align:right; color:#0284c7; font-weight:700;">₹${rfFd.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
      <td style="text-align:right; color:${rf - rfFd > 0 ? '#dc2626' : '#15803d'}; font-weight:700;">₹${Math.max(0, rf - rfFd).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
      <td style="text-align:center;">
        <span style="display:inline-block; padding:2px 8px; border-radius:3px; font-weight:700; font-size:10px; background:${rf - rfFd > 0 ? '#fee2e2; color:#991b1b;' : '#dcfce7; color:#166534;'}">
          ${rf - rfFd > 0 ? 'Shortfall Warning' : 'Compliant'}
        </span>
      </td>
    </tr>
  `;

  // FD Table
  const fdBody = document.getElementById('fdTableBody');
  if (Array.isArray(d.investments) && d.investments.length > 0) {
    let fHtml = '';
    d.investments.forEach((inv, i) => {
      fHtml += `
        <tr>
          <td style="text-align:center; font-weight:700;">${i + 1}</td>
          <td><strong>${escapeHtml(inv.bank)}</strong></td>
          <td style="font-family:Consolas,monospace; font-weight:600; text-align:center; color:#0f766e;">${escapeHtml(inv.fdrNo)}</td>
          <td style="text-align:right; font-weight:700;">₹${Number(inv.principal || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
          <td style="text-align:center;">${inv.startDate}</td>
          <td style="text-align:center;">${inv.maturityDate}</td>
          <td style="text-align:center; font-weight:700; color:#0d9488;">${Number(inv.interestRate).toFixed(2)}%</td>
          <td style="text-align:right; font-weight:800; color:#15803d;">₹${Number(inv.maturityAmount || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        </tr>
      `;
    });
    fdBody.innerHTML = fHtml;
  } else {
    fdBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:20px;">No separate fixed deposit allocations recorded in SocFundInvestment.</td></tr>';
  }
}

function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    window.print();
    return;
  }
  if (!ledgerData) return;
  const wsData = [
    ["SINKING FUND & BUILDING REPAIR FUND STATUTORY LEDGER (Model Bye-Laws 13 & 14)"],
    ["Fund Name", "Accumulated Reserves", "Active FDs", "Statutory Shortfall", "Status"],
    ["Sinking Fund", ledgerData.sinkingFundBalance, ledgerData.totalInvestedFds, ledgerData.statutoryShortfall, ledgerData.isFullyEarmarked ? "Compliant" : "Shortfall"],
    ["Repair Fund", ledgerData.repairFundBalance, 0, ledgerData.repairFundBalance, "Shortfall"]
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Sinking_Fund_Ledger");
  XLSX.writeFile(wb, "Sinking_Fund_Statutory_Ledger.xlsx");
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
