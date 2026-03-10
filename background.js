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

    // Build a lookup map and derive slot positions from current players
    const playerById = {};
    for (const p of players) playerById[p.id] = p;

    const formationSlots = (formation.positions || []).map(slot => {
      const p = playerById[slot.playerId];
      return {
        index: slot.index,
        playerId: slot.playerId,
        captain: slot.captain,
        position: ((p?.metadata?.positions) || [])[0] || 'UNKNOWN',
      };
    });

    // All squad members (starters + bench) with normalized energy
    const allSquad = players.map(player => ({
      id: player.id,
      energy: player.energy / 100,        // 0-10000 → 0-100
      name: `${player.metadata.firstName} ${player.metadata.lastName}`.trim(),
      playerObj: player,                   // full object for ovrAtPosition()
    }));

    const { swaps, warnings, decisions, newAssignment } = optimizeLineup(allSquad, formationSlots);

    console.log('[MFLES] Lineup analysis:');
    console.table(decisions.map(d => ({
      'Slot Player': d.starter,
      'Pos': d.position,
      'Curr OVR': d.starterOvr,
      'Curr Score': d.starterScore,
      'Assigned': d.inPlayer || d.starter,
      'Asgn OVR': d.inOvr ?? d.starterOvr,
      'Asgn Score': d.inScore ?? d.starterScore,
      'Result': d.swapped ? '✓ SWAP' : 'optimal',
    })));

    if (swaps.length === 0) {
      return { success: true, swaps: [], warnings, message: 'Already optimal' };
    }

    const newFormation = applySwaps(formation, newAssignment);
    await setFormation(clubId, squadId, newFormation, mflToken);

    return { success: true, swaps, warnings };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
