// tests/api.test.js
global.fetch = jest.fn();

const { fetchSquad, fetchTactics, setTactics, fetchClubs } = require('../src/api');

const TOKEN = 'Bearer test-token-123';
const CLUB_ID = '5992';

beforeEach(() => {
  fetch.mockClear();
});

describe('fetchSquad', () => {
  test('calls correct endpoint with auth header', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([{ id: 'p1', ovr: 75, energy: 80, position: 'MID' }]),
    });
    const result = await fetchSquad(CLUB_ID, TOKEN);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/clubs/${CLUB_ID}/squad`),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: TOKEN }),
      })
    );
    expect(result[0].id).toBe('p1');
  });

  test('throws on non-ok response', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(fetchSquad(CLUB_ID, TOKEN)).rejects.toThrow('401');
  });
});

describe('fetchTactics', () => {
  test('calls correct endpoint with auth header', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ formation: '4-3-3', startingXI: ['p1'] }),
    });
    const result = await fetchTactics(CLUB_ID, TOKEN);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/clubs/${CLUB_ID}/tactics`),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: TOKEN }),
      })
    );
    expect(result.formation).toBe('4-3-3');
  });
});

describe('setTactics', () => {
  test('POSTs new tactics with auth header and JSON body', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const tactics = { formation: '4-3-3', startingXI: ['p2'] };
    await setTactics(CLUB_ID, tactics, TOKEN);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/clubs/${CLUB_ID}/tactics`),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: TOKEN,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(tactics),
      })
    );
  });
});

describe('fetchClubs', () => {
  test('calls clubs endpoint with auth header', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([{ id: '5992' }, { id: '1234' }]),
    });
    const result = await fetchClubs(TOKEN);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('clubs'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: TOKEN }),
      })
    );
    expect(result).toHaveLength(2);
  });
});
