// ═══════════════════════════════════════════════════════════
// Bill Settings JS — Connected to /api/billing-master/settings
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
  loadSettings();
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

async function loadSettings() {
  const socId = getActiveSocId();
  try {
    const res = await fetch(`${getApiBase()}/billing-master/settings?billType=Maintenance&societyId=${socId}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        if (json.gstCalc) document.getElementById('gstCalcMode').value = json.gstCalc;
        if (json.interestCalc) document.getElementById('interestCalcMode').value = json.interestCalc;
      }
    }
  } catch (e) {
    console.warn('Could not fetch backend billing settings:', e);
  }

  // Load local extra parameters
  const extra = localStorage.getItem('jeevika_bill_settings_extra');
  if (extra) {
    try {
      const p = JSON.parse(extra);
      if (p.interestRate) document.getElementById('interestRate').value = p.interestRate;
      if (p.gracePeriodDays) document.getElementById('gracePeriodDays').value = p.gracePeriodDays;
      if (p.minInterestThreshold) document.getElementById('minInterestThreshold').value = p.minInterestThreshold;
    } catch (e) {}
  }
}

async function saveSettings() {
  const socId = getActiveSocId();
  const gstMode = document.getElementById('gstCalcMode').value;
  const intMode = document.getElementById('interestCalcMode').value;
  const rate = Math.min(21, parseFloat(document.getElementById('interestRate').value) || 21);

  try {
    const res = await fetch(`${getApiBase()}/billing-master/settings?societyId=${socId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        SocietyId: socId,
        BillType: 'Maintenance',
        GSTCalc: gstMode,
        InterestCalc: intMode
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const extra = {
      interestRate: rate,
      gracePeriodDays: document.getElementById('gracePeriodDays').value,
      minInterestThreshold: document.getElementById('minInterestThreshold').value,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem('jeevika_bill_settings_extra', JSON.stringify(extra));

    if (typeof showToast === 'function') {
      showToast('Billing & late fee settings saved successfully!', 'success');
    } else {
      alert('Billing & late fee settings saved successfully!');
    }
  } catch (err) {
    alert('Failed to save settings: ' + err.message);
  }
}
