// tests/scorer.test.js
const { effectiveScore } = require('../src/scorer');

describe('effectiveScore', () => {
  test('energy at 92 uses linear formula: 0.92 * ovr', () => {
    expect(effectiveScore(75, 92)).toBeCloseTo(69.0, 1);
  });

  test('energy at 100 is only marginally better than 92', () => {
    const at92 = effectiveScore(75, 92);
    const at100 = effectiveScore(75, 100);
    // difference should be less than 7 points (diminishing returns keeps it close)
    expect(at100 - at92).toBeLessThan(7);
    expect(at100).toBeGreaterThan(at92);
  });

  test('energy < 92: score is (energy/100) * ovr', () => {
    expect(effectiveScore(75, 80)).toBeCloseTo(60.0, 1);
    expect(effectiveScore(75, 60)).toBeCloseTo(45.0, 1);
    expect(effectiveScore(75, 40)).toBeCloseTo(30.0, 1);
  });

  test('energy 0 gives score 0', () => {
    expect(effectiveScore(75, 0)).toBe(0);
  });

  test('higher OVR at same energy scores higher', () => {
    expect(effectiveScore(85, 80)).toBeGreaterThan(effectiveScore(75, 80));
  });
});
