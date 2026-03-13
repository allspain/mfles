// content_script.js
// Runs in ISOLATED world. fetch_interceptor.js (MAIN world) wraps window.fetch
// and dispatches 'mfl_auth_token' events which this script forwards to background.js.

// ── Auth token capture ──────────────────────────────────────────────
// Listen for the token dispatched from fetch_interceptor.js (MAIN world)
window.addEventListener('mfl_auth_token', (event) => {
  const { token } = event.detail;
  chrome.runtime.sendMessage({ type: 'STORE_TOKEN', token });
});

// ── Page detection ──────────────────────────────────────────────────
function getClubIdFromUrl() {
  const match = window.location.pathname.match(/\/clubs\/(\w+)\/tactics/);
  return match ? match[1] : null;
}

function onTacticsPage() {
  return getClubIdFromUrl() !== null;
}

// ── UI injection ────────────────────────────────────────────────────
function injectOptimizeButton() {
  if (document.getElementById('mfl-optimize-btn')) return;

  const button = document.createElement('button');
  button.id = 'mfl-optimize-btn';
  button.textContent = 'Optimize Lineup';
  button.className = 'mfl-btn';

  const panel = document.createElement('div');
  panel.id = 'mfl-panel';
  panel.className = 'mfl-panel mfl-hidden';

  // Use fixed positioning so React rerenders can't remove or bury the button.
  document.body.appendChild(button);
  document.body.appendChild(panel);

  button.addEventListener('click', async () => {
    const clubId = getClubIdFromUrl();
    if (!clubId) return;

    setButtonState('loading');

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: 'OPTIMIZE_LINEUP',
        clubId,
      });
    } catch (err) {
      setButtonState('error', 'Extension error');
      return;
    }

    if (!response || !response.success) {
      setButtonState('error', (response && response.error) || 'Unknown error');
      return;
    }

    const suspended = response.suspendedStarters || [];
    if (response.swaps.length === 0 && suspended.length === 0) {
      setButtonState('optimal');
    } else {
      const label = response.swaps.length > 0
        ? `${response.swaps.length} swap${response.swaps.length !== 1 ? 's' : ''} made`
        : `${suspended.length} suspended`;
      setButtonState('success', label);
      renderSwapSummary(panel, response.swaps, response.warnings || [], suspended);
      // Trigger Next.js soft navigation to refresh the formation display
      window.dispatchEvent(new CustomEvent('mfl_refresh_ui'));
    }
  });
}

function setButtonState(state, message) {
  const button = document.getElementById('mfl-optimize-btn');
  if (!button) return;

  const config = {
    idle:    { text: 'Optimize Lineup',   cls: 'mfl-btn',                disabled: false },
    loading: { text: 'Optimizing\u2026',  cls: 'mfl-btn mfl-btn--loading', disabled: true  },
    success: { text: `\u2713 ${message}`, cls: 'mfl-btn mfl-btn--success', disabled: false },
    optimal: { text: '\u2713 Already optimal', cls: 'mfl-btn mfl-btn--success', disabled: false },
    error:   { text: `\u2717 ${message}`, cls: 'mfl-btn mfl-btn--error',   disabled: false },
  };

  const s = config[state] || config.idle;
  button.textContent = s.text;
  button.className = s.cls;
  button.disabled = s.disabled;

  if (state !== 'idle' && state !== 'loading') {
    setTimeout(() => {
      button.textContent = 'Optimize Lineup';
      button.className = 'mfl-btn';
      button.disabled = false;
    }, 4000);
  }
}

function renderSwapSummary(panel, swaps, warnings, suspendedStarters) {
  panel.innerHTML = '';
  panel.classList.remove('mfl-hidden');

  for (const p of (suspendedStarters || [])) {
    const el = document.createElement('p');
    el.className = 'mfl-warning';
    el.textContent = `\u{1F7E5} ${p.name} suspended \u2014 removed from lineup`;
    panel.appendChild(el);
  }

  if (warnings.length > 0) {
    const warnEl = document.createElement('p');
    warnEl.className = 'mfl-warning';
    warnEl.textContent = `\u26a0 ${warnings.length} player(s) below 60% energy`;
    panel.appendChild(warnEl);
  }

  for (const swap of swaps) {
    const row = document.createElement('div');
    row.className = 'mfl-swap-row';

    const outEl = document.createElement('span');
    outEl.className = 'mfl-out';
    outEl.textContent = `OUT ${swap.out.name} (OVR ${swap.out.ovr}, energy ${swap.out.energy}% \u2192 score ${swap.out.score.toFixed(1)})`;

    const inEl = document.createElement('span');
    inEl.className = 'mfl-in';
    inEl.textContent = ` IN  ${swap.in.name} (OVR ${swap.in.ovr}, energy ${swap.in.energy}% \u2192 score ${swap.in.score.toFixed(1)})`;

    row.appendChild(outEl);
    row.appendChild(inEl);
    panel.appendChild(row);
  }

  setTimeout(() => panel.classList.add('mfl-hidden'), 8000);
}

if (onTacticsPage()) {
  injectOptimizeButton();
}

function removeOptimizeButton() {
  document.getElementById('mfl-optimize-btn')?.remove();
  document.getElementById('mfl-panel')?.remove();
}

// Handle SPA navigation and button removal (React rerenders can detach body children)
let lastUrl = location.href;
new MutationObserver(() => {
  // Handle URL change
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (onTacticsPage()) {
      setTimeout(injectOptimizeButton, 500);
    } else {
      removeOptimizeButton();
    }
  }
  // Reinject if button was removed while still on tactics page
  if (onTacticsPage() && !document.getElementById('mfl-optimize-btn')) {
    injectOptimizeButton();
  }
}).observe(document, { subtree: true, childList: true });
