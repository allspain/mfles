// content_script.js
// Runs in ISOLATED world. Handles auth token relay, optimize button, and
// position OVR tooltip augmentation (tactics + scouting pages).

// ── Auth token capture ──────────────────────────────────────────────
// Listen for the token dispatched from fetch_interceptor.js (MAIN world)
window.addEventListener('mfl_auth_token', (event) => {
  const { token } = event.detail;
  try { chrome.runtime.sendMessage({ type: 'STORE_TOKEN', token }); } catch { /* context invalidated */ }
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

// ── Scouting inline position OVR display ────────────────────────────
// fetch_interceptor.js (MAIN world) writes player JSON to each
// .inline.cursor-help element's data-mfl-player attribute via fiber traversal.
// We observe that attribute being set, then send GET_POSITION_OVRS and
// replace the cell content with stacked pill chips.

function augmentPositionCell(el) {
  if (el.dataset.mflAugmented) return;
  let player;
  try { player = JSON.parse(el.dataset.mflPlayer); } catch { return; }
  if (!player?.metadata?.positions) return;
  el.dataset.mflAugmented = '1';
  try {
    chrome.runtime.sendMessage({ type: 'GET_POSITION_OVRS', player })
      .then(response => {
        if (!response?.ovrs || !el.isConnected) return;
        el.style.cssText += 'display:inline-flex;flex-wrap:wrap;gap:3px;align-items:center;cursor:help';
        el.innerHTML = player.metadata.positions.map(pos =>
          `<span class="mfl-pos-chip"><span class="mfl-pos-chip__label">${pos}</span>` +
          `<span class="mfl-pos-chip__ovr">${response.ovrs[pos] ?? ''}</span></span>`
        ).join('');
      })
      .catch(() => {});
  } catch { /* context invalidated */ }
}

function setupInlineOvrObserver() {
  // Handle elements already written by fetch_interceptor.js
  for (const el of document.querySelectorAll('.inline.cursor-help[data-mfl-player]')) {
    augmentPositionCell(el);
  }
  // Watch for data-mfl-player being set (MAIN world writes it after fiber traversal)
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'data-mfl-player') {
        augmentPositionCell(m.target);
      }
    }
  }).observe(document.body, { subtree: true, attributeFilter: ['data-mfl-player'] });
}

// ── Position OVR tooltip augmentation ───────────────────────────────
// Player data is extracted in MAIN world (fetch_interceptor.js) via React
// fiber traversal and written to document.body.dataset.mflHoveredPlayer —
// a synchronous DOM write visible to this isolated world immediately.

// Coordinate → position label for grey (no-affinity) circles.
// Derived from MFL pitch SVG layout — fixed across all players/pages.
const PITCH_COORD_POSITIONS = {
  '8,34':  'GK',
  '20,55': 'RB',  '20,13': 'LB',  '20,34': 'CB',
  '37,55': 'RWB', '37,13': 'LWB',
  '43,34': 'CDM',
  '62,55': 'RM',  '62,13': 'LM',  '62,34': 'CM',
  '75,34': 'CAM',
  '84,55': 'RW',  '84,13': 'LW',
  '86,34': 'CF',
  '97,34': 'ST',
};

function makeSvgText(x, y, fontSize, fontWeight, fill, content) {
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  t.setAttribute('x', x);
  t.setAttribute('y', y);
  t.setAttribute('font-size', fontSize);
  t.setAttribute('font-family', 'sans-serif');
  t.setAttribute('font-weight', fontWeight);
  t.setAttribute('fill', fill);
  t.setAttribute('text-anchor', 'middle');
  t.setAttribute('transform', 'rotate(90)');
  t.textContent = content;
  return t;
}

function augmentSvgWithOvrs(tooltipEl, ovrs) {
  const svg = tooltipEl.querySelector('svg');
  if (!svg) return;

  for (const g of svg.querySelectorAll('g')) {
    const circles = g.querySelectorAll(':scope > circle');
    const textEl = g.querySelector(':scope > text');

    if (circles.length === 2 && textEl) {
      // Coloured circle — already labelled, add OVR below
      const posLabel = textEl.textContent.trim();
      if (!posLabel || !(posLabel in ovrs)) continue;

      circles[0].setAttribute('r', '5.8');
      circles[1].setAttribute('r', '5');
      textEl.setAttribute('y', '-1.5');
      textEl.setAttribute('font-size', '2.3');
      g.appendChild(makeSvgText('0', '2.8', '3', '900', '#111', String(ovrs[posLabel])));

    } else if (circles.length === 1 && !textEl) {
      // Grey circle — derive position from SVG coordinates
      const m = g.getAttribute('transform')?.match(/translate\((\d+),\s*(\d+)\)/);
      if (!m) continue;
      const posLabel = PITCH_COORD_POSITIONS[`${m[1]},${m[2]}`];
      if (!posLabel || !(posLabel in ovrs)) continue;

      circles[0].setAttribute('r', '5');
      g.appendChild(makeSvgText('0', '-1.5', '2.3', '700', '#fff', posLabel));
      g.appendChild(makeSvgText('0', '2.8', '3', '900', '#fff', String(ovrs[posLabel])));
    }
  }
}

// ── Position OVR tooltip augmentation ───────────────────────────────
// Player data is written to document.body.dataset.mflHoveredPlayer by
// fetch_interceptor.js (MAIN world) on mouseover — a synchronous DOM write
// that is immediately visible to this isolated world. Read it when a
// react-tiny-popover-container is added to body.

function setupTooltipObserver() {
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (!node.classList?.contains('react-tiny-popover-container')) continue;

        const playerJson = document.body.dataset.mflHoveredPlayer;
        if (!playerJson) continue;
        let player;
        try { player = JSON.parse(playerJson); } catch { continue; }

<<<<<<< HEAD
        try {
          chrome.runtime.sendMessage({ type: 'GET_POSITION_OVRS', player })
            .then(response => {
              if (response?.ovrs && node.isConnected) {
                augmentSvgWithOvrs(node, response.ovrs);
              }
            })
            .catch(() => {}); // service worker may be sleeping; silently ignore
        } catch {
          // Extension context invalidated (page outlived extension reload) — ignore
        }
      }
    }
  }).observe(document.body, { childList: true });
}

if (document.body) {
  setupTooltipObserver();
  setupInlineOvrObserver();
} else {
  document.addEventListener('DOMContentLoaded', () => {
    setupTooltipObserver();
    setupInlineOvrObserver();
  });
}
