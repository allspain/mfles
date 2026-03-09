// src/optimizer.js
const { effectiveScore } = require('./scorer');

const LOW_ENERGY_THRESHOLD = 60;

/**
 * Computes optimal lineup swaps.
 * @param {Array} squad - { id, ovr, energy, position, inStartingXI }
 * @returns {{ swaps: Array, warnings: Array }}
 */
function optimizeLineup(squad) {
  const swaps = [];
  const warnings = [];
  const starters = squad.filter(p => p.inStartingXI);
  const bench = squad.filter(p => !p.inStartingXI);
  const usedBenchIds = new Set();

  for (const starter of starters) {
    const starterScore = effectiveScore(starter.ovr, starter.energy);

    if (starter.energy < LOW_ENERGY_THRESHOLD) {
      warnings.push({ playerId: starter.id, type: 'LOW_ENERGY', energy: starter.energy });
    }

    const eligible = bench.filter(
      p => p.position === starter.position && !usedBenchIds.has(p.id)
    );
    if (eligible.length === 0) continue;

    const best = eligible.reduce((a, b) =>
      effectiveScore(a.ovr, a.energy) > effectiveScore(b.ovr, b.energy) ? a : b
    );
    const bestScore = effectiveScore(best.ovr, best.energy);

    if (bestScore > starterScore) {
      swaps.push({
        out: { ...starter, score: starterScore },
        in: { ...best, score: bestScore },
      });
      usedBenchIds.add(best.id);
    }
  }

  return { swaps, warnings };
}

module.exports = { optimizeLineup };
