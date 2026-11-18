/**
 * bill-register.js — Member Bill Register Engine (Dynamic Pivot & GST / Non-GST Architecture)
 * Fully compliant with ERP Bill/Invoice Generation, SocMemberBillItem line items, and SheetJS XLSX Export.
 */

(function () {
  'use strict';

  const REPORT_KEY = 'bill-register';
  let currentReportData = null;
  let activeBillTypes = [];
  let isInitialLoad = true;

  // ── Initialization ──────────────────────────────────────────
  async function init() {
    setupEventListeners();
    handlePeriodPresetChange();
    await loadBillRegister();
  }

  function setupEventListeners() {
    document.getElementById('btnRefresh')?.addEventListener('click', () => loadBillRegister(true));
    document.getElementById('btnReset')?.addEventListener('click', resetFilters);
    document.getElementById('btnApplyFilters')?.addEventListener('click', () => loadBillRegister(false));
    document.getElementById('btnExportExcel')?.addEventListener('click', exportToExcel);
    document.getElementById('btnPrint')?.addEventListener('click', () => window.print());
    document.getElementById('btnExportPdf')?.addEventListener('click', () => window.print());

    // Period preset listener
    document.getElementById('filterPeriodPreset')?.addEventListener('change', handlePeriodPresetChange);

    // Search input listener (quick client-side filter)
    document.getElementById('filterSearch')?.addEventListener('input', debounce(applyClientFilters, 250));
    document.getElementById('filterGstCategory')?.addEventListener('change', applyClientFilters);
  }

  // ── Preset Date Calculator ──────────────────────────────────
  function handlePeriodPresetChange() {
    const preset = document.getElementById('filterPeriodPreset')?.value || 'start_current';
    const fromInput = document.getElementById('filterDateFrom');
    const toInput = document.getElementById('filterDateTo');
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
        // keep existing dates
        break;
    }
  }

  // ── Load Data from Backend API ──────────────────────────────
  async function loadBillRegister(forceRefresh = false) {
    const container = document.getElementById('billRegisterContainer');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Fetching Bill Register & dynamic charge heads from ERP database...');

    const ctx = HenuOsReportEngine.getSystemContext();
    const apiBase = ctx.apiBase ||
                    (window.CONFIG && (window.CONFIG.API_BASE || window.CONFIG.apiBase)) ||
                    (window.APP_CONFIG && window.APP_CONFIG.API_BASE) ||
                    (typeof window.getApiBaseUrl === 'function' ? window.getApiBaseUrl() + '/api' : 'http://localhost:5002/api');

    const billTypeId = document.getElementById('filterBillType')?.value || '0';
    const wing = document.getElementById('filterWing')?.value?.trim() || '';
    const fromDate = document.getElementById('filterDateFrom')?.value || '';
    const toDate = document.getElementById('filterDateTo')?.value || '';

    let url = `${apiBase}/reports/member/bill-register?societyId=${ctx.societyId || 0}&fyId=${ctx.fyId || 0}`;
    if (billTypeId && billTypeId !== '0') url += `&billTypeId=${encodeURIComponent(billTypeId)}`;
    if (wing) url += `&wing=${encodeURIComponent(wing)}`;
    if (fromDate) url += `&fromDate=${encodeURIComponent(fromDate)}`;
    if (toDate) url += `&toDate=${encodeURIComponent(toDate)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
      const data = await res.json();

      if (!data || !data.success) {
        throw new Error(data?.message || 'Failed to retrieve bill register data.');
      }

      currentReportData = data;

      // Populate Bill Types dropdown if not populated or initial
      if (isInitialLoad || forceRefresh) {
        populateBillTypes(data.billTypes || []);
        if (data.defaultBounds && (!fromDate || !toDate)) {
          if (!fromDate && document.getElementById('filterDateFrom')) {
            document.getElementById('filterDateFrom').value = data.defaultBounds.start || '';
          }
          if (!toDate && document.getElementById('filterDateTo')) {
            document.getElementById('filterDateTo').value = data.defaultBounds.current || '';
          }
        }
        isInitialLoad = false;
      }

      // Configure GST-specific filter & KPI visibility
      const isGst = !!data.society?.isGst;
      const gstFilterGroup = document.getElementById('groupGstFilter');
      if (gstFilterGroup) gstFilterGroup.style.display = isGst ? 'flex' : 'none';

      document.getElementById('kpiExemptPill').style.display = isGst ? 'flex' : 'none';
      document.getElementById('kpiTaxablePill').style.display = isGst ? 'flex' : 'none';
      document.getElementById('kpiTaxPill').style.display = isGst ? 'flex' : 'none';

      applyClientFilters();
    } catch (err) {
      console.error('[BillRegister] Load error:', err);
      HenuOsReportEngine.renderError(
        container,
        'Unable to load Bill Register data.',
        err.message || 'Please check if backend server is running on http://localhost:5002',
        () => loadBillRegister(true)
      );
    }
  }

  function populateBillTypes(types) {
    const sel = document.getElementById('filterBillType');
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="0">All Bill Types</option>';
    types.forEach(bt => {
      const opt = document.createElement('option');
      opt.value = bt.billTypeId;
      opt.textContent = bt.billTypeName;
      sel.appendChild(opt);
    });
    if (currentVal) sel.value = currentVal;
    activeBillTypes = types;
  }

  // ── Client-side Filtering & KPI Update ──────────────────────
  function applyClientFilters() {
    if (!currentReportData) return;

    const searchTerm = document.getElementById('filterSearch')?.value?.toLowerCase().trim() || '';
    const gstFilter = document.getElementById('filterGstCategory')?.value || 'all';
    const isGstSociety = !!currentReportData.society?.isGst;

    let filtered = (currentReportData.bills || []).filter(b => {
      // 1. Search filter (member name, code, flat, bill no)
      if (searchTerm) {
        const hay = `${b.billNo} ${b.memberCode} ${b.memberName} ${b.unit} ${b.billType}`.toLowerCase();
        if (!hay.includes(searchTerm)) return false;
      }

      // 2. GST category filter
      if (isGstSociety && gstFilter !== 'all') {
        if (gstFilter === 'gst' && !b.isGstMember) return false;
        if (gstFilter === 'nongst' && b.isGstMember) return false;
      }

      return true;
    });

    updateKpis(filtered, isGstSociety);
    renderRegister(filtered, currentReportData);
  }

  function updateKpis(bills, isGst) {
    let totExempt = 0, totTaxable = 0, totTax = 0, totPrin = 0, totInt = 0, totArr = 0, grandTotal = 0;

    bills.forEach(b => {
      totExempt += Number(b.exemptSubtotal || 0);
      totTaxable += Number(b.taxableSubtotal || 0);
      totTax += Number(b.totalGst || 0);
      totPrin += Number(b.principal || 0);
      totInt += Number(b.interest || 0);
      totArr += Number(b.arrears || 0);
      grandTotal += Number(b.totalBill || 0);
    });

    const setT = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setT('kpiTotalBills', bills.length);
    setT('kpiTotalExempt', '₹ ' + HenuOsReportEngine.formatINR(totExempt));
    setT('kpiTotalTaxable', '₹ ' + HenuOsReportEngine.formatINR(totTaxable));
    setT('kpiTotalTax', '₹ ' + HenuOsReportEngine.formatINR(totTax));
    setT('kpiTotalPrincipal', '₹ ' + HenuOsReportEngine.formatINR(totPrin));
    setT('kpiTotalInterest', '₹ ' + HenuOsReportEngine.formatINR(totInt));
    setT('kpiTotalArrears', '₹ ' + HenuOsReportEngine.formatINR(totArr));
    setT('kpiGrandTotal', '₹ ' + HenuOsReportEngine.formatINR(grandTotal));
  }

  // ── Render Dynamic Register ─────────────────────────────────
  function renderRegister(bills, data) {
    const container = document.getElementById('billRegisterContainer');
    if (!container) return;

    if (!bills || bills.length === 0) {
      HenuOsReportEngine.renderEmpty(
        container,
        'No bills found for the selected criteria.',
        'Try widening your date range, clearing the wing filter, or selecting "All Bill Types".'
      );
      return;
    }

    const society = data.society || {};
    const isGst = !!society.isGst;
    const heads = data.heads || [];

    if (isGst) {
      container.innerHTML = buildGstRegisterHtml(bills, heads, society, data);
    } else {
      container.innerHTML = buildNonGstRegisterHtml(bills, heads, society, data);
    }
  }

  // ═════════════════════════════════════════════════════════════
  // A. NON-GST REGISTER BUILDER (e.g., Rajarshi Shahu CHS Ltd.)
  // ═════════════════════════════════════════════════════════════
  function buildNonGstRegisterHtml(bills, heads, society, data) {
    const pStart = document.getElementById('filterDateFrom')?.value || data.dateRange?.from || '';
    const pEnd = document.getElementById('filterDateTo')?.value || data.dateRange?.to || '';
    const periodDisplay = `${formatDisplayDate(pStart)} to ${formatDisplayDate(pEnd)}`;

    // Calculate Column Totals
    const headTotals = {};
    heads.forEach(h => { headTotals[h.name] = 0; });
    let totPrin = 0, totInt = 0, totCur = 0, totArr = 0, totNet = 0;

    bills.forEach(b => {
      heads.forEach(h => {
        headTotals[h.name] += Number(b.headAmounts?.[h.name] || 0);
      });
      totPrin += Number(b.principal || 0);
      totInt += Number(b.interest || 0);
      totCur += Number(b.currentTotal || (b.principal + b.interest) || 0);
      totArr += Number(b.arrears || 0);
      totNet += Number(b.totalBill || 0);
    });

    const rowsHtml = bills.map((b, idx) => {
      const typeBadgeClass = (b.billType || '').toLowerCase().includes('repair') ? 'badge-repair' : 'badge-maint';
      const arrClass = b.arrears < 0 ? 'text-advance' : (b.arrears > 0 ? 'text-due' : '');

      const headCells = heads.map(h => {
        const val = Number(b.headAmounts?.[h.name] || 0);
        return `<td class="right">${val !== 0 ? HenuOsReportEngine.formatINR(val) : '-'}</td>`;
      }).join('');

      return `
        <tr>
          <td class="center">${idx + 1}</td>
          <td class="center"><strong>${HenuOsReportEngine.escapeHtml(b.billNo || '-')}</strong></td>
          <td class="center">${HenuOsReportEngine.formatDate(b.billDate)}</td>
          <td class="center"><b>${HenuOsReportEngine.escapeHtml(b.unit || '-')}</b></td>
          <td>${HenuOsReportEngine.escapeHtml(b.memberName || '-')}</td>
          <td class="center"><span class="badge-bill-type ${typeBadgeClass}">${HenuOsReportEngine.escapeHtml(b.billType || 'Maint')}</span></td>
          <td class="right">${Number(b.area || 0) > 0 ? Number(b.area) : '-'}</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(b.period || '-')}</td>
          ${headCells}
          <td class="right font-semibold">${HenuOsReportEngine.formatINR(b.principal)}</td>
          <td class="right">${Number(b.interest) > 0 ? HenuOsReportEngine.formatINR(b.interest) : '-'}</td>
          <td class="right font-bold">${HenuOsReportEngine.formatINR(b.currentTotal || (b.principal + b.interest))}</td>
          <td class="right ${arrClass}">${HenuOsReportEngine.formatINR(b.arrears)}</td>
          <td class="right font-bold" style="color:var(--br-primary); font-size:7.8pt;">${HenuOsReportEngine.formatINR(b.totalBill)}</td>
        </tr>
      `;
    }).join('');

    const headTotalCells = heads.map(h => `
      <td class="right font-bold">${HenuOsReportEngine.formatINR(headTotals[h.name])}</td>
    `).join('');

    return `
      <div class="br-report-sheet henu-dynamic-document">
        <!-- 1. Society Header -->
        <div class="br-soc-header">
          <div class="br-soc-title">${HenuOsReportEngine.escapeHtml(society.societyName || 'HOUSING SOCIETY LTD.')}</div>
          <div class="br-soc-sub">${HenuOsReportEngine.escapeHtml(society.address || '')} ${society.registrationNo ? ' | Reg. No: ' + HenuOsReportEngine.escapeHtml(society.registrationNo) : ''}</div>
        </div>

        <!-- 2. Meta Title Bar -->
        <div class="br-meta-bar">
          <div>BILL REGISTER (NON-GST)</div>
          <div>Period: ${periodDisplay}</div>
          <div>Total Bills: ${bills.length}</div>
        </div>

        <!-- 3. Dynamic Matrix Table -->
        <div class="table-responsive-box">
          <table class="br-matrix-table" id="matrixTable">
            <thead>
              <tr>
                <th style="width:25px;" class="center">#</th>
                <th style="width:65px;" class="center">Bill No</th>
                <th style="width:65px;" class="center">Date</th>
                <th style="width:50px;" class="center">Unit</th>
                <th>Member Name</th>
                <th style="width:70px;" class="center">Bill Type</th>
                <th style="width:45px;" class="right">Area</th>
                <th style="width:65px;" class="center">Period</th>
                ${heads.map(h => `<th class="right" title="${HenuOsReportEngine.escapeHtml(h.name)}">${HenuOsReportEngine.escapeHtml(h.name)}</th>`).join('')}
                <th class="right" style="background:#1e40af;">Principal (₹)</th>
                <th class="right" style="background:#1e40af;">Interest (₹)</th>
                <th class="right" style="background:#1e40af;">Total (₹)</th>
                <th class="right" style="background:#1e40af;">Arrears (₹)</th>
                <th class="right" style="background:#0f172a;">Total Bill (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <!-- Single Consolidated Total Row -->
              <tr class="tr-grand-total">
                <td colspan="8" class="right font-bold" style="padding-right:10px;">TOTAL:</td>
                ${headTotalCells}
                <td class="right font-bold">${HenuOsReportEngine.formatINR(totPrin)}</td>
                <td class="right font-bold">${HenuOsReportEngine.formatINR(totInt)}</td>
                <td class="right font-bold">${HenuOsReportEngine.formatINR(totCur)}</td>
                <td class="right font-bold">${HenuOsReportEngine.formatINR(totArr)}</td>
                <td class="right font-bold" style="font-size:8.2pt;">₹ ${HenuOsReportEngine.formatINR(totNet)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 4. Sheet Footer -->
        <div class="br-sheet-footer">
          <div>Report generated via HENU ERP on ${new Date().toLocaleString('en-IN')}</div>
          <div>All figures in Indian Rupees (₹)</div>
        </div>
      </div>
    `;
  }

  // ═════════════════════════════════════════════════════════════
  // B. GST REGISTER BUILDER (e.g., Shree Sai Usha Complex CHS)
  // ═════════════════════════════════════════════════════════════
  function buildGstRegisterHtml(bills, heads, society, data) {
    const pStart = document.getElementById('filterDateFrom')?.value || data.dateRange?.from || '';
    const pEnd = document.getElementById('filterDateTo')?.value || data.dateRange?.to || '';
    const periodDisplay = `${formatDisplayDate(pStart)} to ${formatDisplayDate(pEnd)}`;

    // Classify heads into Exempt vs Taxable/Service heads
    const exemptHeads = heads.filter(h => h.isExempt);
    const serviceHeads = heads.filter(h => !h.isExempt);

    // Split bills into B2B / Registered (GST) and B2C / Residential (Non-GST)
    const gstBills = bills.filter(b => b.isGstMember);
    const nonGstBills = bills.filter(b => !b.isGstMember);

    function renderBillRows(list) {
      return list.map((b, idx) => {
        const typeBadgeClass = (b.billType || '').toLowerCase().includes('repair') ? 'badge-repair' : 'badge-maint';
        const arrClass = b.arrears < 0 ? 'text-advance' : (b.arrears > 0 ? 'text-due' : '');

        const exemptCells = exemptHeads.map(h => {
          const val = Number(b.headAmounts?.[h.name] || 0);
          return `<td class="right">${val !== 0 ? HenuOsReportEngine.formatINR(val) : '-'}</td>`;
        }).join('');

        const serviceCells = serviceHeads.map(h => {
          const val = Number(b.headAmounts?.[h.name] || 0);
          return `<td class="right">${val !== 0 ? HenuOsReportEngine.formatINR(val) : '-'}</td>`;
        }).join('');

        return `
          <tr>
            <td class="center">${idx + 1}</td>
            <td class="center"><strong>${HenuOsReportEngine.escapeHtml(b.billNo || '-')}</strong></td>
            <td class="center">${HenuOsReportEngine.formatDate(b.billDate)}</td>
            <td class="center"><b>${HenuOsReportEngine.escapeHtml(b.unit || '-')}</b></td>
            <td>${HenuOsReportEngine.escapeHtml(b.memberName || '-')}</td>
            <td class="center"><span class="badge-bill-type ${typeBadgeClass}">${HenuOsReportEngine.escapeHtml(b.billType || 'Maint')}</span></td>
            <td class="right">${Number(b.area || 0) > 0 ? Number(b.area) : '-'}</td>
            <td class="center font-mono" style="font-size:6.8pt;">${HenuOsReportEngine.escapeHtml(b.memberGstin || '-')}</td>
            <td class="center">${HenuOsReportEngine.escapeHtml(b.period || '-')}</td>
            ${exemptCells}
            <td class="right font-semibold" style="background:#f0f9ff;">${HenuOsReportEngine.formatINR(b.exemptSubtotal)}</td>
            ${serviceCells}
            <td class="right font-semibold" style="background:#eff6ff;">${HenuOsReportEngine.formatINR(b.taxableSubtotal)}</td>
            <td class="right">${Number(b.cgst) > 0 ? HenuOsReportEngine.formatINR(b.cgst) : '-'}</td>
            <td class="right">${Number(b.sgst) > 0 ? HenuOsReportEngine.formatINR(b.sgst) : '-'}</td>
            <td class="right font-semibold" style="background:#fef3c7;">${Number(b.totalGst) > 0 ? HenuOsReportEngine.formatINR(b.totalGst) : '-'}</td>
            <td class="right ${arrClass}">${Number(b.arrears) !== 0 ? HenuOsReportEngine.formatINR(b.arrears) : '-'}</td>
            <td class="right font-bold" style="color:var(--br-primary); font-size:7.8pt;">${HenuOsReportEngine.formatINR(b.totalBill)}</td>
          </tr>
        `;
      }).join('');
    }

    function calculateSubtotals(list) {
      const eTotals = {}, sTotals = {};
      exemptHeads.forEach(h => { eTotals[h.name] = 0; });
      serviceHeads.forEach(h => { sTotals[h.name] = 0; });

      let totEx = 0, totTaxable = 0, totCgst = 0, totSgst = 0, totGst = 0, totArr = 0, totNet = 0;

      list.forEach(b => {
        exemptHeads.forEach(h => { eTotals[h.name] += Number(b.headAmounts?.[h.name] || 0); });
        serviceHeads.forEach(h => { sTotals[h.name] += Number(b.headAmounts?.[h.name] || 0); });
        totEx += Number(b.exemptSubtotal || 0);
        totTaxable += Number(b.taxableSubtotal || 0);
        totCgst += Number(b.cgst || 0);
        totSgst += Number(b.sgst || 0);
        totGst += Number(b.totalGst || 0);
        totArr += Number(b.arrears || 0);
        totNet += Number(b.totalBill || 0);
      });

      return { eTotals, sTotals, totEx, totTaxable, totCgst, totSgst, totGst, totArr, totNet };
    }

    function renderSubtotalRow(label, sub, cssClass = 'tr-subtotal-row') {
      const eCells = exemptHeads.map(h => `<td class="right font-bold">${HenuOsReportEngine.formatINR(sub.eTotals[h.name])}</td>`).join('');
      const sCells = serviceHeads.map(h => `<td class="right font-bold">${HenuOsReportEngine.formatINR(sub.sTotals[h.name])}</td>`).join('');

      return `
        <tr class="${cssClass}">
          <td colspan="9" class="right font-bold" style="padding-right:10px;">${label}:</td>
          ${eCells}
          <td class="right font-bold">${HenuOsReportEngine.formatINR(sub.totEx)}</td>
          ${sCells}
          <td class="right font-bold">${HenuOsReportEngine.formatINR(sub.totTaxable)}</td>
          <td class="right font-bold">${HenuOsReportEngine.formatINR(sub.totCgst)}</td>
          <td class="right font-bold">${HenuOsReportEngine.formatINR(sub.totSgst)}</td>
          <td class="right font-bold">${HenuOsReportEngine.formatINR(sub.totGst)}</td>
          <td class="right font-bold">${HenuOsReportEngine.formatINR(sub.totArr)}</td>
          <td class="right font-bold" style="font-size:8.2pt;">₹ ${HenuOsReportEngine.formatINR(sub.totNet)}</td>
        </tr>
      `;
    }

    const subGst = calculateSubtotals(gstBills);
    const subNonGst = calculateSubtotals(nonGstBills);
    const subGrand = calculateSubtotals(bills);

    return `
      <div class="br-report-sheet henu-dynamic-document">
        <!-- 1. Society Header with GSTIN & SAC -->
        <div class="br-soc-header">
          <div class="br-soc-title">${HenuOsReportEngine.escapeHtml(society.societyName || 'CO-OP HOUSING SOCIETY LTD.')}</div>
          <div class="br-soc-sub">${HenuOsReportEngine.escapeHtml(society.address || '')}</div>
          <div class="br-gst-badge-row">
            <span class="br-gst-pill">GSTIN: ${HenuOsReportEngine.escapeHtml(society.gstin || 'NOT SPECIFIED')}</span>
            <span class="br-gst-pill">SAC Code: ${HenuOsReportEngine.escapeHtml(society.sacCode || '999599')}</span>
            <span class="br-gst-pill">Rate: CGST ${society.cgstPct || 9}% + SGST ${society.sgstPct || 9}%</span>
          </div>
        </div>

        <!-- 2. Meta Title Bar -->
        <div class="br-meta-bar">
          <div>BILL REGISTER (GST COMPLIANT)</div>
          <div>Period: ${periodDisplay}</div>
          <div>Total Bills: ${bills.length} (GST: ${gstBills.length} | Non-GST: ${nonGstBills.length})</div>
        </div>

        <!-- 3. Dynamic Matrix Table -->
        <div class="table-responsive-box">
          <table class="br-matrix-table" id="matrixTable">
            <thead>
              <!-- Top Grouped Header -->
              <tr>
                <th colspan="9" class="center">MEMBER DETAILS</th>
                <th colspan="${exemptHeads.length + 1}" class="th-grp-exempt">GST EXEMPT STATUTORY HEADS</th>
                <th colspan="${serviceHeads.length + 1}" class="th-grp-services">MAINTENANCE & TAXABLE SERVICES</th>
                <th colspan="3" class="th-grp-tax">GST BREAKUP</th>
                <th colspan="2" class="center">FINAL SETTLEMENT</th>
              </tr>
              <!-- Sub Header -->
              <tr>
                <th style="width:25px;" class="center">#</th>
                <th style="width:65px;" class="center">Bill No</th>
                <th style="width:65px;" class="center">Date</th>
                <th style="width:50px;" class="center">Unit</th>
                <th>Member Name</th>
                <th style="width:65px;" class="center">Bill Type</th>
                <th style="width:40px;" class="right">Area</th>
                <th style="width:90px;" class="center">GST No.</th>
                <th style="width:65px;" class="center">Period</th>

                <!-- Exempt Heads -->
                ${exemptHeads.map(h => `<th class="right" title="${HenuOsReportEngine.escapeHtml(h.name)}">${HenuOsReportEngine.escapeHtml(h.name)}</th>`).join('')}
                <th class="right" style="background:#0284c7;">Total Exempt (₹)</th>

                <!-- Service Heads -->
                ${serviceHeads.map(h => `<th class="right" title="${HenuOsReportEngine.escapeHtml(h.name)}">${HenuOsReportEngine.escapeHtml(h.name)}</th>`).join('')}
                <th class="right" style="background:#1d4ed8;">Taxable Base (₹)</th>

                <!-- Taxes -->
                <th class="right" style="background:#b45309;">CGST (₹)</th>
                <th class="right" style="background:#b45309;">SGST (₹)</th>
                <th class="right" style="background:#92400e;">Total GST (₹)</th>

                <!-- Settlement -->
                <th class="right" style="background:#475569;">Arrears (₹)</th>
                <th class="right" style="background:#0f172a;">Total Bill (₹)</th>
              </tr>
            </thead>
            <tbody>
              <!-- SECTION 1: TOTAL-GST (B2B / Registered Members / Commercial) -->
              ${gstBills.length > 0 ? `
                <tr class="tr-section-header">
                  <td colspan="${9 + exemptHeads.length + 1 + serviceHeads.length + 1 + 3 + 2}">
                    <i class="bi bi-briefcase-fill text-primary"></i> <b>REGISTERED / COMMERCIAL MEMBERS (TOTAL-GST)</b> — ${gstBills.length} Bill(s)
                  </td>
                </tr>
                ${renderBillRows(gstBills)}
                ${renderSubtotalRow('TOTAL-GST', subGst)}
              ` : ''}

              <!-- SECTION 2: TOTAL-NON GST (B2C / Residential Members) -->
              ${nonGstBills.length > 0 ? `
                <tr class="tr-section-header">
                  <td colspan="${9 + exemptHeads.length + 1 + serviceHeads.length + 1 + 3 + 2}">
                    <i class="bi bi-people-fill text-primary"></i> <b>RESIDENTIAL MEMBERS (TOTAL-NON GST)</b> — ${nonGstBills.length} Bill(s)
                  </td>
                </tr>
                ${renderBillRows(nonGstBills)}
                ${renderSubtotalRow('TOTAL-NON GST', subNonGst)}
              ` : ''}

              <!-- SECTION 3: GRAND TOTAL -->
              ${renderSubtotalRow('GRAND TOTAL', subGrand, 'tr-grand-total')}
            </tbody>
          </table>
        </div>

        <!-- 4. Sheet Footer -->
        <div class="br-sheet-footer">
          <div>Report generated via HENU ERP on ${new Date().toLocaleString('en-IN')}</div>
          <div>All figures in Indian Rupees (₹)</div>
        </div>
      </div>
    `;
  }

  // ═════════════════════════════════════════════════════════════
  // C. EXCEL (.XLSX) EXPORT VIA SHEETJS
  // ═════════════════════════════════════════════════════════════
  function exportToExcel() {
    if (!currentReportData || !currentReportData.bills || currentReportData.bills.length === 0) {
      alert('No bill data available to export.');
      return;
    }

    if (typeof XLSX === 'undefined') {
      alert('Excel export library is loading, please try again.');
      return;
    }

    const data = currentReportData;
    const society = data.society || {};
    const isGst = !!society.isGst;
    const heads = data.heads || [];
    const bills = (data.bills || []);

    const pStart = document.getElementById('filterDateFrom')?.value || data.dateRange?.from || '';
    const pEnd = document.getElementById('filterDateTo')?.value || data.dateRange?.to || '';

    const wb = XLSX.utils.book_new();
    const rows = [];

    // Title rows
    rows.push([society.societyName || 'HOUSING SOCIETY LTD.']);
    rows.push([society.address || '']);
    if (isGst) {
      rows.push([`GSTIN: ${society.gstin || '-'} | SAC: ${society.sacCode || '999599'}`]);
    }
    rows.push([`BILL REGISTER (${isGst ? 'GST' : 'NON-GST'}) — Period: ${pStart} to ${pEnd}`]);
    rows.push([]); // blank

    if (isGst) {
      const exemptHeads = heads.filter(h => h.isExempt);
      const serviceHeads = heads.filter(h => !h.isExempt);

      const headerRow = [
        'No', 'Bill Date', 'Bill No', 'Unit', 'Member Name', 'Bill Type', 'Area', 'GST No', 'Period',
        ...exemptHeads.map(h => h.name),
        'Total Exempt',
        ...serviceHeads.map(h => h.name),
        'Taxable Base',
        'CGST', 'SGST', 'Total GST',
        'Arrears', 'Total Bill'
      ];
      rows.push(headerRow);

      const addRowsForList = (list) => {
        list.forEach((b, idx) => {
          rows.push([
            idx + 1,
            b.billDate,
            b.billNo,
            b.unit,
            b.memberName,
            b.billType,
            Number(b.area || 0),
            b.memberGstin || '',
            b.period || '',
            ...exemptHeads.map(h => Number(b.headAmounts?.[h.name] || 0)),
            Number(b.exemptSubtotal || 0),
            ...serviceHeads.map(h => Number(b.headAmounts?.[h.name] || 0)),
            Number(b.taxableSubtotal || 0),
            Number(b.cgst || 0),
            Number(b.sgst || 0),
            Number(b.totalGst || 0),
            Number(b.arrears || 0),
            Number(b.totalBill || 0)
          ]);
        });
      };

      const gstBills = bills.filter(b => b.isGstMember);
      const nonGstBills = bills.filter(b => !b.isGstMember);

      if (gstBills.length > 0) {
        rows.push(['--- REGISTERED / COMMERCIAL MEMBERS (TOTAL-GST) ---']);
        addRowsForList(gstBills);
      }

      if (nonGstBills.length > 0) {
        rows.push(['--- RESIDENTIAL MEMBERS (TOTAL-NON GST) ---']);
        addRowsForList(nonGstBills);
      }
    } else {
      const headerRow = [
        'No', 'Bill Date', 'Bill No', 'Unit', 'Member Name', 'Bill Type', 'Area', 'Period',
        ...heads.map(h => h.name),
        'Principal', 'Interest', 'Total', 'Arrears', 'Total Bill'
      ];
      rows.push(headerRow);

      bills.forEach((b, idx) => {
        rows.push([
          idx + 1,
          b.billDate,
          b.billNo,
          b.unit,
          b.memberName,
          b.billType,
          Number(b.area || 0),
          b.period || '',
          ...heads.map(h => Number(b.headAmounts?.[h.name] || 0)),
          Number(b.principal || 0),
          Number(b.interest || 0),
          Number(b.currentTotal || (b.principal + b.interest)),
          Number(b.arrears || 0),
          Number(b.totalBill || 0)
        ]);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Bill Register');

    const cleanSocName = (society.societyName || 'Society').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${cleanSocName}_Bill_Register_${pStart}_${pEnd}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  // ── Helper Utilities ────────────────────────────────────────
  function formatDisplayDate(dStr) {
    if (!dStr) return '-';
    try {
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return dStr;
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
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
    const search = document.getElementById('filterSearch');
    if (search) search.value = '';
    const bType = document.getElementById('filterBillType');
    if (bType) bType.value = '0';
    const gstCat = document.getElementById('filterGstCategory');
    if (gstCat) gstCat.value = 'all';

    loadBillRegister(false);
  }

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // Expose global methods
  window.loadBillRegister = loadBillRegister;
  window.resetFilters = resetFilters;
  window.exportToExcel = exportToExcel;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
