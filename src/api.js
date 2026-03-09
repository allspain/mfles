// src/api.js

// TODO: Replace with confirmed base URL after network inspection (Task 2)
const BASE_URL = 'https://api.playmfl.com';

async function apiFetch(path, token, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`MFL API error ${response.status} for ${path}`);
  }
  return response.json();
}

async function fetchSquad(clubId, token) {
  return apiFetch(`/clubs/${clubId}/squad`, token);
}

async function fetchTactics(clubId, token) {
  return apiFetch(`/clubs/${clubId}/tactics`, token);
}

async function setTactics(clubId, tactics, token) {
  return apiFetch(`/clubs/${clubId}/tactics`, token, {
    method: 'POST',
    body: JSON.stringify(tactics),
  });
}

async function fetchClubs(token) {
  return apiFetch('/users/me/clubs', token);
}

module.exports = { fetchSquad, fetchTactics, setTactics, fetchClubs };
