/**
 * nomination-register.js — Jeevika ERP v2
 * Statutory Nomination Register (Form 25 / Bye-Law 32)
 * Fully connected to /api/statutory/nomination-register
 */

(function () {
  'use strict';

  var nominationsData = [];

  document.addEventListener('DOMContentLoaded', function () {
    if (window.Auth && Auth.requireContext) {
      if (!Auth.requireContext()) return;
    }
    initHeaderInfo();
    refreshData();
  });

  function getApiBase() {
    if (window.API_BASE_URL) return window.API_BASE_URL;
    if (window.AppConfig && window.AppConfig.apiBase) return window.AppConfig.apiBase;
    if (window.CONFIG && window.CONFIG.API_BASE) return window.CONFIG.API_BASE;
    return 'http://localhost:5002/api';
  }

  function getActiveSocietyId() {
    return (window.Auth && Auth.getSocietyId) ? Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '1');
  }

  function initHeaderInfo(socInfo) {
    var socName = (socInfo && socInfo.SocietyName) || (window.Auth && Auth.getSocietyName ? Auth.getSocietyName() : 'SHREE SAI CO-OP HOUSING SOCIETY LTD.');
    var regNo = (socInfo && socInfo.RegistrationNo) || localStorage.getItem('jeevika_society_reg_no') || 'REG-MH/MUM/2012/9847';
    var address = (socInfo && socInfo.Address) || localStorage.getItem('jeevika_society_address') || 'Palm Beach Road, Vashi, Navi Mumbai, Maharashtra';

    var today = new Date();
    var dd = String(today.getDate()).padStart(2, '0');
    var mm = String(today.getMonth() + 1).padStart(2, '0');
    var yyyy = today.getFullYear();
    var dateStr = dd + '/' + mm + '/' + yyyy;

    var nameEl = document.getElementById('nr-soc-name');
    var regEl = document.getElementById('nr-soc-reg');
    var dateEl = document.getElementById('nr-date');
    var addrEl = document.getElementById('nr-soc-addr');

    if (nameEl) nameEl.textContent = socName.toUpperCase();
    if (regEl) regEl.textContent = regNo;
    if (dateEl) dateEl.textContent = dateStr;
    if (addrEl) addrEl.textContent = address;
  }

  window.refreshData = async function () {
    var sid = getActiveSocietyId();
    var tbody = document.getElementById('mainTableBody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:30px;"><div class="erp-spinner"></div> Loading Statutory Nomination Register (Bye-Law 32)...</td></tr>';
    }

    try {
      var res = await fetch(getApiBase() + '/statutory/nomination-register?societyId=' + sid);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var json = await res.json();

      if (json.success && Array.isArray(json.data)) {
        if (json.society) initHeaderInfo(json.society);
        nominationsData = json.data.map(function (n, idx) {
          return {
            srNo: n.srNo || (idx + 1),
            memberName: n.memberName + ' (' + n.flatNo + ')',
            nominationDate: n.receiptDate || '—',
            nomineeDetails: '<strong>' + escHtml(n.nomineeName) + '</strong> (' + escHtml(n.relationship || 'Spouse') + ')' +
              (n.nomineeAddress ? '<br><small style="color:#64748b;">' + escHtml(n.nomineeAddress) + '</small>' : ''),
            percentage: Number(n.sharePercentage || 100).toFixed(2) + '%',
            meetingDate: n.committeeApprovalDate || '—',
            revocationDate: (n.status === 'Revoked') ? 'Revoked' : '—',
            remarks: 'Resolution: ' + (n.resolutionNo || 'MC-RES-01') + ' (' + (n.status || 'Active') + ')'
          };
        });
        renderTable(nominationsData);
      } else {
        throw new Error('No records returned');
      }
    } catch (e) {
      console.warn("API fetch error for nominations:", e);
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#ef4444;">Failed to load Nomination Register: ' + e.message + '</td></tr>';
      }
    }
  };

  function renderTable(data) {
    var tbody = document.getElementById('mainTableBody');
    var countEl = document.getElementById('recordCount');
    if (!tbody) return;

    if (countEl) countEl.textContent = 'Total Nominations: ' + data.length;

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#94a3b8;">No Nomination Records Found</td></tr>';
      return;
    }

    var html = '';
    data.forEach(function (r, idx) {
      html += '<tr>' +
        '<td style="text-align:center; font-weight:700; color:#0D47A1;" class="nr-mono">' + (r.srNo || (idx + 1)) + '</td>' +
        '<td style="font-weight:700; color:#0f172a;">' + escHtml(r.memberName) + '</td>' +
        '<td style="text-align:center;" class="nr-mono">' + escHtml(r.nominationDate || '—') + '</td>' +
        '<td>' + (r.nomineeDetails || '—') + '</td>' +
        '<td style="text-align:right; font-weight:700; color:#2E7D32;" class="nr-mono">' + escHtml(r.percentage || '100.00%') + '</td>' +
        '<td style="text-align:center;" class="nr-mono">' + escHtml(r.meetingDate || '—') + '</td>' +
        '<td style="text-align:center; font-weight:700; color:' + (r.revocationDate && r.revocationDate !== '—' ? '#dc2626' : '#64748b') + ';" class="nr-mono">' + escHtml(r.revocationDate || '—') + '</td>' +
        '<td style="font-size:11px;">' + escHtml(r.remarks || '—') + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  window.filterTable = function () {
    var q = (document.getElementById('searchInput').value || '').toLowerCase().trim();
    if (!q) {
      renderTable(nominationsData);
      return;
    }

    var filtered = nominationsData.filter(function (r) {
      return (r.memberName || '').toLowerCase().indexOf(q) !== -1 ||
             (r.nomineeDetails || '').toLowerCase().indexOf(q) !== -1 ||
             (r.remarks || '').toLowerCase().indexOf(q) !== -1 ||
             (r.nominationDate || '').toLowerCase().indexOf(q) !== -1;
    });

    renderTable(filtered);
  };

})();
