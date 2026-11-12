/**
 * bill-type-trf-register.js — Member Bill Type TRF Register Engine (Landscape A4)
 * Architecture: Real ERP Backend Data + Active Published HENU OS DESIGN + Print/PDF Support
 */

(function () {
  'use strict';

  const REPORT_KEY = 'bill-type-trf-register';
  let activeDesign = null;
  let currentReportData = null;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    initDateFilters();
    if (window.HenuOsReportEngine) {
      activeDesign = await HenuOsReportEngine.loadActiveDesign(REPORT_KEY);
      HenuOsReportEngine.applyDesignToDOM(activeDesign);
    }
    await loadTrfRegister();
  }

  function initDateFilters() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');

    const fromEl = document.getElementById('fromDate');
    const toEl = document.getElementById('toDate');

    if (fromEl && !fromEl.value) fromEl.value = `${y}-04-01`;
    if (toEl && !toEl.value) toEl.value = `${y}-${m}-${d}`;
  }

  window.loadTrfRegister = async function () {
    const container = document.getElementById('trfrContainer') || document.getElementById('reportOutputArea');
    if (!container) return;

    if (window.HenuOsReportEngine) {
      HenuOsReportEngine.renderLoading(container, 'Loading Bill Type Transfer Register from ERP database...');
    } else {
      container.innerHTML = '<div style="padding:40px; text-align:center;">Loading Bill Type Transfer records...</div>';
    }

    const ctx = (window.HenuOsReportEngine && HenuOsReportEngine.getSystemContext) ? HenuOsReportEngine.getSystemContext() : {
      apiBase: (window.location && window.location.origin && window.location.origin.startsWith('http')) ? window.location.origin + '/api' : 'http://localhost:5002/api',
      societyId: sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '4',
      fyId: sessionStorage.getItem('activeFyId') || localStorage.getItem('activeFyId') || '1'
    };

    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';
    const wing = document.getElementById('wing')?.value?.trim() || '';
    const member = document.getElementById('fromMember')?.value?.trim() || '';

    let url = `${ctx.apiBase}/reports/member/bill-type-trf-register?societyId=${ctx.societyId}&fyId=${ctx.fyId}`;
    if (fromDate) url += `&fromDate=${encodeURIComponent(fromDate)}`;
    if (toDate) url += `&toDate=${encodeURIComponent(toDate)}`;
    if (wing) url += `&wing=${encodeURIComponent(wing)}`;
    if (member) url += `&fromMember=${encodeURIComponent(member)}`;

    try {
      let res = await fetch(url);
      let data = null;

      if (res.ok) {
        data = await res.json();
      } else {
        // Fallback to MemberBillTypeTransfer controller directly
        const fbUrl = `${ctx.apiBase}/MemberBillTypeTransfer?societyId=${ctx.societyId}&fyId=${ctx.fyId}`;
        const fbRes = await fetch(fbUrl);
        if (fbRes.ok) {
          const fbJson = await fbRes.json();
          const rawItems = fbJson.data || fbJson || [];
          data = {
            success: true,
            society: { SocietyName: sessionStorage.getItem('activeSocietyName') || 'CO-OPERATIVE HOUSING SOCIETY LTD.' },
            items: rawItems.map((r, i) => ({
              srNo: i + 1,
              transferNumber: r.voucherNo || r.VoucherNo || '-',
              date: r.voucherDate || r.VoucherDate || '',
              member: r.memberName || r.personName || r.memName || '-',
              memberCode: r.memberCode || r.memCode || r.personCode || '',
              unit: r.flatNo || (r.wing ? `${r.wing}-${r.flatNo}` : '') || '-',
              fromBillType: `${r.leftBillType || r.leftBt || 'Major Repair'} (${r.leftType || 'Dr'})`,
              toBillType: `${r.rightBillType || r.rightBt || 'Maintenance'} (${r.rightType || 'Cr'})`,
              amount: Number(r.amount || r.Amount || 0),
              narration: r.narration || r.particulars || r.particular1 || '-',
              status: r.status || 'Posted'
            }))
          };
        }
      }

      if (!data || (!data.success && !Array.isArray(data.items))) {
        throw new Error(data?.message || 'Failed to fetch Bill Type TRF register data.');
      }

      let items = data.transfers || data.items || [];

      // Apply client-side filters if needed
      if (fromDate) {
        items = items.filter(it => (it.date || it.voucherDate) >= fromDate);
      }
      if (toDate) {
        items = items.filter(it => (it.date || it.voucherDate) <= toDate);
      }
      if (wing) {
        items = items.filter(it => (it.wing || '').toUpperCase().includes(wing.toUpperCase()) || (it.unit || '').toUpperCase().includes(wing.toUpperCase()));
      }
      if (member) {
        const q = member.toLowerCase();
        items = items.filter(it => (it.member || it.memberName || '').toLowerCase().includes(q) || (it.memberCode || '').toLowerCase().includes(q));
      }

      currentReportData = { ...data, items };
      updateKpis(items);

      if (items.length === 0) {
        if (window.HenuOsReportEngine) {
          HenuOsReportEngine.renderEmpty(
            container,
            'No Bill Type Transfer records found for the selected criteria.',
            'Try adjusting your Date, Wing, or Member filters.'
          );
        } else {
          container.innerHTML = '<div style="padding:40px; text-align:center; color:#64748b;">No Bill Type Transfer records found.</div>';
        }
        return;
      }

      renderTrfRegister({ ...data, items });
    } catch (err) {
      console.error('[BillTypeTRFRegister] Error loading register:', err);
      if (window.HenuOsReportEngine) {
        HenuOsReportEngine.renderError(
          container,
          `Unable to load transfer records: ${err.message}`,
          loadTrfRegister
        );
      } else {
        container.innerHTML = `<div style="padding:40px; text-align:center; color:#dc2626;">Error: ${err.message}</div>`;
      }
    }
  };

  function updateKpis(items) {
    const totalAmount = items.reduce((acc, row) => acc + Number(row.amount || 0), 0);
    const countEl = document.getElementById('kpiTotalCount');
    const amtEl = document.getElementById('kpiTotalAmount');

    if (countEl) countEl.textContent = items.length;
    if (amtEl) {
      const formatted = window.HenuOsReportEngine ? HenuOsReportEngine.formatINR(totalAmount) : totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 });
      amtEl.textContent = `₹ ${formatted}`;
    }
  }

  function renderTrfRegister(data) {
    const container = document.getElementById('trfrContainer') || document.getElementById('reportOutputArea');
    if (!container) return;

    const soc = data.society || {};
    const items = data.items || [];
    const totalAmount = items.reduce((acc, row) => acc + Number(row.amount || 0), 0);

    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';

    const esc = (window.HenuOsReportEngine && HenuOsReportEngine.escapeHtml) ? HenuOsReportEngine.escapeHtml : (str => String(str || '').replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)));
    const fmtDate = (window.HenuOsReportEngine && HenuOsReportEngine.formatDate) ? HenuOsReportEngine.formatDate : (d => d || '-');
    const fmtINR = (window.HenuOsReportEngine && HenuOsReportEngine.formatINR) ? HenuOsReportEngine.formatINR : (n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }));

    const rowsHtml = items.map((row, idx) => {
      const statusClass = (row.status || 'Posted').toLowerCase() === 'posted' ? 'posted' : 'draft';
      return `
        <tr>
          <td class="center">${idx + 1}</td>
          <td class="center" style="font-weight:700;">${esc(row.transferNumber || row.voucherNo || '-')}</td>
          <td class="center">${fmtDate(row.date || row.voucherDate)}</td>
          <td><strong>${esc(row.member || row.memberName || '-')}</strong></td>
          <td class="center">${esc(row.memberCode || '-')}</td>
          <td class="center">${esc(row.unit || row.flatNo || '-')}</td>
          <td>${esc(row.fromBillType || row.sourceHead || '-')}</td>
          <td>${esc(row.toBillType || row.destHead || '-')}</td>
          <td class="right" style="font-weight:700; color:var(--trfr-accent, #2563eb);">${fmtINR(row.amount || 0)}</td>
          <td>${esc(row.narration || '-')}</td>
          <td class="center"><span class="trfr-status-tag ${statusClass}">${esc(row.status || 'Posted')}</span></td>
        </tr>
      `;
    }).join('');

    const html = `
      <div class="trfr-report-page henu-dynamic-document">
        <header class="trfr-header">
          <div class="trfr-soc-name">${esc(soc.SocietyName || soc.name || sessionStorage.getItem('activeSocietyName') || 'CO-OPERATIVE HOUSING SOCIETY LTD.')}</div>
          <div class="trfr-soc-sub">
            ${soc.RegistrationNo ? 'Reg. No: ' + esc(soc.RegistrationNo) + ' | ' : ''}
            ${soc.Address || soc.address || 'Registered Society Premises'}
          </div>
        </header>

        <div class="trfr-title-bar">
          <div class="trfr-doc-title">MEMBER BILL TYPE TRANSFER REGISTER (TRF)</div>
          <div class="trfr-period-tag">Period: ${fmtDate(fromDate)} to ${fmtDate(toDate)}</div>
        </div>

        <div class="trfr-table-wrapper">
          <table class="trfr-table">
            <thead>
              <tr>
                <th class="center" style="width:32px;">Sr</th>
                <th class="center" style="width:80px;">Trf No</th>
                <th class="center" style="width:75px;">Date</th>
                <th style="width:140px;">Member Name</th>
                <th class="center" style="width:55px;">Code</th>
                <th class="center" style="width:65px;">Unit / Flat</th>
                <th style="width:115px;">From Bill Type</th>
                <th style="width:115px;">To Bill Type</th>
                <th class="right" style="width:85px;">Amount (₹)</th>
                <th>Narration</th>
                <th class="center" style="width:60px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr class="total-row">
                <td colspan="8" class="right" style="font-weight:700;">TOTAL TRANSFERRED AMOUNT:</td>
                <td class="right" style="color:var(--trfr-accent, #2563eb); font-weight:800;">₹ ${fmtINR(totalAmount)}</td>
                <td colspan="2" class="center">-</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="trfr-summary-grid">
          <div class="trfr-summary-item">
            <div class="lbl">Total Transfers</div>
            <div class="val">${items.length}</div>
          </div>
          <div class="trfr-summary-item">
            <div class="lbl">Total Transferred Amount</div>
            <div class="val" style="color:var(--trfr-accent, #2563eb); font-weight:800;">₹ ${fmtINR(totalAmount)}</div>
          </div>
          <div class="trfr-summary-item">
            <div class="lbl">Unique Members</div>
            <div class="val">${new Set(items.map(r => r.memberCode || r.member)).size}</div>
          </div>
        </div>

        <footer class="trfr-footer">
          <span>Printed on: ${new Date().toLocaleString()}</span>
          <span>JEEVIKA ERP v2 — Statutory & Financial Management</span>
          <span>Page 1 of 1</span>
        </footer>
      </div>
    `;

    container.innerHTML = html;
    if (window.HenuOsReportEngine && activeDesign) {
      HenuOsReportEngine.applyDesignToDOM(activeDesign);
    }
  }

  window.printReport = function () {
    window.print();
  };

  window.exportPdf = function () {
    window.print();
  };

  window.resetFilters = function () {
    initDateFilters();
    const w = document.getElementById('wing');
    const m = document.getElementById('fromMember');
    if (w) w.value = '';
    if (m) m.value = '';
    loadTrfRegister();
  };

})();
