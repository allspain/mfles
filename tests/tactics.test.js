// tests/tactics.test.js
const { applySwaps } = require('../src/tactics');

describe('applySwaps', () => {
  test('swaps player in object-form startingXI', () => {
    const tactics = {
      formation: '4-3-3',
      startingXI: [{ id: 'p1', pos: 'MID' }, { id: 'p2', pos: 'FWD' }],
    };
    const swaps = [{ out: { id: 'p1' }, in: { id: 'b1' } }];
    const result = applySwaps(tactics, swaps);
    expect(result.startingXI[0].id).toBe('b1');
    expect(result.startingXI[0].pos).toBe('MID'); // preserves other fields
    expect(result.startingXI[1].id).toBe('p2');   // untouched
  });

  test('swaps player in bare-string startingXI', () => {
    const tactics = { startingXI: ['p1', 'p2', 'p3'] };
    const swaps = [{ out: { id: 'p2' }, in: { id: 'b2' } }];
    const result = applySwaps(tactics, swaps);
    expect(result.startingXI).toEqual(['p1', 'b2', 'p3']);
  });

  test('does not mutate the original tactics object', () => {
    const tactics = { startingXI: ['p1'] };
    const swaps = [{ out: { id: 'p1' }, in: { id: 'b1' } }];
    applySwaps(tactics, swaps);
    expect(tactics.startingXI[0]).toBe('p1'); // original unchanged
  });

  test('skips swap and logs warning when out player not found', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const tactics = { startingXI: ['p1', 'p2'] };
    const swaps = [{ out: { id: 'MISSING' }, in: { id: 'b1' } }];
    const result = applySwaps(tactics, swaps);
    expect(result.startingXI).toEqual(['p1', 'p2']); // unchanged
    expect(warnSpy).toHaveBeenCalledWith(
      '[MFLES] applySwaps: player', 'MISSING', 'not found in startingXI — skipping swap'
    );
    warnSpy.mockRestore();
  });

  test('handles multiple swaps correctly', () => {
    const tactics = { startingXI: ['p1', 'p2', 'p3'] };
    const swaps = [
      { out: { id: 'p1' }, in: { id: 'b1' } },
      { out: { id: 'p3' }, in: { id: 'b3' } },
    ];
    const result = applySwaps(tactics, swaps);
    expect(result.startingXI).toEqual(['b1', 'p2', 'b3']);
  });
});
