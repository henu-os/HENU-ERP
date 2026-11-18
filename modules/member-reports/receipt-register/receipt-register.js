/**
 * receipt-register.js — Member Receipt Register Engine (Landscape A4)
 * Fully compliant with Legacy CHS Audit Print (Rajarshi Shahu format), live ERP vouchers, and SheetJS XLSX Export.
 */

(function () {
  'use strict';

  const REPORT_KEY = 'receipt-register';
  let currentReportData = null;
  let isInitialLoad = true;

  // ── Initialization ──────────────────────────────────────────
  async function init() {
    setupEventListeners();
    handlePeriodPresetChange();
    await loadReceiptRegister();
  }

  function setupEventListeners() {
    document.getElementById('btnRefresh')?.addEventListener('click', () => loadReceiptRegister(true));
    document.getElementById('btnReset')?.addEventListener('click', resetFilters);
    document.getElementById('btnApplyFilters')?.addEventListener('click', () => loadReceiptRegister(false));
    document.getElementById('btnExportExcel')?.addEventListener('click', exportToExcel);
    document.getElementById('btnPrint')?.addEventListener('click', () => window.print());
    document.getElementById('btnExportPdf')?.addEventListener('click', () => window.print());

    // Period preset listener
    document.getElementById('filterPeriodPreset')?.addEventListener('change', handlePeriodPresetChange);

    // Search and mode filter listeners
    document.getElementById('filterSearch')?.addEventListener('input', debounce(applyClientFilters, 250));
    document.getElementById('filterMode')?.addEventListener('change', applyClientFilters);
  }

  // ── Period Preset Calculator ────────────────────────────────
  function handlePeriodPresetChange() {
    const preset = document.getElementById('filterPeriodPreset')?.value || 'start_current';
    const fromInput = document.getElementById('filterFromDate');
    const toInput = document.getElementById('filterToDate');
    if (!fromInput || !toInput) return;

    const today = new Date();
    const curYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1; // FY starts April 1
    const fyStart = new Date(curYear, 3, 1);
    const fyEnd = new Date(curYear + 1, 2, 31);

    const pad = n => String(n).padStart(2, '0');
    const toYMD = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    switch (preset) {
      case 'start_current':
        fromInput.value = toYMD(fyStart);
        toInput.value = toYMD(today);
        break;
      case 'current_month':
        fromInput.value = toYMD(new Date(today.getFullYear(), today.getMonth(), 1));
        toInput.value = toYMD(new Date(today.getFullYear(), today.getMonth() + 1, 0));
        break;
      case 'last_month':
        fromInput.value = toYMD(new Date(today.getFullYear(), today.getMonth() - 1, 1));
        toInput.value = toYMD(new Date(today.getFullYear(), today.getMonth(), 0));
        break;
      case 'q1':
        fromInput.value = `${curYear}-04-01`;
        toInput.value = `${curYear}-06-30`;
        break;
      case 'q2':
        fromInput.value = `${curYear}-07-01`;
        toInput.value = `${curYear}-09-30`;
        break;
      case 'q3':
        fromInput.value = `${curYear}-10-01`;
        toInput.value = `${curYear}-12-31`;
        break;
      case 'q4':
        fromInput.value = `${curYear + 1}-01-01`;
        toInput.value = `${curYear + 1}-03-31`;
        break;
      case 'full_fy':
        fromInput.value = toYMD(fyStart);
        toInput.value = toYMD(fyEnd);
        break;
      case 'custom':
        break;
    }
  }

  // ── Load Receipt Data from Backend API ───────────────────────
  async function loadReceiptRegister(forceRefresh = false) {
    const container = document.getElementById('rrContainer');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Fetching Receipt Register from ERP database...');

    const ctx = HenuOsReportEngine.getSystemContext();
    const apiBase = ctx.apiBase ||
                    window.CONFIG?.API_BASE ||
                    window.APP_CONFIG?.API_BASE ||
                    (typeof window.getApiBaseUrl === 'function' ? window.getApiBaseUrl() + '/api' : 'http://localhost:5002/api');

    const wing = document.getElementById('filterWing')?.value?.trim() || '';
    const fromDate = document.getElementById('filterFromDate')?.value || '';
    const toDate = document.getElementById('filterToDate')?.value || '';

    let url = `${apiBase}/reports/member/receipt-register?societyId=${ctx.societyId || 0}&fyId=${ctx.fyId || 0}`;
    if (wing) url += `&wing=${encodeURIComponent(wing)}`;
    if (fromDate) url += `&fromDate=${encodeURIComponent(fromDate)}`;
    if (toDate) url += `&toDate=${encodeURIComponent(toDate)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
      const data = await res.json();

      if (!data || !data.success) {
        throw new Error(data?.message || 'Failed to retrieve receipt register data.');
      }

      currentReportData = data;

      if (isInitialLoad || forceRefresh) {
        if (data.defaultBounds && (!fromDate || !toDate)) {
          if (!fromDate && document.getElementById('filterFromDate')) {
            document.getElementById('filterFromDate').value = data.defaultBounds.start || '';
          }
          if (!toDate && document.getElementById('filterToDate')) {
            document.getElementById('filterToDate').value = data.defaultBounds.current || '';
          }
        }
        isInitialLoad = false;
      }

      applyClientFilters();
    } catch (err) {
      console.error('[ReceiptRegister] Load error:', err);
      HenuOsReportEngine.renderError(
        container,
        'Unable to load Receipt Register data.',
        err.message || 'Please check if backend server is running on http://localhost:5002',
        () => loadReceiptRegister(true)
      );
    }
  }

  // ── Client-side Filtering & KPI Update ──────────────────────
  function applyClientFilters() {
    if (!currentReportData) return;

    const searchTerm = document.getElementById('filterSearch')?.value?.toLowerCase().trim() || '';
    const modeFilter = document.getElementById('filterMode')?.value || 'all';

    let filtered = (currentReportData.receipts || []).filter(r => {
      // 1. Search term (member name, flat, receipt no, bank, chq no)
      if (searchTerm) {
        const hay = `${r.receiptNo} ${r.name} ${r.flatNo} ${r.chqNo} ${r.bankName} ${r.mode} ${r.narration}`.toLowerCase();
        if (!hay.includes(searchTerm)) return false;
      }

      // 2. Mode filter
      if (modeFilter !== 'all') {
        const rMode = (r.mode || '').toUpperCase();
        if (modeFilter === 'Cheque' && !rMode.includes('CHEQUE')) return false;
        if (modeFilter === 'UPI' && !rMode.includes('UPI')) return false;
        if (modeFilter === 'NEFT' && !rMode.includes('NEFT') && !rMode.includes('RTGS')) return false;
        if (modeFilter === 'IMPS' && !rMode.includes('IMPS')) return false;
        if (modeFilter === 'TRF' && !rMode.includes('TRF')) return false;
        if (modeFilter === 'Cash' && !rMode.includes('CASH')) return false;
      }

      return true;
    });

    updateKpis(filtered);
    renderReceiptRegister(filtered, currentReportData);
  }

  function updateKpis(receipts) {
    let totCash = 0, totCheque = 0, totDigital = 0, grandTotal = 0;

    receipts.forEach(r => {
      const amt = Number(r.amount || 0);
      grandTotal += amt;
      const m = (r.mode || '').toUpperCase();
      if (m.includes('CASH')) totCash += amt;
      else if (m.includes('CHEQUE')) totCheque += amt;
      else totDigital += amt; // UPI, NEFT, IMPS, TRF
    });

    const setT = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setT('kpiReceiptCount', receipts.length);
    setT('kpiCash', '₹ ' + HenuOsReportEngine.formatINR(totCash));
    setT('kpiCheque', '₹ ' + HenuOsReportEngine.formatINR(totCheque));
    setT('kpiDigital', '₹ ' + HenuOsReportEngine.formatINR(totDigital));
    setT('kpiTotalCollections', '₹ ' + HenuOsReportEngine.formatINR(grandTotal));
  }

  // ── Render Legacy-Compliant Receipt Register ────────────────
  function renderReceiptRegister(receipts, data) {
    const container = document.getElementById('rrContainer');
    if (!container) return;

    if (!receipts || receipts.length === 0) {
      HenuOsReportEngine.renderEmpty(
        container,
        'No receipts found for the selected criteria.',
        'Try widening your date range, resetting the payment mode, or searching for another member.'
      );
      return;
    }

    const society = data.society || {};
    const pStart = document.getElementById('filterFromDate')?.value || data.dateRange?.from || '';
    const pEnd = document.getElementById('filterToDate')?.value || data.dateRange?.to || '';
    const periodDisplay = `${formatDisplayDate(pStart)} to ${formatDisplayDate(pEnd)}`;
    const fyDisplay = data.fyLabel ? `F.Y. : ${data.fyLabel}` : (data.society?.startingyear ? `F.Y. : ${data.society.startingyear}` : 'F.Y. : 2026-2027');

    let grandTotal = 0;
    const rowsHtml = receipts.map((r, idx) => {
      const amt = Number(r.amount || 0);
      grandTotal += amt;

      return `
        <tr>
          <td class="center">${r.srNo || (idx + 1)}</td>
          <td class="center">${r.date || '-'}</td>
          <td class="center"><b>${HenuOsReportEngine.escapeHtml(r.flatNo || '-')}</b></td>
          <td>${HenuOsReportEngine.escapeHtml(r.name || '-')}</td>
          <td class="center font-semibold" style="color:#0f172a;" title="${HenuOsReportEngine.escapeHtml(r.cashBankName || r.cashBank || '')}">
            ${HenuOsReportEngine.escapeHtml(r.cashBankName || r.cashBank || 'Society Bank')}
          </td>
          <td class="center">${HenuOsReportEngine.escapeHtml(r.chqNo || '-')}</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(r.chqDate || '-')}</td>
          <td class="bank-cell" title="${HenuOsReportEngine.escapeHtml(r.bankName || '')}">${HenuOsReportEngine.escapeHtml(r.bankName || '-')}</td>
          <td class="right font-bold">${HenuOsReportEngine.formatINR(amt)}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <div class="rr-report-sheet henu-dynamic-document">
        <!-- 1. Header (Exact Match to Rajarshi Shahu CHS Ltd. format) -->
        <div class="rr-header-block">
          <div class="rr-soc-title">${HenuOsReportEngine.escapeHtml(society.societyname || society.SocietyName || 'CO-OP. HOUSING SOCIETY LTD.')}</div>
          <div class="rr-report-title">Member's Receipt Register from ${periodDisplay}</div>
          <div class="rr-meta-subrow">
            <div>${HenuOsReportEngine.escapeHtml(fyDisplay)}</div>
            <div>Page No : 1</div>
          </div>
        </div>

        <!-- 2. Matrix Table (8 Columns exact legacy layout) -->
        <div class="table-responsive-box">
          <table class="rr-matrix-table" id="receiptMatrixTable">
            <thead>
              <tr>
                <th style="width:45px;" class="center">No.</th>
                <th style="width:85px;" class="center">Date</th>
                <th style="width:75px;" class="center">Flat No.</th>
                <th style="width:230px;">Name</th>
                <th style="width:75px;" class="center">Cash/Bank</th>
                <th style="width:95px;" class="center">Chq. No.</th>
                <th style="width:90px;" class="center">Chq.Date</th>
                <th>Bank Name</th>
                <th style="width:110px;" class="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <!-- Bottom Total Row -->
              <tr class="rr-grand-total-row">
                <td colspan="8" class="right font-bold" style="padding-right:15px;">TOTAL:</td>
                <td class="right font-bold">${HenuOsReportEngine.formatINR(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 3. Footer -->
        <div class="rr-sheet-footer">
          <div>Total Receipts: <b>${receipts.length}</b> | Generated: ${new Date().toLocaleString('en-IN')}</div>
          <div>All figures in Indian Rupees (₹)</div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // ── Excel Export via SheetJS (.xlsx) ────────────────────────
  function exportToExcel() {
    if (!currentReportData || !currentReportData.receipts || currentReportData.receipts.length === 0) {
      alert('No receipt records to export.');
      return;
    }

    if (typeof XLSX === 'undefined') {
      alert('Excel export library is loading, please try again.');
      return;
    }

    const data = currentReportData;
    const society = data.society || {};
    const receipts = data.receipts || [];
    const pStart = document.getElementById('filterFromDate')?.value || data.dateRange?.from || '';
    const pEnd = document.getElementById('filterToDate')?.value || data.dateRange?.to || '';

    const wb = XLSX.utils.book_new();
    const rows = [];

    // Header block
    rows.push([society.societyname || society.SocietyName || 'CO-OP. HOUSING SOCIETY LTD.']);
    rows.push([`Member's Receipt Register from ${pStart} to ${pEnd}`]);
    rows.push([`F.Y. : ${data.fyLabel || '2026-2027'}`]);
    rows.push([]);

    // Column Headers
    rows.push(['No.', 'Date', 'Flat No.', 'Name', 'Cash/Bank', 'Chq. No.', 'Chq.Date', 'Bank Name', 'Amount']);

    let totalAmt = 0;
    receipts.forEach((r, idx) => {
      const amt = Number(r.amount || 0);
      totalAmt += amt;
      rows.push([
        r.srNo || (idx + 1),
        r.date || '',
        r.flatNo || '',
        r.name || '',
        r.cashBankName || r.cashBank || 'Society Bank',
        r.chqNo || '',
        r.chqDate || '',
        r.bankName || '',
        amt
      ]);
    });

    // Grand total row
    rows.push(['', '', '', '', '', '', '', 'TOTAL:', totalAmt]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Receipt Register');

    const cleanSocName = (society.societyname || society.SocietyName || 'Society').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${cleanSocName}_Receipt_Register_${pStart}_${pEnd}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  // ── Helper Utilities ────────────────────────────────────────
  function formatDisplayDate(dStr) {
    if (!dStr) return '-';
    try {
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return dStr;
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
    const mode = document.getElementById('filterMode');
    if (mode) mode.value = 'all';
    const search = document.getElementById('filterSearch');
    if (search) search.value = '';

    loadReceiptRegister(false);
  }

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  window.loadReceiptRegister = loadReceiptRegister;
  window.resetFilters = resetFilters;
  window.exportToExcel = exportToExcel;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
