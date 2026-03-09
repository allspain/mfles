// tests/positions.test.js
const { ovrAtPosition } = require('../src/positions');

// A player with all stats = 50
const flatPlayer = {
  metadata: {
    positions: ['CM'],
    pace: 50, shooting: 50, passing: 50,
    dribbling: 50, defense: 50, physical: 50, goalkeeping: 50,
  },
};

// A real-ish player: CM primary, CDM secondary
const cmPlayer = {
  metadata: {
    positions: ['CM', 'CDM'],
    pace: 30, shooting: 39, passing: 53,
    dribbling: 70, defense: 50, physical: 56, goalkeeping: 0,
  },
};

describe('ovrAtPosition', () => {
  test('returns correct OVR at primary position (no familiarity penalty)', () => {
    // CM weights: pass*0.43 + shoot*0.12 + def*0.10 + drib*0.29 + phys*0.06
    // = 50*0.43 + 50*0.12 + 50*0.10 + 50*0.29 + 50*0.06 = 50
    expect(ovrAtPosition(flatPlayer, 'CM')).toBe(50);
  });

  test('returns lower OVR at secondary position (-1 to all stats)', () => {
    // CDM is secondary for cmPlayer — all stats -1 before weights
    const atPrimary = ovrAtPosition(cmPlayer, 'CM');
    const atSecondary = ovrAtPosition(cmPlayer, 'CDM');
    expect(atSecondary).toBeLessThan(atPrimary);
  });

  test('returns lower OVR at unfamiliar position than secondary', () => {
    // ST is neither primary nor secondary for cmPlayer
    const atSecondary = ovrAtPosition(cmPlayer, 'CDM');
    const atUnfamiliar = ovrAtPosition(cmPlayer, 'ST');
    expect(atUnfamiliar).toBeLessThan(atSecondary);
  });

  test('GK returns 0 for outfield player at GK position', () => {
    // cmPlayer has goalkeeping:0, and with -20 familiarity it becomes 0 clamped
    expect(ovrAtPosition(cmPlayer, 'GK')).toBe(0);
  });

  test('stats are clamped to [0, 99] after familiarity adjustment', () => {
    const lowStatsPlayer = {
      metadata: {
        positions: ['ST'],
        pace: 5, shooting: 5, passing: 5,
        dribbling: 5, defense: 5, physical: 5, goalkeeping: 0,
      },
    };
    // Playing ST at GK = -20 familiarity → all stats become negative → clamped to 0
    const result = ovrAtPosition(lowStatsPlayer, 'GK');
    expect(result).toBe(0);
  });

  test('primary position produces same result as flat familiarity (no penalty)', () => {
    // A flat player at their primary position should get exactly 50
    expect(ovrAtPosition(flatPlayer, 'CM')).toBe(50);
    // Confirm no adjustment is being applied
    const flatCB = {
      metadata: {
        positions: ['CB'],
        pace: 50, shooting: 50, passing: 50,
        dribbling: 50, defense: 50, physical: 50, goalkeeping: 50,
      },
    };
    // CB weights: pass*0.05 + def*0.64 + drib*0.09 + pace*0.02 + phys*0.20
    // = 50*(0.05+0.64+0.09+0.02+0.20) = 50*1.0 = 50
    expect(ovrAtPosition(flatCB, 'CB')).toBe(50);
  });
});
