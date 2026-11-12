// ═══════════════════════════════════════════════════════════
// Billing Schedule Setup JS — Billing Utilities
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
  loadStoredSchedule();
});

function loadStoredSchedule() {
  const cfg = localStorage.getItem('jeevika_billing_schedule');
  if (cfg) {
    try {
      const parsed = JSON.parse(cfg);
      if (parsed.frequency) document.getElementById('billFrequency').value = parsed.frequency;
      if (parsed.genDay) document.getElementById('billGenDay').value = parsed.genDay;
      if (parsed.graceDays) document.getElementById('graceDays').value = parsed.graceDays;
      if (parsed.prefix) document.getElementById('billPrefix').value = parsed.prefix;
      if (parsed.clause) document.getElementById('interestClause').value = parsed.clause;
    } catch (e) {}
  }
}

function saveSchedule() {
  const cfg = {
    frequency: document.getElementById('billFrequency').value,
    genDay: document.getElementById('billGenDay').value,
    graceDays: document.getElementById('graceDays').value,
    prefix: document.getElementById('billPrefix').value,
    clause: document.getElementById('interestClause').value,
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem('jeevika_billing_schedule', JSON.stringify(cfg));
  if (typeof showToast === 'function') {
    showToast('Billing schedule & run configuration saved successfully!', 'success');
  } else {
    alert('Billing schedule & run configuration saved successfully!');
  }
}

function openBillingMatrix() {
  window.location.href = '../../master/billing-master/billing-master.html';
}

function openBillFormat() {
  window.location.href = '../../member-reports/bill-format/bill-format.html';
}

function generateCurrentMonth() {
  window.location.href = '../../transaction/member-bill/member-bill.html';
}
