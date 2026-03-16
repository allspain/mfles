// fetch_interceptor.js
// Runs in MAIN world (same JS context as the page).
// Wraps window.fetch to capture MFL auth tokens and broadcast them
// via CustomEvent so the isolated content script can forward to background.js.
(function () {
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
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

  // ── Player hover detection ──────────────────────────────────────────
  // __reactFiber expando properties are only accessible from MAIN world.
  // We extract player data here and dispatch it as a CustomEvent so the
  // isolated content script can forward it to background.js for OVR computation.

  function getPlayerFromTacticsStore(playerId) {
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

  function getPlayerFromRowFiber(el) {
    const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber'));
    if (!fiberKey) return null;
    let fiber = el[fiberKey];
    while (fiber) {
      const props = fiber.memoizedProps;
      if (props?.row?.metadata?.positions) return props.row;
      if (props?.player?.metadata?.positions) return props.player;
      fiber = fiber.return;
    }
    return null;
  }

  // ── Inline position OVR display ─────────────────────────────────────
  // Write player data to each .inline.cursor-help element's dataset so the
  // isolated world content script can read it without fiber traversal.
  function writePlayerData(el) {
    if (el.dataset.mflPlayer) return;
    // Only position cells — text is exclusively uppercase 2-3 letter codes e.g. "LB, LWB, LM"
    if (!/^[A-Z]{2,3}(,\s*[A-Z]{2,3})*$/.test(el.textContent.trim())) return;
    const player = getPlayerFromRowFiber(el);
    if (!player?.metadata?.positions) return;
    el.dataset.mflPlayer = JSON.stringify({
      id: player.id,
      metadata: {
        positions: player.metadata.positions,
        pace: player.metadata.pace,
        shooting: player.metadata.shooting,
        passing: player.metadata.passing,
        dribbling: player.metadata.dribbling,
        defense: player.metadata.defense,
        physical: player.metadata.physical,
        goalkeeping: player.metadata.goalkeeping,
      },
    });
  }

  function setupPlayerDataWriter() {
    for (const el of document.querySelectorAll('.inline.cursor-help')) writePlayerData(el);
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.classList?.contains('inline') && node.classList?.contains('cursor-help')) {
            writePlayerData(node);
          }
          for (const el of (node.querySelectorAll?.('.inline.cursor-help') ?? [])) {
            writePlayerData(el);
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState !== 'loading') {
    setupPlayerDataWriter();
  } else {
    document.addEventListener('DOMContentLoaded', setupPlayerDataWriter);
  }

  document.addEventListener('mouseover', (e) => {
    let player = null;

    // Tactics page: player ID is encoded in the element's CSS class
    const tacticsEl = e.target.closest('[class*="player-position-"]');
    if (tacticsEl) {
      const match = [...tacticsEl.classList].join(' ').match(/player-position-(\d+)/);
      if (match) player = getPlayerFromTacticsStore(parseInt(match[1], 10));
    }

    // Tactics table + scouting page: player data is in row/player fiber prop
    if (!player) {
      const scoutEl = e.target.closest('.inline.cursor-help');
      if (scoutEl) player = getPlayerFromRowFiber(scoutEl);
    }

    if (player?.metadata?.positions) {
      // Write to dataset — synchronous DOM write visible to isolated world immediately,
      // unlike CustomEvent dispatch which is delivered async across worlds.
      document.body.dataset.mflHoveredPlayer = JSON.stringify({
        id: player.id,
        metadata: {
          positions: player.metadata.positions,
          pace: player.metadata.pace,
          shooting: player.metadata.shooting,
          passing: player.metadata.passing,
          dribbling: player.metadata.dribbling,
          defense: player.metadata.defense,
          physical: player.metadata.physical,
          goalkeeping: player.metadata.goalkeeping,
        },
      });
    }
  }, true);
})();
