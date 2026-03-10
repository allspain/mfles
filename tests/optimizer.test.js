// tests/optimizer.test.js
const { optimizeLineup } = require('../src/optimizer');

// Build a player for the optimizer
function player(id, overall, energy, positions) {
  const playerObj = {
    metadata: {
      positions,
      pace: overall, shooting: overall, passing: overall,
      dribbling: overall, defense: overall, physical: overall, goalkeeping: overall,
    },
  };
  return { id, energy, name: `Player ${id}`, playerObj };
}

// Build a formation slot
function slot(index, playerId, position) {
  return { index, playerId, position, captain: false };
}

describe('optimizeLineup', () => {
  test('returns empty result for empty/invalid input', () => {
    expect(optimizeLineup(null, [])).toEqual({ swaps: [], warnings: [], decisions: [], newAssignment: {} });
    expect(optimizeLineup([], null)).toEqual({ swaps: [], warnings: [], decisions: [], newAssignment: {} });
  });

  test('keeps current player when they are already optimal', () => {
    const players = [
      player('s1', 80, 95, ['CM']),
      player('b1', 75, 80, ['CM']),
    ];
    const slots = [slot(0, 's1', 'CM')];
    const result = optimizeLineup(players, slots);
    expect(result.swaps).toHaveLength(0);
    expect(result.newAssignment[0].id).toBe('s1');
  });

  test('assigns better player to a slot regardless of starter/bench status', () => {
    const players = [
      player('s1', 80, 40, ['CM']),  // current starter, low energy → low score
      player('b1', 75, 92, ['CM']),  // bench, good energy → higher score
    ];
    const slots = [slot(0, 's1', 'CM')];
    const result = optimizeLineup(players, slots);
    expect(result.swaps).toHaveLength(1);
    expect(result.swaps[0].out.id).toBe('s1');
    expect(result.swaps[0].in.id).toBe('b1');
    expect(result.newAssignment[0].id).toBe('b1');
  });

  test('applies familiarity penalty for players out of position', () => {
    // GK playing CM gets -20 familiarity, making their effective OVR much lower
    const players = [
      player('s1', 80, 80, ['CM']),
      player('b1', 80, 92, ['GK']),  // GK at CM: OVR 60 after penalty → lower score
    ];
    const slots = [slot(0, 's1', 'CM')];
    const result = optimizeLineup(players, slots);
    expect(result.swaps).toHaveLength(0);
  });

  test('prefers secondary-position player over completely unfamiliar player', () => {
    const players = [
      player('s1', 80, 40, ['CDM']),              // fatigued starter
      player('b1', 75, 92, ['CM', 'CDM']),         // CM with CDM secondary (-1 familiarity)
      player('b2', 75, 92, ['GK']),                // GK at CDM (-20 familiarity)
    ];
    const slots = [slot(0, 's1', 'CDM')];
    const result = optimizeLineup(players, slots);
    expect(result.swaps).toHaveLength(1);
    expect(result.swaps[0].in.id).toBe('b1');
  });

  test('never assigns the same player to two slots', () => {
    const players = [
      player('s1', 80, 40, ['CM']),
      player('s2', 78, 40, ['CM']),
      player('b1', 75, 92, ['CM']),  // only one good bench CM
    ];
    const slots = [slot(0, 's1', 'CM'), slot(1, 's2', 'CM')];
    const result = optimizeLineup(players, slots);
    const assignedIds = Object.values(result.newAssignment).map(p => p.id);
    expect(new Set(assignedIds).size).toBe(assignedIds.length); // all unique
  });

  test('considers all players globally — finds optimal cross-slot assignment', () => {
    // Best GK should go to GK slot, best ST to ST slot
    // Even if both are currently on bench
    const players = [
      player('gk_weak',  55, 100, ['GK']),  // current GK starter
      player('st_weak',  55, 100, ['ST']),  // current ST starter
      player('gk_strong',70, 100, ['GK']),  // bench GK
      player('st_strong',70, 100, ['ST']),  // bench ST
    ];
    const slots = [slot(0, 'gk_weak', 'GK'), slot(1, 'st_weak', 'ST')];
    const result = optimizeLineup(players, slots);
    expect(result.newAssignment[0].id).toBe('gk_strong');
    expect(result.newAssignment[1].id).toBe('st_strong');
    expect(result.swaps).toHaveLength(2);
  });

  test('warns about low energy players in the final assigned XI', () => {
    const players = [
      player('s1', 80, 55, ['CM']),  // best OVR, wins slot despite low energy
      player('b1', 40, 80, ['CM']),  // too weak to displace s1
    ];
    const slots = [slot(0, 's1', 'CM')];
    const result = optimizeLineup(players, slots);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ playerId: 's1', type: 'LOW_ENERGY', energy: 55 })
    );
  });

  test('swap result includes ovr, score, energy for both out and in', () => {
    const players = [
      player('s1', 80, 40, ['CM']),
      player('b1', 75, 92, ['CM']),
    ];
    const slots = [slot(0, 's1', 'CM')];
    const result = optimizeLineup(players, slots);
    expect(result.swaps[0].out).toMatchObject({ id: 's1', ovr: expect.any(Number), score: expect.any(Number), energy: 40 });
    expect(result.swaps[0].in).toMatchObject({ id: 'b1', ovr: expect.any(Number), score: expect.any(Number) });
  });

  test('no swap when scores are equal', () => {
    const players = [
      player('s1', 75, 80, ['CM']),
      player('b1', 75, 80, ['CM']),
    ];
    const slots = [slot(0, 's1', 'CM')];
    const result = optimizeLineup(players, slots);
    expect(result.swaps).toHaveLength(0);
  });
});
