// src/optimizer.js

const _effectiveScore = (typeof require !== 'undefined')
  ? require('./scorer').effectiveScore
  : globalThis.effectiveScore;

const _ovrAtPosition = (typeof require !== 'undefined')
  ? require('./positions').ovrAtPosition
  : globalThis.ovrAtPosition;

const LOW_ENERGY_THRESHOLD = 60;

/**
 * Computes optimal lineup swaps using position-specific OVR.
 *
 * @param {Array} squad - Players: { id, energy, position, positions, playerObj, inStartingXI }
 *   - energy: 0-100 scale
 *   - position: primary position string (for slot matching)
 *   - positions: full positions array (for familiarity lookup)
 *   - playerObj: full player object passed to ovrAtPosition
 * @returns {{ swaps: Array, warnings: Array }}
 */
function optimizeLineup(squad) {
  if (!Array.isArray(squad)) return { swaps: [], warnings: [], decisions: [] };

  const swaps = [];
  const warnings = [];
  const decisions = [];
  const starters = squad.filter(p => p.inStartingXI);
  const bench = squad.filter(p => !p.inStartingXI);
  const usedBenchIds = new Set();

  for (const starter of starters) {
    const starterOvr = _ovrAtPosition(starter.playerObj, starter.position);
    const starterScore = _effectiveScore(starterOvr, starter.energy);

    if (starter.energy < LOW_ENERGY_THRESHOLD) {
      warnings.push({ playerId: starter.id, type: 'LOW_ENERGY', energy: starter.energy });
    }

    const eligible = bench.filter(p => !usedBenchIds.has(p.id));

    if (eligible.length === 0) {
      decisions.push({ starter: starter.name, position: starter.position, starterOvr, starterScore: +starterScore.toFixed(2), starterEnergy: starter.energy, reason: 'no bench available', swapped: false });
      continue;
    }

    const scored = eligible.map(p => ({
      player: p,
      ovr: _ovrAtPosition(p.playerObj, starter.position),
      score: _effectiveScore(_ovrAtPosition(p.playerObj, starter.position), p.energy),
    }));

    const best = scored.reduce((a, b) => a.score > b.score ? a : b);

    if (best.score > starterScore) {
      swaps.push({
        out: { id: starter.id, name: starter.name, ovr: starterOvr, energy: starter.energy, score: starterScore, position: starter.position },
        in:  { id: best.player.id, name: best.player.name, ovr: best.ovr, energy: best.player.energy, score: best.score, position: starter.position },
      });
      usedBenchIds.add(best.player.id);
      decisions.push({ starter: starter.name, position: starter.position, starterOvr, starterScore: +starterScore.toFixed(2), starterEnergy: starter.energy, inPlayer: best.player.name, inOvr: best.ovr, inScore: +best.score.toFixed(2), inEnergy: best.player.energy, reason: 'swap', swapped: true });
    } else {
      decisions.push({ starter: starter.name, position: starter.position, starterOvr, starterScore: +starterScore.toFixed(2), starterEnergy: starter.energy, inPlayer: best.player.name, inOvr: best.ovr, inScore: +best.score.toFixed(2), inEnergy: best.player.energy, reason: 'starter wins', swapped: false });
    }
  }

  return { swaps, warnings, decisions };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { optimizeLineup };
} else {
  globalThis.optimizeLineup = optimizeLineup;
}
