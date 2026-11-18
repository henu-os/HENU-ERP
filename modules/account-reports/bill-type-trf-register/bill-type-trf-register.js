/**
 * bill-type-trf-register.js — JEEVIKA ERP v2
 * Comprehensive Statutory Bill Type Transfer Register
 * Interactive ERP Software UX, KPI Metrics, Print & Excel Engine
 */

(function () {
  'use strict';

  let rawTransfers = [];
  let filteredTransfers = [];
  let billTypes = [];
  let activeTrfDetails = null;

  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
    initDates();
    loadSocietyDetails();
    await loadBillTypes();
    await loadTrfRegister();
  });

  let societyDetails = {
    societyName: '',
    registrationNo: '',
    city: 'Mumbai'
  };

  function getActiveSocietyId() {
    return (window.Auth && Auth.getSocietyId) ? Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || 1);
  }

  function getActiveFYId() {
    return (window.Auth && Auth.getFYId) ? Auth.getFYId() : (sessionStorage.getItem('activeFYId') || 1);
  }

  async function loadSocietyDetails() {
    const socId = getActiveSocietyId();
    try {
      if (window.API && typeof API.get === 'function') {
        const res = await API.get(`/societies/${socId}`);
        if (res && res.data) {
          societyDetails = { ...societyDetails, ...res.data };
        } else if (res && res.societyName) {
          societyDetails = { ...societyDetails, ...res };
        }
      }
    } catch (e) {
      console.warn('Could not fetch full society details:', e);
    }

    if (!societyDetails.societyName || societyDetails.societyName === '—') {
      societyDetails.societyName = (window.Auth && Auth.getSocietyName && Auth.getSocietyName() !== '—')
        ? Auth.getSocietyName()
        : (sessionStorage.getItem('activeSocietyName') || 'SHREE SAI CO-OP. HOUSING SOCIETY LTD.');
    }
    if (!societyDetails.registrationNo) {
      societyDetails.registrationNo = sessionStorage.getItem('activeSocietyRegNo') || 'BOM/HSG/0000';
    }

    const prtSoc = document.getElementById('prtSocName');
    if (prtSoc) prtSoc.textContent = societyDetails.societyName;
    const prtSub = document.getElementById('prtSocSub');
    if (prtSub) prtSub.textContent = `Registration No: ${societyDetails.registrationNo} | ${societyDetails.city || 'Mumbai'}`;
  }

  function initDates() {
    let fyLabel = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2026-27');
    const parts = fyLabel.split('-');
    let startYear = parseInt(parts[0], 10) || 2026;
    if (startYear < 2000) startYear += 2000;
    const endYear = startYear + 1;

    window._fyStartDate = `${startYear}-04-01`;
    window._fyEndDate = `${endYear}-03-31`;

    const fromEl = document.getElementById('fromDate');
    const toEl = document.getElementById('toDate');
    if (fromEl) fromEl.value = window._fyStartDate;
    if (toEl) toEl.value = window._fyEndDate;

    updatePrintDates();
  }

  function updatePrintDates() {
    const fromEl = document.getElementById('fromDate');
    const toEl = document.getElementById('toDate');
    const prtFrom = document.getElementById('prtFromDate');
    const prtTo = document.getElementById('prtToDate');

    if (prtFrom && fromEl) prtFrom.textContent = formatDateDisplay(fromEl.value);
    if (prtTo && toEl) prtTo.textContent = formatDateDisplay(toEl.value);
  }

  window.onDateChange = function () {
    updatePrintDates();
    filterTable();
  };

  async function loadBillTypes() {
    const socId = getActiveSocietyId();
    try {
      if (window.API && typeof API.get === 'function') {
        const res = await API.get(`/bill-types?societyId=${socId}`);
        billTypes = (res && res.data) ? res.data : (Array.isArray(res) ? res : []);
      }
    } catch (e) {
      billTypes = [];
    }

    const select = document.getElementById('billTypeSelect');
    if (!select) return;

    select.innerHTML = '<option value="all">All Bill Heads</option>';
    const defaultHeads = ['Maintenance', 'Sinking Fund', 'Repair Fund', 'Water Charges', 'Non-Occupancy', 'Parking Charges', 'Interest'];
    
    const uniqueHeads = Array.from(new Set([
      ...defaultHeads,
      ...billTypes.map(b => b.billTypeName || b.name).filter(Boolean)
    ]));

    uniqueHeads.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h;
      opt.textContent = h;
      select.appendChild(opt);
    });
  }

  window.loadTrfRegister = async function () {
    const tbody = document.getElementById('regTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="td-center text-muted" style="padding:40px;">
            <i class="bi bi-arrow-repeat spin" style="font-size:20px;display:block;margin-bottom:8px;"></i>
            Loading Bill Type Transfer records...
          </td>
        </tr>`;
    }

    const socId = getActiveSocietyId();
    const fyId = getActiveFYId();

    try {
      let data = [];
      const baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      
      try {
        const res = await fetch(`${baseHost}/api/member-bill-type-transfers?societyId=${socId}&fyId=${fyId}`, {
          headers: (typeof getAuthHeaders === 'function' ? getAuthHeaders() : {})
        });
        if (res.ok) {
          const json = await res.json();
          data = (json && json.data) ? json.data : (Array.isArray(json) ? json : []);
        }
      } catch (_) {}

      // Fallback if empty or mock
      if (!data || data.length === 0) {
        try {
          const allV = await fetch(`${baseHost}/api/vouchers?societyId=${socId}&fyId=${fyId}&type=MemberBillTypeTransfer`, {
            headers: (typeof getAuthHeaders === 'function' ? getAuthHeaders() : {})
          });
          if (allV.ok) {
            const allJson = await allV.json();
            data = (allJson && allJson.data) ? allJson.data : (Array.isArray(allJson) ? allJson : []);
          }
        } catch (_) {}
      }

      rawTransfers = normalizeTrfRecords(data);
      filterTable();
    } catch (err) {
      console.error('Failed to load Transfer records:', err);
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="td-center text-danger" style="padding:30px;">
              <i class="bi bi-exclamation-triangle" style="font-size:20px;display:block;margin-bottom:6px;"></i>
              Failed to load transfers. Please verify server connection.
            </td>
          </tr>`;
      }
    }
  };

  function normalizeTrfRecords(data) {
    if (!Array.isArray(data)) return [];
    return data.map((d, idx) => {
      const vNo = d.trfNo || d.voucherNo || `TRF-${1000 + idx}`;
      const vDate = d.trfDate || d.transferDate || d.voucherDate || d.date || '';
      const memName = d.memberName || d.memName || d.member1Name || 'Society Member';
      const flat = d.flatNo || d.member1Flat || d.unitNo || '—';
      const mCode = d.memberCode || d.member1Code || '';
      
      const fromHead = d.leftBillType || d.fromBillType || d.sourceBillType || 'Maintenance';
      const toHead = d.rightBillType || d.toBillType || d.targetBillType || 'Sinking Fund';
      const totAmt = parseFloat(d.amount || d.totalAmount || 0);
      const note = d.particular1 || d.narration || 'Internal Bill Type Transfer';

      return {
        id: d.trfId || d.voucherId || d.id || idx,
        trfNo: vNo,
        trfDate: vDate,
        memberName: memName,
        flatNo: flat,
        memberCode: mCode,
        fromHead: fromHead,
        toHead: toHead,
        amount: totAmt,
        narration: note,
        raw: d
      };
    });
  }

  window.filterTable = function () {
    const fromVal = document.getElementById('fromDate')?.value || '';
    const toVal = document.getElementById('toDate')?.value || '';
    const headVal = document.getElementById('billTypeSelect')?.value || 'all';
    const searchVal = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();

    filteredTransfers = rawTransfers.filter(t => {
      if (fromVal && t.trfDate && t.trfDate < fromVal) return false;
      if (toVal && t.trfDate && t.trfDate > toVal) return false;
      if (headVal !== 'all' && t.fromHead !== headVal && t.toHead !== headVal) return false;

      if (searchVal) {
        const hay = `${t.trfNo} ${t.memberName} ${t.flatNo} ${t.memberCode} ${t.fromHead} ${t.toHead} ${t.narration}`.toLowerCase();
        if (!hay.includes(searchVal)) return false;
      }
      return true;
    });

    renderRegisterView();
    updateKpis();
  };

  window.renderRegisterView = function () {
    const tbody = document.getElementById('regTableBody');
    if (!tbody) return;

    const showCodes = document.getElementById('chk-voucher-no')?.checked ?? true;

    if (!filteredTransfers || filteredTransfers.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="td-center text-muted" style="padding:40px;">
            <i class="bi bi-inbox" style="font-size:24px;display:block;margin-bottom:6px;"></i>
            No Bill Type Transfers found for selected filters.
          </td>
        </tr>`;
      updateTotals(0);
      return;
    }

    let totAmount = 0;

    const html = filteredTransfers.map(t => {
      totAmount += t.amount;

      return `
        <tr ondblclick="inspectTrf(${t.id})" title="Double-click to inspect transfer details" style="cursor:pointer;">
          <td class="col-trf-date td-center">${formatDateDisplay(t.trfDate)}</td>
          <td class="col-trf-no td-center font-bold">
            ${showCodes ? `<span style="color:var(--primary); font-weight:700;">${escapeHtml(t.trfNo)}</span>` : '—'}
          </td>
          <td class="col-trf-flat td-center font-bold" style="color:#0f172a;">${escapeHtml(t.flatNo)}</td>
          <td class="col-trf-name">
            <div style="font-weight:700; color:#0f172a;">${escapeHtml(t.memberName)}</div>
            ${(showCodes && t.memberCode) ? `<div style="font-size:10px; color:#64748b;">Code: ${escapeHtml(t.memberCode)}</div>` : ''}
          </td>
          <td class="col-trf-from">
            <span class="trf-head-pill head-source"><i class="bi bi-dash-circle"></i> ${escapeHtml(t.fromHead)}</span>
          </td>
          <td class="col-trf-to">
            <span class="trf-head-pill head-dest"><i class="bi bi-plus-circle"></i> ${escapeHtml(t.toHead)}</span>
          </td>
          <td class="col-trf-amount td-amt" style="font-weight:800; color:var(--primary);">₹ ${formatCurrency(t.amount)}</td>
          <td class="col-trf-note">
            <div style="color:#334155;">${escapeHtml(t.narration)}</div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = html;
    updateTotals(totAmount);

    const cntLbl = document.getElementById('recordCountLabel');
    if (cntLbl) cntLbl.textContent = `${filteredTransfers.length} Transfers Displayed`;
  };

  function updateTotals(total) {
    const footTot = document.getElementById('footTotAmount');
    if (footTot) footTot.textContent = `₹ ${formatCurrency(total)}`;
  }

  function updateKpis() {
    const totalCount = filteredTransfers.length;
    const totalAmount = filteredTransfers.reduce((s, t) => s + (t.amount || 0), 0);
    const members = new Set(filteredTransfers.map(t => t.memberName).filter(Boolean)).size;

    // Calculate top source head
    const headCounts = {};
    filteredTransfers.forEach(t => {
      headCounts[t.fromHead] = (headCounts[t.fromHead] || 0) + 1;
    });
    let topHead = '—';
    let maxCnt = 0;
    Object.keys(headCounts).forEach(h => {
      if (headCounts[h] > maxCnt) {
        maxCnt = headCounts[h];
        topHead = h;
      }
    });

    const kpiCount = document.getElementById('kpiTotalTrfCount');
    const kpiAmt = document.getElementById('kpiTotalTrfAmount');
    const kpiMem = document.getElementById('kpiTotalMembers');
    const kpiHead = document.getElementById('kpiTopHead');

    if (kpiCount) kpiCount.textContent = String(totalCount);
    if (kpiAmt) kpiAmt.textContent = `₹ ${formatCurrency(totalAmount)}`;
    if (kpiMem) kpiMem.textContent = String(members);
    if (kpiHead) kpiHead.textContent = topHead;
  }

  window.inspectTrf = function (trfId) {
    const trf = filteredTransfers.find(t => String(t.id) === String(trfId)) || rawTransfers.find(t => String(t.id) === String(trfId));
    if (!trf) return;
    activeTrfDetails = trf;

    const modal = document.getElementById('trfDetailModal');
    const body = document.getElementById('modalTrfBody');
    const title = document.getElementById('modalTrfTitle');

    if (title) title.innerHTML = `<i class="bi bi-arrow-left-right"></i> Transfer Voucher — ${escapeHtml(trf.trfNo)}`;

    if (body) {
      body.innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; background:#f8fafc; padding:12px; border-radius:6px; border:1px solid #e2e8f0; font-size:12px;">
          <div><strong>Member Name:</strong> ${escapeHtml(trf.memberName)}</div>
          <div><strong>Flat / Unit:</strong> ${escapeHtml(trf.flatNo)}</div>
          <div><strong>Transfer Date:</strong> ${formatDateDisplay(trf.trfDate)}</div>
          <div><strong>TRF No:</strong> ${escapeHtml(trf.trfNo)}</div>
          <div><strong>Transferred Amount:</strong> <span style="font-weight:800; color:var(--primary);">₹ ${formatCurrency(trf.amount)}</span></div>
          <div><strong>Status:</strong> <span style="color:#047857; font-weight:700;">Posted &amp; Reconciled</span></div>
        </div>
        
        <div style="display:flex; align-items:center; justify-content:space-around; background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:14px; margin-bottom:12px;">
          <div style="text-align:center;">
            <div style="font-size:10px; color:#64748b; font-weight:600; text-transform:uppercase;">Source Head (Debit)</div>
            <span class="trf-head-pill head-source" style="font-size:12px; padding:4px 10px; margin-top:4px;">${escapeHtml(trf.fromHead)}</span>
          </div>
          <div style="font-size:20px; color:#2563eb;"><i class="bi bi-arrow-right-circle-fill"></i></div>
          <div style="text-align:center;">
            <div style="font-size:10px; color:#64748b; font-weight:600; text-transform:uppercase;">Target Head (Credit)</div>
            <span class="trf-head-pill head-dest" style="font-size:12px; padding:4px 10px; margin-top:4px;">${escapeHtml(t.toHead || trf.toHead)}</span>
          </div>
        </div>

        <div style="margin-bottom:6px; font-weight:700; font-size:12px; color:#334155;">Narration / Approval Reason:</div>
        <div style="background:#fff; border:1px solid #cbd5e1; border-radius:4px; padding:10px; font-size:12px; color:#1e293b; line-height:1.5;">
          ${escapeHtml(trf.narration)}
        </div>
      `;
    }

    if (modal) modal.classList.add('show');
  };

  window.closeTrfModal = function (e) {
    if (e && e.target && e.target.id !== 'trfDetailModal' && !e.target.classList.contains('bi-x-lg') && e.target.tagName !== 'BUTTON') {
      return;
    }
    const modal = document.getElementById('trfDetailModal');
    if (modal) modal.classList.remove('show');
  };

  window.printSingleTrf = function () {
    if (!activeTrfDetails) return;
    window.print();
  };

  window.toggleSummaryPopover = function (e) {
    if (e) e.stopPropagation();
    const pop = document.getElementById('summaryPopover');
    if (pop) pop.classList.toggle('show');
  };

  document.addEventListener('click', (e) => {
    const pop = document.getElementById('summaryPopover');
    const btn = document.getElementById('btnSummaryToggle');
    if (pop && btn && !pop.contains(e.target) && !btn.contains(e.target)) {
      pop.classList.remove('show');
    }
  });

  window.printRegister = function () {
    window.print();
  };

  window.exportToExcel = function () {
    if (typeof XLSX === 'undefined') {
      alert('Excel export library is loading. Please try again in a few seconds.');
      return;
    }

    const socName = societyDetails.societyName || 'SOCIETY';
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';

    const rows = [];
    rows.push([socName]);
    rows.push([`MEMBER BILL TYPE TRANSFER REGISTER FROM ${formatDateDisplay(fromDate)} TO ${formatDateDisplay(toDate)}`]);
    rows.push([]);

    rows.push(['Date', 'TRF No.', 'Flat / Unit', 'Member Name', 'Member Code', 'Source Head (From)', 'Target Head (To)', 'Amount (₹)', 'Narration']);

    let totAmt = 0;

    filteredTransfers.forEach(t => {
      totAmt += t.amount;

      rows.push([
        formatDateDisplay(t.trfDate),
        t.trfNo,
        t.flatNo,
        t.memberName,
        t.memberCode,
        t.fromHead,
        t.toHead,
        t.amount,
        t.narration
      ]);
    });

    rows.push([]);
    rows.push(['TOTAL', '', '', '', '', '', '', totAmt, '']);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transfers');

    const cleanSoc = socName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    const filename = `Bill_Type_Transfer_Register_${cleanSoc}_${fromDate}_to_${toDate}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  function formatDateDisplay(dStr) {
    if (!dStr || dStr === '—') return '—';
    try {
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return dStr;
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) {
      return dStr;
    }
  }

  function formatCurrency(num) {
    if (isNaN(num)) return '0.00';
    return Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
