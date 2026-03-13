// fetch_interceptor.js
// Runs in MAIN world (same JS context as the page).
// Wraps window.fetch to capture MFL auth tokens and broadcast them
// via CustomEvent so the isolated content script can forward to background.js.
(function () {
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    const options = args[1] || {};
    const headers = options.headers || {};
    const authHeader =
      headers.Authorization ||
      headers.authorization ||
      (headers instanceof Headers ? headers.get('Authorization') : null);

    if (authHeader) {
      window.dispatchEvent(new CustomEvent('mfl_auth_token', {
        detail: { token: authHeader },
      }));
    }
    return originalFetch.apply(this, args);
  };

  // Listen for refresh requests from the content script (isolated world).
  // Soft-navigate away then back to force the tactics component to remount
  // and re-fetch fresh formation data from the API.
  window.addEventListener('mfl_refresh_ui', () => {
    const router = window.next?.router;
    if (!router) return;
    const tacticsPath = router.asPath;
    const clubPath = tacticsPath.replace('/tactics', '');
    router.push(clubPath).then(() => router.replace(tacticsPath));
  });

  // ── Position OVR tooltip augmentation ──────────────────────────────
  // Runs in MAIN world so ovrAtPosition() from src/positions.js is available.
  // When hovering over a player's position cell the MFL app shows a mini-pitch
  // tooltip. We augment each position circle with the player's calculated OVR
  // at that position using the same ovrAtPosition() logic as the optimizer.

  // Walk the React fiber tree from a known element to find playersListStore
  function getPlayerById(playerId) {
    const el = document.querySelector('[class*="player-position-"]');
    if (!el) return null;
    const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber'));
    if (!fiberKey) return null;
    let fiber = el[fiberKey];
    while (fiber) {
      if (fiber.memoizedProps?.playersListStore?.players) {
        return fiber.memoizedProps.playersListStore.players.find(p => p.id === playerId) || null;
      }
      fiber = fiber.return;
    }
    return null;
  }

  // Coordinate → position label for grey (no-affinity) circles.
  // Derived from MFL pitch SVG layout — these coords are fixed across all players.
  const PITCH_COORD_POSITIONS = {
    '8,34': 'GK',
    '20,55': 'RB', '20,13': 'LB', '20,34': 'CB',
    '37,55': 'RWB', '37,13': 'LWB',
    '84,55': 'RW', '84,13': 'LW',
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

  // Augment each position circle in the tooltip SVG with a calculated OVR number.
  // Coloured circles already have a position label; grey circles are looked up by coordinate.
  function augmentPositionTooltip(tooltipEl, playerId) {
    const player = getPlayerById(playerId);
    if (!player) return;
    const svg = tooltipEl.querySelector('svg');
    if (!svg) return;

    for (const g of svg.querySelectorAll('g')) {
      const circles = g.querySelectorAll(':scope > circle');
      const textEl = g.querySelector(':scope > text');

      if (circles.length === 2 && textEl) {
        // Coloured circle — already labelled, just add OVR below
        const posLabel = textEl.textContent.trim();
        if (!posLabel) continue;
        const ovr = ovrAtPosition(player, posLabel);

        circles[0].setAttribute('r', '5.8'); // outer halo
        circles[1].setAttribute('r', '5');   // inner fill
        textEl.setAttribute('y', '-1.5');
        textEl.setAttribute('font-size', '2.3');
        g.appendChild(makeSvgText('0', '2.8', '3', '900', '#111', String(ovr)));

      } else if (circles.length === 1 && !textEl) {
        // Grey circle — derive position from SVG coordinates
        const m = g.getAttribute('transform')?.match(/translate\((\d+),\s*(\d+)\)/);
        if (!m) continue;
        const posLabel = PITCH_COORD_POSITIONS[`${m[1]},${m[2]}`];
        if (!posLabel) continue;
        const ovr = ovrAtPosition(player, posLabel);

        circles[0].setAttribute('r', '5');
        g.appendChild(makeSvgText('0', '-1.5', '2.3', '700', '#fff', posLabel));
        g.appendChild(makeSvgText('0', '2.8', '3', '900', '#fff', String(ovr)));
      }
    }
  }

  // Track the last hovered player-position element via mouseover (more reliable than
  // CSS :hover which isn't set during synthetic dispatches and can race with real hover).
  let _lastHoveredPlayerId = null;
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[class*="player-position-"]');
    if (!el) return;
    const match = [...el.classList].join(' ').match(/player-position-(\d+)/);
    if (match) _lastHoveredPlayerId = parseInt(match[1], 10);
  }, true);

  // Observe body for the popover being appended (it's fixed-position, direct child of body).
  // Deferred until document.body exists since this script runs at document_start.
  function setupTooltipObserver() {
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && node.classList?.contains('react-tiny-popover-container')) {
            if (_lastHoveredPlayerId != null) {
              augmentPositionTooltip(node, _lastHoveredPlayerId);
            }
          }
        }
      }
    }).observe(document.body, { childList: true });
  }

  if (document.body) {
    setupTooltipObserver();
  } else {
    document.addEventListener('DOMContentLoaded', setupTooltipObserver);
  }
})();
