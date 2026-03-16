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
