// ═══════════════════════════════════════════════════════════
// Property & Fixed Assets Register JS
// Connects to /api/statutory/property-register (Bye-Law 154)
// ═══════════════════════════════════════════════════════════

let propertyData = [];

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
  loadPropertyData();
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

async function loadPropertyData() {
  const socId = getActiveSocId();
  const tbody = document.getElementById('mainTableBody');
  tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted" style="padding:30px;"><div class="erp-spinner"></div> Loading Property Register...</td></tr>';

  try {
    const res = await fetch(`${getApiBase()}/statutory/property-register?societyId=${socId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.success && Array.isArray(json.data)) {
      propertyData = json.data;
      if (json.society && json.society.SocietyName) {
        document.getElementById('societyNameDisplay').textContent = `${json.society.SocietyName} (Reg: ${json.society.RegistrationNo || '—'})`;
      }
      
      const flats = json.totalFlats || 0;
      const area = json.totalAreaSqft || 0;
      document.getElementById('sumFlatsArea').textContent = `${flats} Units (${Number(area).toLocaleString('en-IN')} Sq.Ft.)`;

      let totalBookVal = 0;
      let totalInsured = 0;
      propertyData.forEach(p => {
        totalBookVal += Number(p.netBookValue || 0);
        totalInsured += Number(p.insuredSum || 0);
      });

      document.getElementById('sumCost').textContent = `₹${totalBookVal.toLocaleString('en-IN', {minimumFractionDigits:2})}`;
      document.getElementById('sumInsurance').textContent = `₹${totalInsured.toLocaleString('en-IN', {minimumFractionDigits:2})}`;

      renderPropertyTable(propertyData);
    } else {
      tbody.innerHTML = '<tr><td colspan="11" class="text-center text-danger" style="padding:30px;">No property assets recorded.</td></tr>';
    }
  } catch (err) {
    console.error('Failed to load Property Register:', err);
    tbody.innerHTML = `<tr><td colspan="11" class="text-center text-danger" style="padding:30px;">Error loading Property Register: ${err.message}</td></tr>`;
  }
}

function renderPropertyTable(items) {
  const tbody = document.getElementById('mainTableBody');
  const countEl = document.getElementById('recordCount');
  if (countEl) countEl.textContent = `Total Assets: ${items.length}`;

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted" style="padding:30px;">No matching assets found.</td></tr>';
    return;
  }

  let html = '';
  items.forEach(p => {
    html += `
      <tr>
        <td style="text-align:center; font-weight:700;">${p.srNo}</td>
        <td><span class="stat-badge">${escapeHtml(p.assetCategory)}</span></td>
        <td><strong>${escapeHtml(p.assetDescription)}</strong></td>
        <td style="font-size:11px; font-family:Consolas,monospace;">${escapeHtml(p.identificationNo)}</td>
        <td style="text-align:center;">${escapeHtml(p.acquisitionDate)}</td>
        <td style="font-size:11px;">${escapeHtml(p.totalCarpetArea)}</td>
        <td style="text-align:right;">₹${Number(p.originalCost || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="font-size:10.5px; color:#475569;">${escapeHtml(p.depreciationRate)}</td>
        <td style="text-align:right; font-weight:700; color:#15803d;">₹${Number(p.netBookValue || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
        <td style="font-size:11px; font-weight:600; color:#0369a1;">${escapeHtml(p.conveyanceStatus)}</td>
        <td style="text-align:right; font-weight:700; color:#7c2d12;">₹${Number(p.insuredSum || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function filterTable() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!q) {
    renderPropertyTable(propertyData);
    return;
  }
  const filtered = propertyData.filter(p => {
    return (p.assetDescription && p.assetDescription.toLowerCase().includes(q)) ||
           (p.assetCategory && p.assetCategory.toLowerCase().includes(q)) ||
           (p.identificationNo && p.identificationNo.toLowerCase().includes(q)) ||
           (p.conveyanceStatus && p.conveyanceStatus.toLowerCase().includes(q));
  });
  renderPropertyTable(filtered);
}

function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    window.print();
    return;
  }
  const wsData = [
    ["PROPERTY & FIXED ASSETS REGISTER (Under Model Bye-Law No. 154)"],
    ["Sr No", "Category", "Description", "Identification / Reg No", "Year", "Scope", "Original Cost (₹)", "Depreciation Rule", "Net Book Value (₹)", "Conveyance Status", "Insured Sum (₹)"]
  ];
  propertyData.forEach(p => {
    wsData.push([
      p.srNo, p.assetCategory, p.assetDescription, p.identificationNo, p.acquisitionDate, p.totalCarpetArea,
      p.originalCost, p.depreciationRate, p.netBookValue, p.conveyanceStatus, p.insuredSum
    ]);
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Property_Register");
  XLSX.writeFile(wb, "Property_Fixed_Assets_Register.xlsx");
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
