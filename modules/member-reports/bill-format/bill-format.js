/**
 * bill-format.js — Member Bill Format Engine
 * Supports 4 Formats controlled dynamically by Master (Bill Print Setup):
 *   1. GST_DETAILED  - Full Detailed A4 Tax Invoice
 *   2. GST_RECEIPT   - Modern Tax Invoice with Tear-off Counterfoil Slip
 *   3. NON_GST       - Standard Society Maintenance Bill (Bill of Supply)
 *   4. MARATHI       - Marathi Language Format (मराठी देखभाल देयक व पावती)
 * Fully connected to PostgreSQL database & Master Bill Print Setup API.
 */

(function () {
  'use strict';

  const REPORT_KEY = 'MEMBER_BILL_FORMAT';
  let activeDesign = null;
  let activeBpsConfig = {
    societyId: 1,
    format: 'GST_DETAILED',
    heading: 'TAX INVOICE',
    bldg: true,
    srno: true,
    newpage: false,
    arrears: true,
    receipt: false,
    blankhead: false,
    qr: 'upi',
    sign: 'sig'
  };

  document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await loadMembersDropdown();
    activeDesign = await HenuOsReportEngine.loadActiveDesign(REPORT_KEY);
    await loadBills();
  });

  function setupEventListeners() {
    document.getElementById('btnRefresh')?.addEventListener('click', () => loadBills());
    document.getElementById('btnApplyFilters')?.addEventListener('click', () => loadBills());
    document.getElementById('btnReset')?.addEventListener('click', () => resetFilters());
    document.getElementById('btnPrint')?.addEventListener('click', () => window.print());
    document.getElementById('btnPdf')?.addEventListener('click', () => window.print());
  }

  function resetFilters() {
    document.getElementById('filterBillNo').value = '';
    document.getElementById('filterWing').value = '';
    document.getElementById('filterMember').value = '';
    document.getElementById('filterBillFrom').value = '';
    document.getElementById('filterBillTo').value = '';
    loadBills();
  }

  async function loadMembersDropdown() {
    const select = document.getElementById('filterMember');
    if (!select) return;
    const ctx = HenuOsReportEngine.getSystemContext();

    try {
      const res = await fetch(`${HenuOsReportEngine.API_BASE}/reports/member/data-sheet?societyId=${ctx.societyId}`);
      if (res.ok) {
        const json = await res.json();
        const members = json.members || [];
        select.innerHTML = '<option value="">-- All Members --</option>';
        members.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.memberCode || m.memberId || '';
          opt.textContent = `${m.flat || ''} ${m.wing ? '(' + m.wing + ')' : ''} - ${m.memberName || ''}`.trim();
          select.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn('[Bill Format] Could not load member dropdown:', err);
    }
  }

  async function fetchBpsConfig(societyId) {
    try {
      const apiRoot = HenuOsReportEngine.API_BASE.replace(/\/reports\/?$/, '').replace(/\/api\/?$/, '');
      const res = await fetch(`${apiRoot}/api/bill-print-setup?societyId=${societyId}`);
      if (res.ok) {
        const cfg = await res.json();
        if (cfg && cfg.format) {
          activeBpsConfig = Object.assign({}, activeBpsConfig, cfg);
        }
      }
    } catch (err) {
      console.warn('[Bill Format] Could not fetch bill-print-setup from backend:', err);
      const local = localStorage.getItem('jeevika_bps_config_' + societyId) || localStorage.getItem('jeevika_bps_config');
      if (local) {
        try { activeBpsConfig = Object.assign({}, activeBpsConfig, JSON.parse(local)); } catch (e) {}
      }
    }
  }

  async function loadBills() {
    const container = document.getElementById('billContainer');
    const kpiStrip = document.getElementById('kpiStrip');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Loading bills & layout configuration...');

    const ctx = HenuOsReportEngine.getSystemContext();
    await fetchBpsConfig(ctx.societyId);

    const billNo = document.getElementById('filterBillNo')?.value?.trim() || '';
    const wing = document.getElementById('filterWing')?.value?.trim() || '';
    const member = document.getElementById('filterMember')?.value?.trim() || '';
    const fromDate = document.getElementById('filterBillFrom')?.value || '';
    const toDate = document.getElementById('filterBillTo')?.value || '';

    try {
      const params = new URLSearchParams();
      params.append('societyId', ctx.societyId);
      if (ctx.fyId) params.append('fyId', ctx.fyId);
      if (billNo) params.append('fromBillNo', billNo);
      if (wing) params.append('wing', wing);
      if (member) params.append('fromMember', member);
      if (fromDate) params.append('billFrom', fromDate);
      if (toDate) params.append('billTo', toDate);

      const res = await fetch(`${HenuOsReportEngine.API_BASE}/reports/member/bill-format?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const bills = data.bills || [];
      const society = data.society || {};

      if (data.printSetup) {
        activeBpsConfig = Object.assign({}, activeBpsConfig, data.printSetup);
      }

      if (bills.length === 0) {
        HenuOsReportEngine.renderEmpty(container, 'No billing records found for the selected criteria.');
        if (kpiStrip) kpiStrip.style.display = 'none';
        return;
      }

      // Update KPI strip
      if (kpiStrip) {
        let totalTaxable = 0;
        let totalTax = 0;
        let totalNet = 0;

        bills.forEach(b => {
          totalTaxable += (b.subtotalTaxable || b.taxableValue || b.principalAmount || 0);
          totalTax += ((b.cgstAmt || b.cgstTotal || 0) + (b.sgstAmt || b.sgstTotal || 0));
          totalNet += (b.netPayable || b.totalAmount || 0);
        });

        document.getElementById('kpiTotalBills').textContent = bills.length;
        document.getElementById('kpiTotalTaxable').textContent = HenuOsReportEngine.formatINR(totalTaxable);
        document.getElementById('kpiTotalTax').textContent = HenuOsReportEngine.formatINR(totalTax);
        document.getElementById('kpiNetPayable').textContent = HenuOsReportEngine.formatINR(totalNet);
        kpiStrip.style.display = 'flex';
      }

      renderBillsDispatch(society, bills, activeBpsConfig, container);
      HenuOsReportEngine.applyDesignToDOM(activeDesign);
    } catch (err) {
      console.error('[Bill Format] Error loading bills:', err);
      HenuOsReportEngine.renderError(container, 'Unable to load bill format records from server.', () => loadBills());
      if (kpiStrip) kpiStrip.style.display = 'none';
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SHARED HELPERS & LOCALIZATION
  // ═══════════════════════════════════════════════════════════
  function translateMarathiHead(name) {
    if (!name) return 'देखभाल आकार';
    const n = name.toLowerCase();
    if (n.includes('maint')) return 'सामान्य देखभाल आकार (General Maintenance)';
    if (n.includes('repair') || n.includes('duru')) return 'दुरुस्ती व देखभाल निधी (Repair Fund)';
    if (n.includes('sink')) return 'बुडीत निधी (Sinking Fund)';
    if (n.includes('water') || n.includes('pani')) return 'पाणी आकार (Water Charges)';
    if (n.includes('park') || n.includes('vahan')) return 'वाहनतळ आकार (Parking Charges)';
    if (n.includes('non') || n.includes('occ') || n.includes('bigar')) return 'बिगर वापर आकार (Non-Occupancy)';
    if (n.includes('elect') || n.includes('power')) return 'विद्युत आकार (Electricity Charges)';
    if (n.includes('insurance') || n.includes('vima')) return 'विमा आकार (Insurance Fund)';
    if (n.includes('service') || n.includes('seva')) return 'सेवा आकार (Service Charges)';
    if (n.includes('interest') || n.includes('vyaj')) return 'थकबाकीवरील व्याज (Interest)';
    return `${name}`;
  }

  function formatMarathiDate(dStr) {
    if (!dStr) return '-';
    try {
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return dStr;
      const months = ['जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर'];
      const day = String(d.getDate()).padStart(2, '0');
      const mon = months[d.getMonth()];
      const yr = d.getFullYear();
      return `${day}-${mon}-${yr}`;
    } catch {
      return dStr;
    }
  }

  function getUpiQrSvg(socName, amount) {
    return `
      <div class="bill-qr-box" title="Scan to pay via UPI">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="100" fill="#ffffff" />
          <path d="M10 10h30v30h-30z M15 15h20v20h-20z M20 20h10v10h-10z" fill="#1e3a8a"/>
          <path d="M60 10h30v30h-30z M65 15h20v20h-20z M70 20h10v10h-10z" fill="#1e3a8a"/>
          <path d="M10 60h30v30h-30z M15 65h20v20h-20z M20 70h10v10h-10z" fill="#1e3a8a"/>
          <rect x="45" y="15" width="8" height="25" fill="#1e3a8a"/>
          <rect x="15" y="45" width="25" height="8" fill="#1e3a8a"/>
          <rect x="45" y="45" width="10" height="10" fill="#dc2626"/>
          <rect x="60" y="45" width="28" height="8" fill="#1e3a8a"/>
          <rect x="45" y="60" width="8" height="28" fill="#1e3a8a"/>
          <rect x="60" y="60" width="12" height="12" fill="#1e3a8a"/>
          <rect x="76" y="76" width="12" height="12" fill="#1e3a8a"/>
        </svg>
        <span class="bill-qr-label">BHIM UPI QR</span>
      </div>
    `;
  }

  function getSignBlock(socName, signType, isMarathi) {
    if (signType === 'none') return '';
    let label = isMarathi ? 'मा. मानद सचिव / खजिनदार' : 'Hon. Secretary / Treasurer';
    let extra = '';
    if (signType === 'stamp') {
      extra = `<div style="height:32px; font-size:7.5pt; color:#64748b; display:flex; align-items:center; justify-content:center; border:1px dashed #cbd5e1; margin-bottom:4px;">${isMarathi ? '[संस्थेचा शिक्का]' : '[Society Stamp]'}</div>`;
    } else if (signType === 'seal') {
      extra = `<div style="height:36px; font-size:7.5pt; color:#1e3a8a; display:flex; align-items:center; justify-content:center; border:2px solid #1e3a8a; border-radius:50%; width:70px; margin:0 auto 4px auto;">${isMarathi ? 'मुद्रा' : 'SEAL'}</div>`;
    }
    return `
      <div style="width:160px; text-align:center;">
        <div style="font-size:7.5pt; color:#64748b; margin-bottom:2px;">${isMarathi ? 'संस्थेकरिता' : 'For ' + HenuOsReportEngine.escapeHtml(socName)}</div>
        ${extra}
        <div style="border-top:1px solid #1e3a8a; padding-top:4px; font-size:8pt; font-weight:700; color:#0f172a;">${label}</div>
      </div>
    `;
  }

  function getCounterfoilSlipHtml(soc, bill, mem, netPayable, isMarathi) {
    const socName = soc.SocietyName || soc.societyname || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
    const billNo = bill.billNo || '-';
    const billDate = isMarathi ? formatMarathiDate(bill.billDate) : HenuOsReportEngine.formatDate(bill.billDate);
    const dueDate = isMarathi ? formatMarathiDate(bill.dueDate) : HenuOsReportEngine.formatDate(bill.dueDate);
    const memName = mem.name || mem.memName || '-';
    const flatNo = `${mem.flatNo || mem.flat || '-'}${mem.wing ? ' (' + mem.wing + ')' : ''}`;

    return `
      <div class="bill-tear-off-line">
        <span class="bill-tear-off-badge">
          <i class="bi bi-scissors"></i> ${isMarathi ? 'फाडणी पावती / पोच पावती (कार्यालय प्रत)' : 'TEAR-OFF COUNTERFOIL / ACKNOWLEDGMENT SLIP (OFFICE COPY)'} <i class="bi bi-scissors"></i>
        </span>
      </div>

      <div class="bill-counterfoil-card">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:6px;">
          <div style="font-weight:800; color:var(--bill-primary); font-size:8.5pt;">${HenuOsReportEngine.escapeHtml(socName)}</div>
          <div style="font-size:7.5pt; color:#64748b;">${isMarathi ? 'पावती / भरणा प्रत' : 'Payment Acknowledgment Slip'}</div>
        </div>

        <div class="bill-counterfoil-grid">
          <div>
            <div><strong>${isMarathi ? 'देयक क्रमांक' : 'Bill No'}:</strong> ${HenuOsReportEngine.escapeHtml(billNo)} &nbsp;|&nbsp; <strong>${isMarathi ? 'दिनांक' : 'Date'}:</strong> ${billDate}</div>
            <div><strong>${isMarathi ? 'सभासदाचे नाव' : 'Member Name'}:</strong> ${HenuOsReportEngine.escapeHtml(memName)}</div>
            <div><strong>${isMarathi ? 'सदनिका क्र.' : 'Flat / Unit'}:</strong> ${HenuOsReportEngine.escapeHtml(flatNo)}</div>
          </div>
          <div>
            <div><strong>${isMarathi ? 'अंतिम देय तारीख' : 'Due Date'}:</strong> <span style="color:var(--bill-accent); font-weight:700;">${dueDate}</span></div>
            <div style="margin-top:2px;"><strong>${isMarathi ? 'एकूण देय रक्कम' : 'Net Due Amount'}:</strong> <span style="font-size:9.5pt; font-weight:800; color:var(--bill-primary);">${HenuOsReportEngine.formatINR(netPayable)}</span></div>
          </div>
        </div>

        <div style="margin-top:6px; padding-top:4px; border-top:1px dashed #cbd5e1; font-size:7.5pt;">
          <span>${isMarathi ? 'भरणा प्रकार' : 'Payment Mode'}: [ &nbsp; ] Cheque &nbsp; [ &nbsp; ] UPI / NEFT &nbsp; [ &nbsp; ] Cash</span>
          &nbsp;&nbsp;&nbsp;&nbsp;
          <span>${isMarathi ? 'धनादेश / यूटीआर क्र.' : 'Cheque / UTR No'}: <span class="bill-fill-line"></span></span>
          &nbsp;&nbsp;
          <span>${isMarathi ? 'दिनांक' : 'Date'}: <span class="bill-fill-line" style="min-width:70px;"></span></span>
        </div>

        <div style="margin-top:6px; display:flex; justify-content:space-between; align-items:flex-end; font-size:7.5pt;">
          <div>
            ${isMarathi ? 'बँकेचे नाव' : 'Bank & Branch'}: <span class="bill-fill-line" style="min-width:180px;"></span>
          </div>
          <div style="text-align:right;">
            ${isMarathi ? 'अधिकृत सही व शिक्का' : 'Received By (Collector Sign & Stamp)'}: <span class="bill-fill-line" style="min-width:110px;"></span>
          </div>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════
  // MAIN DISPATCH ROUTER
  // ═══════════════════════════════════════════════════════════
  function renderBillsDispatch(soc, bills, config, container) {
    let html = '';
    const fmt = config.format || 'GST_DETAILED';

    bills.forEach((bill, idx) => {
      const isLast = idx === bills.length - 1;
      switch (fmt) {
        case 'GST_RECEIPT':
          html += renderGstReceipt(soc, bill, config, isLast, idx);
          break;
        case 'NON_GST':
          html += renderNonGst(soc, bill, config, isLast, idx);
          break;
        case 'MARATHI':
          html += renderMarathi(soc, bill, config, isLast, idx);
          break;
        case 'GST_DETAILED':
        default:
          html += renderGstDetailed(soc, bill, config, isLast, idx);
          break;
      }
    });

    container.innerHTML = html;
  }

  // ═══════════════════════════════════════════════════════════
  // FORMAT 1: GST DETAILED (Full A4 Tax Invoice)
  // ═══════════════════════════════════════════════════════════
  function renderGstDetailed(soc, bill, config, isLast, idx) {
    const socName = soc.SocietyName || soc.societyname || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
    const regNo = soc.RegistrationNo || soc.registrationno || '';
    const pan = soc.PANNumber || soc.pannumber || soc.pan || '';
    const gstin = soc.GSTNumber || soc.gstnumber || soc.gstin || '';
    const addr = soc.Address || soc.address || '';
    const bankName = soc.BankName || soc.bankname || '';
    const accNo = soc.BankAccountNo || soc.bankaccountno || '';
    const ifsc = soc.IFSCCode || soc.ifsccode || '';

    const mem = bill.member || {};
    const items = bill.items || [];
    const isPageBreak = config.newpage ? true : !isLast;
    const netPayable = bill.netPayable || bill.totalAmount || 0;
    const words = HenuOsReportEngine.numberToWordsINR(netPayable);

    let chargeRows = '';
    let subtotalTaxable = 0;
    let subtotalCgst = 0;
    let subtotalSgst = 0;
    let subtotalTotal = 0;

    if (items.length > 0) {
      items.forEach((it, itIdx) => {
        const amt = it.amount || 0;
        if (!config.blankhead && amt === 0) return;
        const taxVal = it.taxable !== undefined ? it.taxable : amt;
        const cgst = it.cgst || (bill.isGst ? Math.round(taxVal * 0.09) : 0);
        const sgst = it.sgst || (bill.isGst ? Math.round(taxVal * 0.09) : 0);
        const rowTot = taxVal + cgst + sgst;

        subtotalTaxable += taxVal;
        subtotalCgst += cgst;
        subtotalSgst += sgst;
        subtotalTotal += rowTot;

        chargeRows += `
          <tr>
            ${config.srno ? `<td class="center" style="width:30px;">${itIdx + 1}</td>` : ''}
            <td>${HenuOsReportEngine.escapeHtml(it.accountName || it.description || 'Maintenance Charge')}</td>
            <td class="center" style="width:70px;">${HenuOsReportEngine.escapeHtml(it.sac || bill.sacCode || '999598')}</td>
            <td class="right" style="width:85px;">${HenuOsReportEngine.formatINR(taxVal)}</td>
            <td class="right" style="width:70px;">${HenuOsReportEngine.formatINR(cgst)}</td>
            <td class="right" style="width:70px;">${HenuOsReportEngine.formatINR(sgst)}</td>
            <td class="right" style="width:90px; font-weight:700;">${HenuOsReportEngine.formatINR(rowTot)}</td>
          </tr>
        `;
      });
    } else {
      const pAmt = bill.principalAmount || 0;
      const cgst = bill.cgstAmt || 0;
      const sgst = bill.sgstAmt || 0;
      subtotalTaxable = pAmt;
      subtotalCgst = cgst;
      subtotalSgst = sgst;
      subtotalTotal = bill.totalAmount || (pAmt + cgst + sgst);

      chargeRows = `
        <tr>
          ${config.srno ? `<td class="center">1</td>` : ''}
          <td>Society Maintenance Assessment Charges</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(bill.sacCode || '999598')}</td>
          <td class="right">${HenuOsReportEngine.formatINR(pAmt)}</td>
          <td class="right">${HenuOsReportEngine.formatINR(cgst)}</td>
          <td class="right">${HenuOsReportEngine.formatINR(sgst)}</td>
          <td class="right" style="font-weight:700;">${HenuOsReportEngine.formatINR(subtotalTotal)}</td>
        </tr>
      `;
    }

    return `
      <div class="bill-page ${isPageBreak ? 'page-break' : ''}">
        <header class="bill-header">
          <div class="bill-header-left">
            <div class="bill-soc-name">${HenuOsReportEngine.escapeHtml(socName)}</div>
            <div class="bill-soc-meta">
              ${regNo ? `Reg. No: <strong>${HenuOsReportEngine.escapeHtml(regNo)}</strong> | ` : ''}
              ${pan ? `PAN: <strong>${HenuOsReportEngine.escapeHtml(pan)}</strong> | ` : ''}
              ${gstin ? `GSTIN: <strong>${HenuOsReportEngine.escapeHtml(gstin)}</strong> (State: 27)` : ''}
            </div>
            <div class="bill-soc-meta">${HenuOsReportEngine.escapeHtml(addr)}</div>
          </div>
        </header>

        <div class="bill-title-bar">
          <div class="bill-doc-title">${HenuOsReportEngine.escapeHtml(config.heading || 'TAX INVOICE')}</div>
          <div class="bill-doc-period">Billing Period: ${HenuOsReportEngine.escapeHtml(bill.period || HenuOsReportEngine.formatDate(bill.billDate))}</div>
        </div>

        <div class="bill-meta-grid">
          <div class="bill-meta-box">
            <div class="bill-meta-title">Bill To (Member Details)</div>
            <div class="bill-meta-row"><span class="bill-meta-label">Member Name:</span><span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.memName || mem.name || '-')}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label">Flat / Unit:</span><span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.flatNo || mem.flat || '-')}${config.bldg && mem.wing ? ' (' + HenuOsReportEngine.escapeHtml(mem.wing) + ')' : ''}${config.bldg && mem.building ? ', ' + HenuOsReportEngine.escapeHtml(mem.building) : ''}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label">Member Code:</span><span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.memCode || mem.code || '-')}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label">Area (Sq. Ft):</span><span class="bill-meta-val">${mem.areaSqft || mem.area || '-'}</span></div>
            ${mem.panNo ? `<div class="bill-meta-row"><span class="bill-meta-label">Member PAN:</span><span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.panNo)}</span></div>` : ''}
          </div>

          <div class="bill-meta-box">
            <div class="bill-meta-title">Invoice &amp; Tax Details</div>
            <div class="bill-meta-row"><span class="bill-meta-label">Invoice No:</span><span class="bill-meta-val" style="color:var(--bill-primary); font-weight:800;">${HenuOsReportEngine.escapeHtml(bill.billNo || '-')}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label">Invoice Date:</span><span class="bill-meta-val">${HenuOsReportEngine.formatDate(bill.billDate)}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label">Due Date:</span><span class="bill-meta-val" style="color:var(--bill-accent); font-weight:700;">${HenuOsReportEngine.formatDate(bill.dueDate)}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label">Reverse Charge:</span><span class="bill-meta-val">No</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label">Place of Supply:</span><span class="bill-meta-val">27 - Maharashtra</span></div>
          </div>
        </div>

        <div class="bill-table-wrapper">
          <table class="bill-table">
            <thead>
              <tr>
                ${config.srno ? `<th class="center" style="width:30px;">Sr</th>` : ''}
                <th>Particulars / Description</th>
                <th class="center" style="width:70px;">SAC</th>
                <th class="right" style="width:85px;">Taxable (₹)</th>
                <th class="right" style="width:70px;">CGST 9%</th>
                <th class="right" style="width:70px;">SGST 9%</th>
                <th class="right" style="width:90px;">Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${chargeRows}
              <tr style="background:#e2e8f0; font-weight:bold;">
                ${config.srno ? `<td></td>` : ''}
                <td>Current Month Total Charges</td>
                <td class="center">-</td>
                <td class="right">${HenuOsReportEngine.formatINR(subtotalTaxable)}</td>
                <td class="right">${HenuOsReportEngine.formatINR(subtotalCgst)}</td>
                <td class="right">${HenuOsReportEngine.formatINR(subtotalSgst)}</td>
                <td class="right">${HenuOsReportEngine.formatINR(subtotalTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="bill-summary-grid">
          <div class="bill-words-box">
            <div>
              <div style="font-weight:700; color:var(--bill-primary); margin-bottom:2px;">Amount in Words:</div>
              <div style="font-style:italic; line-height:1.3;">${HenuOsReportEngine.escapeHtml(words)}</div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
              <div class="bill-payment-box" style="margin-bottom:0; flex:1; margin-right:8px;">
                <div>
                  <div style="font-weight:700; font-size:7.5pt; color:var(--bill-primary); margin-bottom:1px;">Bank Account for Payment:</div>
                  <div style="font-size:7.5pt;">Bank: <strong>${HenuOsReportEngine.escapeHtml(bankName || 'Society Bank')}</strong></div>
                  ${accNo ? `<div style="font-size:7.5pt;">A/C: <strong>${HenuOsReportEngine.escapeHtml(accNo)}</strong> | IFSC: <strong>${HenuOsReportEngine.escapeHtml(ifsc)}</strong></div>` : ''}
                </div>
              </div>
              ${config.qr !== 'none' ? getUpiQrSvg(socName, netPayable) : ''}
            </div>
          </div>

          <div>
            <table class="bill-totals-table">
              <tr>
                <td>Current Bill Amount:</td>
                <td class="right" style="font-weight:700;">${HenuOsReportEngine.formatINR(subtotalTotal)}</td>
              </tr>
              ${config.arrears ? `
                <tr>
                  <td>Previous Dues (Principal):</td>
                  <td class="right">${HenuOsReportEngine.formatINR(bill.prevArrears || 0)}</td>
                </tr>
                <tr>
                  <td>Interest on Arrears @ 21%:</td>
                  <td class="right">${HenuOsReportEngine.formatINR(bill.interest || 0)}</td>
                </tr>
                ${(bill.advanceCredit && bill.advanceCredit > 0) ? `
                  <tr>
                    <td>Less: Advance Credit:</td>
                    <td class="right" style="color:var(--bill-accent);">(-) ${HenuOsReportEngine.formatINR(bill.advanceCredit)}</td>
                  </tr>
                ` : ''}
              ` : `
                <tr>
                  <td>Previous Balance:</td>
                  <td class="right">${HenuOsReportEngine.formatINR(bill.prevArrears || 0)}</td>
                </tr>
              `}
              <tr class="grand-total">
                <td><strong>NET PAYABLE AMOUNT:</strong></td>
                <td class="right" style="color:var(--bill-primary); font-size:10pt;"><strong>${HenuOsReportEngine.formatINR(netPayable)}</strong></td>
              </tr>
            </table>
          </div>
        </div>

        <div class="bill-terms" style="margin-top:6px; margin-bottom:8px; padding:4px 8px; background:#f8fafc; border:1px solid var(--bill-border); border-radius:3px; font-size:7pt; color:#475569; line-height:1.35;">
          <strong>TERMS:</strong> 1. Please pay on or before Due Date to avoid interest. 2. As per CHS Bye-Law 68, simple interest @ 21% p.a. will be levied after due date. 3. Cheques subject to realization.
        </div>

        <footer class="bill-footer" style="display:flex; justify-content:space-between; align-items:flex-end;">
          <div style="width:140px; text-align:center;">
            <div style="border-top:1px solid #94a3b8; padding-top:4px; font-size:7.5pt; font-weight:600; color:#475569;">Accountant / Manager</div>
          </div>
          ${getSignBlock(socName, config.sign, false)}
        </footer>

        ${config.receipt ? getCounterfoilSlipHtml(soc, bill, mem, netPayable, false) : ''}
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════
  // FORMAT 2: GST RECEIPT (Tax Invoice with Perforated Counterfoil)
  // ═══════════════════════════════════════════════════════════
  function renderGstReceipt(soc, bill, config, isLast, idx) {
    const socName = soc.SocietyName || soc.societyname || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
    const regNo = soc.RegistrationNo || soc.registrationno || '';
    const pan = soc.PANNumber || soc.pannumber || soc.pan || '';
    const gstin = soc.GSTNumber || soc.gstnumber || soc.gstin || '';
    const addr = soc.Address || soc.address || '';
    const bankName = soc.BankName || soc.bankname || '';
    const accNo = soc.BankAccountNo || soc.bankaccountno || '';
    const ifsc = soc.IFSCCode || soc.ifsccode || '';

    const mem = bill.member || {};
    const items = bill.items || [];
    const isPageBreak = config.newpage ? true : !isLast;
    const netPayable = bill.netPayable || bill.totalAmount || 0;
    const words = HenuOsReportEngine.numberToWordsINR(netPayable);

    let chargeRows = '';
    let subtotalTaxable = 0;
    let subtotalCgst = 0;
    let subtotalSgst = 0;
    let subtotalTotal = 0;

    if (items.length > 0) {
      items.forEach((it, itIdx) => {
        const amt = it.amount || 0;
        if (!config.blankhead && amt === 0) return;
        const taxVal = it.taxable !== undefined ? it.taxable : amt;
        const cgst = it.cgst || (bill.isGst ? Math.round(taxVal * 0.09) : 0);
        const sgst = it.sgst || (bill.isGst ? Math.round(taxVal * 0.09) : 0);
        const rowTot = taxVal + cgst + sgst;

        subtotalTaxable += taxVal;
        subtotalCgst += cgst;
        subtotalSgst += sgst;
        subtotalTotal += rowTot;

        chargeRows += `
          <tr>
            ${config.srno ? `<td class="center" style="width:28px;">${itIdx + 1}</td>` : ''}
            <td>${HenuOsReportEngine.escapeHtml(it.accountName || it.description || 'Maintenance Head')}</td>
            <td class="center" style="width:65px;">${HenuOsReportEngine.escapeHtml(it.sac || bill.sacCode || '999598')}</td>
            <td class="right" style="width:80px;">${HenuOsReportEngine.formatINR(taxVal)}</td>
            <td class="right" style="width:65px;">${HenuOsReportEngine.formatINR(cgst)}</td>
            <td class="right" style="width:65px;">${HenuOsReportEngine.formatINR(sgst)}</td>
            <td class="right" style="width:85px; font-weight:700;">${HenuOsReportEngine.formatINR(rowTot)}</td>
          </tr>
        `;
      });
    } else {
      const pAmt = bill.principalAmount || 0;
      const cgst = bill.cgstAmt || 0;
      const sgst = bill.sgstAmt || 0;
      subtotalTaxable = pAmt;
      subtotalCgst = cgst;
      subtotalSgst = sgst;
      subtotalTotal = bill.totalAmount || (pAmt + cgst + sgst);

      chargeRows = `
        <tr>
          ${config.srno ? `<td class="center">1</td>` : ''}
          <td>Society Maintenance Assessment</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(bill.sacCode || '999598')}</td>
          <td class="right">${HenuOsReportEngine.formatINR(pAmt)}</td>
          <td class="right">${HenuOsReportEngine.formatINR(cgst)}</td>
          <td class="right">${HenuOsReportEngine.formatINR(sgst)}</td>
          <td class="right" style="font-weight:700;">${HenuOsReportEngine.formatINR(subtotalTotal)}</td>
        </tr>
      `;
    }

    return `
      <div class="bill-page ${isPageBreak ? 'page-break' : ''}" style="padding-bottom:8mm;">
        <!-- Upper 68%: Tax Invoice -->
        <header class="bill-header" style="margin-bottom:6px; padding-bottom:6px;">
          <div class="bill-header-left">
            <div class="bill-soc-name" style="font-size:13.5pt;">${HenuOsReportEngine.escapeHtml(socName)}</div>
            <div class="bill-soc-meta" style="font-size:7.5pt;">
              ${regNo ? `Reg: <strong>${HenuOsReportEngine.escapeHtml(regNo)}</strong> | ` : ''}
              ${pan ? `PAN: <strong>${HenuOsReportEngine.escapeHtml(pan)}</strong> | ` : ''}
              ${gstin ? `GSTIN: <strong>${HenuOsReportEngine.escapeHtml(gstin)}</strong>` : ''}
            </div>
            <div class="bill-soc-meta" style="font-size:7.5pt;">${HenuOsReportEngine.escapeHtml(addr)}</div>
          </div>
        </header>

        <div class="bill-title-bar" style="padding:3px 8px; margin-bottom:8px;">
          <div class="bill-doc-title" style="font-size:9.5pt;">${HenuOsReportEngine.escapeHtml(config.heading || 'TAX INVOICE & RECEIPT')}</div>
          <div class="bill-doc-period" style="font-size:8pt;">Billing Period: ${HenuOsReportEngine.escapeHtml(bill.period || HenuOsReportEngine.formatDate(bill.billDate))}</div>
        </div>

        <div class="bill-meta-grid" style="margin-bottom:8px; gap:8px;">
          <div class="bill-meta-box" style="padding:6px 8px; font-size:8pt;">
            <div class="bill-meta-title" style="font-size:7.5pt;">Member Details</div>
            <div class="bill-meta-row"><span class="bill-meta-label" style="width:85px;">Member:</span><span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.memName || mem.name || '-')}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label" style="width:85px;">Flat / Unit:</span><span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.flatNo || mem.flat || '-')}${config.bldg && mem.wing ? ' (' + HenuOsReportEngine.escapeHtml(mem.wing) + ')' : ''}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label" style="width:85px;">Area:</span><span class="bill-meta-val">${mem.areaSqft || mem.area || '-'} Sq.Ft.</span></div>
          </div>

          <div class="bill-meta-box" style="padding:6px 8px; font-size:8pt;">
            <div class="bill-meta-title" style="font-size:7.5pt;">Bill Info</div>
            <div class="bill-meta-row"><span class="bill-meta-label" style="width:85px;">Bill No:</span><span class="bill-meta-val" style="color:var(--bill-primary); font-weight:800;">${HenuOsReportEngine.escapeHtml(bill.billNo || '-')}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label" style="width:85px;">Bill Date:</span><span class="bill-meta-val">${HenuOsReportEngine.formatDate(bill.billDate)}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label" style="width:85px;">Due Date:</span><span class="bill-meta-val" style="color:var(--bill-accent); font-weight:700;">${HenuOsReportEngine.formatDate(bill.dueDate)}</span></div>
          </div>
        </div>

        <div class="bill-table-wrapper" style="margin-bottom:6px;">
          <table class="bill-table" style="font-size:8pt;">
            <thead>
              <tr>
                ${config.srno ? `<th class="center" style="width:28px;">Sr</th>` : ''}
                <th>Particulars</th>
                <th class="center" style="width:65px;">SAC</th>
                <th class="right" style="width:80px;">Taxable</th>
                <th class="right" style="width:65px;">CGST</th>
                <th class="right" style="width:65px;">SGST</th>
                <th class="right" style="width:85px;">Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${chargeRows}
            </tbody>
          </table>
        </div>

        <div class="bill-summary-grid" style="margin-bottom:6px; gap:8px;">
          <div class="bill-words-box" style="padding:6px 8px; font-size:7.5pt;">
            <div><strong>Amount in Words:</strong> <em>${HenuOsReportEngine.escapeHtml(words)}</em></div>
            <div style="margin-top:4px; display:flex; justify-content:space-between; align-items:center;">
              <div>Bank: <strong>${HenuOsReportEngine.escapeHtml(bankName || 'Society Bank')}</strong> | A/C: <strong>${HenuOsReportEngine.escapeHtml(accNo || '-')}</strong></div>
              ${config.qr !== 'none' ? getUpiQrSvg(socName, netPayable) : ''}
            </div>
          </div>

          <div>
            <table class="bill-totals-table" style="font-size:8pt;">
              <tr><td>Current Charges:</td><td class="right">${HenuOsReportEngine.formatINR(subtotalTotal)}</td></tr>
              ${config.arrears ? `
                <tr><td>Previous Arrears:</td><td class="right">${HenuOsReportEngine.formatINR(bill.prevArrears || 0)}</td></tr>
                <tr><td>Interest on Arrears:</td><td class="right">${HenuOsReportEngine.formatINR(bill.interest || 0)}</td></tr>
              ` : ''}
              <tr class="grand-total"><td><strong>NET PAYABLE:</strong></td><td class="right" style="font-size:9.5pt;"><strong>${HenuOsReportEngine.formatINR(netPayable)}</strong></td></tr>
            </table>
          </div>
        </div>

        <footer style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:4px;">
          <div style="font-size:7pt; color:#64748b;">Subject to realization of cheque. Pay before due date.</div>
          ${getSignBlock(socName, config.sign, false)}
        </footer>

        <!-- Bottom 32%: Tear-off Counterfoil -->
        ${getCounterfoilSlipHtml(soc, bill, mem, netPayable, false)}
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════
  // FORMAT 3: NON-GST FORMAT (Standard Society Maintenance Bill)
  // ═══════════════════════════════════════════════════════════
  function renderNonGst(soc, bill, config, isLast, idx) {
    const socName = soc.SocietyName || soc.societyname || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
    const regNo = soc.RegistrationNo || soc.registrationno || '';
    const pan = soc.PANNumber || soc.pannumber || soc.pan || '';
    const addr = soc.Address || soc.address || '';
    const bankName = soc.BankName || soc.bankname || '';
    const accNo = soc.BankAccountNo || soc.bankaccountno || '';
    const ifsc = soc.IFSCCode || soc.ifsccode || '';

    const mem = bill.member || {};
    const items = bill.items || [];
    const isPageBreak = config.newpage ? true : !isLast;
    const netPayable = bill.netPayable || bill.totalAmount || 0;
    const words = HenuOsReportEngine.numberToWordsINR(netPayable);

    let chargeRows = '';
    let currentTotal = 0;

    if (items.length > 0) {
      items.forEach((it, itIdx) => {
        const amt = it.amount || 0;
        if (!config.blankhead && amt === 0) return;
        currentTotal += amt;

        chargeRows += `
          <tr>
            ${config.srno ? `<td class="center" style="width:35px;">${itIdx + 1}</td>` : ''}
            <td>${HenuOsReportEngine.escapeHtml(it.accountName || it.description || 'Maintenance Head')}</td>
            <td class="right" style="width:130px; font-weight:600;">${HenuOsReportEngine.formatINR(amt)}</td>
          </tr>
        `;
      });
    } else {
      const pAmt = bill.principalAmount || 0;
      currentTotal = pAmt;

      chargeRows = `
        <tr>
          ${config.srno ? `<td class="center">1</td>` : ''}
          <td>General Maintenance Charges</td>
          <td class="right" style="font-weight:600;">${HenuOsReportEngine.formatINR(pAmt)}</td>
        </tr>
      `;
    }

    return `
      <div class="bill-page ${isPageBreak ? 'page-break' : ''}">
        <header class="bill-header">
          <div class="bill-header-left">
            <div class="bill-soc-name">${HenuOsReportEngine.escapeHtml(socName)}</div>
            <div class="bill-soc-meta">
              ${regNo ? `Reg. No: <strong>${HenuOsReportEngine.escapeHtml(regNo)}</strong> | ` : ''}
              ${pan ? `PAN: <strong>${HenuOsReportEngine.escapeHtml(pan)}</strong>` : ''}
            </div>
            <div class="bill-soc-meta">${HenuOsReportEngine.escapeHtml(addr)}</div>
          </div>
        </header>

        <div class="bill-title-bar">
          <div class="bill-doc-title">${HenuOsReportEngine.escapeHtml(config.heading || 'MAINTENANCE BILL')}</div>
          <div class="bill-doc-period">Period: ${HenuOsReportEngine.escapeHtml(bill.period || HenuOsReportEngine.formatDate(bill.billDate))}</div>
        </div>

        <div class="bill-meta-grid">
          <div class="bill-meta-box">
            <div class="bill-meta-title">Member Particulars</div>
            <div class="bill-meta-row"><span class="bill-meta-label">Member Name:</span><span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.memName || mem.name || '-')}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label">Flat / Unit No:</span><span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.flatNo || mem.flat || '-')}${config.bldg && mem.wing ? ' (' + HenuOsReportEngine.escapeHtml(mem.wing) + ')' : ''}${config.bldg && mem.building ? ', ' + HenuOsReportEngine.escapeHtml(mem.building) : ''}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label">Member Code:</span><span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.memCode || mem.code || '-')}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label">Carpet Area:</span><span class="bill-meta-val">${mem.areaSqft || mem.area || '-'} Sq.Ft.</span></div>
          </div>

          <div class="bill-meta-box">
            <div class="bill-meta-title">Billing Summary</div>
            <div class="bill-meta-row"><span class="bill-meta-label">Bill Number:</span><span class="bill-meta-val" style="color:var(--bill-primary); font-weight:800;">${HenuOsReportEngine.escapeHtml(bill.billNo || '-')}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label">Bill Date:</span><span class="bill-meta-val">${HenuOsReportEngine.formatDate(bill.billDate)}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label">Due Date:</span><span class="bill-meta-val" style="color:var(--bill-accent); font-weight:700;">${HenuOsReportEngine.formatDate(bill.dueDate)}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label">Contact No:</span><span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.contactNo || '-')}</span></div>
          </div>
        </div>

        <div class="bill-table-wrapper">
          <table class="bill-table">
            <thead>
              <tr>
                ${config.srno ? `<th class="center" style="width:35px;">Sr.No</th>` : ''}
                <th>Particulars / Maintenance Head</th>
                <th class="right" style="width:130px;">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${chargeRows}
              <tr style="background:#e2e8f0; font-weight:bold;">
                ${config.srno ? `<td></td>` : ''}
                <td>Total Current Assessment</td>
                <td class="right">${HenuOsReportEngine.formatINR(currentTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="bill-summary-grid">
          <div class="bill-words-box">
            <div>
              <div style="font-weight:700; color:var(--bill-primary); margin-bottom:2px;">Amount in Words:</div>
              <div style="font-style:italic; line-height:1.3;">${HenuOsReportEngine.escapeHtml(words)}</div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
              <div class="bill-payment-box" style="margin-bottom:0; flex:1; margin-right:8px;">
                <div>
                  <div style="font-weight:700; font-size:7.5pt; color:var(--bill-primary); margin-bottom:1px;">Bank Account for Payment:</div>
                  <div style="font-size:7.5pt;">Bank: <strong>${HenuOsReportEngine.escapeHtml(bankName || 'Society Bank Account')}</strong></div>
                  ${accNo ? `<div style="font-size:7.5pt;">A/C: <strong>${HenuOsReportEngine.escapeHtml(accNo)}</strong> | IFSC: <strong>${HenuOsReportEngine.escapeHtml(ifsc)}</strong></div>` : ''}
                </div>
              </div>
              ${config.qr !== 'none' ? getUpiQrSvg(socName, netPayable) : ''}
            </div>
          </div>

          <div>
            <table class="bill-totals-table">
              <tr>
                <td>Current Bill Assessment:</td>
                <td class="right" style="font-weight:700;">${HenuOsReportEngine.formatINR(currentTotal)}</td>
              </tr>
              ${config.arrears ? `
                <tr>
                  <td>Previous Dues (Principal):</td>
                  <td class="right">${HenuOsReportEngine.formatINR(bill.prevArrears || 0)}</td>
                </tr>
                <tr>
                  <td>Interest on Arrears @ 21%:</td>
                  <td class="right">${HenuOsReportEngine.formatINR(bill.interest || 0)}</td>
                </tr>
                ${(bill.advanceCredit && bill.advanceCredit > 0) ? `
                  <tr>
                    <td>Less Advance / Credit Adjustment:</td>
                    <td class="right" style="color:var(--bill-accent);">(-) ${HenuOsReportEngine.formatINR(bill.advanceCredit)}</td>
                  </tr>
                ` : ''}
              ` : `
                <tr>
                  <td>Previous Balance:</td>
                  <td class="right">${HenuOsReportEngine.formatINR(bill.prevArrears || 0)}</td>
                </tr>
              `}
              <tr class="grand-total">
                <td><strong>NET PAYABLE ON OR BEFORE DUE DATE:</strong></td>
                <td class="right" style="color:var(--bill-primary); font-size:10pt;"><strong>${HenuOsReportEngine.formatINR(netPayable)}</strong></td>
              </tr>
            </table>
          </div>
        </div>

        <div class="bill-terms" style="margin-top:6px; margin-bottom:8px; padding:4px 8px; background:#f8fafc; border:1px solid var(--bill-border); border-radius:3px; font-size:7pt; color:#475569; line-height:1.35;">
          <strong>RULES &amp; INSTRUCTIONS:</strong> 1. Cheque should be drawn in favour of "${HenuOsReportEngine.escapeHtml(socName)}". 2. Under Bye-Law No. 68, simple interest @ 21% p.a. will be levied after due date. 3. Please write Flat No. &amp; Bill No. behind the cheque.
        </div>

        <footer class="bill-footer" style="display:flex; justify-content:space-between; align-items:flex-end;">
          <div style="width:140px; text-align:center;">
            <div style="border-top:1px solid #94a3b8; padding-top:4px; font-size:7.5pt; font-weight:600; color:#475569;">Prepared By (Manager)</div>
          </div>
          ${getSignBlock(socName, config.sign, false)}
        </footer>

        ${config.receipt ? getCounterfoilSlipHtml(soc, bill, mem, netPayable, false) : ''}
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════
  // FORMAT 4: MARATHI FORMAT (मराठी देखभाल देयक व पावती)
  // ═══════════════════════════════════════════════════════════
  function renderMarathi(soc, bill, config, isLast, idx) {
    const rawSocName = soc.SocietyName || soc.societyname || soc.name || 'सहकारी गृहनिर्माण संस्था मर्यादित';
    const socName = rawSocName.includes('सहकारी') ? rawSocName : `${rawSocName} सहकारी गृहनिर्माण संस्था मर्यादित`;
    const regNo = soc.RegistrationNo || soc.registrationno || '';
    const pan = soc.PANNumber || soc.pannumber || soc.pan || '';
    const addr = soc.Address || soc.address || '';
    const bankName = soc.BankName || soc.bankname || '';
    const accNo = soc.BankAccountNo || soc.bankaccountno || '';
    const ifsc = soc.IFSCCode || soc.ifsccode || '';

    const mem = bill.member || {};
    const items = bill.items || [];
    const isPageBreak = config.newpage ? true : !isLast;
    const netPayable = bill.netPayable || bill.totalAmount || 0;
    const words = HenuOsReportEngine.numberToWordsINR(netPayable);

    let chargeRows = '';
    let currentTotal = 0;

    if (items.length > 0) {
      items.forEach((it, itIdx) => {
        const amt = it.amount || 0;
        if (!config.blankhead && amt === 0) return;
        currentTotal += amt;

        chargeRows += `
          <tr>
            ${config.srno ? `<td class="center" style="width:35px;">${itIdx + 1}</td>` : ''}
            <td>${HenuOsReportEngine.escapeHtml(translateMarathiHead(it.accountName || it.description))}</td>
            <td class="right" style="width:130px; font-weight:600;">${HenuOsReportEngine.formatINR(amt)}</td>
          </tr>
        `;
      });
    } else {
      const pAmt = bill.principalAmount || 0;
      currentTotal = pAmt;

      chargeRows = `
        <tr>
          ${config.srno ? `<td class="center">1</td>` : ''}
          <td>सामान्य देखभाल आकार (General Maintenance)</td>
          <td class="right" style="font-weight:600;">${HenuOsReportEngine.formatINR(pAmt)}</td>
        </tr>
      `;
    }

    return `
      <div class="bill-page bill-marathi ${isPageBreak ? 'page-break' : ''}">
        <header class="bill-header">
          <div class="bill-header-left">
            <div class="bill-soc-name" style="font-size:14pt;">${HenuOsReportEngine.escapeHtml(socName)}</div>
            <div class="bill-soc-meta">
              ${regNo ? `नोंदणी क्र.: <strong>${HenuOsReportEngine.escapeHtml(regNo)}</strong> | ` : ''}
              ${pan ? `पॅन क्र.: <strong>${HenuOsReportEngine.escapeHtml(pan)}</strong>` : ''}
            </div>
            <div class="bill-soc-meta">${HenuOsReportEngine.escapeHtml(addr)}</div>
          </div>
        </header>

        <div class="bill-title-bar">
          <div class="bill-doc-title">${HenuOsReportEngine.escapeHtml(config.heading || 'मासिक देखभाल देयक')}</div>
          <div class="bill-doc-period">बिलिंग कालावधी: ${HenuOsReportEngine.escapeHtml(bill.period || formatMarathiDate(bill.billDate))}</div>
        </div>

        <div class="bill-meta-grid">
          <div class="bill-meta-box">
            <div class="bill-meta-title">सभासदाचा तपशील (Member Details)</div>
            <div class="bill-meta-row"><span class="bill-meta-label" style="width:110px;">सभासदाचे नाव:</span><span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.memName || mem.name || '-')}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label" style="width:110px;">सदनिका क्र. व विंग:</span><span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.flatNo || mem.flat || '-')}${config.bldg && mem.wing ? ' (विंग ' + HenuOsReportEngine.escapeHtml(mem.wing) + ')' : ''}${config.bldg && mem.building ? ', ' + HenuOsReportEngine.escapeHtml(mem.building) : ''}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label" style="width:110px;">सभासद कोड:</span><span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.memCode || mem.code || '-')}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label" style="width:110px;">सदनिका क्षेत्रफळ:</span><span class="bill-meta-val">${mem.areaSqft || mem.area || '-'} चौ.फूट</span></div>
          </div>

          <div class="bill-meta-box">
            <div class="bill-meta-title">देयक माहिती (Bill Particulars)</div>
            <div class="bill-meta-row"><span class="bill-meta-label" style="width:110px;">देयक क्रमांक:</span><span class="bill-meta-val" style="color:var(--bill-primary); font-weight:800;">${HenuOsReportEngine.escapeHtml(bill.billNo || '-')}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label" style="width:110px;">देयक दिनांक:</span><span class="bill-meta-val">${formatMarathiDate(bill.billDate)}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label" style="width:110px;">अंतिम देय तारीख:</span><span class="bill-meta-val" style="color:var(--bill-accent); font-weight:700;">${formatMarathiDate(bill.dueDate)}</span></div>
            <div class="bill-meta-row"><span class="bill-meta-label" style="width:110px;">संपर्क क्र.:</span><span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.contactNo || '-')}</span></div>
          </div>
        </div>

        <div class="bill-table-wrapper">
          <table class="bill-table">
            <thead>
              <tr>
                ${config.srno ? `<th class="center" style="width:35px;">अ.क्र.</th>` : ''}
                <th>खर्चाचा तपशील / लेखा शीर्षके (Particulars)</th>
                <th class="right" style="width:130px;">रक्कम (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${chargeRows}
              <tr style="background:#e2e8f0; font-weight:bold;">
                ${config.srno ? `<td></td>` : ''}
                <td>चालू महिन्याची एकूण आकारणी (Current Assessment)</td>
                <td class="right">${HenuOsReportEngine.formatINR(currentTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="bill-summary-grid">
          <div class="bill-words-box">
            <div>
              <div style="font-weight:700; color:var(--bill-primary); margin-bottom:2px;">अक्षरी रक्कम:</div>
              <div style="font-style:italic; line-height:1.3;">${HenuOsReportEngine.escapeHtml(words)}</div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
              <div class="bill-payment-box" style="margin-bottom:0; flex:1; margin-right:8px;">
                <div>
                  <div style="font-weight:700; font-size:7.5pt; color:var(--bill-primary); margin-bottom:1px;">बँक तपशील (Bank Details):</div>
                  <div style="font-size:7.5pt;">बँक: <strong>${HenuOsReportEngine.escapeHtml(bankName || 'सोसायटी बँक खाते')}</strong></div>
                  ${accNo ? `<div style="font-size:7.5pt;">खाते क्र.: <strong>${HenuOsReportEngine.escapeHtml(accNo)}</strong> | IFSC: <strong>${HenuOsReportEngine.escapeHtml(ifsc)}</strong></div>` : ''}
                </div>
              </div>
              ${config.qr !== 'none' ? getUpiQrSvg(socName, netPayable) : ''}
            </div>
          </div>

          <div>
            <table class="bill-totals-table">
              <tr>
                <td>चालू आकारणी रक्कम:</td>
                <td class="right" style="font-weight:700;">${HenuOsReportEngine.formatINR(currentTotal)}</td>
              </tr>
              ${config.arrears ? `
                <tr>
                  <td>मागील मुद्दल थकबाकी (Arrears):</td>
                  <td class="right">${HenuOsReportEngine.formatINR(bill.prevArrears || 0)}</td>
                </tr>
                <tr>
                  <td>थकबाकीवरील व्याज (Interest @ 21%):</td>
                  <td class="right">${HenuOsReportEngine.formatINR(bill.interest || 0)}</td>
                </tr>
                ${(bill.advanceCredit && bill.advanceCredit > 0) ? `
                  <tr>
                    <td>वजा: आगाऊ जमा रक्कम:</td>
                    <td class="right" style="color:var(--bill-accent);">(-) ${HenuOsReportEngine.formatINR(bill.advanceCredit)}</td>
                  </tr>
                ` : ''}
              ` : `
                <tr>
                  <td>मागील शिल्लक (Balance):</td>
                  <td class="right">${HenuOsReportEngine.formatINR(bill.prevArrears || 0)}</td>
                </tr>
              `}
              <tr class="grand-total">
                <td><strong>एकूण देय रक्कम (NET PAYABLE):</strong></td>
                <td class="right" style="color:var(--bill-primary); font-size:10pt;"><strong>${HenuOsReportEngine.formatINR(netPayable)}</strong></td>
              </tr>
            </table>
          </div>
        </div>

        <div class="bill-terms" style="margin-top:6px; margin-bottom:8px; padding:4px 8px; background:#f8fafc; border:1px solid var(--bill-border); border-radius:3px; font-size:7pt; color:#475569; line-height:1.35;">
          <strong>महत्त्वाच्या सूचना:</strong> १. धनादेश "${HenuOsReportEngine.escapeHtml(socName)}" यांच्या नावाने असावा. २. उपविधी क्र. ६८ नुसार अंतिम देय तारखेनंतर भरणा केल्यास दरमहा २१% दराने व्याज आकारले जाईल. ३. धनादेशाच्या मागे सदनिका क्र. व देयक क्र. अवश्य लिहावा.
        </div>

        <footer class="bill-footer" style="display:flex; justify-content:space-between; align-items:flex-end;">
          <div style="width:140px; text-align:center;">
            <div style="border-top:1px solid #94a3b8; padding-top:4px; font-size:7.5pt; font-weight:600; color:#475569;">तयार करणार (लेखापाल)</div>
          </div>
          ${getSignBlock(socName, config.sign, true)}
        </footer>

        ${config.receipt ? getCounterfoilSlipHtml(soc, bill, mem, netPayable, true) : ''}
      </div>
    `;
  }
})();
