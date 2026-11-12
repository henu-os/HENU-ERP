// ═══════════════════════════════════════════════════════════
// Overdue Interest Calculator JS — Bye-Law 68 Simple Interest
// Formula: P * R * T / (365 * 100)
// ═══════════════════════════════════════════════════════════

let calcResults = [];

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('calcAsOn').value = today;
  loadBulkCalculation();
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

async function loadBulkCalculation() {
  const socId = getActiveSocId();
  const rate = Math.min(21, Math.max(0, parseFloat(document.getElementById('calcRate').value) || 21));
  const tbody = document.getElementById('mainTableBody');
  tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted" style="padding:30px;"><div class="erp-spinner"></div> Computing overdue simple interest...</td></tr>';

  try {
    const memRes = await fetch(`${getApiBase()}/members?societyId=${socId}`);
    let members = [];
    if (memRes.ok) {
      const mj = await memRes.json();
      members = Array.isArray(mj) ? mj : (mj.data || []);
    }

    let sr = 1;
    let totInt = 0;
    calcResults = [];

    members.forEach(m => {
      const p = Number(m.opPrincipal || m.balance || 0);
      if (p > 0) {
        const days = 60; // 60 days standard overdue
        // Simple Interest: P * R * T / 36500
        const rawInt = (p * rate * days) / 36500;
        const interest = Math.round(rawInt * 100) / 100;
        const total = p + interest;
        totInt += interest;

        calcResults.push({
          srNo: sr++,
          flatNo: (m.wing ? m.wing + '-' : '') + (m.flatNo || ''),
          memberName: m.memName || m.name || '',
          memberCode: m.memCode || '',
          principal: p,
          daysOverdue: days,
          rate: rate,
          interest: interest,
          total: total
        });
      }
    });

    document.getElementById('sumTotalInterest').textContent = `₹${totInt.toLocaleString('en-IN', {minimumFractionDigits:2})}`;
    renderCalcTable(calcResults);
  } catch (err) {
    console.error('Calculation error:', err);
    tbody.innerHTML = `<tr><td colspan="10" class="text-center text-danger" style="padding:30px;">Error calculating interest: ${err.message}</td></tr>`;
  }
}

function renderCalcTable(items) {
  const tbody = document.getElementById('mainTableBody');
  const countEl = document.getElementById('recordCount');
  if (countEl) countEl.textContent = `Total Flats: ${items.length}`;

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-success" style="padding:30px; font-weight:700;"><i class="bi bi-check-circle"></i> Nil Overdue! No interest applicable.</td></tr>';
    return;
  }

  let html = '';
  items.forEach(c => {
    html += `
      <tr>
        <td style="text-align:center; font-weight:700;">${c.srNo}</td>
        <td style="text-align:center; font-weight:700; color:#1e40af;">${escapeHtml(c.flatNo)}</td>
        <td><strong>${escapeHtml(c.memberName)}</strong></td>
        <td style="text-align:center; font-family:Consolas,monospace; font-size:11px; color:#64748b;">${escapeHtml(c.memberCode)}</td>
        <td style="text-align:right; font-weight:700;">₹${Number(c.principal).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:center; font-weight:600;">${c.daysOverdue} Days</td>
        <td style="text-align:center; font-weight:700; color:#b45309;">${c.rate}%</td>
        <td style="text-align:right; font-weight:700; color:#d97706;">₹${Number(c.interest).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:right; font-weight:800; color:#dc2626;">₹${Number(c.total).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="text-align:center;"><span style="display:inline-block; padding:2px 6px; border-radius:3px; font-size:10px; font-weight:700; background:#fef3c7; color:#b45309;">Bye-Law 68 Simple Int</span></td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function filterTable() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!q) {
    renderCalcTable(calcResults);
    return;
  }
  const filtered = calcResults.filter(c => {
    return (c.memberName && c.memberName.toLowerCase().includes(q)) ||
           (c.flatNo && c.flatNo.toLowerCase().includes(q)) ||
           (c.memberCode && c.memberCode.toLowerCase().includes(q));
  });
  renderCalcTable(filtered);
}

function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    window.print();
    return;
  }
  const wsData = [
    ["OVERDUE INTEREST CALCULATION (Under Model Bye-Law No. 68 — Simple Interest @ 21% p.a.)"],
    ["Sr No", "Flat No", "Member Name", "Member Code", "Overdue Principal (₹)", "Days Overdue", "Rate (%)", "Simple Interest (₹)", "Total Due (₹)", "Rule"]
  ];
  calcResults.forEach(c => {
    wsData.push([c.srNo, c.flatNo, c.memberName, c.memberCode, c.principal, c.daysOverdue, c.rate, c.interest, c.total, "Bye-Law 68 Simple Interest"]);
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Interest_Calculation");
  XLSX.writeFile(wb, "Overdue_Interest_Calculation_ByeLaw68.xlsx");
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
