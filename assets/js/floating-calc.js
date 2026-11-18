// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — FLOATING ACCOUNTING CALCULATOR ENGINE
// ═══════════════════════════════════════════════════════════

(() => {
  let currentInput = '0';
  let previousOperand = null;
  let currentOperator = null;
  let waitingForNextOperand = false;
  let memoryRegister = 0;
  let historyTape = [];
  let isTapeOpen = false;

  function initFloatingCalculator() {
    setupDraggable();
    setupKeyboardListeners();
    renderTape();
  }

  function toggleFloatingCalculator(forceState) {
    const widget = document.getElementById('floatingCalcWidget');
    const pill = document.getElementById('sbCalcBtn');
    if (!widget) return;

    const shouldShow = (typeof forceState === 'boolean')
      ? forceState
      : (widget.style.display === 'none' || !widget.classList.contains('show'));

    if (shouldShow) {
      widget.style.display = 'flex';
      widget.classList.add('show');
      if (pill) pill.classList.add('active');
      updateDisplay();
    } else {
      widget.classList.remove('show');
      widget.style.display = 'none';
      if (pill) pill.classList.remove('active');
    }
  }

  function updateDisplay() {
    const display = document.getElementById('fcDisplay');
    const history = document.getElementById('fcHistory');
    if (!display || !history) return;

    display.textContent = currentInput;

    if (previousOperand !== null && currentOperator) {
      const opSymbol = currentOperator === '*' ? '×' : (currentOperator === '/' ? '÷' : currentOperator);
      history.textContent = `${previousOperand} ${opSymbol}`;
    } else {
      history.textContent = '\u00A0';
    }
  }

  function handleFloatingCalcInput(val) {
    if (val >= '0' && val <= '9') {
      inputDigit(val);
    } else if (val === '00') {
      inputDigit('0');
      inputDigit('0');
    } else if (val === '.') {
      inputDot();
    } else if (val === '+' || val === '-' || val === '*' || val === '/') {
      inputOperator(val);
    } else if (val === '%') {
      inputPercentage();
    } else if (val === '=') {
      calculateResult();
    } else if (val === 'AC') {
      clearAll();
    } else if (val === 'BACK') {
      backspace();
    }
  }

  function inputDigit(digit) {
    if (waitingForNextOperand) {
      currentInput = String(digit);
      waitingForNextOperand = false;
    } else {
      currentInput = currentInput === '0' ? String(digit) : currentInput + digit;
    }
    updateDisplay();
  }

  function inputDot() {
    if (waitingForNextOperand) {
      currentInput = '0.';
      waitingForNextOperand = false;
    } else if (!currentInput.includes('.')) {
      currentInput += '.';
    }
    updateDisplay();
  }

  function backspace() {
    if (waitingForNextOperand) return;
    if (currentInput.length > 1) {
      currentInput = currentInput.slice(0, -1);
    } else {
      currentInput = '0';
    }
    updateDisplay();
  }

  function clearAll() {
    currentInput = '0';
    previousOperand = null;
    currentOperator = null;
    waitingForNextOperand = false;
    updateDisplay();
  }

  function inputOperator(op) {
    const inputValue = parseFloat(currentInput);

    if (previousOperand === null) {
      previousOperand = inputValue;
    } else if (currentOperator && !waitingForNextOperand) {
      const result = executeSafeMath(previousOperand, inputValue, currentOperator);
      currentInput = formatCalcResult(result);
      previousOperand = result;
    }

    currentOperator = op;
    waitingForNextOperand = true;
    updateDisplay();
  }

  function inputPercentage() {
    const current = parseFloat(currentInput);
    if (isNaN(current)) return;
    const result = current / 100;
    currentInput = formatCalcResult(result);
    updateDisplay();
  }

  function calculateResult() {
    if (previousOperand === null || currentOperator === null || waitingForNextOperand) return;

    const currentVal = parseFloat(currentInput);
    const result = executeSafeMath(previousOperand, currentVal, currentOperator);

    const opSymbol = currentOperator === '*' ? '×' : (currentOperator === '/' ? '÷' : currentOperator);
    const expr = `${previousOperand} ${opSymbol} ${currentVal}`;
    const resStr = formatCalcResult(result);

    addTapeEntry(expr, resStr);

    currentInput = resStr;
    previousOperand = null;
    currentOperator = null;
    waitingForNextOperand = true;
    updateDisplay();
  }

  function executeSafeMath(a, b, op) {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/':
        if (b === 0) {
          flashToast('Cannot divide by zero');
          return 0;
        }
        return a / b;
      default: return b;
    }
  }

  function formatCalcResult(num) {
    if (isNaN(num)) return '0';
    const rounded = Math.round(num * 100000000) / 100000000;
    return String(rounded);
  }

  function handleFloatingCalcMem(cmd) {
    const val = parseFloat(currentInput) || 0;
    const badge = document.getElementById('fcMemBadge');

    switch (cmd) {
      case 'MC':
        memoryRegister = 0;
        flashToast('Memory Cleared');
        break;
      case 'MR':
        currentInput = formatCalcResult(memoryRegister);
        waitingForNextOperand = true;
        updateDisplay();
        flashToast(`Recalled: ${memoryRegister}`);
        break;
      case 'M+':
        memoryRegister += val;
        flashToast(`M+: ${memoryRegister}`);
        break;
      case 'M-':
        memoryRegister -= val;
        flashToast(`M-: ${memoryRegister}`);
        break;
    }

    if (badge) {
      if (memoryRegister !== 0) {
        badge.style.display = 'inline-block';
        badge.textContent = `M: ${memoryRegister}`;
      } else {
        badge.style.display = 'none';
      }
    }
  }

  function addTapeEntry(expr, result) {
    historyTape.unshift({ expr, result, time: new Date().toLocaleTimeString() });
    if (historyTape.length > 30) historyTape.pop();
    renderTape();
  }

  function renderTape() {
    const list = document.getElementById('fcTapeList');
    if (!list) return;

    if (!historyTape || historyTape.length === 0) {
      list.innerHTML = '<div class="fc-tape-empty">No calculations yet.</div>';
      return;
    }

    list.innerHTML = historyTape.map(t => `
      <div class="fc-tape-item" onclick="loadTapeResult('${t.result}')" title="Click to use this value (${t.time})">
        <span class="fc-tape-expr">${escapeHtml(t.expr)} =</span>
        <span class="fc-tape-res">${escapeHtml(t.result)}</span>
      </div>
    `).join('');
  }

  function loadTapeResult(val) {
    currentInput = String(val);
    waitingForNextOperand = true;
    updateDisplay();
    flashToast(`Loaded: ${val}`);
  }

  function clearFloatingCalcTape() {
    historyTape = [];
    renderTape();
    flashToast('Tape Cleared');
  }

  function toggleFloatingCalcTape() {
    const drawer = document.getElementById('fcTapeDrawer');
    const btn = document.getElementById('fcTapeToggleBtn');
    if (!drawer) return;

    isTapeOpen = !isTapeOpen;
    drawer.style.display = isTapeOpen ? 'flex' : 'none';
    if (btn) btn.classList.toggle('active', isTapeOpen);
  }

  function copyFloatingCalcResult() {
    navigator.clipboard.writeText(currentInput).then(() => {
      flashToast(`Copied: ${currentInput}`);
    }).catch(() => {
      flashToast('Failed to copy');
    });
  }

  function flashToast(msg) {
    let toast = document.getElementById('fcToastPill');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'fcToastPill';
      toast.className = 'fc-toast-pill';
      const screen = document.querySelector('.fc-screen');
      if (screen) screen.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 1800);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function setupDraggable() {
    const widget = document.getElementById('floatingCalcWidget');
    const header = document.getElementById('fcHeader');
    if (!widget || !header) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = widget.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      widget.style.bottom = 'auto';
      widget.style.right = 'auto';
      widget.style.left = `${initialLeft}px`;
      widget.style.top = `${initialTop}px`;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    });

    function onMouseMove(e) {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newLeft = initialLeft + dx;
      let newTop = initialTop + dy;

      const maxLeft = window.innerWidth - widget.offsetWidth - 10;
      const maxTop = window.innerHeight - widget.offsetHeight - 10;

      newLeft = Math.max(10, Math.min(newLeft, maxLeft));
      newTop = Math.max(10, Math.min(newTop, maxTop));

      widget.style.left = `${newLeft}px`;
      widget.style.top = `${newTop}px`;
    }

    function onMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
  }

  function setupKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
      // Toggle shortcut: Alt + C
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        toggleFloatingCalculator();
        return;
      }

      const widget = document.getElementById('floatingCalcWidget');
      const isVisible = widget && widget.classList.contains('show');
      if (!isVisible) return;

      // Don't intercept if focus is inside normal input/textarea outside the calculator
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        if (!widget.contains(e.target)) return;
      }

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        inputDigit(e.key);
      } else if (e.key === '.') {
        e.preventDefault();
        inputDot();
      } else if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') {
        e.preventDefault();
        inputOperator(e.key);
      } else if (e.key === '%') {
        e.preventDefault();
        inputPercentage();
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        calculateResult();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (currentInput !== '0') {
          clearAll();
        } else {
          toggleFloatingCalculator(false);
        }
      }
    });
  }

  // Expose global methods
  window.toggleFloatingCalculator = toggleFloatingCalculator;
  window.handleFloatingCalcInput = handleFloatingCalcInput;
  window.handleFloatingCalcMem = handleFloatingCalcMem;
  window.toggleFloatingCalcTape = toggleFloatingCalcTape;
  window.clearFloatingCalcTape = clearFloatingCalcTape;
  window.copyFloatingCalcResult = copyFloatingCalcResult;
  window.loadTapeResult = loadTapeResult;

  document.addEventListener('DOMContentLoaded', initFloatingCalculator);
})();
