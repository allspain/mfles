// tests/api.test.js
global.fetch = jest.fn();

const { fetchClub, fetchPlayers, fetchFormation, setFormation } = require('../src/api');

const TOKEN = 'Bearer test-token-123';
const CLUB_ID = '7338';
const SQUAD_ID = '105409';

beforeEach(() => {
  fetch.mockClear();
});

describe('fetchClub', () => {
  test('calls /clubs/:id without auth header', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 7338, squads: [{ id: 105409, type: 'PREMIERE' }] }),
    });
    const result = await fetchClub(CLUB_ID);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/clubs/${CLUB_ID}`),
      expect.objectContaining({ headers: expect.not.objectContaining({ Authorization: expect.anything() }) })
    );
    expect(result.squads[0].id).toBe(105409);
  });
});

describe('fetchPlayers', () => {
  test('calls /clubs/:id/players without auth header', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([{ id: 270735, metadata: { overall: 56, positions: ['CM'] }, energy: 9200 }]),
    });
    const result = await fetchPlayers(CLUB_ID);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/clubs/${CLUB_ID}/players`),
      expect.anything()
    );
    expect(result[0].id).toBe(270735);
  });
});

describe('fetchFormation', () => {
  test('calls correct endpoint with auth header', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 4300143, type: '4-3-3_attack', positions: [] }),
    });
    const result = await fetchFormation(CLUB_ID, SQUAD_ID, TOKEN);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/clubs/${CLUB_ID}/squads/${SQUAD_ID}/formation`),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: TOKEN }),
      })
    );
    expect(result.type).toBe('4-3-3_attack');
  });

  test('throws on non-ok response', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(fetchFormation(CLUB_ID, SQUAD_ID, TOKEN)).rejects.toThrow('401');
  });
});

describe('setFormation', () => {
  test('POSTs formation with auth header and JSON body', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const formation = { id: 4300143, type: '4-3-3_attack', positions: [{ index: 0, playerId: 1, captain: false }] };
    const { id: _id, ...expectedBody } = formation; // id is stripped from POST body
    await setFormation(CLUB_ID, SQUAD_ID, formation, TOKEN);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/clubs/${CLUB_ID}/squads/${SQUAD_ID}/formation`),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: TOKEN,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(expectedBody),
      })
    );
  });
});
