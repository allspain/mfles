// src/tactics.js

/**
 * Apply optimizer swaps to a formation object.
 * The formation's `positions` array contains { index, playerId, captain } objects.
 * Replaces the `playerId` of the `out` player with the `in` player's id.
 *
 * @param {Object} formation - Raw formation from MFL API
 * @param {Array} swaps - Array of { out: { id }, in: { id } }
 * @returns {Object} New formation object with swaps applied
 */
function applySwaps(formation, swaps) {
  const newFormation = JSON.parse(JSON.stringify(formation));
  for (const swap of swaps) {
    const slot = (newFormation.positions || []).find(p => p.playerId === swap.out.id);
    if (!slot) {
      console.warn('[MFLES] applySwaps: player', swap.out.id, 'not found in formation — skipping swap');
      continue;
    }
    slot.playerId = swap.in.id;
  }
  return newFormation;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applySwaps };
} else {
  globalThis.applySwaps = applySwaps;
}
