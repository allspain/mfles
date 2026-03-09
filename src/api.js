// src/api.js

const BASE_URL = 'https://z519wdyajg.execute-api.us-east-1.amazonaws.com/prod';

async function apiFetch(path, token, options = {}) {
  const headers = {
    ...(token ? { Authorization: token } : {}),
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch (_) {}
    throw new Error(`MFL API error ${response.status} for ${path}${detail ? ': ' + detail : ''}`);
  }
  return response.json();
}

// Get club info including squad IDs (no auth required)
async function fetchClub(clubId) {
  return apiFetch(`/clubs/${clubId}`, null);
}

// Get all players for a club (no auth required)
async function fetchPlayers(clubId) {
  return apiFetch(`/clubs/${clubId}/players`, null);
}

// Get current formation (requires auth)
async function fetchFormation(clubId, squadId, token) {
  return apiFetch(`/clubs/${clubId}/squads/${squadId}/formation`, token);
}

// Save new formation (requires auth)
// Strip `id` from body — it's in the URL and some APIs reject it in the body
async function setFormation(clubId, squadId, formation, token) {
  const { id: _id, ...body } = formation;
  return apiFetch(`/clubs/${clubId}/squads/${squadId}/formation`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fetchClub, fetchPlayers, fetchFormation, setFormation };
} else {
  globalThis.fetchClub = fetchClub;
  globalThis.fetchPlayers = fetchPlayers;
  globalThis.fetchFormation = fetchFormation;
  globalThis.setFormation = setFormation;
}
