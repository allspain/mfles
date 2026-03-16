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

// Tactical slider fields — omit when null, coerce to number when set
const TACTICAL_FIELDS = new Set([
  'depth', 'compactness', 'pressing', 'clearance', 'aggressivity',
  'width', 'directness', 'sideAttackLeft', 'dribble', 'farShot',
  'crosses', 'riskPass', 'fluidity', 'offensiveEngagement',
]);

// Save new formation (requires auth)
// Strip `id` (in URL), rename `type` → `formationType`
// Omit null tactical fields; coerce non-null tactical fields to numbers
async function setFormation(clubId, squadId, formation, token) {
  const { id: _id, type, ...rest } = formation;
  const body = { formationType: type };
  for (const [key, val] of Object.entries(rest)) {
    if (val === null) continue; // omit all null fields
    if (TACTICAL_FIELDS.has(key)) {
      body[key] = Number.isFinite(Number(val)) ? Number(val) : 1.0;
    } else {
      body[key] = val;
    }
  }
  return apiFetch(`/clubs/${clubId}/squads/${squadId}/formation`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// Get all clubs for the authenticated user
async function fetchMyClubs(token, walletAddress) {
  return apiFetch(`/clubs?walletAddress=${walletAddress}`, token);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fetchClub, fetchPlayers, fetchFormation, setFormation, fetchMyClubs };
} else {
  globalThis.fetchClub = fetchClub;
  globalThis.fetchPlayers = fetchPlayers;
  globalThis.fetchFormation = fetchFormation;
  globalThis.setFormation = setFormation;
  globalThis.fetchMyClubs = fetchMyClubs;
}
