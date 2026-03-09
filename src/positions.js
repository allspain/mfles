// src/positions.js

const POSITION_WEIGHTS = [
  { positions: ['GK'],                          weights: [0,    0,    0,    0,    0,    0,    1   ] },
  { positions: ['CB'],                           weights: [0.05, 0,    0.64, 0.09, 0.02, 0.20, 0   ] },
  { positions: ['LWB', 'RWB', 'LB', 'RB'],      weights: [0.19, 0,    0.44, 0.17, 0.10, 0.10, 0   ] },
  { positions: ['CDM'],                          weights: [0.28, 0,    0.40, 0.17, 0,    0.15, 0   ] },
  { positions: ['CM', 'LM', 'RM'],               weights: [0.43, 0.12, 0.10, 0.29, 0,    0.06, 0   ] },
  { positions: ['CAM'],                          weights: [0.34, 0.21, 0,    0.38, 0.07, 0,    0   ] },
  { positions: ['CF', 'LW', 'RW'],               weights: [0.24, 0.23, 0,    0.40, 0.13, 0,    0   ] },
  { positions: ['ST'],                           weights: [0.10, 0.46, 0,    0.29, 0.10, 0.05, 0   ] },
];

const FAMILIARITY = {
  GK:  { GK:0,   CB:-20, RB:-20, LB:-20, RWB:-20, LWB:-20, CDM:-20, CM:-20, CAM:-20, RM:-20, LM:-20, RW:-20, LW:-20, CF:-20, ST:-20 },
  CB:  { GK:-20, CB:0,   RB:-8,  LB:-8,  RWB:-20, LWB:-20, CDM:-8,  CM:-20, CAM:-20, RM:-20, LM:-20, RW:-20, LW:-20, CF:-20, ST:-20 },
  RB:  { GK:-20, CB:-8,  RB:0,   LB:-8,  RWB:-5,  LWB:-20, CDM:-20, CM:-20, CAM:-20, RM:-8,  LM:-20, RW:-20, LW:-20, CF:-20, ST:-20 },
  LB:  { GK:-20, CB:-8,  RB:-8,  LB:0,   RWB:-20, LWB:-5,  CDM:-20, CM:-20, CAM:-20, RM:-20, LM:-8,  RW:-20, LW:-20, CF:-20, ST:-20 },
  RWB: { GK:-20, CB:-20, RB:-5,  LB:-20, RWB:0,   LWB:-8,  CDM:-20, CM:-20, CAM:-20, RM:-8,  LM:-20, RW:-8,  LW:-20, CF:-20, ST:-20 },
  LWB: { GK:-20, CB:-20, RB:-20, LB:-5,  RWB:-8,  LWB:0,   CDM:-20, CM:-20, CAM:-20, RM:-20, LM:-8,  RW:-20, LW:-8,  CF:-20, ST:-20 },
  CDM: { GK:-20, CB:-8,  RB:-20, LB:-20, RWB:-20, LWB:-20, CDM:0,   CM:-5,  CAM:-8,  RM:-20, LM:-20, RW:-20, LW:-20, CF:-20, ST:-20 },
  CM:  { GK:-20, CB:-20, RB:-20, LB:-20, RWB:-20, LWB:-20, CDM:-5,  CM:0,   CAM:-5,  RM:-8,  LM:-8,  RW:-20, LW:-20, CF:-20, ST:-20 },
  CAM: { GK:-20, CB:-20, RB:-20, LB:-20, RWB:-20, LWB:-20, CDM:-8,  CM:-5,  CAM:0,   RM:-20, LM:-20, RW:-20, LW:-20, CF:-5,  ST:-20 },
  RM:  { GK:-20, CB:-20, RB:-8,  LB:-20, RWB:-8,  LWB:-20, CDM:-20, CM:-8,  CAM:-20, RM:0,   LM:-8,  RW:-5,  LW:-20, CF:-20, ST:-20 },
  LM:  { GK:-20, CB:-20, RB:-20, LB:-8,  RWB:-20, LWB:-8,  CDM:-20, CM:-8,  CAM:-20, RM:-8,  LM:0,   RW:-20, LW:-5,  CF:-20, ST:-20 },
  RW:  { GK:-20, CB:-20, RB:-20, LB:-20, RWB:-8,  LWB:-20, CDM:-20, CM:-20, CAM:-20, RM:-5,  LM:-20, RW:0,   LW:-8,  CF:-20, ST:-20 },
  LW:  { GK:-20, CB:-20, RB:-20, LB:-20, RWB:-20, LWB:-8,  CDM:-20, CM:-20, CAM:-20, RM:-20, LM:-5,  RW:-8,  LW:0,   CF:-20, ST:-20 },
  CF:  { GK:-20, CB:-20, RB:-20, LB:-20, RWB:-20, LWB:-20, CDM:-20, CM:-20, CAM:-5,  RM:-20, LM:-20, RW:-20, LW:-20, CF:0,   ST:-5  },
  ST:  { GK:-20, CB:-20, RB:-20, LB:-20, RWB:-20, LWB:-20, CDM:-20, CM:-20, CAM:-20, RM:-20, LM:-20, RW:-20, LW:-20, CF:-5,  ST:0   },
};

const SECONDARY_FAMILIARITY = -1;
const UNKNOWN_FAMILIARITY = -20;

/**
 * Get the familiarity adjustment for a player playing at a target position.
 * @param {string[]} playerPositions - Player's positions array (index 0 = primary)
 * @param {string} targetPosition
 * @returns {number} flat delta added to all stats
 */
function getFamiliarityAdjustment(playerPositions, targetPosition) {
  const primaryPosition = playerPositions[0];

  if (primaryPosition === targetPosition) return 0;

  // Secondary position (explicitly listed but not primary)
  if (playerPositions.slice(1).includes(targetPosition)) return SECONDARY_FAMILIARITY;

  // Use familiarity table for primary → target
  const row = FAMILIARITY[primaryPosition];
  if (row && targetPosition in row) return row[targetPosition];

  return UNKNOWN_FAMILIARITY;
}

/**
 * Calculate a player's OVR at a specific target position.
 * Applies familiarity adjustment first, then position-specific attribute weights.
 *
 * @param {Object} player - Player object with metadata.positions and stat fields
 * @param {string} targetPosition
 * @returns {number} OVR at target position (rounded integer)
 */
function ovrAtPosition(player, targetPosition) {
  const m = player.metadata;
  const adjustment = getFamiliarityAdjustment(m.positions || [], targetPosition);

  const clamp = v => Math.min(99, Math.max(0, v + adjustment));
  const stats = [
    clamp(m.passing),
    clamp(m.shooting),
    clamp(m.defense),
    clamp(m.dribbling),
    clamp(m.pace),
    clamp(m.physical),
    clamp(m.goalkeeping),
  ];

  const group = POSITION_WEIGHTS.find(g => g.positions.includes(targetPosition));
  if (!group) return 0;

  return Math.round(
    stats[0] * group.weights[0] +
    stats[1] * group.weights[1] +
    stats[2] * group.weights[2] +
    stats[3] * group.weights[3] +
    stats[4] * group.weights[4] +
    stats[5] * group.weights[5] +
    stats[6] * group.weights[6]
  );
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ovrAtPosition, getFamiliarityAdjustment };
} else {
  globalThis.ovrAtPosition = ovrAtPosition;
  globalThis.getFamiliarityAdjustment = getFamiliarityAdjustment;
}
