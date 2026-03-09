// tests/tactics.test.js
const { applySwaps } = require('../src/tactics');

describe('applySwaps', () => {
  test('replaces playerId in formation positions', () => {
    const formation = {
      type: '4-3-3_attack',
      positions: [
        { index: 0, playerId: 100, captain: false },
        { index: 1, playerId: 200, captain: false },
      ],
    };
    const swaps = [{ out: { id: 100 }, in: { id: 999 } }];
    const result = applySwaps(formation, swaps);
    expect(result.positions[0].playerId).toBe(999);
    expect(result.positions[1].playerId).toBe(200); // untouched
  });

  test('preserves index and captain fields when swapping', () => {
    const formation = {
      positions: [{ index: 6, playerId: 143257, captain: true }],
    };
    const swaps = [{ out: { id: 143257 }, in: { id: 99999 } }];
    const result = applySwaps(formation, swaps);
    expect(result.positions[0].index).toBe(6);
    expect(result.positions[0].captain).toBe(true);
    expect(result.positions[0].playerId).toBe(99999);
  });

  test('does not mutate the original formation', () => {
    const formation = { positions: [{ index: 0, playerId: 100, captain: false }] };
    applySwaps(formation, [{ out: { id: 100 }, in: { id: 999 } }]);
    expect(formation.positions[0].playerId).toBe(100);
  });

  test('skips and warns when out player not in formation', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const formation = { positions: [{ index: 0, playerId: 100, captain: false }] };
    const result = applySwaps(formation, [{ out: { id: 999 }, in: { id: 888 } }]);
    expect(result.positions[0].playerId).toBe(100);
    expect(warnSpy).toHaveBeenCalledWith('[MFLES] applySwaps: player', 999, 'not found in formation — skipping swap');
    warnSpy.mockRestore();
  });

  test('handles multiple swaps', () => {
    const formation = {
      positions: [
        { index: 0, playerId: 1, captain: false },
        { index: 1, playerId: 2, captain: false },
        { index: 2, playerId: 3, captain: false },
      ],
    };
    const result = applySwaps(formation, [
      { out: { id: 1 }, in: { id: 10 } },
      { out: { id: 3 }, in: { id: 30 } },
    ]);
    expect(result.positions.map(p => p.playerId)).toEqual([10, 2, 30]);
  });
});
