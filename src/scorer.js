// src/scorer.js

/**
 * Calculates a player's effective output score.
 * Below 92% energy: linear scale (energy/100 * ovr)
 * Above 92% energy: diminishing returns on the excess
 *
 * @param {number} ovr - Player overall rating (0-99)
 * @param {number} energy - Player energy percentage (0-100)
 * @returns {number} effective score
 */
function effectiveScore(ovr, energy) {
  if (energy <= 92) {
    return (energy / 100) * ovr;
  }
  const excessMultiplier = 0.92 + 0.08 * (1 - Math.exp(-3 * (energy - 92) / 8));
  return excessMultiplier * ovr;
}

module.exports = { effectiveScore };
