// ═══════════════════════════════════════════════════════════
// Co-op Audit Form 1 JS — Statutory Audit Memo
// Connects to /api/statutory/audit-memo (100% DB Driven)
// ═══════════════════════════════════════════════════════════

let auditMemoData = null;

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
  loadAuditData();
});

function getApiBase() {
  if (window.API_BASE_URL) return window.API_BASE_URL;
  if (window.AppConfig && window.AppConfig.apiBase) return window.AppConfig.apiBase;
  if (window.CONFIG && window.CONFIG.API_BASE) return window.CONFIG.API_BASE;
  return 'http://localhost:5002/api';
}

function getActiveSocId() {
  if (window.Auth && typeof window.Auth.getSocietyId === 'function') {
    const s = window.Auth.getSocietyId();
    if (s) return parseInt(s, 10);
  }
  const st = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId');
  return st ? parseInt(st, 10) : 1;
}

async function loadAuditData() {
  const socId = getActiveSocId();
  const tbody = document.getElementById('mainTableBody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:30px;"><div class="erp-spinner"></div> Loading Statutory Audit Memo...</td></tr>';

  try {
    const res = await fetch(`${getApiBase()}/statutory/audit-memo?societyId=${socId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.success) {
      auditMemoData = json;
      if (json.society && json.society.SocietyName) {
        document.getElementById('societyNameDisplay').textContent = `${json.society.SocietyName} (Reg: ${json.society.RegistrationNo || '—'})`;
      }
      renderAuditMemo(json);
    }
  } catch (err) {
    console.error('Failed to load Audit Memo:', err);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger" style="padding:30px;">Error loading Audit Memo: ${err.message}</td></tr>`;
  }
}

function renderAuditMemo(d) {
  const grade = d.recommendedAuditClass || 'A';
  const gradeEl = document.getElementById('auditGradeBadge');
  const gradeTextEl = document.getElementById('auditGradeText');
  gradeEl.textContent = grade;

  if (grade === 'A') {
    gradeEl.style.background = '#15803d';
    gradeTextEl.textContent = "Grade 'A' (Overdue < 10% — Sound Financial Health)";
    gradeTextEl.style.color = '#15803d';
  } else if (grade === 'B') {
    gradeEl.style.background = '#d97706';
    gradeTextEl.textContent = "Grade 'B' (Overdue 10-25% — Satisfactory Recovery)";
    gradeTextEl.style.color = '#d97706';
  } else {
    gradeEl.style.background = '#dc2626';
    gradeTextEl.textContent = "Grade 'C' (Overdue > 25% — Recovery Action Required)";
    gradeTextEl.style.color = '#dc2626';
  }

  if (d.keyMetrics) {
    document.getElementById('sumRecovery').textContent = `${d.keyMetrics.recoveryPercentage}%`;
    document.getElementById('sumCash').textContent = `₹${Number(d.keyMetrics.cashInHandBalance || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}`;
    if (!d.keyMetrics.isCashLimitCompliant) {
      document.getElementById('sumCash').style.color = '#dc2626';
    }
    document.getElementById('sumDefaulters').textContent = `${d.keyMetrics.defaulterCount} / ${d.keyMetrics.totalMembers}`;
  }

  const tbody = document.getElementById('mainTableBody');
  if (Array.isArray(d.auditChecklist)) {
    let html = '';
    d.auditChecklist.forEach(pt => {
      html += `
        <tr>
          <td style="text-align:center; font-weight:700;">${pt.pointNo}</td>
          <td style="font-family:Consolas,monospace; font-size:11px; font-weight:600; color:#1e40af;">${escapeHtml(pt.statutoryClause)}</td>
          <td><strong>${escapeHtml(pt.subject)}</strong></td>
          <td style="font-size:11px; color:#334155;">${escapeHtml(pt.observedStatus)}</td>
          <td style="text-align:center;">
            <span style="display:inline-block; padding:2px 8px; border-radius:3px; font-weight:700; font-size:10px; background:${pt.compliant ? '#dcfce7; color:#166534;' : '#fee2e2; color:#991b1b;'}">
              ${pt.compliant ? 'COMPLIANT' : 'NON-COMPLIANT'}
            </span>
          </td>
          <td style="text-align:center; font-weight:600; font-size:11px; color:#475569;">${escapeHtml(pt.gradeImpact)}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }
}

function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    window.print();
    return;
  }
  if (!auditMemoData) return;
  const wsData = [
    ["CO-OPERATIVE AUDIT FORM NO. 1 — STATUTORY AUDIT MEMO"],
    ["Point No", "Statutory Clause", "Checklist Matter", "Observed Status", "Compliant", "Impact"]
  ];
  auditMemoData.auditChecklist.forEach(pt => {
    wsData.push([pt.pointNo, pt.statutoryClause, pt.subject, pt.observedStatus, pt.compliant ? "YES" : "NO", pt.gradeImpact]);
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Audit_Form_1");
  XLSX.writeFile(wb, "CoOp_Audit_Form_1_Memo.xlsx");
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
