// src/tactics.js

/**
 * Apply a new assignment to a formation object.
 * newAssignment maps slotIndex → { id } (player object with at least an id).
 * Returns a deep clone with updated playerIds.
 *
 * @param {Object} formation - Raw formation from MFL API
 * @param {Object} newAssignment - { [slotIndex]: { id, ... } }
 * @returns {Object} New formation with updated playerIds
 */
function applySwaps(formation, newAssignment) {
  const newFormation = JSON.parse(JSON.stringify(formation));
  for (const slot of newFormation.positions) {
    const assigned = newAssignment[slot.index];
    if (assigned != null) slot.playerId = assigned.id;
  }
  return newFormation;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applySwaps };
} else {
  globalThis.applySwaps = applySwaps;
}
