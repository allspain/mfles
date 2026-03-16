// src/optimizer.js

const _effectiveScore = (typeof require !== 'undefined')
  ? require('./scorer').effectiveScore
  : globalThis.effectiveScore;

const _ovrAtPosition = (typeof require !== 'undefined')
  ? require('./positions').ovrAtPosition
  : globalThis.ovrAtPosition;

const LOW_ENERGY_THRESHOLD = 60;

/**
 * Finds the globally optimal player-to-slot assignment using a regret-based
 * greedy algorithm (Vogel's approximation). Considers all squad members for
 * all slots simultaneously — not just bench players for each individual slot.
 *
 * @param {Array} allPlayers - All squad members: { id, energy, name, playerObj }
 *   - energy: 0-100 scale
 * @param {Array} formationSlots - Current formation slots: { index, playerId, position, captain }
 *   - position: the position this slot requires (inferred from the current player's primary position)
 * @returns {{ swaps, warnings, decisions, newAssignment }}
 *   - newAssignment: { [slotIndex]: player } — full optimal assignment
 *   - swaps: entries where the assigned player differs from the current player
 */
function optimizeLineup(allPlayers, formationSlots) {
  if (!Array.isArray(allPlayers) || !Array.isArray(formationSlots) || formationSlots.length === 0) {
    return { swaps: [], warnings: [], decisions: [], newAssignment: {} };
  }

  // Build score + OVR matrices for all player × slot combinations
  const scores = {}; // scores[slotIndex][playerId]
  const ovrs = {};   // ovrs[slotIndex][playerId]
  for (const slot of formationSlots) {
    scores[slot.index] = {};
    ovrs[slot.index] = {};
    for (const player of allPlayers) {
      const ovr = _ovrAtPosition(player.playerObj, slot.position);
      ovrs[slot.index][player.id] = ovr;
      scores[slot.index][player.id] = _effectiveScore(ovr, player.energy);
    }
  }

  // Regret-based greedy assignment (Vogel's approximation):
  // Each round, pick the slot with the largest gap between its best and second-best
  // available player (highest "regret" if we don't assign optimally). Assign that
  // slot's best available player and mark them used.
  const newAssignment = {}; // slotIndex → player
  const usedPlayerIds = new Set();
  const remaining = [...formationSlots];

  while (remaining.length > 0) {
    let bestRegret = -Infinity;
    let bestSlotIdx = 0;
    let bestPlayer = null;

    for (let i = 0; i < remaining.length; i++) {
      const slot = remaining[i];
      const available = allPlayers
        .filter(p => !usedPlayerIds.has(p.id))
        .sort((a, b) => scores[slot.index][b.id] - scores[slot.index][a.id]);

      if (available.length === 0) continue;

      const best = available[0];
      const secondScore = available.length > 1 ? scores[slot.index][available[1].id] : -Infinity;
      const regret = scores[slot.index][best.id] - secondScore;

      if (regret > bestRegret) {
        bestRegret = regret;
        bestSlotIdx = i;
        bestPlayer = best;
      }
    }

    const slot = remaining[bestSlotIdx];
    newAssignment[slot.index] = bestPlayer;
    usedPlayerIds.add(bestPlayer.id);
    remaining.splice(bestSlotIdx, 1);
  }

  // Warnings: low energy players in the final XI
  const warnings = [];
  for (const slot of formationSlots) {
    const p = newAssignment[slot.index];
    if (p && p.energy < LOW_ENERGY_THRESHOLD) {
      warnings.push({ playerId: p.id, type: 'LOW_ENERGY', energy: p.energy });
    }
  }

  // Build swaps and decisions by comparing new assignment to current
  const playerById = {};
  for (const p of allPlayers) playerById[p.id] = p;

  const swaps = [];
  const decisions = [];

  for (const slot of formationSlots) {
    const newPlayer = newAssignment[slot.index];
    const newOvr = ovrs[slot.index][newPlayer.id];
    const newScore = scores[slot.index][newPlayer.id];
    const currentPlayer = playerById[slot.playerId];
    const currentOvr = currentPlayer ? ovrs[slot.index][currentPlayer.id] : 0;
    const currentScore = currentPlayer ? scores[slot.index][currentPlayer.id] : 0;

    if (newPlayer.id !== slot.playerId) {
      swaps.push({
        out: {
          id: slot.playerId,
          name: currentPlayer ? currentPlayer.name : `#${slot.playerId}`,
          ovr: currentOvr,
          energy: currentPlayer ? currentPlayer.energy : 0,
          score: +currentScore.toFixed(2),
          position: slot.position,
        },
        in: {
          id: newPlayer.id,
          name: newPlayer.name,
          ovr: newOvr,
          energy: newPlayer.energy,
          score: +newScore.toFixed(2),
          position: slot.position,
        },
      });
      decisions.push({
        starter: currentPlayer ? currentPlayer.name : `#${slot.playerId}`,
        position: slot.position,
        starterOvr: currentOvr,
        starterScore: +currentScore.toFixed(2),
        starterEnergy: currentPlayer ? currentPlayer.energy : 0,
        inPlayer: newPlayer.name,
        inOvr: newOvr,
        inScore: +newScore.toFixed(2),
        inEnergy: newPlayer.energy,
        reason: 'swap',
        swapped: true,
      });
    } else {
      decisions.push({
        starter: newPlayer.name,
        position: slot.position,
        starterOvr: newOvr,
        starterScore: +newScore.toFixed(2),
        starterEnergy: newPlayer.energy,
        reason: 'optimal',
        swapped: false,
      });
    }
  }

  return { swaps, warnings, decisions, newAssignment };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { optimizeLineup };
} else {
  globalThis.optimizeLineup = optimizeLineup;
}
