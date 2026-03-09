// background.js
// Service worker for MFL Enhancement Suite

importScripts('src/scorer.js', 'src/positions.js', 'src/optimizer.js', 'src/api.js', 'src/tactics.js');

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
    // Step 1: get squad ID from club (no auth needed)
    const club = await fetchClub(clubId);
    const squadId = club.squads && club.squads[0] && club.squads[0].id;
    if (!squadId) {
      return { success: false, error: 'No squad found for this club.' };
    }

    // Step 2: fetch players and formation in parallel
    const [players, formation] = await Promise.all([
      fetchPlayers(clubId),
      fetchFormation(clubId, squadId, mflToken),
    ]);

    // Normalize players for the optimizer
    const startingXIIds = new Set((formation.positions || []).map(p => p.playerId));

    const squad = players.map(player => ({
      id: player.id,
      energy: player.energy / 100,          // 0-10000 → 0-100
      position: (player.metadata.positions || [])[0] || 'UNKNOWN',
      positions: player.metadata.positions || [],
      name: `${player.metadata.firstName} ${player.metadata.lastName}`.trim(),
      playerObj: player,                     // full object for ovrAtPosition()
      inStartingXI: startingXIIds.has(player.id),
    }));

    const { swaps, warnings, decisions } = optimizeLineup(squad);
    console.log('[MFLES] Lineup analysis:');
    console.table(decisions.map(d => ({
      'Starter': d.starter,
      'Pos': d.position,
      'S.OVR': d.starterOvr,
      'S.Nrg': d.starterEnergy + '%',
      'S.Score': d.starterScore,
      'Best Bench': d.inPlayer || '-',
      'B.OVR': d.inOvr ?? '-',
      'B.Nrg': d.inEnergy != null ? d.inEnergy + '%' : '-',
      'B.Score': d.inScore ?? '-',
      'Result': d.swapped ? '✓ SWAP' : d.reason,
    })));

    if (swaps.length === 0) {
      return { success: true, swaps: [], warnings, message: 'Already optimal' };
    }

    const newFormation = applySwaps(formation, swaps);
    await setFormation(clubId, squadId, newFormation, mflToken);

    return { success: true, swaps, warnings };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
