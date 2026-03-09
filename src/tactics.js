// src/tactics.js

/**
 * Apply optimizer swaps to a tactics object.
 * Handles both object-form ({ id, ... }) and bare-string-ID form for startingXI entries.
 * Deep-clones the tactics object before mutating.
 *
 * @param {Object} tactics - Raw tactics from MFL API (startingXI is array of objects or strings)
 * @param {Array} swaps - Array of { out: { id }, in: { id } } swap descriptors
 * @returns {Object} New tactics object with swaps applied
 */
function applySwaps(tactics, swaps) {
  const newTactics = JSON.parse(JSON.stringify(tactics));
  for (const swap of swaps) {
    const idx = (newTactics.startingXI || []).findIndex(
      p => (typeof p === 'object' ? p.id : p) === swap.out.id
    );
    if (idx === -1) {
      console.warn('[MFLES] applySwaps: player', swap.out.id, 'not found in startingXI — skipping swap');
      continue;
    }
    const original = newTactics.startingXI[idx];
    newTactics.startingXI[idx] = typeof original === 'object'
      ? { ...original, id: swap.in.id }
      : swap.in.id;
  }
  return newTactics;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applySwaps };
} else {
  globalThis.applySwaps = applySwaps;
}
