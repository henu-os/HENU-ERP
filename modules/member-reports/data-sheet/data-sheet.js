/**
 * data-sheet.js — Member Data Sheet (Bill & Collection Reconciliation Register)
 * Connects 100% to Live ERP Database & matches legacy CHS audit print format.
 */

(function () {
  'use strict';

  const REPORT_KEY = 'MEMBER_DATA_SHEET';
  let currentReportData = null;
  let activeDesign = null;
  let activeDateBounds = { start: '', current: '' };

  document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    activeDesign = await HenuOsReportEngine.loadActiveDesign(REPORT_KEY);
    await loadDataSheet(true);
  });

  // ── Event Listeners ──────────────────────────────────────────
  function setupEventListeners() {
    document.getElementById('btnRefresh')?.addEventListener('click', () => loadDataSheet(true));
    document.getElementById('btnApplyFilters')?.addEventListener('click', () => loadDataSheet(false));
    document.getElementById('btnReset')?.addEventListener('click', () => resetFilters());
    document.getElementById('btnPrint')?.addEventListener('click', () => window.print());
    document.getElementById('btnExportPdf')?.addEventListener('click', () => window.print());
    document.getElementById('btnExportExcel')?.addEventListener('click', () => exportToExcel());

    // Preset time period dropdown
    document.getElementById('filterPeriodPreset')?.addEventListener('change', handlePeriodPresetChange);

    // Dynamic search / status changes
    document.getElementById('filterStatus')?.addEventListener('change', () => renderFilteredView());
    document.getElementById('filterSearch')?.addEventListener('input', debounce(() => renderFilteredView(), 250));
  }

  // ── Preset Date Management ───────────────────────────────────
  function handlePeriodPresetChange() {
    const preset = document.getElementById('filterPeriodPreset')?.value;
    const fromInput = document.getElementById('filterFromDate');
    const toInput = document.getElementById('filterToDate');
    if (!fromInput || !toInput) return;

    const fyStartStr = activeDateBounds.start || '2026-04-01';
    const currentStr = activeDateBounds.current || new Date().toISOString().split('T')[0];
    const fyStart = new Date(fyStartStr);
    const currentDate = new Date(currentStr);

    switch (preset) {
      case 'start_current':
        fromInput.value = fyStartStr;
        toInput.value = currentStr;
        break;

      case 'current_month': {
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();
        const first = new Date(y, m, 1);
        const last = new Date(y, m + 1, 0);
        fromInput.value = formatDateYMD(first);
        toInput.value = formatDateYMD(last);
        break;
      }

      case 'last_month': {
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth() - 1;
        const first = new Date(y, m, 1);
        const last = new Date(y, m + 1, 0);
        fromInput.value = formatDateYMD(first);
        toInput.value = formatDateYMD(last);
        break;
      }

      case 'q1': { // Apr - Jun
        const y = fyStart.getFullYear();
        fromInput.value = formatDateYMD(new Date(y, 3, 1));
        toInput.value = formatDateYMD(new Date(y, 5, 30));
        break;
      }

      case 'q2': { // Jul - Sep
        const y = fyStart.getFullYear();
        fromInput.value = formatDateYMD(new Date(y, 6, 1));
        toInput.value = formatDateYMD(new Date(y, 8, 30));
        break;
      }

      case 'q3': { // Oct - Dec
        const y = fyStart.getFullYear();
        fromInput.value = formatDateYMD(new Date(y, 9, 1));
        toInput.value = formatDateYMD(new Date(y, 11, 31));
        break;
      }

      case 'q4': { // Jan - Mar
        const y = fyStart.getFullYear() + 1;
        fromInput.value = formatDateYMD(new Date(y, 0, 1));
        toInput.value = formatDateYMD(new Date(y, 2, 31));
        break;
      }

      case 'full_fy': {
        const y1 = fyStart.getFullYear();
        fromInput.value = formatDateYMD(new Date(y1, 3, 1));
        toInput.value = formatDateYMD(new Date(y1 + 1, 2, 31));
        break;
      }

      case 'custom':
      default:
        break;
    }
  }

  function formatDateYMD(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // ── Load Data from Backend API ───────────────────────────────
  async function loadDataSheet(isInitial = false) {
    const container = document.getElementById('dsContainer');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Loading Data Sheet (Bill & Collection Register)...');

    const ctx = HenuOsReportEngine.getSystemContext();
    const apiBase = ctx.apiBase || HenuOsReportEngine.API_BASE || `${window.location.protocol}//${window.location.hostname}:5002/api`;

    const wing = document.getElementById('filterWing')?.value?.trim() || '';
    const billTypeId = document.getElementById('filterBillType')?.value || '0';
    const search = document.getElementById('filterSearch')?.value?.trim() || '';
    const fromDate = document.getElementById('filterFromDate')?.value || '';
    const toDate = document.getElementById('filterToDate')?.value || '';

    try {
      const params = new URLSearchParams();
      params.append('societyId', ctx.societyId || 4);
      params.append('fyId', ctx.fyId || 0);

      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);
      if (billTypeId && billTypeId !== '0') params.append('billTypeId', billTypeId);
      if (wing && wing.toLowerCase() !== 'all') params.append('wing', wing);
      if (search) params.append('searchText', search);

      const url = `${apiBase}/reports/member/data-sheet?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      currentReportData = data;

      // Set date bounds if initial load or dates not set yet
      if (data.defaultBounds) {
        activeDateBounds.start = data.defaultBounds.start;
        activeDateBounds.current = data.defaultBounds.current;

        const fromInput = document.getElementById('filterFromDate');
        const toInput = document.getElementById('filterToDate');
        if (fromInput && !fromInput.value) fromInput.value = data.dateRange?.from || activeDateBounds.start;
        if (toInput && !toInput.value) toInput.value = data.dateRange?.to || activeDateBounds.current;
      }

      // Populate bill types dropdown if empty
      if (data.billTypes && data.billTypes.length > 0) {
        populateBillTypesDropdown(data.billTypes);
      }

      renderFilteredView();
      HenuOsReportEngine.applyDesignToDOM(activeDesign);
    } catch (err) {
      console.error('[DataSheet] Failed to load data sheet:', err);
      HenuOsReportEngine.renderError(container, 'Unable to load Data Sheet from backend server.', () => loadDataSheet(true));
      const kpiStrip = document.getElementById('kpiStrip');
      if (kpiStrip) kpiStrip.style.display = 'none';
    }
  }

  function populateBillTypesDropdown(billTypes) {
    const sel = document.getElementById('filterBillType');
    if (!sel || sel.options.length > 1) return;

    billTypes.forEach(bt => {
      const opt = document.createElement('option');
      opt.value = bt.billTypeId;
      opt.textContent = bt.billTypeName;
      sel.appendChild(opt);
    });
  }

  // ── Filter and Render ────────────────────────────────────────
  function renderFilteredView() {
    const container = document.getElementById('dsContainer');
    if (!container || !currentReportData) return;

    const data = currentReportData;
    const statusFilter = document.getElementById('filterStatus')?.value || 'all';
    const searchFilter = document.getElementById('filterSearch')?.value?.trim().toLowerCase() || '';

    let rows = (data.rows || []).slice();

    if (statusFilter !== 'all') {
      rows = rows.filter(r => r.status === statusFilter);
    }

    if (searchFilter) {
      rows = rows.filter(r => {
        return (r.name && r.name.toLowerCase().includes(searchFilter)) ||
               (r.code && r.code.toLowerCase().includes(searchFilter)) ||
               (r.billNo && r.billNo.toLowerCase().includes(searchFilter)) ||
               (r.chqNo && r.chqNo.toLowerCase().includes(searchFilter)) ||
               (r.bankName && r.bankName.toLowerCase().includes(searchFilter));
      });
    }

    // Update KPI Strip
    updateKpiStrip(rows);

    if (rows.length === 0) {
      HenuOsReportEngine.renderEmpty(container, 'No bill or collection records found for the selected criteria.');
      return;
    }

    renderDataSheetHTML(data.society || {}, data, rows, container);
  }

  // ── Update KPI Strip ─────────────────────────────────────────
  function updateKpiStrip(rows) {
    const kpiStrip = document.getElementById('kpiStrip');
    if (!kpiStrip) return;

    let billCount = 0;
    let sumBillAmount = 0;
    let sumInterest = 0;
    let sumArrears = 0;
    let sumDues = 0;
    let sumCollections = 0;

    rows.forEach(r => {
      if (r.billNo && r.billNo !== '-') {
        billCount++;
      }
      sumBillAmount += Number(r.billAmount || 0);
      sumInterest += Number(r.interest || 0);
      sumArrears += Number(r.arrears || 0);
      sumDues += Number(r.totalDues || 0);
      sumCollections += Number(r.amount || 0);
    });

    const outstanding = sumDues - sumCollections;

    document.getElementById('kpiTotalBills').textContent = billCount;
    document.getElementById('kpiBillAmount').textContent = HenuOsReportEngine.formatINR(sumBillAmount);
    document.getElementById('kpiInterest').textContent = HenuOsReportEngine.formatINR(sumInterest);
    document.getElementById('kpiArrears').textContent = HenuOsReportEngine.formatINR(sumArrears);
    document.getElementById('kpiTotalDues').textContent = HenuOsReportEngine.formatINR(sumDues);
    document.getElementById('kpiTotalCollections').textContent = HenuOsReportEngine.formatINR(sumCollections);
    document.getElementById('kpiOutstanding').textContent = HenuOsReportEngine.formatINR(outstanding);

    kpiStrip.style.display = 'flex';
  }

  // ── Render HTML Table Matching Legacy PDF ────────────────────
  function renderDataSheetHTML(soc, meta, rows, container) {
    const socName = soc.societyName || soc.SocietyName || 'SHREE SAI CO-OP. HOUSING SOCIETY LTD.';
    const fyLabel = meta.fyLabel || '2026-27';

    // Format display dates
    const fromVal = document.getElementById('filterFromDate')?.value || meta.dateRange?.from || '';
    const toVal = document.getElementById('filterToDate')?.value || meta.dateRange?.to || '';
    const displayFrom = formatDisplayDate(fromVal);
    const displayTo = formatDisplayDate(toVal);

    let sumBillAmount = 0;
    let sumInterest = 0;
    let sumArrears = 0;
    let sumDues = 0;
    let sumCollections = 0;

    const trHtml = rows.map((r, idx) => {
      const bAmt = Number(r.billAmount || 0);
      const intr = Number(r.interest || 0);
      const arr = Number(r.arrears || 0);
      const dues = Number(r.totalDues || 0);
      const cAmt = Number(r.amount || 0);

      sumBillAmount += bAmt;
      sumInterest += intr;
      sumArrears += arr;
      sumDues += dues;
      sumCollections += cAmt;

      // Status pill class
      const st = r.status || 'Unpaid';
      const statusClass = st === 'Paid' ? 'status-paid' :
                          st === 'Partial' ? 'status-partial' :
                          st === 'Advance' ? 'status-advance' : 'status-unpaid';

      return `
        <tr>
          <td class="center" style="font-weight:600;">${HenuOsReportEngine.escapeHtml(r.billNo || '-')}</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(r.date || '-')}</td>
          <td class="center" style="font-weight:700;">${HenuOsReportEngine.escapeHtml(r.code || '-')}</td>
          <td><strong>${HenuOsReportEngine.escapeHtml(r.name || '-')}</strong></td>
          <td class="right">${bAmt !== 0 ? bAmt.toFixed(2) : '0.00'}</td>
          <td class="right">${intr !== 0 ? intr.toFixed(2) : '0.00'}</td>
          <td class="right" style="${arr < 0 ? 'color:#b91c1c;' : ''}">${arr !== 0 ? arr.toFixed(2) : '0.00'}</td>
          <td class="right boundary-col" style="font-weight:700; ${dues < 0 ? 'color:#b91c1c;' : ''}">${dues !== 0 ? dues.toFixed(2) : '0.00'}</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(r.recDate || '')}</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(r.chqNo || '')}</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(r.chqDate || '')}</td>
          <td class="bank-cell" title="${HenuOsReportEngine.escapeHtml(r.bankName || '')}">${HenuOsReportEngine.escapeHtml(r.bankName || '')}</td>
          <td class="right" style="font-weight:700; ${cAmt > 0 ? 'color:#15803d;' : ''}">${cAmt > 0 ? cAmt.toFixed(2) : ''}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <div class="ds-report-sheet">
        <!-- Exact Legacy CHS Header Block -->
        <div class="ds-header-block">
          <div class="ds-soc-title">${HenuOsReportEngine.escapeHtml(socName)}</div>
          <div class="ds-report-title">Bill & Collection Register from ${displayFrom} to ${displayTo}</div>
          <div class="ds-meta-subrow">
            <div>F.Y. : ${HenuOsReportEngine.escapeHtml(fyLabel)}</div>
            <div>Page No : 1</div>
          </div>
        </div>

        <!-- Matrix Table (Exact Match to Legacy Print) -->
        <div class="table-responsive-box">
          <table class="ds-matrix-table">
            <thead>
              <!-- Dual-section group header -->
              <tr>
                <th colspan="8" class="section-demand-hdr boundary-col">DEMAND (BILLS ISSUED)</th>
                <th colspan="5" class="section-collection-hdr">COLLECTION (RECEIPTS / PAYMENTS)</th>
              </tr>
              <!-- Columns matching DATA_SHEET.pdf -->
              <tr>
                <th class="center" style="width: 105px;">No.</th>
                <th class="center" style="width: 78px;">Date</th>
                <th class="center" style="width: 65px;">Code</th>
                <th style="min-width: 160px;">Name</th>
                <th class="right" style="width: 85px;">Bill Amount</th>
                <th class="right" style="width: 65px;">Interest</th>
                <th class="right" style="width: 75px;">Arrears</th>
                <th class="right boundary-col" style="width: 85px;">Total Dues</th>
                <th class="center" style="width: 78px;">Rec. Date</th>
                <th class="center" style="width: 75px;">Chq. No</th>
                <th class="center" style="width: 78px;">Chq. Date</th>
                <th style="width: 130px;">Bank Name</th>
                <th class="right" style="width: 85px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${trHtml}
            </tbody>
            <tfoot>
              <!-- Totals row matching DATA_SHEET.pdf -->
              <tr class="ds-grand-total-row">
                <td colspan="4" class="right" style="font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">TOTAL:</td>
                <td class="right">${sumBillAmount.toFixed(2)}</td>
                <td class="right">${sumInterest.toFixed(2)}</td>
                <td class="right">${sumArrears.toFixed(2)}</td>
                <td class="right boundary-col">${sumDues.toFixed(2)}</td>
                <td colspan="4" class="center">-</td>
                <td class="right" style="color:#15803d;">${sumCollections.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Sheet Footer -->
        <div class="ds-sheet-footer">
          <div>Report generated via HENU ERP on ${new Date().toLocaleDateString('en-IN')} ${new Date().toLocaleTimeString('en-IN')}</div>
          <div>All figures in Indian Rupees (₹)</div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // ── Excel Export (SheetJS Styled Export) ──────────────────────
  function exportToExcel() {
    if (!currentReportData || !window.XLSX) {
      alert('Report data is not yet ready for export.');
      return;
    }

    const data = currentReportData;
    const soc = data.society || {};
    const socName = soc.societyName || soc.SocietyName || 'CO-OP. HOUSING SOCIETY LTD.';
    const pStart = document.getElementById('filterFromDate')?.value || data.dateRange?.from || '';
    const pEnd = document.getElementById('filterToDate')?.value || data.dateRange?.to || '';
    const rows = data.rows || [];

    const wb = XLSX.utils.book_new();
    const aoa = [];

    // Header block
    aoa.push([socName]);
    aoa.push([`Bill & Collection Register from ${formatDisplayDate(pStart)} to ${formatDisplayDate(pEnd)}`]);
    aoa.push([`F.Y. : ${data.fyLabel || '2026-27'}`]);
    aoa.push([]);

    // Two-tier header
    aoa.push([
      'DEMAND (BILLS ISSUED)', '', '', '', '', '', '', '',
      'COLLECTION (RECEIPTS / PAYMENTS)', '', '', '', ''
    ]);
    aoa.push([
      'No.', 'Date', 'Code', 'Name', 'Bill Amount', 'Interest', 'Arrears', 'Total Dues',
      'Rec. Date', 'Chq. No', 'Chq. Date', 'Bank Name', 'Amount'
    ]);

    let sumB = 0, sumI = 0, sumArr = 0, sumD = 0, sumC = 0;

    rows.forEach(r => {
      const bAmt = Number(r.billAmount || 0);
      const intr = Number(r.interest || 0);
      const arr = Number(r.arrears || 0);
      const dues = Number(r.totalDues || 0);
      const cAmt = Number(r.amount || 0);

      sumB += bAmt;
      sumI += intr;
      sumArr += arr;
      sumD += dues;
      sumC += cAmt;

      aoa.push([
        r.billNo || '-',
        r.date || '-',
        r.code || '-',
        r.name || '-',
        bAmt,
        intr,
        arr,
        dues,
        r.recDate || '',
        r.chqNo || '',
        r.chqDate || '',
        r.bankName || '',
        cAmt > 0 ? cAmt : ''
      ]);
    });

    // Total row
    aoa.push([
      '', '', '', 'TOTAL:',
      sumB, sumI, sumArr, sumD,
      '', '', '', '', sumC
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Merge header groups
    ws['!merges'] = [
      { s: { r: 4, c: 0 }, e: { r: 4, c: 7 } },  // DEMAND merge cols A-H
      { s: { r: 4, c: 8 }, e: { r: 4, c: 12 } }  // COLLECTION merge cols I-M
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Data Sheet');

    const cleanSocName = socName.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${cleanSocName}_Data_Sheet_${pStart}_${pEnd}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  // ── Helper Utilities ─────────────────────────────────────────
  function formatDisplayDate(dStr) {
    if (!dStr) return '-';
    try {
      const parts = dStr.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return dStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dStr;
    }
  }

  function resetFilters() {
    const selPreset = document.getElementById('filterPeriodPreset');
    if (selPreset) {
      selPreset.value = 'start_current';
      handlePeriodPresetChange();
    }
    const wing = document.getElementById('filterWing');
    if (wing) wing.value = '';
    const bt = document.getElementById('filterBillType');
    if (bt) bt.value = '0';
    const status = document.getElementById('filterStatus');
    if (status) status.value = 'all';
    const search = document.getElementById('filterSearch');
    if (search) search.value = '';

    loadDataSheet(false);
  }

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

})();
