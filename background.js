// background.js
// Service worker for MFL Enhancement Suite

importScripts('src/scorer.js', 'src/optimizer.js', 'src/api.js', 'src/tactics.js');

// ── Message handler ──────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STORE_TOKEN') {
    chrome.storage.session.set({ mflToken: message.token }).catch(err =>
      console.error('[MFLES] Failed to store token:', err)
    );
    return;
  }

  if (message.type === 'OPTIMIZE_LINEUP') {
    handleOptimize(message.clubId).then(sendResponse);
    return true; // keep channel open for async response
  }
});

// ── Lineup optimization ──────────────────────────────────────────────
async function handleOptimize(clubId) {
  const { mflToken } = await chrome.storage.session.get('mflToken');

  if (!mflToken) {
    return { success: false, error: 'Not authenticated. Browse any MFL page first.' };
  }

  try {
    const [squad, tactics] = await Promise.all([
      fetchSquad(clubId, mflToken),
      fetchTactics(clubId, mflToken),
    ]);

    // Normalize squad: mark which players are in the starting XI
    // Field names (id, ovr, energy, position, name) will be confirmed in Task 2
    // and may need adjustment after network inspection
    const startingXIIds = new Set(
      (tactics.startingXI || []).map(p => (typeof p === 'object' ? p.id : p))
    );

    const normalizedSquad = squad.map(player => ({
      id: player.id,
      ovr: player.ovr,
      energy: player.energy,
      position: player.position,
      name: player.name || `${player.firstName || ''} ${player.lastName || ''}`.trim(),
      inStartingXI: startingXIIds.has(player.id),
    }));

    const { swaps, warnings } = optimizeLineup(normalizedSquad);

    if (swaps.length === 0) {
      return { success: true, swaps: [], warnings, message: 'Already optimal' };
    }

    const newTactics = applySwaps(tactics, swaps);
    await setTactics(clubId, newTactics, mflToken);

    return { success: true, swaps, warnings };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

