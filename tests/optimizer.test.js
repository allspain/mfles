// tests/optimizer.test.js
const { optimizeLineup } = require('../src/optimizer');

// Build a player with full metadata for position OVR calculation
function player(id, overall, energy, primaryPosition, allPositions, inStartingXI = false) {
  // Build stats that produce approximately `overall` at `primaryPosition`
  // Use uniform stats of `overall` for simplicity (weights sum to 1 so result ≈ overall)
  const playerObj = {
    metadata: {
      positions: allPositions,
      pace: overall, shooting: overall, passing: overall,
      dribbling: overall, defense: overall, physical: overall, goalkeeping: overall,
    },
  };
  return {
    id,
    energy,
    position: primaryPosition,
    positions: allPositions,
    name: `Player ${id}`,
    playerObj,
    inStartingXI,
  };
}

describe('optimizeLineup', () => {
  test('does not swap when starter scores higher than bench players', () => {
    const squad = [
      player('s1', 80, 95, 'CM', ['CM'], true),   // high energy → high score
      player('b1', 75, 80, 'CM', ['CM'], false),   // lower score
    ];
    const result = optimizeLineup(squad);
    expect(result.swaps).toHaveLength(0);
  });

  test('swaps fatigued starter for fresher bench player with higher score', () => {
    const squad = [
      player('s1', 80, 40, 'CM', ['CM'], true),   // low energy → low score
      player('b1', 75, 92, 'CM', ['CM'], false),  // good energy → high score
    ];
    const result = optimizeLineup(squad);
    expect(result.swaps).toHaveLength(1);
    expect(result.swaps[0].out.id).toBe('s1');
    expect(result.swaps[0].in.id).toBe('b1');
  });

  test('bench player with wrong position scores low due to familiarity and is not selected', () => {
    // A GK on the bench gets -20 familiarity at CM, reducing their effective OVR there.
    // A natural CM at good energy should outscore a GK playing out of position.
    const squad = [
      player('s1', 80, 80, 'CM', ['CM'], true),   // CM at CM: OVR=80, score=64
      player('b1', 80, 92, 'GK', ['GK'], false),  // GK at CM: OVR=60 (after -20), score≈55.2
    ];
    const result = optimizeLineup(squad);
    // CM starter (score 64) beats GK out-of-position (score 55.2) → no swap
    expect(result.swaps).toHaveLength(0);
  });

  test('bench player with secondary position gets -1 familiarity, not -20', () => {
    // CM with CDM as secondary — CDM slot should prefer CM(secondary) over GK
    const squad = [
      player('s1', 80, 40, 'CDM', ['CDM'], true),    // fatigued CDM starter
      player('b1', 75, 92, 'CM', ['CM', 'CDM'], false),  // CM with CDM as secondary (-1)
      player('b2', 75, 92, 'GK', ['GK'], false),     // GK completely unfamiliar
    ];
    const result = optimizeLineup(squad);
    expect(result.swaps).toHaveLength(1);
    expect(result.swaps[0].in.id).toBe('b1'); // CM(secondary CDM) wins over GK
  });

  test('does not use the same bench player for two swaps', () => {
    const squad = [
      player('s1', 80, 40, 'CM', ['CM'], true),
      player('s2', 78, 40, 'CM', ['CM'], true),
      player('b1', 75, 92, 'CM', ['CM'], false), // only one good bench CM
    ];
    const result = optimizeLineup(squad);
    expect(result.swaps).toHaveLength(1);
  });

  test('warns when starter energy below 60%', () => {
    const squad = [
      player('s1', 80, 55, 'CM', ['CM'], true),
      player('b1', 79, 50, 'CM', ['CM'], false),
    ];
    const result = optimizeLineup(squad);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ playerId: 's1', type: 'LOW_ENERGY', energy: 55 })
    );
  });

  test('swap result includes ovr, score, energy for both out and in', () => {
    const squad = [
      player('s1', 80, 40, 'CM', ['CM'], true),
      player('b1', 75, 92, 'CM', ['CM'], false),
    ];
    const result = optimizeLineup(squad);
    expect(result.swaps[0].out).toMatchObject({ id: 's1', ovr: expect.any(Number), score: expect.any(Number), energy: 40 });
    expect(result.swaps[0].in).toMatchObject({ id: 'b1', ovr: expect.any(Number), score: expect.any(Number) });
  });

  test('does not swap when scores are equal', () => {
    const squad = [
      player('s1', 75, 80, 'CM', ['CM'], true),
      player('b1', 75, 80, 'CM', ['CM'], false),
    ];
    const result = optimizeLineup(squad);
    expect(result.swaps).toHaveLength(0);
  });

  test('returns empty result for non-array input', () => {
    expect(optimizeLineup(null)).toEqual({ swaps: [], warnings: [], decisions: [] });
  });
});
