// ═══════════════════════════════════════════════════════════
// HENU ERP — BUDGET REPORT (INCOME & EXPENDITURE) ENGINE
// Format A: Statutory AGM Budget Report
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';

  let currentBudgetReport = null;
  let activeSocietyId = 1;
  let activeFyId = 1;
  const modifiedBudgets = new Map(); // key: accountId, value: { approvedAmount, proposedAmount, remarks }
  const STORAGE_PREFIX = 'henu_budget_store_';

  // ── 1. INITIALIZATION ──────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    initBudgetModule();
  });

  async function initBudgetModule() {
    activeSocietyId = (window.Auth && typeof Auth.getSocietyId === 'function') 
      ? (Auth.getSocietyId() || '1') 
      : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '1');
    
    activeFyId = (window.Auth && typeof Auth.getFYId === 'function') 
      ? (Auth.getFYId() || '1') 
      : (sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId') || '1');

    initDatePickers();
    await loadFinancialYears();
    loadBudgetData();
  }

  function initDatePickers() {
    const fromInp = document.getElementById('bgt-from-date');
    const toInp = document.getElementById('bgt-to-date');
    if (!fromInp || !toInp) return;

    let fyStart = '';
    let fyEnd = '';

    if (typeof getFYDateRange === 'function') {
      try {
        const range = getFYDateRange();
        if (range && range.fyStart && range.fyEnd) {
          fyStart = range.fyStart;
          fyEnd = range.fyEnd;
        }
      } catch (e) {}
    }

    if (!fyStart || !fyEnd) {
      fyStart = sessionStorage.getItem('activeFYStart') || localStorage.getItem('activeFYStart') || '';
      fyEnd = sessionStorage.getItem('activeFYEnd') || localStorage.getItem('activeFYEnd') || '';
    }

    if (!fyStart || !fyEnd) {
      const fyLabel = (window.Auth && typeof Auth.getFYLabel === 'function') ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2026-27');
      const parts = fyLabel.split('-');
      let sYear = parseInt(parts[0], 10) || 2026;
      if (sYear < 2000) sYear += 2000;
      fyStart = `${sYear}-04-01`;
      fyEnd = `${sYear + 1}-03-31`;
    }

    if (fyStart && fyStart.includes('T')) fyStart = fyStart.split('T')[0];
    if (fyEnd && fyEnd.includes('T')) fyEnd = fyEnd.split('T')[0];

    fromInp.value = fyStart;
    toInp.value = fyEnd;
  }

  async function loadFinancialYears() {
    const sel = document.getElementById('bgt-fy');
    if (!sel) return;

    try {
      const res = await API.get(`/api/financial-years?societyId=${activeSocietyId}`);
      if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
        sel.innerHTML = '';
        res.data.forEach(fy => {
          const opt = document.createElement('option');
          const id = fy.fyId || fy.FYId;
          opt.value = id;
          opt.textContent = fy.fyLabel || fy.FYLabel || `${fy.fyStart} - ${fy.fyEnd}`;
          if (String(id) === String(activeFyId)) {
            opt.selected = true;
            if (fy.fyStart && fy.fyEnd) {
              setDatesFromFy(fy);
            }
          }
          sel.appendChild(opt);
        });
        return;
      }
    } catch (e) {
      console.warn('Could not load FY list via API, using active label', e);
    }

    const curLabel = (window.Auth && typeof Auth.getFYLabel === 'function') 
      ? Auth.getFYLabel() 
      : (sessionStorage.getItem('activeFYLabel') || '2026-2027');
    sel.innerHTML = `<option value="${activeFyId}" selected>${curLabel}</option>`;
  }

  function setDatesFromFy(fy) {
    const fromInput = document.getElementById('bgt-from-date');
    const toInput = document.getElementById('bgt-to-date');
    if (fromInput && fy.fyStart) fromInput.value = fy.fyStart.split('T')[0];
    if (toInput && fy.fyEnd) toInput.value = fy.fyEnd.split('T')[0];
  }

  window.onFyChanged = function () {
    const sel = document.getElementById('bgt-fy');
    if (!sel) return;
    activeFyId = sel.value;
    modifiedBudgets.clear();
    loadBudgetData();
  };

  // ── 2. DATA PERSISTENCE (LOCAL & BACKEND) ──────────────────────────────
  function getStoredBudgetMap(societyId, fyId) {
    const key = `${STORAGE_PREFIX}${societyId}_${fyId}`;
    try {
      const raw = (window.SafeStorage ? window.SafeStorage.local.getItem(key) : localStorage.getItem(key));
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {};
  }

  function setStoredBudgetMap(societyId, fyId, map) {
    const key = `${STORAGE_PREFIX}${societyId}_${fyId}`;
    try {
      const raw = JSON.stringify(map);
      if (window.SafeStorage) window.SafeStorage.local.setItem(key, raw);
      else localStorage.setItem(key, raw);
    } catch (e) {}
  }

  // ── 3. DATA FETCHING & ADAPTER ──────────────────────────────────────────
  window.loadBudgetData = async function () {
    const tbody = document.getElementById('bgtTBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted" style="padding:40px;">
            <i class="bi bi-arrow-repeat spin"></i> Loading Budget Report...
          </td>
        </tr>`;
    }

    const fromInp = document.getElementById('bgt-from-date');
    const toInp = document.getElementById('bgt-to-date');
    const fromDate = fromInp ? fromInp.value : '';
    const toDate = toInp ? toInp.value : '';

    try {
      let reportData = null;

      // 1. Try dedicated budget endpoint first
      try {
        const budgetUrl = `/api/additional-reports/budget/report?societyId=${activeSocietyId}&fyId=${activeFyId}&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}&comparePrevFY=true`;
        const bRes = await API.get(budgetUrl);
        if (bRes && bRes.success) {
          reportData = bRes;
        }
      } catch (be) {
        // Fall through to core I&E engine
      }

      // 2. If dedicated endpoint not available, use the live Income & Expenditure API
      if (!reportData) {
        const ieUrl = `/api/reports/income-expenditure?societyId=${activeSocietyId}&fyId=${activeFyId}&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}&comparePrevFY=true`;
        const ieRes = await API.get(ieUrl);

        if (ieRes && ieRes.success) {
          reportData = adaptIEReportToBudget(ieRes);
        } else {
          throw new Error(ieRes?.message || 'Failed to load report from server');
        }
      }

      currentBudgetReport = reportData;
      renderBudgetView();
    } catch (err) {
      console.error('Error loading budget report:', err);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger" style="padding:30px;">Error connecting to server. Please check backend connection.</td></tr>`;
      }
    }
  };

  function adaptIEReportToBudget(ie) {
    const stored = getStoredBudgetMap(activeSocietyId, activeFyId);
    const p = ie.period || {};
    const prevP = ie.prevPeriod || {};

    const curFyLabel = p.fyLabel || (window.Auth && typeof Auth.getFYLabel === 'function' ? Auth.getFYLabel() : '2026-2027');
    let prevFyLabel = prevP.fyLabel || '';
    if (!prevFyLabel && curFyLabel.includes('-')) {
      const parts = curFyLabel.split('-');
      if (parts.length === 2) {
        const y1 = parseInt(parts[0], 10);
        const y2 = parseInt(parts[1], 10);
        if (y1) prevFyLabel = `${y1 - 1}-${y2 - 1}`;
      }
    }

    let nextFyLabel = '';
    if (curFyLabel.includes('-')) {
      const parts = curFyLabel.split('-');
      if (parts.length === 2) {
        const y1 = parseInt(parts[0], 10);
        const y2 = parseInt(parts[1], 10);
        if (y1) nextFyLabel = `${y1 + 1}-${y2 + 1}`;
      }
    }

    function mapGroups(groups, side) {
      return (groups || []).map(g => {
        let gPrev = 0, gApp = 0, gCur = 0, gProp = 0;
        const accounts = (g.accounts || []).map(a => {
          const s = stored[a.accountId] || {};
          const prevActual = parseFloat(a.prevAmount) || 0;
          const currentActual = parseFloat(a.currentAmount) || 0;
          const approvedBudget = parseFloat(s.approvedAmount) || 0;
          const proposedBudget = parseFloat(s.proposedAmount) || 0;
          const variance = currentActual - approvedBudget;

          gPrev += prevActual;
          gApp += approvedBudget;
          gCur += currentActual;
          gProp += proposedBudget;

          return {
            accountId: a.accountId,
            accCode: a.accCode || '',
            accName: a.accName || '',
            prevActual,
            approvedBudget,
            currentActual,
            proposedBudget,
            variance,
            remarks: s.remarks || ''
          };
        });

        return {
          groupId: g.groupId,
          groupCode: g.groupCode || '',
          groupName: g.groupName || 'General',
          grpSubtotal: !!g.grpSubtotal,
          totalPrevActual: gPrev,
          totalApprovedBudget: gApp,
          totalCurrentActual: gCur,
          totalProposedBudget: gProp,
          totalVariance: gCur - gApp,
          accounts
        };
      });
    }

    const expenditure = mapGroups(ie.expenditure || [], 'exp');
    const income = mapGroups(ie.income || [], 'inc');

    return {
      success: true,
      society: ie.society || {},
      period: {
        fyId: activeFyId,
        fyLabel: curFyLabel,
        fromDisplay: p.fromDisplay || p.fromDate || '',
        toDisplay: p.toDisplay || p.toDate || '',
        prevFyLabel,
        nextFyLabel
      },
      expenditure,
      income
    };
  }

  // ── 4. VIEW RENDERER ────────────────────────────────────────────────────
  window.renderBudgetView = function () {
    if (!currentBudgetReport) return;

    const data = currentBudgetReport;
    const soc = data.society || {};
    const period = data.period || {};
    const viewMode = document.getElementById('bgt-view-mode')?.value || 'detailed';
    const hideZero = document.getElementById('chk-hide-zero')?.checked || false;

    // 1. Update Masthead Info
    const activeSocName = (window.Auth && typeof Auth.getSocietyName === 'function') 
      ? Auth.getSocietyName() 
      : (soc.societyName || 'CO-OPERATIVE HOUSING SOCIETY LTD.');
    const dispName = document.getElementById('disp-soc-name');
    const dispSub = document.getElementById('disp-soc-sub');
    const dispPeriod = document.getElementById('disp-period');
    const dispFyLabel = document.getElementById('disp-fy-label');
    const signSoc = document.getElementById('bgtSignSocName');

    if (dispName) dispName.textContent = activeSocName;
    if (dispSub) dispSub.textContent = `Registration No: ${soc.registrationNo || '—'} | Address: ${soc.address || ''} ${soc.city || ''}`.trim();
    if (dispPeriod) dispPeriod.textContent = `${period.fromDisplay || period.fromDate || ''} To ${period.toDisplay || period.toDate || ''}`;
    if (dispFyLabel) dispFyLabel.textContent = period.fyLabel || 'Current FY';
    if (signSoc) signSoc.textContent = `For ${activeSocName}`;

    // 2. Update Dynamic Column Headers
    const prevLabel = period.prevFyLabel ? `(${period.prevFyLabel})` : 'Previous Year';
    const curLabel = period.fyLabel ? `(${period.fyLabel})` : 'Current Year';
    const nextLabel = period.nextFyLabel ? `(${period.nextFyLabel})` : 'Next Year';

    const thPrev = document.getElementById('th-prev-actual');
    const thApproved = document.getElementById('th-cur-approved');
    const thCurAct = document.getElementById('th-cur-actual');
    const thProposed = document.getElementById('th-next-proposed');

    if (thPrev) thPrev.innerHTML = `Actuals (₹)<br><span style="font-weight:normal; font-size:10px;">${prevLabel}</span>`;
    if (thApproved) thApproved.innerHTML = `Approved Budget (₹)<br><span style="font-weight:normal; font-size:10px;">${curLabel}</span>`;
    if (thCurAct) thCurAct.innerHTML = `Actuals (₹)<br><span style="font-weight:normal; font-size:10px;">${curLabel}</span>`;
    if (thProposed) thProposed.innerHTML = `Proposed Budget (₹)<br><span style="font-weight:normal; font-size:10px;">${nextLabel}</span>`;

    // 3. Build Table HTML
    const tbody = document.getElementById('bgtTBody');
    if (!tbody) return;

    let html = '';

    // ── PART I: EXPENDITURE ─────────────────────────────────────────────
    html += `
      <tr class="bgt-section-header-row">
        <td colspan="6"><i class="bi bi-dash-circle me-1"></i> PART I : EXPENDITURE</td>
      </tr>`;

    html += renderSectionRows(data.expenditure || [], 'exp', viewMode, hideZero);

    // Total Expenditure Row
    const expTotals = calculateSectionTotals(data.expenditure || []);
    html += `
      <tr class="bgt-section-total-row" id="row-tot-exp">
        <td class="text-start">TOTAL EXPENDITURE (A)</td>
        <td class="bgt-num" id="tot-exp-prev">${formatINR(expTotals.prevActual)}</td>
        <td class="bgt-num" id="tot-exp-approved" style="font-weight:800; color:#1e40af;">${formatINR(expTotals.approvedBudget)}</td>
        <td class="bgt-num" id="tot-exp-cur">${formatINR(expTotals.currentActual)}</td>
        <td class="bgt-num" id="tot-exp-proposed" style="font-weight:800; color:#166534;">${formatINR(expTotals.proposedBudget)}</td>
        <td class="bgt-num ${expTotals.variance > 0 ? 'text-danger' : 'text-success'}" id="tot-exp-variance">${formatINR(expTotals.variance)}</td>
      </tr>`;

    // ── PART II: INCOME ─────────────────────────────────────────────────
    html += `
      <tr class="bgt-section-header-row" style="background:#0f766e;">
        <td colspan="6"><i class="bi bi-plus-circle me-1"></i> PART II : INCOME</td>
      </tr>`;

    html += renderSectionRows(data.income || [], 'inc', viewMode, hideZero);

    // Total Income Row
    const incTotals = calculateSectionTotals(data.income || []);
    html += `
      <tr class="bgt-section-total-row" id="row-tot-inc" style="border-top-color:#0f766e;">
        <td class="text-start">TOTAL INCOME (B)</td>
        <td class="bgt-num" id="tot-inc-prev">${formatINR(incTotals.prevActual)}</td>
        <td class="bgt-num" id="tot-inc-approved" style="font-weight:800; color:#1e40af;">${formatINR(incTotals.approvedBudget)}</td>
        <td class="bgt-num" id="tot-inc-cur">${formatINR(incTotals.currentActual)}</td>
        <td class="bgt-num" id="tot-inc-proposed" style="font-weight:800; color:#166534;">${formatINR(incTotals.proposedBudget)}</td>
        <td class="bgt-num ${incTotals.variance < 0 ? 'text-danger' : 'text-success'}" id="tot-inc-variance">${formatINR(incTotals.variance)}</td>
      </tr>`;

    // ── PART III: SURPLUS / DEFICIT ─────────────────────────────────────
    const netPrev = incTotals.prevActual - expTotals.prevActual;
    const netApproved = incTotals.approvedBudget - expTotals.approvedBudget;
    const netCur = incTotals.currentActual - expTotals.currentActual;
    const netProposed = incTotals.proposedBudget - expTotals.proposedBudget;
    const netVar = netCur - netApproved;

    html += `
      <tr class="bgt-surplus-deficit-row" id="row-net-surplus">
        <td class="text-start">
          <i class="bi bi-pie-chart-fill me-1"></i> ESTIMATED SURPLUS / (DEFICIT) (B − A)
        </td>
        <td class="bgt-num ${netPrev < 0 ? 'bgt-deficit-text' : ''}" id="net-prev">${formatINR(netPrev)}</td>
        <td class="bgt-num ${netApproved < 0 ? 'bgt-deficit-text' : ''}" id="net-approved">${formatINR(netApproved)}</td>
        <td class="bgt-num ${netCur < 0 ? 'bgt-deficit-text' : ''}" id="net-cur">${formatINR(netCur)}</td>
        <td class="bgt-num ${netProposed < 0 ? 'bgt-deficit-text' : ''}" id="net-proposed">${formatINR(netProposed)}</td>
        <td class="bgt-num ${netVar < 0 ? 'text-danger' : 'text-success'}" id="net-variance">${formatINR(netVar)}</td>
      </tr>`;

    tbody.innerHTML = html;
  };

  function renderSectionRows(groups, side, viewMode, hideZero) {
    let out = '';

    groups.forEach(g => {
      const accounts = g.accounts || [];

      const filteredAccounts = accounts.filter(a => {
        if (!hideZero) return true;
        const vals = getAccountValues(a);
        return Math.abs(vals.prevActual) > 0.005 ||
               Math.abs(vals.approvedBudget) > 0.005 ||
               Math.abs(vals.currentActual) > 0.005 ||
               Math.abs(vals.proposedBudget) > 0.005;
      });

      if (hideZero && filteredAccounts.length === 0) {
        return;
      }

      const grpTotals = calculateGroupTotals(filteredAccounts);

      // Group Header Row
      out += `
        <tr class="bgt-group-header-row">
          <td colspan="6"><i class="bi bi-folder2 me-1"></i> ${escHtml(g.groupName || 'General')}</td>
        </tr>`;

      if (viewMode === 'detailed') {
        filteredAccounts.forEach(acc => {
          const vals = getAccountValues(acc);
          const isModified = modifiedBudgets.has(acc.accountId);

          out += `
            <tr class="bgt-acc-row" data-account-id="${acc.accountId}" data-side="${side}">
              <td class="bgt-acc-name">
                <span class="bgt-acc-code">[${escHtml(acc.accCode || '')}]</span>
                ${escHtml(acc.accName || '')}
              </td>
              <td class="bgt-num col-amount">${formatINR(vals.prevActual, true)}</td>
              <td class="text-end">
                <input type="number" step="100" class="bgt-budget-input bgt-input-approved ${isModified ? 'bgt-input-modified' : ''}"
                  data-acc-id="${acc.accountId}" data-field="approvedAmount"
                  value="${vals.approvedBudget ? vals.approvedBudget.toFixed(2) : ''}"
                  placeholder="0.00" onchange="onBudgetInputChange(this)">
              </td>
              <td class="bgt-num col-amount">${formatINR(vals.currentActual, true)}</td>
              <td class="text-end">
                <input type="number" step="100" class="bgt-budget-input bgt-input-proposed ${isModified ? 'bgt-input-modified' : ''}"
                  data-acc-id="${acc.accountId}" data-field="proposedAmount"
                  value="${vals.proposedBudget ? vals.proposedBudget.toFixed(2) : ''}"
                  placeholder="0.00" onchange="onBudgetInputChange(this)">
              </td>
              <td class="bgt-num col-amount ${vals.variance > 0 ? (side === 'exp' ? 'text-danger' : 'text-success') : (side === 'exp' ? 'text-success' : 'text-danger')}">
                ${formatINR(vals.variance, true)}
              </td>
            </tr>`;
        });
      }

      // Group Subtotal Row
      out += `
        <tr class="bgt-group-subtotal-row">
          <td class="text-start" style="padding-left:14px;">Total ${escHtml(g.groupName || '')}</td>
          <td class="bgt-num">${formatINR(grpTotals.prevActual)}</td>
          <td class="bgt-num" style="color:#1e40af;">${formatINR(grpTotals.approvedBudget)}</td>
          <td class="bgt-num">${formatINR(grpTotals.currentActual)}</td>
          <td class="bgt-num" style="color:#166534;">${formatINR(grpTotals.proposedBudget)}</td>
          <td class="bgt-num ${grpTotals.variance > 0 ? (side === 'exp' ? 'text-danger' : 'text-success') : (side === 'exp' ? 'text-success' : 'text-danger')}">
            ${formatINR(grpTotals.variance)}
          </td>
        </tr>`;
    });

    return out;
  }

  function getAccountValues(acc) {
    const mod = modifiedBudgets.get(acc.accountId);
    const approvedBudget = mod && mod.approvedAmount !== undefined ? mod.approvedAmount : (parseFloat(acc.approvedBudget) || 0);
    const proposedBudget = mod && mod.proposedAmount !== undefined ? mod.proposedAmount : (parseFloat(acc.proposedBudget) || 0);
    const prevActual = parseFloat(acc.prevActual) || 0;
    const currentActual = parseFloat(acc.currentActual) || 0;
    const variance = currentActual - approvedBudget;

    return { prevActual, approvedBudget, currentActual, proposedBudget, variance };
  }

  function calculateGroupTotals(accounts) {
    let prevActual = 0, approvedBudget = 0, currentActual = 0, proposedBudget = 0;
    accounts.forEach(a => {
      const v = getAccountValues(a);
      prevActual += v.prevActual;
      approvedBudget += v.approvedBudget;
      currentActual += v.currentActual;
      proposedBudget += v.proposedBudget;
    });
    return {
      prevActual,
      approvedBudget,
      currentActual,
      proposedBudget,
      variance: currentActual - approvedBudget
    };
  }

  function calculateSectionTotals(groups) {
    let prevActual = 0, approvedBudget = 0, currentActual = 0, proposedBudget = 0;
    groups.forEach(g => {
      (g.accounts || []).forEach(a => {
        const v = getAccountValues(a);
        prevActual += v.prevActual;
        approvedBudget += v.approvedBudget;
        currentActual += v.currentActual;
        proposedBudget += v.proposedBudget;
      });
    });
    return {
      prevActual,
      approvedBudget,
      currentActual,
      proposedBudget,
      variance: currentActual - approvedBudget
    };
  }

  // ── 5. INLINE EDITING & REAL-TIME RECALCULATION ─────────────────────────
  window.onBudgetInputChange = function (input) {
    const accId = parseInt(input.dataset.accId, 10);
    const field = input.dataset.field; // 'approvedAmount' or 'proposedAmount'
    const val = parseFloat(input.value) || 0;

    let entry = modifiedBudgets.get(accId);
    if (!entry) {
      const acc = findAccountInReport(accId);
      entry = {
        accountId: accId,
        approvedAmount: parseFloat(acc?.approvedBudget) || 0,
        proposedAmount: parseFloat(acc?.proposedBudget) || 0,
        remarks: acc?.remarks || ''
      };
    }

    entry[field] = val;
    modifiedBudgets.set(accId, entry);

    input.classList.add('bgt-input-modified');

    // Recalculate row variance
    const row = input.closest('tr');
    if (row) {
      const acc = findAccountInReport(accId);
      if (acc) {
        const vals = getAccountValues(acc);
        const varCell = row.cells[5];
        if (varCell) {
          varCell.textContent = formatINR(vals.variance, true);
        }
      }
    }

    recalculateAllTotals();
  };

  function findAccountInReport(accId) {
    if (!currentBudgetReport) return null;
    const all = [...(currentBudgetReport.expenditure || []), ...(currentBudgetReport.income || [])];
    for (const g of all) {
      for (const a of (g.accounts || [])) {
        if (a.accountId === accId) return a;
      }
    }
    return null;
  }

  function recalculateAllTotals() {
    if (!currentBudgetReport) return;

    const expTotals = calculateSectionTotals(currentBudgetReport.expenditure || []);
    const incTotals = calculateSectionTotals(currentBudgetReport.income || []);

    setElText('tot-exp-prev', formatINR(expTotals.prevActual));
    setElText('tot-exp-approved', formatINR(expTotals.approvedBudget));
    setElText('tot-exp-cur', formatINR(expTotals.currentActual));
    setElText('tot-exp-proposed', formatINR(expTotals.proposedBudget));
    setElText('tot-exp-variance', formatINR(expTotals.variance));

    setElText('tot-inc-prev', formatINR(incTotals.prevActual));
    setElText('tot-inc-approved', formatINR(incTotals.approvedBudget));
    setElText('tot-inc-cur', formatINR(incTotals.currentActual));
    setElText('tot-inc-proposed', formatINR(incTotals.proposedBudget));
    setElText('tot-inc-variance', formatINR(incTotals.variance));

    const netPrev = incTotals.prevActual - expTotals.prevActual;
    const netApproved = incTotals.approvedBudget - expTotals.approvedBudget;
    const netCur = incTotals.currentActual - expTotals.currentActual;
    const netProposed = incTotals.proposedBudget - expTotals.proposedBudget;
    const netVar = netCur - netApproved;

    setElText('net-prev', formatINR(netPrev));
    setElText('net-approved', formatINR(netApproved));
    setElText('net-cur', formatINR(netCur));
    setElText('net-proposed', formatINR(netProposed));
    setElText('net-variance', formatINR(netVar));
  }

  function setElText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  // ── 6. SAVE BUDGET ──────────────────────────────────────────────────────
  window.saveBudget = async function () {
    const btn = document.getElementById('btn-save-budget');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Saving...';
    }

    try {
      const storedMap = getStoredBudgetMap(activeSocietyId, activeFyId);
      const items = [];
      const allGroups = [...(currentBudgetReport.expenditure || []), ...(currentBudgetReport.income || [])];

      allGroups.forEach(g => {
        (g.accounts || []).forEach(a => {
          const vals = getAccountValues(a);
          storedMap[a.accountId] = {
            approvedAmount: vals.approvedBudget,
            proposedAmount: vals.proposedBudget,
            remarks: a.remarks || ''
          };
          items.push({
            accountId: a.accountId,
            approvedAmount: vals.approvedBudget,
            proposedAmount: vals.proposedBudget,
            remarks: a.remarks || ''
          });
        });
      });

      // 1. Instant local persistence
      setStoredBudgetMap(activeSocietyId, activeFyId, storedMap);

      // 2. Background sync to backend if endpoint available
      try {
        await API.post('/api/additional-reports/budget/save', {
          societyId: activeSocietyId,
          fyId: activeFyId,
          items
        });
      } catch (beErr) {
        console.warn('Backend budget endpoint sync skipped or pending server restart', beErr);
      }

      modifiedBudgets.clear();
      alert('Budget figures saved successfully!');
      await loadBudgetData();
    } catch (err) {
      console.error('Error saving budget:', err);
      alert('Error saving budget figures.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-floppy2"></i> Save Budget';
      }
    }
  };

  // ── 7. AUTO PROJECTION TOOL ─────────────────────────────────────────────
  window.openAutoProjectModal = function () {
    const modal = document.getElementById('modalAutoProject');
    if (modal) modal.style.display = 'flex';
  };

  window.closeAutoProjectModal = function () {
    const modal = document.getElementById('modalAutoProject');
    if (modal) modal.style.display = 'none';
  };

  window.applyAutoProjection = function () {
    const srcCol = document.getElementById('proj-source-col')?.value || 'currentActual';
    const pct = parseFloat(document.getElementById('proj-percentage')?.value) || 0;
    const target = document.getElementById('proj-apply-target')?.value || 'both';

    const multiplier = 1 + (pct / 100);

    const sections = [];
    if (target === 'both' || target === 'expenditure') sections.push(...(currentBudgetReport.expenditure || []));
    if (target === 'both' || target === 'income') sections.push(...(currentBudgetReport.income || []));

    let count = 0;
    sections.forEach(g => {
      (g.accounts || []).forEach(a => {
        let baseVal = 0;
        if (srcCol === 'currentActual') baseVal = parseFloat(a.currentActual) || 0;
        else if (srcCol === 'approvedBudget') baseVal = parseFloat(a.approvedBudget) || 0;
        else if (srcCol === 'prevActual') baseVal = parseFloat(a.prevActual) || 0;

        if (baseVal > 0) {
          const projected = Math.round(baseVal * multiplier);
          let entry = modifiedBudgets.get(a.accountId);
          if (!entry) {
            entry = {
              accountId: a.accountId,
              approvedAmount: parseFloat(a.approvedBudget) || 0,
              proposedAmount: projected,
              remarks: a.remarks || ''
            };
          } else {
            entry.proposedAmount = projected;
          }
          modifiedBudgets.set(a.accountId, entry);
          count++;
        }
      });
    });

    closeAutoProjectModal();
    renderBudgetView();
    alert(`Applied ${pct}% projection to ${count} account heads! Click "Save Budget" to store the changes.`);
  };

  // ── 8. PRINT & EXCEL EXPORT ─────────────────────────────────────────────
  window.printReport = function () {
    window.print();
  };

  window.exportToExcel = function () {
    if (!currentBudgetReport) {
      alert('Please wait for the Budget Report to load before exporting.');
      return;
    }

    if (typeof XLSX === 'undefined') {
      alert('Excel export library is loading. Please try again.');
      return;
    }

    const soc = currentBudgetReport.society || {};
    const socName = (window.Auth && typeof Auth.getSocietyName === 'function') ? Auth.getSocietyName() : (soc.societyName || 'CO-OPERATIVE HOUSING SOCIETY LTD.');
    const p = currentBudgetReport.period || {};
    const periodDisplay = `${p.fromDisplay || p.fromDate || ''} To ${p.toDisplay || p.toDate || ''}`;

    const wsData = [];

    // Header Rows
    wsData.push([socName]);
    wsData.push([`Registration No: ${soc.registrationNo || '—'} | Address: ${soc.address || ''} ${soc.city || ''}`.trim()]);
    wsData.push([`BUDGET ESTIMATE STATEMENT (INCOME & EXPENDITURE) FOR ${p.fyLabel || 'FY'}`]);
    wsData.push([`Period: ${periodDisplay}`]);
    wsData.push([]); // blank

    // Column Headers
    const prevHead = `Actuals (${p.prevFyLabel || 'Prev FY'}) (₹)`;
    const appHead  = `Approved Budget (${p.fyLabel || 'Current FY'}) (₹)`;
    const curHead  = `Actuals (${p.fyLabel || 'Current FY'}) (₹)`;
    const propHead = `Proposed Budget (${p.nextFyLabel || 'Next FY'}) (₹)`;

    wsData.push([
      'Particulars / Account Head',
      prevHead,
      appHead,
      curHead,
      propHead,
      'Variance (Actual − Budget) (₹)'
    ]);

    // EXPENDITURE SECTION
    wsData.push(['PART I : EXPENDITURE', '', '', '', '', '']);
    (currentBudgetReport.expenditure || []).forEach(g => {
      wsData.push([g.groupName || 'General', '', '', '', '', '']);
      (g.accounts || []).forEach(a => {
        const vals = getAccountValues(a);
        wsData.push([
          `    [${a.accCode || ''}] ${a.accName || ''}`,
          vals.prevActual || 0,
          vals.approvedBudget || 0,
          vals.currentActual || 0,
          vals.proposedBudget || 0,
          vals.variance || 0
        ]);
      });
      const gt = calculateGroupTotals(g.accounts || []);
      wsData.push([
        `Total ${g.groupName || ''}`,
        gt.prevActual || 0,
        gt.approvedBudget || 0,
        gt.currentActual || 0,
        gt.proposedBudget || 0,
        gt.variance || 0
      ]);
    });

    const expTot = calculateSectionTotals(currentBudgetReport.expenditure || []);
    wsData.push([
      'TOTAL EXPENDITURE (A)',
      expTot.prevActual || 0,
      expTot.approvedBudget || 0,
      expTot.currentActual || 0,
      expTot.proposedBudget || 0,
      expTot.variance || 0
    ]);
    wsData.push([]); // blank

    // INCOME SECTION
    wsData.push(['PART II : INCOME', '', '', '', '', '']);
    (currentBudgetReport.income || []).forEach(g => {
      wsData.push([g.groupName || 'General', '', '', '', '', '']);
      (g.accounts || []).forEach(a => {
        const vals = getAccountValues(a);
        wsData.push([
          `    [${a.accCode || ''}] ${a.accName || ''}`,
          vals.prevActual || 0,
          vals.approvedBudget || 0,
          vals.currentActual || 0,
          vals.proposedBudget || 0,
          vals.variance || 0
        ]);
      });
      const gt = calculateGroupTotals(g.accounts || []);
      wsData.push([
        `Total ${g.groupName || ''}`,
        gt.prevActual || 0,
        gt.approvedBudget || 0,
        gt.currentActual || 0,
        gt.proposedBudget || 0,
        gt.variance || 0
      ]);
    });

    const incTot = calculateSectionTotals(currentBudgetReport.income || []);
    wsData.push([
      'TOTAL INCOME (B)',
      incTot.prevActual || 0,
      incTot.approvedBudget || 0,
      incTot.currentActual || 0,
      incTot.proposedBudget || 0,
      incTot.variance || 0
    ]);
    wsData.push([]); // blank

    // SURPLUS / DEFICIT
    wsData.push([
      'ESTIMATED SURPLUS / (DEFICIT) (B − A)',
      (incTot.prevActual - expTot.prevActual) || 0,
      (incTot.approvedBudget - expTot.approvedBudget) || 0,
      (incTot.currentActual - expTot.currentActual) || 0,
      (incTot.proposedBudget - expTot.proposedBudget) || 0,
      ((incTot.currentActual - expTot.currentActual) - (incTot.approvedBudget - expTot.approvedBudget)) || 0
    ]);

    // Signatures
    wsData.push([]);
    wsData.push([`For ${socName}`]);
    wsData.push([]);
    wsData.push(['SECRETARY', '', 'CHAIRMAN', '', 'TREASURER', '']);

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
      { wch: 42 }, // Particulars
      { wch: 18 }, // Prev Actual
      { wch: 22 }, // Approved Budget
      { wch: 18 }, // Cur Actual
      { wch: 22 }, // Proposed Budget
      { wch: 22 }  // Variance
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Budget Report');

    const cleanSoc = socName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    const dateStr = (p.toDate || '31-03').replace(/[^0-9-]/g, '');
    XLSX.writeFile(wb, `${cleanSoc}_Budget_Report_${dateStr}.xlsx`);
  };

  // ── UTILITIES ───────────────────────────────────────────────────────────
  function formatINR(val, zeroAsBlank = false) {
    const num = parseFloat(val);
    if (isNaN(num) || Math.abs(num) < 0.005) {
      return zeroAsBlank ? '' : '0.00';
    }
    return num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
