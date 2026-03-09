// tests/optimizer.test.js
const { optimizeLineup } = require('../src/optimizer');

function player(id, ovr, energy, position, inStartingXI = false) {
  return { id, ovr, energy, position, inStartingXI };
}

describe('optimizeLineup', () => {
  test('does not swap when starter scores higher than all bench players', () => {
    const squad = [
      player('s1', 80, 95, 'MID', true),   // high energy, high score
      player('b1', 75, 80, 'MID', false),  // lower score
    ];
    const result = optimizeLineup(squad);
    expect(result.swaps).toHaveLength(0);
  });

  test('swaps fatigued starter for fresher bench player with higher score', () => {
    const squad = [
      player('s1', 80, 40, 'MID', true),   // score = 32
      player('b1', 75, 92, 'MID', false),  // score = 69
    ];
    const result = optimizeLineup(squad);
    expect(result.swaps).toHaveLength(1);
    expect(result.swaps[0].out.id).toBe('s1');
    expect(result.swaps[0].in.id).toBe('b1');
  });

  test('only swaps players at matching positions', () => {
    const squad = [
      player('s1', 80, 40, 'MID', true),   // score = 32
      player('b1', 90, 92, 'FWD', false),  // wrong position — no swap
    ];
    const result = optimizeLineup(squad);
    expect(result.swaps).toHaveLength(0);
  });

  test('picks the bench player with the highest score when multiple eligible', () => {
    const squad = [
      player('s1', 80, 40, 'MID', true),   // score = 32
      player('b1', 70, 92, 'MID', false),  // score = 64.4
      player('b2', 75, 92, 'MID', false),  // score = 69 — best
    ];
    const result = optimizeLineup(squad);
    expect(result.swaps[0].in.id).toBe('b2');
  });

  test('does not use the same bench player for two swaps', () => {
    const squad = [
      player('s1', 80, 40, 'MID', true),   // score = 32
      player('s2', 78, 40, 'MID', true),   // score = 31.2
      player('b1', 75, 92, 'MID', false),  // only one MID bench player
    ];
    const result = optimizeLineup(squad);
    expect(result.swaps).toHaveLength(1); // only one swap possible
  });

  test('warns when starter energy below 60%', () => {
    const squad = [
      player('s1', 80, 55, 'MID', true),  // below 60% — warn
      player('b1', 79, 50, 'MID', false), // lower score, no swap
    ];
    const result = optimizeLineup(squad);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ playerId: 's1', type: 'LOW_ENERGY' })
    );
  });

  test('swap result includes score for both out and in players', () => {
    const squad = [
      player('s1', 80, 40, 'MID', true),
      player('b1', 75, 92, 'MID', false),
    ];
    const result = optimizeLineup(squad);
    expect(result.swaps[0].out).toHaveProperty('score');
    expect(result.swaps[0].in).toHaveProperty('score');
    expect(typeof result.swaps[0].out.score).toBe('number');
    expect(typeof result.swaps[0].in.score).toBe('number');
  });
});
