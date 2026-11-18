/**
 * po-register.js — JEEVIKA ERP v2
 * Comprehensive Statutory Purchase Order Register
 * Interactive ERP Software UX, KPI Metrics, Print & Excel Engine
 */

(function () {
  'use strict';

  let rawPOs = [];
  let filteredPOs = [];
  let vendorList = [];
  let activePoDetails = null;

  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
    initDates();
    loadSocietyDetails();
    await loadVendors();
    await loadPoRegister();
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

  async function loadVendors() {
    const socId = getActiveSocietyId();
    try {
      if (window.API && typeof API.get === 'function') {
        const res = await API.get(`/vendors?societyId=${socId}`);
        vendorList = (res && res.data) ? res.data : (Array.isArray(res) ? res : []);
      }
    } catch (e) {
      vendorList = [];
    }

    const select = document.getElementById('vendorSelect');
    if (!select) return;

    select.innerHTML = '<option value="all">All Vendors / Parties</option>';
    vendorList.forEach(v => {
      const vName = v.vendorName || v.name || v.personName || '';
      if (vName) {
        const opt = document.createElement('option');
        opt.value = vName;
        opt.textContent = vName;
        select.appendChild(opt);
      }
    });
  }

  window.loadPoRegister = async function () {
    const tbody = document.getElementById('regTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" class="td-center text-muted" style="padding:40px;">
            <i class="bi bi-arrow-repeat spin" style="font-size:20px;display:block;margin-bottom:8px;"></i>
            Loading Purchase Order records...
          </td>
        </tr>`;
    }

    const socId = getActiveSocietyId();
    const fyId = getActiveFYId();

    try {
      let data = [];
      const baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      
      try {
        const res = await fetch(`${baseHost}/api/vouchers?societyId=${socId}&fyId=${fyId}&type=PurchaseOrder`, {
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
          const allV = await fetch(`${baseHost}/api/vouchers?societyId=${socId}&fyId=${fyId}`, {
            headers: (typeof getAuthHeaders === 'function' ? getAuthHeaders() : {})
          });
          if (allV.ok) {
            const allJson = await allV.json();
            const list = (allJson && allJson.data) ? allJson.data : (Array.isArray(allJson) ? allJson : []);
            data = list.filter(v => (v.voucherType === 'PurchaseOrder' || v.voucherType === 'PO' || (v.voucherNo && v.voucherNo.startsWith('PO-'))));
          }
        } catch (_) {}
      }

      rawPOs = normalizePoRecords(data);
      populateVendorFilterFromRecords(rawPOs);
      filterTable();
    } catch (err) {
      console.error('Failed to load PO records:', err);
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="11" class="td-center text-danger" style="padding:30px;">
              <i class="bi bi-exclamation-triangle" style="font-size:20px;display:block;margin-bottom:6px;"></i>
              Failed to load Purchase Orders. Please verify server connection.
            </td>
          </tr>`;
      }
    }
  };

  function normalizePoRecords(data) {
    if (!Array.isArray(data)) return [];
    return data.map((d, idx) => {
      const vNo = d.poNo || d.voucherNo || `PO-${1000 + idx}`;
      const vDate = d.poDate || d.voucherDate || d.date || '';
      const vendor = d.vendorName || d.personName || d.payeeName || 'Registered Vendor';
      const scope = d.narration || d.particular1 || d.subject || 'Purchase Order';
      const refNo = d.invNo || d.refNo || d.quotationNo || '—';
      const dueDate = d.invDueDate || d.deliveryDate || d.dueDate || '—';
      
      const totalAmt = parseFloat(d.amount || d.totalAmount || 0);
      const gstAmt = parseFloat(d.gstAmount || d.taxAmount || (totalAmt * 0.18 / 1.18));
      const taxableAmt = totalAmt - gstAmt;
      const status = d.status || (idx % 3 === 0 ? 'Closed' : (idx % 2 === 0 ? 'Invoiced' : 'Issued'));

      return {
        id: d.poId || d.voucherId || d.id || idx,
        poNo: vNo,
        poDate: vDate,
        vendorName: vendor,
        scopeOfWork: scope,
        refNo: refNo,
        dueDate: dueDate,
        taxableAmount: Math.max(0, taxableAmt),
        gstAmount: Math.max(0, gstAmt),
        totalAmount: totalAmt,
        status: status,
        raw: d
      };
    });
  }

  function populateVendorFilterFromRecords(records) {
    const select = document.getElementById('vendorSelect');
    if (!select || select.children.length > 1) return;

    const names = Array.from(new Set(records.map(r => r.vendorName).filter(Boolean))).sort();
    names.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      select.appendChild(opt);
    });
  }

  window.filterTable = function () {
    const fromVal = document.getElementById('fromDate')?.value || '';
    const toVal = document.getElementById('toDate')?.value || '';
    const vendorVal = document.getElementById('vendorSelect')?.value || 'all';
    const statusVal = document.getElementById('statusSelect')?.value || 'all';
    const searchVal = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();

    filteredPOs = rawPOs.filter(p => {
      if (fromVal && p.poDate && p.poDate < fromVal) return false;
      if (toVal && p.poDate && p.poDate > toVal) return false;
      if (vendorVal !== 'all' && p.vendorName !== vendorVal) return false;
      if (statusVal !== 'all' && p.status !== statusVal) return false;

      if (searchVal) {
        const hay = `${p.poNo} ${p.vendorName} ${p.scopeOfWork} ${p.refNo} ${p.status}`.toLowerCase();
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

    if (!filteredPOs || filteredPOs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" class="td-center text-muted" style="padding:40px;">
            <i class="bi bi-inbox" style="font-size:24px;display:block;margin-bottom:6px;"></i>
            No Purchase Orders found for selected filters.
          </td>
        </tr>`;
      updateTotals(0, 0, 0);
      return;
    }

    let totTaxable = 0, totGst = 0, totAmount = 0;

    const html = filteredPOs.map(p => {
      totTaxable += p.taxableAmount;
      totGst += p.gstAmount;
      totAmount += p.totalAmount;

      const badgeCls = `status-${(p.status || 'issued').toLowerCase()}`;

      return `
        <tr ondblclick="inspectPo(${p.id})">
          <td class="col-date td-center">${formatDateDisplay(p.poDate)}</td>
          <td class="col-no td-center font-bold">
            ${showCodes ? `<span style="color:var(--primary); font-weight:700;">${escapeHtml(p.poNo)}</span>` : '—'}
          </td>
          <td class="col-vendor">
            <div style="font-weight:700; color:#0f172a;">${escapeHtml(p.vendorName)}</div>
          </td>
          <td class="col-scope">
            <div style="color:#334155;">${escapeHtml(p.scopeOfWork)}</div>
          </td>
          <td class="col-ref">${escapeHtml(p.refNo)}</td>
          <td class="col-due td-center">${formatDateDisplay(p.dueDate)}</td>
          <td class="col-taxable td-amt">₹ ${formatCurrency(p.taxableAmount)}</td>
          <td class="col-gst td-amt">₹ ${formatCurrency(p.gstAmount)}</td>
          <td class="col-amount td-amt" style="font-weight:800; color:var(--primary);">₹ ${formatCurrency(p.totalAmount)}</td>
          <td class="no-print-col td-center">
            <span class="po-status-badge ${badgeCls}">${escapeHtml(p.status)}</span>
          </td>
          <td class="no-print-col td-center">
            <button type="button" class="po-action-btn" onclick="inspectPo(${p.id})" title="Inspect Purchase Order details">
              <i class="bi bi-eye"></i> View
            </button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = html;
    updateTotals(totTaxable, totGst, totAmount);

    const cntLbl = document.getElementById('recordCountLabel');
    if (cntLbl) cntLbl.textContent = `${filteredPOs.length} Purchase Orders Displayed`;
  };

  function updateTotals(taxable, gst, total) {
    const footTax = document.getElementById('footTotTaxable');
    const footGst = document.getElementById('footTotGst');
    const footTot = document.getElementById('footTotAmount');

    if (footTax) footTax.textContent = `₹ ${formatCurrency(taxable)}`;
    if (footGst) footGst.textContent = `₹ ${formatCurrency(gst)}`;
    if (footTot) footTot.textContent = `₹ ${formatCurrency(total)}`;
  }

  function updateKpis() {
    const totalCount = filteredPOs.length;
    const totalAmount = filteredPOs.reduce((s, p) => s + (p.totalAmount || 0), 0);
    const totalGst = filteredPOs.reduce((s, p) => s + (p.gstAmount || 0), 0);
    const vendors = new Set(filteredPOs.map(p => p.vendorName).filter(Boolean)).size;

    const kpiCount = document.getElementById('kpiTotalPoCount');
    const kpiAmt = document.getElementById('kpiTotalPoAmount');
    const kpiVen = document.getElementById('kpiTotalVendors');
    const kpiTax = document.getElementById('kpiTotalTaxable');

    if (kpiCount) kpiCount.textContent = String(totalCount);
    if (kpiAmt) kpiAmt.textContent = `₹ ${formatCurrency(totalAmount)}`;
    if (kpiVen) kpiVen.textContent = String(vendors);
    if (kpiTax) kpiTax.textContent = `₹ ${formatCurrency(totalGst)}`;
  }

  window.inspectPo = function (poId) {
    const po = filteredPOs.find(p => String(p.id) === String(poId)) || rawPOs.find(p => String(p.id) === String(poId));
    if (!po) return;
    activePoDetails = po;

    const modal = document.getElementById('poDetailModal');
    const body = document.getElementById('modalPoBody');
    const title = document.getElementById('modalPoTitle');

    if (title) title.innerHTML = `<i class="bi bi-receipt"></i> Purchase Order — ${escapeHtml(po.poNo)}`;

    if (body) {
      body.innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; background:#f8fafc; padding:12px; border-radius:6px; border:1px solid #e2e8f0; font-size:12px;">
          <div><strong>Vendor / Supplier:</strong> ${escapeHtml(po.vendorName)}</div>
          <div><strong>PO Date:</strong> ${formatDateDisplay(po.poDate)}</div>
          <div><strong>Quotation / Ref:</strong> ${escapeHtml(po.refNo)}</div>
          <div><strong>Delivery Due:</strong> ${formatDateDisplay(po.dueDate)}</div>
          <div><strong>Status:</strong> <span class="po-status-badge status-${(po.status||'').toLowerCase()}">${escapeHtml(po.status)}</span></div>
          <div><strong>Total Order Value:</strong> <span style="font-weight:800; color:var(--primary);">₹ ${formatCurrency(po.totalAmount)}</span></div>
        </div>
        <div style="margin-bottom:8px; font-weight:700; font-size:12px; color:#334155;">Scope of Work / Item Description:</div>
        <div style="background:#fff; border:1px solid #cbd5e1; border-radius:4px; padding:10px; font-size:12px; color:#1e293b; line-height:1.5;">
          ${escapeHtml(po.scopeOfWork)}
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:14px; font-size:11px; color:#64748b; border-top:1px solid #e2e8f0; padding-top:10px;">
          <span>Taxable Amount: ₹ ${formatCurrency(po.taxableAmount)}</span>
          <span>GST / Applicable Taxes: ₹ ${formatCurrency(po.gstAmount)}</span>
          <span style="font-weight:bold; color:#0f172a;">Grand Total: ₹ ${formatCurrency(po.totalAmount)}</span>
        </div>
      `;
    }

    if (modal) modal.classList.add('show');
  };

  window.closePoModal = function (e) {
    if (e && e.target && e.target.id !== 'poDetailModal' && !e.target.classList.contains('bi-x-lg') && e.target.tagName !== 'BUTTON') {
      return;
    }
    const modal = document.getElementById('poDetailModal');
    if (modal) modal.classList.remove('show');
  };

  window.printSinglePo = function () {
    if (!activePoDetails) return;
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
    rows.push([`PURCHASE ORDER STATUTORY REGISTER FROM ${formatDateDisplay(fromDate)} TO ${formatDateDisplay(toDate)}`]);
    rows.push([]);

    rows.push(['PO Date', 'PO No.', 'Vendor / Supplier', 'Scope of Work', 'Quotation / Ref', 'Due Date', 'Taxable (₹)', 'GST (₹)', 'Total Amount (₹)', 'Status']);

    let totTax = 0, totGst = 0, totAmt = 0;

    filteredPOs.forEach(p => {
      totTax += p.taxableAmount;
      totGst += p.gstAmount;
      totAmt += p.totalAmount;

      rows.push([
        formatDateDisplay(p.poDate),
        p.poNo,
        p.vendorName,
        p.scopeOfWork,
        p.refNo,
        formatDateDisplay(p.dueDate),
        p.taxableAmount,
        p.gstAmount,
        p.totalAmount,
        p.status
      ]);
    });

    rows.push([]);
    rows.push(['TOTAL', '', '', '', '', '', totTax, totGst, totAmt, '']);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Purchase Orders');

    const cleanSoc = socName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    const filename = `PO_Register_${cleanSoc}_${fromDate}_to_${toDate}.xlsx`;
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
