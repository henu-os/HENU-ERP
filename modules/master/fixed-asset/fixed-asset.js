// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — fixed-asset.js
// Fixed Asset Account Structure, Purchase Tracking,
// SLM/WDV Depreciation Automation & Single-Click Net Balance
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';

  var currentAssets = [];
  var currentSummary = {};
  var activeSocietyId = 0;
  var activeFYId = 0;
  var activeFYLabel = '2026-27';

  // ── INIT & EVENT LISTENERS ─────────────────────────────────
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initFixedAssetModule);
  } else {
    setTimeout(initFixedAssetModule, 10);
  }
  window.initFixedAssetModule = initFixedAssetModule;
  window.loadFixedAssets = loadFixedAssets;

  function getApiBase() {
    if (window.APP_CONFIG && window.APP_CONFIG.API_BASE) {
      return window.APP_CONFIG.API_BASE.replace(/\/api\/?$/, '');
    }
    if (window.API_BASE) {
      return window.API_BASE.replace(/\/api\/?$/, '');
    }
    return 'http://localhost:5002';
  }

  function toast(msg, isSuccess) {
    if (window.parent && window.parent.showToast) {
      window.parent.showToast(msg, isSuccess ? 'success' : 'error');
      return;
    }
    if (typeof showToast === 'function') {
      showToast(msg, isSuccess ? 'success' : 'error');
      return;
    }
    var existing = document.getElementById('fa-toast-banner');
    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'fa-toast-banner';
      existing.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:99999; padding:10px 18px; border-radius:6px; font-size:12px; font-weight:600; box-shadow:0 4px 12px rgba(0,0,0,0.15); transition:all 0.3s ease; max-width:400px; display:flex; align-items:center; gap:8px;';
      document.body.appendChild(existing);
    }
    existing.style.background = isSuccess ? '#15803d' : '#dc2626';
    existing.style.color = '#ffffff';
    existing.innerHTML = (isSuccess ? '<i class="bi bi-check-circle-fill"></i> ' : '<i class="bi bi-exclamation-triangle-fill"></i> ') + esc(msg);
    existing.style.opacity = '1';
    existing.style.display = 'flex';
    clearTimeout(existing._tid);
    existing._tid = setTimeout(function () {
      existing.style.opacity = '0';
      setTimeout(function () { existing.style.display = 'none'; }, 300);
    }, 4000);
  }

  async function fetchApiData(endpoint, method, body) {
    method = (method || 'GET').toUpperCase();
    try {
      if (window.API) {
        if (method === 'GET') return await window.API.get(endpoint);
        if (method === 'POST') return await window.API.post(endpoint, body);
        if (method === 'PUT') return await window.API.put(endpoint, body);
        if (method === 'DELETE') return await window.API.delete(endpoint);
      }
    } catch (e) {
      console.warn('API client error, falling back to direct fetch', e);
    }

    var base = getApiBase();
    var url = endpoint.startsWith('http') ? endpoint : (base + endpoint);
    var headers = { 'Content-Type': 'application/json' };
    var token = (window.Auth && Auth.getToken) ? Auth.getToken() : (sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken') || '');
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var sid = activeSocietyId || sessionStorage.getItem('activeSocietyId') || 1;
    if (sid) headers['X-Society-Id'] = sid;
    var fy = activeFYId || sessionStorage.getItem('activeFYId') || 1;
    if (fy) headers['X-FY-Id'] = fy;

    var opts = { method: method, headers: headers };
    if (body && (method === 'POST' || method === 'PUT')) opts.body = JSON.stringify(body);

    var res = await fetch(url, opts);
    if (!res.ok) {
      var errText = await res.text();
      try {
        return JSON.parse(errText);
      } catch (e) {
        return { success: false, message: 'Server error ' + res.status + ': ' + errText };
      }
    }
    return await res.json();
  }

  function getActiveSocietyId() {
    var sid = (window.Auth && window.Auth.getSocietyId) ? window.Auth.getSocietyId() : null;
    return sid || sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '1';
  }

  function getActiveSocietyName() {
    var sName = (window.Auth && window.Auth.getSocietyName) ? window.Auth.getSocietyName() : null;
    return sName || sessionStorage.getItem('activeSocietyName') || localStorage.getItem('activeSocietyName') || 'Society';
  }

  function getActiveFYId() {
    var fy = sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId');
    return fy ? parseInt(fy, 10) : 1;
  }

  function getActiveFYLabel() {
    return sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2026-27';
  }

  async function initFixedAssetModule() {
    activeSocietyId = parseInt(getActiveSocietyId(), 10) || 1;
    activeFYId = getActiveFYId() || 1;
    activeFYLabel = getActiveFYLabel();

    var socNameEl = document.getElementById('fa-society-name');
    if (socNameEl) socNameEl.textContent = getActiveSocietyName();

    var fyLabelEl = document.getElementById('fa-fy-label');
    if (fyLabelEl) fyLabelEl.textContent = 'FY ' + activeFYLabel;

    await loadFixedAssets();
  }

  // ── LOAD FIXED ASSETS & BALANCES ───────────────────────────
  async function loadFixedAssets() {
    try {
      var url = '/api/fixed-assets?societyId=' + activeSocietyId + (activeFYId ? '&fyId=' + activeFYId : '');
      var res = await fetchApiData(url);

      if (res && res.success) {
        currentAssets = res.data || [];
        currentSummary = res.summary || {};

        if (res.financialYear && res.financialYear.fyLabel) {
          activeFYLabel = res.financialYear.fyLabel;
          var fyLabelEl = document.getElementById('fa-fy-label');
          if (fyLabelEl) fyLabelEl.textContent = 'FY ' + activeFYLabel;
        }

        renderKPICards(currentSummary, currentAssets);
        renderAssetTable(currentAssets);
        populateLedgerAssetSelect(currentAssets);
      } else {
        toast((res && res.message) ? res.message : 'Failed to load Fixed Assets', false);
      }
    } catch (err) {
      console.error('Error loading fixed assets:', err);
      toast('Error loading Fixed Assets: ' + err.message, false);
    }
  }

  // ── RENDER KPI SUMMARY CARDS ───────────────────────────────
  function renderKPICards(summary, assets) {
    var setTxt = function (id, txt) {
      var el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    var categories = {};
    (assets || []).forEach(function (a) {
      if (a.assetCategory) categories[a.assetCategory] = true;
    });
    var catCount = Object.keys(categories).length;

    setTxt('kpi-total-assets', assets.length || 0);
    setTxt('kpi-categories', catCount + ' Categories');
    setTxt('kpi-opening-cost', formatINR(summary.totalOpeningCost || 0));
    setTxt('kpi-opening-wdv', 'Opening WDV: ' + formatINR(summary.totalOpeningWDV || 0));
    setTxt('kpi-additions', formatINR(summary.totalAdditions || 0));
    setTxt('kpi-depreciation', formatINR(summary.totalDepreciation || 0));
    setTxt('kpi-net-balance', formatINR(summary.totalNetBookValue || 0));

    var anyPosted = (assets || []).some(function (a) { return a.isDepreciationPosted; });
    var allPosted = (assets || []).length > 0 && (assets || []).every(function (a) { return a.isDepreciationPosted; });
    setTxt('kpi-dep-status', allPosted ? '✓ All Posted (JV)' : (anyPosted ? 'Partially Posted' : 'Pending Calculation'));
  }

  // ── RENDER MAIN TABLE (TAB 1) ──────────────────────────────
  function renderAssetTable(assets) {
    var tbody = document.getElementById('fa-table-body');
    var tfoot = document.getElementById('fa-table-foot');
    if (!tbody) return;

    if (!assets || assets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="13" class="fa-empty-state"><i class="bi bi-inbox"></i> No Fixed Assets found. Click <strong>+ New Asset</strong> above to add one.</td></tr>';
      if (tfoot) tfoot.style.display = 'none';
      return;
    }

    var html = '';
    var totOp = 0, totAdd = 0, totGross = 0, totDep = 0, totNet = 0;

    assets.forEach(function (a, idx) {
      var op = a.openingCost || 0;
      var add = a.additionsDuringYear || 0;
      var gross = a.totalGrossCost || (op + add);
      var dep = a.depreciationDuringYear || 0;
      var net = a.netBookValue || Math.max(0, gross - ((a.openingDepreciation || 0) + dep));

      totOp += op;
      totAdd += add;
      totGross += gross;
      totDep += dep;
      totNet += net;

      var methodBadge = a.depreciationMethod === 'WDV'
        ? '<span class="badge-tag badge-wdv">WDV ' + (a.depreciationRate || 0) + '%</span>'
        : '<span class="badge-tag badge-slm">SLM ' + (a.depreciationRate || 0) + '%</span>';

      var linkedAccs = '<div style="font-size:10px; line-height:1.4;">' +
        '<div><strong>Main:</strong> <span class="badge-tag badge-code">' + esc(a.mainAccCode || '-') + '</span> ' + esc(a.mainAccName || '') + '</div>' +
        '<div><strong>Add:</strong> <span class="badge-tag badge-code">' + esc(a.addAccCode || '-') + '</span></div>' +
        '<div><strong>Dep:</strong> <span class="badge-tag badge-code">' + esc(a.depAccCode || '-') + '</span></div>' +
        '</div>';

      html += '<tr>' +
        '<td style="text-align: center; color: #64748b;">' + (idx + 1) + '</td>' +
        '<td><span class="badge-tag badge-code">' + esc(a.assetCode || '-') + '</span></td>' +
        '<td><strong>' + esc(a.assetName || '') + '</strong></td>' +
        '<td><span class="badge-tag" style="background:#f1f5f9; color:#475569;">' + esc(a.assetCategory || '') + '</span></td>' +
        '<td>' + (a.purchaseDate || '-') + '</td>' +
        '<td>' + methodBadge + '</td>' +
        '<td style="text-align: right;">' + formatINR(op) + '</td>' +
        '<td style="text-align: right; color:#15803d; font-weight:600;">' + (add > 0 ? '+' + formatINR(add) : '₹ 0.00') + '</td>' +
        '<td style="text-align: right; font-weight:600;">' + formatINR(gross) + '</td>' +
        '<td style="text-align: right; color:#7c3aed; font-weight:600;">' + (dep > 0 ? '−' + formatINR(dep) : '₹ 0.00') + '</td>' +
        '<td style="text-align: right; font-weight:700; color:#0369a1; font-size:12.5px;">' + formatINR(net) + '</td>' +
        '<td>' + linkedAccs + '</td>' +
        '<td style="text-align: center; white-space: nowrap;">' +
          '<button class="fa-btn fa-btn-outline" style="padding:3px 7px; margin-right:4px;" title="View 3-Tier Ledger Flow" onclick="inspectAssetLedger(' + a.assetId + ')"><i class="bi bi-diagram-3"></i></button>' +
          '<button class="fa-btn fa-btn-outline" style="padding:3px 7px; margin-right:4px;" title="Edit Asset" onclick="openEditAssetModal(' + a.assetId + ')"><i class="bi bi-pencil"></i></button>' +
          '<button class="fa-btn fa-btn-outline" style="padding:3px 7px; color:#dc2626;" title="Delete Asset" onclick="deleteAsset(' + a.assetId + ')"><i class="bi bi-trash"></i></button>' +
        '</td>' +
      '</tr>';
    });

    tbody.innerHTML = html;

    if (tfoot) {
      tfoot.style.display = 'table-footer-group';
      var setTxt = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = formatINR(v); };
      setTxt('tot-op-cost', totOp);
      setTxt('tot-additions', totAdd);
      setTxt('tot-gross-cost', totGross);
      setTxt('tot-depreciation', totDep);
      setTxt('tot-net-balance', totNet);
    }
  }

  // ── SINGLE-CLICK "CALCULATE NET BALANCE" AUTOMATION ─────────
  window.runCalculateNetBalance = async function () {
    var btn = document.getElementById('btn-calc-net');
    var origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Calculating...';
      btn.disabled = true;
    }

    try {
      var res = await fetchApiData('/api/fixed-assets/calculate-net-balance', 'POST', {
        societyId: activeSocietyId,
        fyId: activeFYId
      });

      if (res && res.success) {
        currentAssets = res.data || [];
        currentSummary = res.summary || {};
        renderKPICards(currentSummary, currentAssets);
        renderAssetTable(currentAssets);
        populateLedgerAssetSelect(currentAssets);

        toast('Net balance calculated successfully for all ' + currentAssets.length + ' fixed assets.', true);
      } else {
        toast((res && res.message) ? res.message : 'Calculation failed', false);
      }
    } catch (err) {
      console.error('Calculate net balance error:', err);
      toast('Calculation error: ' + err.message, false);
    } finally {
      if (btn) {
        btn.innerHTML = origHtml;
        btn.disabled = false;
      }
    }
  };

  // ── TAB 2: 3-TIER LEDGER FLOW (ERP VIEW LIKE SECTION 7) ────
  function populateLedgerAssetSelect(assets) {
    var sel = document.getElementById('fa-ledger-asset-select');
    if (!sel) return;
    var curVal = sel.value;

    var opts = '<option value="">-- Choose an Asset --</option>';
    (assets || []).forEach(function (a) {
      opts += '<option value="' + a.assetId + '">[' + esc(a.assetCode || 'FA') + '] ' + esc(a.assetName || '') + ' (' + esc(a.assetCategory || '') + ')</option>';
    });
    sel.innerHTML = opts;
    if (curVal) sel.value = curVal;
  }

  window.inspectAssetLedger = function (assetId) {
    switchFaTab('ledger');
    var sel = document.getElementById('fa-ledger-asset-select');
    if (sel) {
      sel.value = assetId;
      renderAssetLedgerFlow(assetId);
    }
  };

  window.renderAssetLedgerFlow = async function (assetId) {
    var container = document.getElementById('fa-ledger-view-container');
    if (!container) return;

    if (!assetId) {
      container.innerHTML = '<div class="fa-empty-state" style="padding: 40px;">' +
        '<i class="bi bi-diagram-3" style="font-size: 32px; color: #94a3b8;"></i>' +
        '<div style="font-size: 14px; font-weight: 600; margin-top: 10px;">Select an asset above to view its 3-Tier Ledger Flow</div>' +
        '</div>';
      return;
    }

    container.innerHTML = '<div class="fa-empty-state"><i class="bi bi-hourglass-split"></i> Loading 3-Tier Ledgers...</div>';

    try {
      var res = await fetchApiData('/api/fixed-assets/' + assetId + '?societyId=' + activeSocietyId + (activeFYId ? '&fyId=' + activeFYId : ''));
      if (!res || !res.success || !res.data) {
        container.innerHTML = '<div class="fa-empty-state">Failed to load ledger flow for asset.</div>';
        return;
      }

      var a = res.data;
      var txns = a.ledgerTransactions || [];

      // Split transactions across the 3 accounts
      var mainTxns = txns.filter(function (t) { return t.accountId === a.mainAccountId; });
      var addTxns  = txns.filter(function (t) { return t.accountId === a.additionsSubAccountId; });
      var depTxns  = txns.filter(function (t) { return t.accountId === a.depreciationSubAccountId; });

      var opCost = a.openingCost || 0;
      var opDep  = a.openingDepreciation || 0;
      var totAdd = addTxns.reduce(function (sum, t) { return sum + (t.debit || 0); }, 0);
      var totDep = depTxns.reduce(function (sum, t) { return sum + (t.credit || 0); }, 0);
      if (totDep === 0 && a.depreciationDuringYear) totDep = a.depreciationDuringYear;

      var netBal = Math.max(0, (opCost + totAdd) - (opDep + totDep));

      function buildLedgerTable(rows, initialBal, isCredit) {
        var runningBal = initialBal || 0;
        var rHtml = '';

        if (initialBal > 0) {
          rHtml += '<tr style="background:#fefce8; font-weight:600;">' +
            '<td>01-04-' + activeFYLabel.split('-')[0] + '</td>' +
            '<td>Opening Balance B/f</td>' +
            '<td style="text-align: right;">' + (!isCredit ? formatINR(initialBal) : '-') + '</td>' +
            '<td style="text-align: right;">' + (isCredit ? formatINR(initialBal) : '-') + '</td>' +
            '<td style="text-align: right; font-weight:700;">' + formatINR(runningBal) + '</td>' +
          '</tr>';
        }

        if (rows.length === 0 && initialBal === 0) {
          rHtml += '<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:12px;">No transactions recorded in this sub-account yet.</td></tr>';
        } else {
          rows.forEach(function (r) {
            var dr = r.debit || 0;
            var cr = r.credit || 0;
            if (!isCredit) runningBal += (dr - cr);
            else runningBal += (cr - dr);

            rHtml += '<tr>' +
              '<td>' + (r.voucherDate || '-') + '</td>' +
              '<td>' + esc(r.narration || r.voucherNo || 'Voucher Entry') + '</td>' +
              '<td style="text-align: right;">' + (dr > 0 ? formatINR(dr) : '-') + '</td>' +
              '<td style="text-align: right;">' + (cr > 0 ? formatINR(cr) : '-') + '</td>' +
              '<td style="text-align: right; font-weight:700;">' + formatINR(runningBal) + '</td>' +
            '</tr>';
          });
        }

        return '<table class="fa-table">' +
          '<thead>' +
            '<tr><th style="width:110px;">Date</th><th>Particulars</th><th style="width:120px; text-align:right;">Debit (₹)</th><th style="width:120px; text-align:right;">Credit (₹)</th><th style="width:130px; text-align:right;">Balance (₹)</th></tr>' +
          '</thead>' +
          '<tbody>' + rHtml + '</tbody>' +
        '</table>';
      }

      var html = '' +
        '<!-- 1. MAIN ASSET ACCOUNT -->' +
        '<div class="fa-ledger-card">' +
          '<div class="fa-ledger-card-header main-head">' +
            '<span><i class="bi bi-laptop"></i> ' + esc(a.assetName) + ' (Main Asset Account) — [' + esc(a.mainAccCode || 'MAIN') + ']</span>' +
            '<span>Account Type: Fixed Asset</span>' +
          '</div>' +
          buildLedgerTable(mainTxns, opCost, false) +
        '</div>' +

        '<!-- 2. SUB ACCOUNT: ADDITIONS DURING YEAR -->' +
        '<div class="fa-ledger-card">' +
          '<div class="fa-ledger-card-header add-head">' +
            '<span><i class="bi bi-plus-circle"></i> Additions During Year (Sub Account) — [' + esc(a.addAccCode || 'ADD') + ']</span>' +
            '<span>Auto-Posted from Purchase Vouchers</span>' +
          '</div>' +
          buildLedgerTable(addTxns, 0, false) +
        '</div>' +

        '<!-- 3. SUB ACCOUNT: DEPRECIATION DURING YEAR -->' +
        '<div class="fa-ledger-card">' +
          '<div class="fa-ledger-card-header dep-head">' +
            '<span><i class="bi bi-dash-circle"></i> Depreciation During Year (Sub Account) — [' + esc(a.depAccCode || 'DEP') + ']</span>' +
            '<span>Auto-Posted from Depreciation Engine</span>' +
          '</div>' +
          buildLedgerTable(depTxns, opDep, true) +
        '</div>' +

        '<!-- NET BALANCE CALCULATION BAR (MATCHING SECTION 7 OF DIAGRAM) -->' +
        '<div class="fa-net-balance-summary-box">' +
          '<div>' +
            '<div class="fa-net-formula">' +
              '<i class="bi bi-check-circle-fill"></i> Net Balance = Opening (' + formatINR(opCost) + ') + Additions (' + formatINR(totAdd) + ') − Depreciation (' + formatINR(opDep + totDep) + ')' +
            '</div>' +
            '<div style="font-size:11px; color:#15803d; margin-top:3px;">No double deductions applied. Sub accounts accurately isolated for statutory compliance.</div>' +
          '</div>' +
          '<div style="text-align: right;">' +
            '<div style="font-size:11px; font-weight:700; color:#166534; text-transform:uppercase;">Calculated Net Balance</div>' +
            '<div class="fa-net-result">' + formatINR(netBal) + '</div>' +
          '</div>' +
        '</div>';

      container.innerHTML = html;

    } catch (err) {
      console.error('Error rendering asset ledger flow:', err);
      container.innerHTML = '<div class="fa-empty-state">Error loading ledgers: ' + err.message + '</div>';
    }
  };

  // ── DEPRECIATION ENGINE & POSTING MODAL ─────────────────────
  window.openDepreciationModal = async function () {
    var modal = document.getElementById('modal-dep-calc');
    if (!modal) return;
    modal.style.display = 'flex';

    var fyEl = document.getElementById('dep-calc-fy');
    if (fyEl) fyEl.textContent = activeFYLabel;

    var tbody = document.getElementById('dep-calc-preview-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="fa-empty-state"><i class="bi bi-hourglass-split"></i> Simulating depreciation across all active assets...</td></tr>';

    try {
      var res = await fetchApiData('/api/fixed-assets/calculate-depreciation', 'POST', {
        societyId: activeSocietyId,
        fyId: activeFYId
      });

      if (!res || !res.success || !res.data) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="fa-empty-state">No assets found for depreciation calculation.</td></tr>';
        return;
      }

      var items = res.data || [];
      var summary = res.summary || {};

      var anyAlreadyPosted = (currentAssets || []).some(function (a) { return a.isDepreciationPosted; });
      var warnBox = document.getElementById('dep-calc-warning');
      var chkBox = document.getElementById('box-overwrite');
      if (warnBox) warnBox.style.display = anyAlreadyPosted ? 'flex' : 'none';
      if (chkBox) chkBox.style.display = anyAlreadyPosted ? 'block' : 'none';

      var html = '';
      items.forEach(function (it) {
        html += '<tr>' +
          '<td><strong>' + esc(it.assetName) + '</strong> <span class="badge-tag badge-code">' + esc(it.assetCode) + '</span></td>' +
          '<td>' + esc(it.assetCategory) + '</td>' +
          '<td style="text-align: right;">' + formatINR(it.openingCost || 0) + '</td>' +
          '<td style="text-align: right; color:#15803d;">' + (it.additionsDuringYear > 0 ? '+' + formatINR(it.additionsDuringYear) : '-') + '</td>' +
          '<td style="text-align: center;"><span class="badge-tag badge-slm">' + (it.depreciationRate || 0) + '% ' + (it.depreciationMethod || 'SLM') + '</span></td>' +
          '<td style="text-align: right; font-weight:700; color:#7c3aed;">' + formatINR(it.depreciationAmount || 0) + '</td>' +
          '<td style="text-align: right; font-weight:700; color:#0369a1;">' + formatINR(it.netBookValue || 0) + '</td>' +
        '</tr>';
      });

      if (tbody) tbody.innerHTML = html;

      var setTxt = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = formatINR(v); };
      setTxt('dep-calc-total-amt', summary.totalDepreciation || 0);
      setTxt('dep-calc-total-nbv', summary.totalNetBookValue || 0);
      setTxt('jv-dr-amt', summary.totalDepreciation || 0);
      setTxt('jv-cr-amt', summary.totalDepreciation || 0);

    } catch (err) {
      console.error('Error simulating depreciation:', err);
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="fa-empty-state">Error calculating depreciation: ' + err.message + '</td></tr>';
    }
  };

  window.closeDepreciationModal = function () {
    var modal = document.getElementById('modal-dep-calc');
    if (modal) modal.style.display = 'none';
  };

  window.executePostDepreciation = async function () {
    var btn = document.getElementById('btn-post-dep');
    var chkOverwrite = document.getElementById('chk-overwrite');
    var isOverwrite = chkOverwrite ? chkOverwrite.checked : false;

    var origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Posting JV...';
      btn.disabled = true;
    }

    try {
      var res = await fetchApiData('/api/fixed-assets/post-depreciation', 'POST', {
        societyId: activeSocietyId,
        fyId: activeFYId,
        overwrite: isOverwrite
      });

      if (res && res.success) {
        toast('Success: ' + res.message, true);
        closeDepreciationModal();
        await loadFixedAssets();
      } else if (res && res.isDuplicate) {
        toast(res.message, false);
        var chkBox = document.getElementById('box-overwrite');
        if (chkBox) chkBox.style.display = 'block';
        if (chkOverwrite) chkOverwrite.checked = true;
      } else {
        toast((res && res.message) ? res.message : 'Depreciation posting failed', false);
      }
    } catch (err) {
      console.error('Post depreciation error:', err);
      toast('Error posting depreciation: ' + err.message, false);
    } finally {
      if (btn) {
        btn.innerHTML = origHtml;
        btn.disabled = false;
      }
    }
  };

  // ── NEW / EDIT ASSET MASTER MODAL ──────────────────────────
  window.openNewAssetModal = function () {
    var modal = document.getElementById('modal-asset-form');
    var title = document.getElementById('modal-asset-title');
    var form = document.getElementById('frm-asset');
    if (!modal) return;

    if (form) form.reset();
    document.getElementById('asset-form-id').value = '';
    if (title) title.innerHTML = '<i class="bi bi-plus-circle-fill"></i> Add New Fixed Asset';

    updateAccountPreview('Computer System');
    modal.style.display = 'flex';
  };

  window.openEditAssetModal = function (assetId) {
    var a = currentAssets.find(function (x) { return x.assetId === assetId; });
    if (!a) return;

    var modal = document.getElementById('modal-asset-form');
    var title = document.getElementById('modal-asset-title');
    if (!modal) return;

    document.getElementById('asset-form-id').value = a.assetId;
    document.getElementById('inp-asset-code').value = a.assetCode || '';
    document.getElementById('inp-asset-name').value = a.assetName || '';
    document.getElementById('inp-asset-cat').value = a.assetCategory || 'Computer & Equipment';
    document.getElementById('inp-purchase-date').value = a.purchaseDate || '';
    document.getElementById('inp-dep-method').value = a.depreciationMethod || 'SLM';
    document.getElementById('inp-dep-rate').value = a.depreciationRate || 0;
    document.getElementById('inp-half-rate').value = a.halfYearRate || 0;
    document.getElementById('inp-useful-life').value = a.usefulLifeYears || 0;
    document.getElementById('inp-opening-cost').value = a.openingCost || 0;
    document.getElementById('inp-opening-dep').value = a.openingDepreciation || 0;
    document.getElementById('inp-remarks').value = a.remarks || '';

    if (title) title.innerHTML = '<i class="bi bi-pencil-square"></i> Edit Fixed Asset — ' + esc(a.assetName);
    updateAccountPreview(a.assetName);
    modal.style.display = 'flex';
  };

  window.closeAssetModal = function () {
    var modal = document.getElementById('modal-asset-form');
    if (modal) modal.style.display = 'none';
  };

  window.updateAccountPreview = function (name) {
    var clean = (name || '').trim() || 'Computer System';
    var prevMain = document.getElementById('prev-main-acc');
    var prevAdd  = document.getElementById('prev-add-acc');
    var prevDep  = document.getElementById('prev-dep-acc');
    if (prevMain) prevMain.textContent = clean;
    if (prevAdd)  prevAdd.textContent  = clean + ' - Additions During Year';
    if (prevDep)  prevDep.textContent  = clean + ' - Depreciation During Year';
  };

  window.calcHalfRate = function (val) {
    var num = parseFloat(val) || 0;
    var halfInp = document.getElementById('inp-half-rate');
    if (halfInp && (!halfInp.value || parseFloat(halfInp.value) === 0)) {
      halfInp.value = (num * 0.5).toFixed(2);
    }
  };

  window.handleAssetFormSubmit = async function (e) {
    e.preventDefault();
    var editId = document.getElementById('asset-form-id').value;
    var isEdit = Boolean(editId);

    var payload = {
      societyId: activeSocietyId,
      assetCode: document.getElementById('inp-asset-code').value.trim(),
      assetName: document.getElementById('inp-asset-name').value.trim(),
      assetCategory: document.getElementById('inp-asset-cat').value.trim(),
      purchaseDate: document.getElementById('inp-purchase-date').value || null,
      depreciationMethod: document.getElementById('inp-dep-method').value,
      depreciationRate: parseFloat(document.getElementById('inp-dep-rate').value) || 0,
      halfYearRate: parseFloat(document.getElementById('inp-half-rate').value) || 0,
      usefulLifeYears: parseInt(document.getElementById('inp-useful-life').value, 10) || 0,
      openingCost: parseFloat(document.getElementById('inp-opening-cost').value) || 0,
      openingDepreciation: parseFloat(document.getElementById('inp-opening-dep').value) || 0,
      remarks: document.getElementById('inp-remarks').value.trim()
    };

    var btn = document.getElementById('btn-save-asset');
    var origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Saving...';
      btn.disabled = true;
    }

    try {
      var url = isEdit ? ('/api/fixed-assets/' + editId) : '/api/fixed-assets';
      var method = isEdit ? 'PUT' : 'POST';
      var res = await fetchApiData(url, method, payload);

      if (res && res.success) {
        toast(res.message || 'Asset saved successfully.', true);
        closeAssetModal();
        await loadFixedAssets();
      } else {
        toast((res && res.message) ? res.message : 'Failed to save asset.', false);
      }
    } catch (err) {
      console.error('Error saving asset:', err);
      toast('Error saving asset: ' + err.message, false);
    } finally {
      if (btn) {
        btn.innerHTML = origHtml;
        btn.disabled = false;
      }
    }
  };

  window.deleteAsset = async function (assetId) {
    var a = currentAssets.find(function (x) { return x.assetId === assetId; });
    var name = a ? a.assetName : 'Asset';
    if (!confirm('Are you sure you want to delete ' + name + '? This action will remove the asset master record.')) {
      return;
    }

    try {
      var res = await fetchApiData('/api/fixed-assets/' + assetId + '?societyId=' + activeSocietyId, 'DELETE');
      if (res && res.success) {
        toast('Asset deleted successfully.', true);
        await loadFixedAssets();
      } else {
        toast((res && res.message) ? res.message : 'Failed to delete asset.', false);
      }
    } catch (err) {
      toast('Error deleting asset: ' + err.message, false);
    }
  };

  // ── SEARCH & FILTER ────────────────────────────────────────
  window.handleAssetSearch = function (q) {
    var query = (q || '').toLowerCase().trim();
    if (!query) {
      renderAssetTable(currentAssets);
      return;
    }

    var filtered = currentAssets.filter(function (a) {
      return (a.assetName || '').toLowerCase().includes(query) ||
             (a.assetCode || '').toLowerCase().includes(query) ||
             (a.assetCategory || '').toLowerCase().includes(query) ||
             (a.mainAccName || '').toLowerCase().includes(query) ||
             (a.mainAccCode || '').toLowerCase().includes(query);
    });

    renderAssetTable(filtered);
  };

  window.filterByCategory = function (cat) {
    if (!cat || cat === 'ALL') {
      renderAssetTable(currentAssets);
      return;
    }
    var filtered = currentAssets.filter(function (a) {
      return (a.assetCategory || '').toLowerCase() === cat.toLowerCase();
    });
    renderAssetTable(filtered);
  };

  // ── TAB SWITCHER ───────────────────────────────────────────
  window.switchFaTab = function (tabKey) {
    var btns = document.querySelectorAll('.fa-tab-btn');
    var contents = document.querySelectorAll('.fa-tab-content');
    btns.forEach(function (b) { b.classList.remove('active'); });
    contents.forEach(function (c) { c.classList.remove('active'); });

    var targetContent = document.getElementById('tab-' + tabKey);
    if (targetContent) targetContent.classList.add('active');

    if (tabKey === 'grid') btns[0].classList.add('active');
    else if (tabKey === 'ledger') btns[1].classList.add('active');
    else if (tabKey === 'logs') btns[2].classList.add('active');
  };

  // ── EXPORT TO EXCEL (STATUTORY SCHEDULE) ───────────────────
  window.exportAssetScheduleExcel = function () {
    if (typeof XLSX === 'undefined' || !XLSX.utils) {
      toast('Excel library loading, please wait...', false);
      return;
    }

    var wsData = [
      [getActiveSocietyName()],
      ['FIXED ASSET SCHEDULE — STATUTORY FORM 31'],
      ['Financial Year: ' + activeFYLabel],
      [],
      [
        'Sr No', 'Asset Code', 'Asset Name', 'Category', 'Purchase Date',
        'Dep Method', 'Rate (%)', 'Opening Cost (₹)', 'Additions FY (₹)',
        'Total Gross Cost (₹)', 'Opening Dep (₹)', 'Dep for Year (₹)',
        'Total Accum. Dep (₹)', 'Net Book Value (₹)'
      ]
    ];

    var totOp = 0, totAdd = 0, totGross = 0, totOpDep = 0, totDepYr = 0, totAccDep = 0, totNet = 0;

    currentAssets.forEach(function (a, i) {
      var op = a.openingCost || 0;
      var add = a.additionsDuringYear || 0;
      var gross = a.totalGrossCost || (op + add);
      var opDep = a.openingDepreciation || 0;
      var depYr = a.depreciationDuringYear || 0;
      var accDep = a.totalAccumulatedDep || (opDep + depYr);
      var net = a.netBookValue || Math.max(0, gross - accDep);

      totOp += op;
      totAdd += add;
      totGross += gross;
      totOpDep += opDep;
      totDepYr += depYr;
      totAccDep += accDep;
      totNet += net;

      wsData.push([
        i + 1,
        a.assetCode || '',
        a.assetName || '',
        a.assetCategory || '',
        a.purchaseDate || '',
        a.depreciationMethod || 'SLM',
        a.depreciationRate || 0,
        op, add, gross, opDep, depYr, accDep, net
      ]);
    });

    wsData.push([
      '', '', 'TOTAL', '', '', '', '',
      totOp, totAdd, totGross, totOpDep, totDepYr, totAccDep, totNet
    ]);

    var ws = XLSX.utils.aoa_to_sheet(wsData);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fixed_Asset_Schedule');
    XLSX.writeFile(wb, 'Fixed_Asset_Schedule_' + activeFYLabel + '.xlsx');
    toast('Fixed Asset Schedule exported to Excel.', true);
  };

  // ── PRINT SCHEDULE ─────────────────────────────────────────
  window.printAssetSchedule = function () {
    window.print();
  };

  // ── UTILITY HELPERS ────────────────────────────────────────
  function formatINR(val) {
    var num = parseFloat(val) || 0;
    return '₹ ' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
