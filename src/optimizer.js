// src/optimizer.js

// Support both Node (Jest) and browser service worker
const _effectiveScore = (typeof require !== 'undefined')
  ? require('./scorer').effectiveScore
  : globalThis.effectiveScore;

const LOW_ENERGY_THRESHOLD = 60;

/**
 * Computes optimal lineup swaps.
 * @param {Array} squad - { id, ovr, energy, position, inStartingXI }
 * @returns {{ swaps: Array, warnings: Array }}
 */
function optimizeLineup(squad) {
  if (!Array.isArray(squad)) return { swaps: [], warnings: [] };
  const swaps = [];
  const warnings = [];
  const starters = squad.filter(p => p.inStartingXI);
  const bench = squad.filter(p => !p.inStartingXI);
  const usedBenchIds = new Set();

  for (const starter of starters) {
    const starterScore = _effectiveScore(starter.ovr, starter.energy);

    if (starter.energy < LOW_ENERGY_THRESHOLD) {
      warnings.push({ playerId: starter.id, type: 'LOW_ENERGY', energy: starter.energy });
    }

    const eligible = bench.filter(
      p => p.position === starter.position && !usedBenchIds.has(p.id)
    );
    if (eligible.length === 0) continue;

    const best = eligible.reduce((a, b) =>
      _effectiveScore(a.ovr, a.energy) > _effectiveScore(b.ovr, b.energy) ? a : b
    );
    const bestScore = _effectiveScore(best.ovr, best.energy);

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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { optimizeLineup };
} else {
  globalThis.optimizeLineup = optimizeLineup;
}
