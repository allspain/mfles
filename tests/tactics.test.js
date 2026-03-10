// tests/tactics.test.js
const { applySwaps } = require('../src/tactics');

describe('applySwaps', () => {
  test('applies new assignment to formation positions', () => {
    const formation = {
      type: '4-3-3_attack',
      positions: [
        { index: 0, playerId: 100, captain: false },
        { index: 1, playerId: 200, captain: false },
      ],
    };
    const newAssignment = { 0: { id: 999 } };
    const result = applySwaps(formation, newAssignment);
    expect(result.positions[0].playerId).toBe(999);
    expect(result.positions[1].playerId).toBe(200); // untouched
  });

  test('preserves index and captain fields', () => {
    const formation = {
      positions: [{ index: 6, playerId: 143257, captain: true }],
    };
    const result = applySwaps(formation, { 6: { id: 99999 } });
    expect(result.positions[0].index).toBe(6);
    expect(result.positions[0].captain).toBe(true);
    expect(result.positions[0].playerId).toBe(99999);
  });

  test('does not mutate the original formation', () => {
    const formation = { positions: [{ index: 0, playerId: 100, captain: false }] };
    applySwaps(formation, { 0: { id: 999 } });
    expect(formation.positions[0].playerId).toBe(100);
  });

  test('handles full assignment across all slots', () => {
    const formation = {
      positions: [
        { index: 0, playerId: 1, captain: false },
        { index: 1, playerId: 2, captain: false },
        { index: 2, playerId: 3, captain: false },
      ],
    };
    const result = applySwaps(formation, {
      0: { id: 10 },
      1: { id: 2 },  // unchanged
      2: { id: 30 },
    });
    expect(result.positions.map(p => p.playerId)).toEqual([10, 2, 30]);
  });

  test('handles position swaps between two starters without collision', () => {
    // Player 1 moves to slot 1, player 2 moves to slot 0 — a direct swap
    const formation = {
      positions: [
        { index: 0, playerId: 1, captain: false },
        { index: 1, playerId: 2, captain: false },
      ],
    };
    const result = applySwaps(formation, { 0: { id: 2 }, 1: { id: 1 } });
    expect(result.positions[0].playerId).toBe(2);
    expect(result.positions[1].playerId).toBe(1);
  });

  test('leaves slot unchanged when not in assignment', () => {
    const formation = {
      positions: [{ index: 0, playerId: 100, captain: false }],
    };
    const result = applySwaps(formation, {}); // empty assignment
    expect(result.positions[0].playerId).toBe(100);
  });
});
