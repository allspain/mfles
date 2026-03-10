// background.js
// Service worker for MFL Enhancement Suite

importScripts('src/scorer.js', 'src/positions.js', 'src/optimizer.js', 'src/api.js', 'src/tactics.js');

// ── Canonical slot positions per formation type ───────────────────────
// Extracted from MFL app webpack bundle (module 57461).
// Used so the optimizer evaluates each slot at its true position role,
// not the native position of whichever player happens to occupy it.
const FORMATION_SLOT_POSITIONS = {
  '3-4-2-1':          {0:'GK',1:'CB',2:'CB',3:'CB',4:'RM',5:'CM',6:'CM',7:'LM',8:'CF',9:'ST',10:'CF'},
  '3-4-3':            {0:'GK',1:'CB',2:'CB',3:'CB',4:'RM',5:'CM',6:'CM',7:'LM',8:'RW',9:'ST',10:'LW'},
  '3-4-3_diamond':    {0:'GK',1:'CB',2:'CB',3:'CB',4:'RM',5:'CDM',6:'LM',7:'CAM',8:'RW',9:'ST',10:'LW'},
  '3-5-2':            {0:'GK',1:'CB',2:'CB',3:'CB',4:'RM',5:'CM',6:'CDM',7:'CM',8:'LM',9:'ST',10:'ST'},
  '3-5-2_B':          {0:'GK',1:'CB',2:'CB',3:'CB',4:'CDM',5:'CDM',6:'RM',7:'CAM',8:'LM',9:'ST',10:'ST'},
  '4-1-2-1-2':        {0:'GK',1:'RB',2:'CB',3:'CB',4:'LB',5:'RM',6:'CDM',7:'LM',8:'ST',9:'CAM',10:'ST'},
  '4-1-2-1-2_narrow': {0:'GK',1:'RB',2:'CB',3:'CB',4:'LB',5:'CM',6:'CDM',7:'CM',8:'ST',9:'CAM',10:'ST'},
  '4-1-3-2':          {0:'GK',1:'RB',2:'CB',3:'CB',4:'LB',5:'CDM',6:'RM',7:'CM',8:'LM',9:'ST',10:'ST'},
  '4-1-4-1':          {0:'GK',1:'RB',2:'CB',3:'CB',4:'LB',5:'RM',6:'CM',7:'CDM',8:'CM',9:'LM',10:'ST'},
  '4-2-2-2':          {0:'GK',1:'RB',2:'CB',3:'CB',4:'LB',5:'CAM',6:'CDM',7:'CDM',8:'CAM',9:'ST',10:'ST'},
  '4-2-3-1':          {0:'GK',1:'RB',2:'CB',3:'CB',4:'LB',5:'CDM',6:'CAM',7:'CDM',8:'RM',9:'ST',10:'LM'},
  '4-2-4':            {0:'GK',1:'RB',2:'CB',3:'CB',4:'LB',5:'CM',6:'CM',7:'RW',8:'ST',9:'ST',10:'LW'},
  '4-3-1-2':          {0:'GK',1:'RB',2:'CB',3:'CB',4:'LB',5:'CM',6:'CM',7:'CM',8:'ST',9:'CAM',10:'ST'},
  '4-3-2-1':          {0:'GK',1:'RB',2:'CB',3:'CB',4:'LB',5:'CM',6:'CM',7:'CM',8:'CF',9:'ST',10:'CF'},
  '4-3-3':            {0:'GK',1:'RB',2:'CB',3:'CB',4:'LB',5:'CM',6:'CM',7:'CM',8:'RW',9:'ST',10:'LW'},
  '4-3-3_attack':     {0:'GK',1:'RB',2:'CB',3:'CB',4:'LB',5:'CM',6:'CAM',7:'CM',8:'RW',9:'ST',10:'LW'},
  '4-3-3_defend':     {0:'GK',1:'RB',2:'CB',3:'CB',4:'LB',5:'CM',6:'CDM',7:'CM',8:'RW',9:'ST',10:'LW'},
  '4-3-3_false9':     {0:'GK',1:'RB',2:'CB',3:'CB',4:'LB',5:'CM',6:'CDM',7:'CM',8:'RW',9:'CF',10:'LW'},
  '4-4-1-1':          {0:'GK',1:'RB',2:'CB',3:'CB',4:'LB',5:'RM',6:'CM',7:'CM',8:'LM',9:'CF',10:'ST'},
  '4-4-2':            {0:'GK',1:'RB',2:'CB',3:'CB',4:'LB',5:'RM',6:'CM',7:'CM',8:'LM',9:'ST',10:'ST'},
  '4-4-2_B':          {0:'GK',1:'RB',2:'CB',3:'CB',4:'LB',5:'RM',6:'CDM',7:'CDM',8:'LM',9:'ST',10:'ST'},
  '5-2-3':            {0:'GK',1:'RWB',2:'CB',3:'CB',4:'CB',5:'LWB',6:'CM',7:'CM',8:'RW',9:'ST',10:'LW'},
  '5-3-2':            {0:'GK',1:'RWB',2:'CB',3:'CB',4:'CB',5:'LWB',6:'RM',7:'CM',8:'LM',9:'ST',10:'ST'},
  '5-4-1':            {0:'GK',1:'RWB',2:'CB',3:'CB',4:'CB',5:'LWB',6:'RM',7:'CDM',8:'LM',9:'CAM',10:'ST'},
  '5-4-1_flat':       {0:'GK',1:'RWB',2:'CB',3:'CB',4:'CB',5:'LWB',6:'RM',7:'CM',8:'CM',9:'LM',10:'ST'},
};

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

    // Build a lookup map; derive slot positions from the formation type
    // (not the current player), so out-of-position players don't confuse the optimizer.
    const playerById = {};
    for (const p of players) playerById[p.id] = p;

    const slotPositionMap = FORMATION_SLOT_POSITIONS[formation.type] || {};
    const formationSlots = (formation.positions || []).map(slot => {
      const p = playerById[slot.playerId];
      const position =
        slotPositionMap[slot.index] ||
        ((p?.metadata?.positions) || [])[0] ||
        'UNKNOWN';
      return { index: slot.index, playerId: slot.playerId, captain: slot.captain, position };
    });

    // Identify suspended players (red card / accumulated yellows)
    const starterIds = new Set(formationSlots.map(s => s.playerId));
    const suspendedIds = new Set(
      players.filter(p => p.matchesSuspensions?.length > 0).map(p => p.id)
    );
    const suspendedStarters = players
      .filter(p => suspendedIds.has(p.id) && starterIds.has(p.id))
      .map(p => ({
        id: p.id,
        name: `${p.metadata.firstName} ${p.metadata.lastName}`.trim(),
        position: (p.metadata.positions || [])[0] || 'UNKNOWN',
      }));

    if (suspendedStarters.length > 0) {
      console.warn('[MFLES] Suspended starters removed from pool:', suspendedStarters.map(p => p.name));
    }

    // All eligible squad members (starters + bench, excluding suspended)
    const allSquad = players
      .filter(p => !suspendedIds.has(p.id))
      .map(player => ({
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
      return { success: true, swaps: [], warnings, suspendedStarters, message: 'Already optimal' };
    }

    const newFormation = applySwaps(formation, newAssignment);
    await setFormation(clubId, squadId, newFormation, mflToken);

    return { success: true, swaps, warnings, suspendedStarters };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
