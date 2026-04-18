# MFL Enhancement Suite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Chrome extension that injects an "Optimize Lineup" button on MFL tactics pages, automatically substituting fatigued players using an energy×OVR scoring algorithm.

**Architecture:** Content script captures auth token by wrapping fetch/XHR, forwards it to background.js service worker via chrome.runtime messaging. Background.js fetches squad+tactics, runs the optimizer, and POSTs the new lineup. Content script handles only button injection and UI feedback.

**Tech Stack:** Vanilla JS (Manifest V3), Jest + jsdom for unit tests, no build step required.

---

## Task 1: Project Scaffold

**Files:**
- Create: `manifest.json`
- Create: `background.js`
- Create: `content_script.js`
- Create: `styles.css`
- Create: `package.json`
- Create: `src/scorer.js`
- Create: `src/optimizer.js`
- Create: `src/api.js`
- Create: `tests/scorer.test.js`
- Create: `tests/optimizer.test.js`
- Create: `tests/api.test.js`

**Step 1: Create package.json**

```json
{
  "name": "mfl-enhancement-suite",
  "version": "0.1.0",
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "devDependencies": {
    "jest": "^29.0.0"
  },
  "jest": {
    "testEnvironment": "node"
  }
}
```

**Step 2: Install dependencies**

```bash
cd /Users/rickklein/Development/mfles
npm install
```

Expected: `node_modules/` created, no errors.

**Step 3: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "MFL Enhancement Suite",
  "version": "0.1.0",
  "description": "Automates lineup optimization for MFL clubs",
  "permissions": [
    "storage",
    "cookies"
  ],
  "host_permissions": [
    "https://*.playmfl.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://app.playmfl.com/*"],
      "js": ["content_script.js"],
      "css": ["styles.css"],
      "run_at": "document_idle"
    }
  ]
}
```

**Step 4: Create empty source files**

```bash
touch background.js content_script.js styles.css src/scorer.js src/optimizer.js src/api.js
mkdir -p tests && touch tests/scorer.test.js tests/optimizer.test.js tests/api.test.js
```

**Step 5: Commit**

```bash
git init
git add .
git commit -m "feat: project scaffold for MFL Enhancement Suite"
```

---

## Task 2: Network Inspection (Manual Step)

This is a required manual step to discover the real MFL internal API endpoints before building the API client.

**Step 1: Load the extension in Chrome (unpacked)**
1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" → select `/Users/rickklein/Development/mfles`

**Step 2: Open DevTools Network tab**
1. Navigate to `https://app.playmfl.com/clubs/5992/tactics`
2. Open DevTools → Network tab → filter by `Fetch/XHR`
3. Reload the page

**Step 3: Record these values in `docs/api-notes.md`**

Look for requests to `api.playmfl.com` or similar. Record:
- Base URL (e.g. `https://api.playmfl.com`)
- Auth header name and format (e.g. `Authorization: Bearer eyJ...`)
- Exact path for fetching squad (look for response containing player OVR + energy fields)
- Exact path for fetching tactics (look for formation + player lineup)
- Exact path for saving tactics (look for a POST/PUT when you manually change something)
- Exact path for fetching all clubs for account

**Step 4: Document a sample squad response**

Copy one player object from the squad response into `docs/api-notes.md`. This confirms the exact field names for `ovr`, `energy`, `position`, and `id`.

**Step 5: Document a sample tactics response**

Copy the tactics response structure into `docs/api-notes.md`. This confirms how the starting XI and bench are represented.

> **Note:** Update `src/api.js` constants with confirmed URLs before Task 5.

---

## Task 3: Scoring Algorithm (TDD)

**Files:**
- Modify: `src/scorer.js`
- Modify: `tests/scorer.test.js`

**Step 1: Write failing tests**

```javascript
// tests/scorer.test.js
const { effectiveScore } = require('../src/scorer');

describe('effectiveScore', () => {
  test('energy >= 92: score is linear energy * ovr', () => {
    expect(effectiveScore(75, 100)).toBeCloseTo(75.0, 1);
    expect(effectiveScore(75, 92)).toBeCloseTo(69.0, 1);
  });

  test('energy at 100 is only marginally better than 92', () => {
    const at92 = effectiveScore(75, 92);
    const at100 = effectiveScore(75, 100);
    // difference should be less than 5 points (diminishing returns)
    expect(at100 - at92).toBeLessThan(5);
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
```

**Step 2: Run to verify failure**

```bash
npm test -- tests/scorer.test.js
```

Expected: FAIL — `effectiveScore is not a function`

**Step 3: Implement scorer**

```javascript
// src/scorer.js

/**
 * Calculates a player's effective output score.
 * Below 92% energy: linear scale (energy/100 * ovr)
 * Above 92% energy: diminishing returns on the excess
 *
 * @param {number} ovr - Player overall rating (0-99)
 * @param {number} energy - Player energy percentage (0-100)
 * @returns {number} effective score
 */
function effectiveScore(ovr, energy) {
  if (energy <= 92) {
    return (energy / 100) * ovr;
  }
  const excessMultiplier = 0.92 + 0.08 * (1 - Math.exp(-3 * (energy - 92) / 8));
  return excessMultiplier * ovr;
}

module.exports = { effectiveScore };
```

**Step 4: Run tests to verify passing**

```bash
npm test -- tests/scorer.test.js
```

Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add src/scorer.js tests/scorer.test.js
git commit -m "feat: add player scoring algorithm with energy diminishing returns"
```

---

## Task 4: Lineup Optimizer (TDD)

**Files:**
- Modify: `src/optimizer.js`
- Modify: `tests/optimizer.test.js`

The optimizer takes a squad array and current tactics, returns a list of swaps and the new starting XI.

**Step 1: Write failing tests**

```javascript
// tests/optimizer.test.js
const { optimizeLineup } = require('../src/optimizer');

// Helper: build a player object
function player(id, ovr, energy, position, inStartingXI = false) {
  return { id, ovr, energy, position, inStartingXI };
}

describe('optimizeLineup', () => {
  test('does not swap when starter scores higher than all bench players', () => {
    const squad = [
      player('s1', 80, 95, 'MID', true),   // score ~74
      player('b1', 75, 80, 'MID', false),   // score = 60
    ];
    const result = optimizeLineup(squad);
    expect(result.swaps).toHaveLength(0);
  });

  test('swaps fatigued starter for fresher bench player with higher score', () => {
    const squad = [
      player('s1', 80, 40, 'MID', true),    // score = 32
      player('b1', 75, 92, 'MID', false),   // score = 69
    ];
    const result = optimizeLineup(squad);
    expect(result.swaps).toHaveLength(1);
    expect(result.swaps[0].out.id).toBe('s1');
    expect(result.swaps[0].in.id).toBe('b1');
  });

  test('only swaps players at matching positions', () => {
    const squad = [
      player('s1', 80, 40, 'MID', true),    // score = 32
      player('b1', 90, 92, 'FWD', false),   // score = 82.8 — wrong position
    ];
    const result = optimizeLineup(squad);
    expect(result.swaps).toHaveLength(0);
  });

  test('picks the bench player with the highest score when multiple eligible', () => {
    const squad = [
      player('s1', 80, 40, 'MID', true),    // score = 32
      player('b1', 70, 92, 'MID', false),   // score = 64.4
      player('b2', 75, 92, 'MID', false),   // score = 69 — best
    ];
    const result = optimizeLineup(squad);
    expect(result.swaps[0].in.id).toBe('b2');
  });

  test('warns when starter energy below 60%', () => {
    const squad = [
      player('s1', 80, 55, 'MID', true),    // below 60% warning
      player('b1', 79, 50, 'MID', false),   // lower score, no swap
    ];
    const result = optimizeLineup(squad);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ playerId: 's1', type: 'LOW_ENERGY' })
    );
  });
});
```

**Step 2: Run to verify failure**

```bash
npm test -- tests/optimizer.test.js
```

Expected: FAIL — `optimizeLineup is not a function`

**Step 3: Implement optimizer**

```javascript
// src/optimizer.js
const { effectiveScore } = require('./scorer');

const LOW_ENERGY_THRESHOLD = 60;

/**
 * Computes optimal lineup swaps.
 *
 * @param {Array} squad - All players: { id, ovr, energy, position, inStartingXI }
 * @returns {{ swaps: Array, warnings: Array }}
 */
function optimizeLineup(squad) {
  const swaps = [];
  const warnings = [];
  const starters = squad.filter(p => p.inStartingXI);
  const bench = squad.filter(p => !p.inStartingXI);

  // Track which bench players have already been used in a swap
  const usedBenchIds = new Set();

  for (const starter of starters) {
    const starterScore = effectiveScore(starter.ovr, starter.energy);

    if (starter.energy < LOW_ENERGY_THRESHOLD) {
      warnings.push({ playerId: starter.id, type: 'LOW_ENERGY', energy: starter.energy });
    }

    // Find best eligible bench player at same position not yet used
    const eligible = bench.filter(
      p => p.position === starter.position && !usedBenchIds.has(p.id)
    );

    if (eligible.length === 0) continue;

    const best = eligible.reduce((a, b) =>
      effectiveScore(a.ovr, a.energy) > effectiveScore(b.ovr, b.energy) ? a : b
    );

    const bestScore = effectiveScore(best.ovr, best.energy);

    if (bestScore > starterScore) {
      swaps.push({
        out: { ...starter, score: starterScore },
        in: { ...best, score: bestScore },
      });
      usedBenchIds.add(best.id);
    }
  }

  return { swaps, warnings };
}

module.exports = { optimizeLineup };
```

**Step 4: Run tests to verify passing**

```bash
npm test -- tests/optimizer.test.js
```

Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add src/optimizer.js tests/optimizer.test.js
git commit -m "feat: add lineup optimizer with position-aware swap selection"
```

---

## Task 5: MFL API Client (TDD with mocks)

> **Prerequisite:** Complete Task 2 (network inspection) and confirm real endpoint URLs. Replace `BASE_URL` and endpoint paths below with confirmed values from `docs/api-notes.md`. Also confirm exact field names for `ovr`, `energy`, `position` from the real API response.

**Files:**
- Modify: `src/api.js`
- Modify: `tests/api.test.js`

**Step 1: Write failing tests**

```javascript
// tests/api.test.js

// Mock global fetch
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
  test('POSTs new tactics with auth header', async () => {
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
  test('calls /users/me/clubs with auth header', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([{ id: '5992' }, { id: '1234' }]),
    });

    const result = await fetchClubs(TOKEN);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/users/me/clubs'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: TOKEN }),
      })
    );
    expect(result).toHaveLength(2);
  });
});
```

**Step 2: Run to verify failure**

```bash
npm test -- tests/api.test.js
```

Expected: FAIL — functions not defined.

**Step 3: Implement API client**

> Replace `BASE_URL` with the confirmed base URL from Task 2.

```javascript
// src/api.js

const BASE_URL = 'https://api.playmfl.com'; // TODO: confirm from network inspection

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
```

**Step 4: Run tests to verify passing**

```bash
npm test -- tests/api.test.js
```

Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/api.js tests/api.test.js
git commit -m "feat: add MFL API client with squad, tactics, and clubs endpoints"
```

---

## Task 6: Auth Token Capture (content_script.js)

No unit test for this — it relies on browser APIs. Verified manually in Task 8.

**Files:**
- Modify: `content_script.js`

**Step 1: Implement token interceptor and page detection**

```javascript
// content_script.js

// ── Auth token capture ──────────────────────────────────────────────
// Inject a script into the page context to intercept fetch calls.
// Content scripts can't directly observe fetch, so we inject a <script> tag.
const interceptor = document.createElement('script');
interceptor.textContent = `
  (function() {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const options = args[1] || {};
      const authHeader =
        options?.headers?.Authorization ||
        options?.headers?.authorization ||
        (options?.headers instanceof Headers ? options.headers.get('Authorization') : null);

      if (authHeader && url.includes('playmfl.com')) {
        window.dispatchEvent(new CustomEvent('mfl_auth_token', {
          detail: { token: authHeader }
        }));
      }
      return originalFetch.apply(this, args);
    };
  })();
`;
(document.head || document.documentElement).appendChild(interceptor);
interceptor.remove();

// Listen for the token from the page context
window.addEventListener('mfl_auth_token', (event) => {
  const { token } = event.detail;
  chrome.runtime.sendMessage({ type: 'STORE_TOKEN', token });
});

// ── Page detection ──────────────────────────────────────────────────
function getClubIdFromUrl() {
  const match = window.location.pathname.match(/\/clubs\/(\w+)\/tactics/);
  return match ? match[1] : null;
}

function onTacticsPage() {
  return getClubIdFromUrl() !== null;
}

// ── UI injection (runs in Task 7) ───────────────────────────────────
if (onTacticsPage()) {
  injectOptimizeButton();
}

// Handle SPA navigation (MFL is a React app, URL changes without full reload)
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (onTacticsPage()) {
      // Small delay to let React render the page
      setTimeout(injectOptimizeButton, 500);
    }
  }
}).observe(document, { subtree: true, childList: true });
```

> `injectOptimizeButton` is implemented in Task 7. Add a stub so the file doesn't error:

```javascript
function injectOptimizeButton() {
  // implemented in Task 7
}
```

**Step 2: Commit**

```bash
git add content_script.js
git commit -m "feat: add auth token interceptor and tactics page detection"
```

---

## Task 7: Background.js Orchestration

**Files:**
- Modify: `background.js`

**Step 1: Implement background service worker**

```javascript
// background.js
importScripts('src/api.js', 'src/scorer.js', 'src/optimizer.js');

// ── Token storage ────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STORE_TOKEN') {
    chrome.storage.session.set({ mflToken: message.token });
    return;
  }

  if (message.type === 'OPTIMIZE_LINEUP') {
    handleOptimize(message.clubId).then(sendResponse);
    return true; // keep message channel open for async response
  }
});

// ── Lineup optimization ──────────────────────────────────────────────
async function handleOptimize(clubId) {
  const { mflToken } = await chrome.storage.session.get('mflToken');

  if (!mflToken) {
    return { success: false, error: 'Not authenticated. Browse any MFL page first.' };
  }

  try {
    const [squad, tactics] = await Promise.all([
      fetchSquad(clubId, mflToken),
      fetchTactics(clubId, mflToken),
    ]);

    // Normalize squad: merge tactics starting XI info into player objects
    // TODO: adjust field names after confirming real API response shape in Task 2
    const startingXIIds = new Set(tactics.startingXI.map(p => p.id || p));
    const normalizedSquad = squad.map(player => ({
      id: player.id,
      ovr: player.ovr,
      energy: player.energy,
      position: player.position,
      name: player.name || `${player.firstName} ${player.lastName}`,
      inStartingXI: startingXIIds.has(player.id),
    }));

    const { swaps, warnings } = optimizeLineup(normalizedSquad);

    if (swaps.length === 0) {
      return { success: true, swaps: [], warnings, message: 'Already optimal' };
    }

    // Apply swaps to tactics and POST
    const newTactics = applySwaps(tactics, swaps);
    await setTactics(clubId, newTactics, mflToken);

    return { success: true, swaps, warnings };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Apply optimizer swaps to the raw tactics object.
 * TODO: adjust to match real tactics shape confirmed in Task 2.
 */
function applySwaps(tactics, swaps) {
  const newTactics = JSON.parse(JSON.stringify(tactics)); // deep clone
  for (const swap of swaps) {
    const starterIndex = newTactics.startingXI.findIndex(
      p => (p.id || p) === swap.out.id
    );
    if (starterIndex !== -1) {
      newTactics.startingXI[starterIndex] = swap.in.id;
    }
  }
  return newTactics;
}
```

**Step 2: Commit**

```bash
git add background.js
git commit -m "feat: add background service worker with lineup optimization orchestration"
```

---

## Task 8: Content Script UI

**Files:**
- Modify: `content_script.js` (replace `injectOptimizeButton` stub)
- Modify: `styles.css`

**Step 1: Replace the stub with full button implementation**

Find and replace the `injectOptimizeButton` stub in `content_script.js`:

```javascript
function injectOptimizeButton() {
  // Don't inject twice
  if (document.getElementById('mfl-optimize-btn')) return;

  const button = document.createElement('button');
  button.id = 'mfl-optimize-btn';
  button.textContent = 'Optimize Lineup';
  button.className = 'mfl-btn';

  const panel = document.createElement('div');
  panel.id = 'mfl-panel';
  panel.className = 'mfl-panel hidden';

  // Insert near the top of the tactics page — adjust selector after inspecting real DOM
  const toolbar = document.querySelector('[class*="tactics"]') ||
                  document.querySelector('main') ||
                  document.body;
  toolbar.prepend(panel);
  toolbar.prepend(button);

  button.addEventListener('click', async () => {
    const clubId = getClubIdFromUrl();
    if (!clubId) return;

    setButtonState('loading');

    const response = await chrome.runtime.sendMessage({
      type: 'OPTIMIZE_LINEUP',
      clubId,
    });

    if (!response.success) {
      setButtonState('error', response.error);
      return;
    }

    if (response.swaps.length === 0) {
      setButtonState('optimal');
    } else {
      setButtonState('success', `${response.swaps.length} swap${response.swaps.length > 1 ? 's' : ''} made`);
      renderSwapSummary(panel, response.swaps, response.warnings);
    }
  });
}

function setButtonState(state, message = '') {
  const button = document.getElementById('mfl-optimize-btn');
  if (!button) return;
  button.disabled = state === 'loading';

  const states = {
    idle:    { text: 'Optimize Lineup', cls: 'mfl-btn' },
    loading: { text: 'Optimizing…',     cls: 'mfl-btn mfl-btn--loading' },
    success: { text: `✓ ${message}`,    cls: 'mfl-btn mfl-btn--success' },
    optimal: { text: '✓ Already optimal', cls: 'mfl-btn mfl-btn--success' },
    error:   { text: `✗ ${message}`,    cls: 'mfl-btn mfl-btn--error' },
  };

  const s = states[state] || states.idle;
  button.textContent = s.text;
  button.className = s.cls;

  // Reset to idle after 4 seconds
  if (state !== 'idle' && state !== 'loading') {
    setTimeout(() => {
      button.textContent = 'Optimize Lineup';
      button.className = 'mfl-btn';
      button.disabled = false;
    }, 4000);
  }
}

function renderSwapSummary(panel, swaps, warnings) {
  panel.innerHTML = '';
  panel.classList.remove('hidden');

  if (warnings.length > 0) {
    const warnEl = document.createElement('p');
    warnEl.className = 'mfl-warning';
    warnEl.textContent = `⚠ ${warnings.length} player(s) below 60% energy`;
    panel.appendChild(warnEl);
  }

  for (const swap of swaps) {
    const row = document.createElement('div');
    row.className = 'mfl-swap-row';
    row.innerHTML = `
      <span class="mfl-out">OUT ${swap.out.name} (OVR ${swap.out.ovr}, energy ${swap.out.energy}% → score ${swap.out.score.toFixed(1)})</span>
      <span class="mfl-in"> IN  ${swap.in.name} (OVR ${swap.in.ovr}, energy ${swap.in.energy}% → score ${swap.in.score.toFixed(1)})</span>
    `;
    panel.appendChild(row);
  }

  setTimeout(() => panel.classList.add('hidden'), 8000);
}
```

**Step 2: Add styles**

```css
/* styles.css */
#mfl-optimize-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: #4f46e5;
  color: white;
  margin: 8px;
  transition: background 0.2s, opacity 0.2s;
}

#mfl-optimize-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.mfl-btn--success { background: #16a34a; }
.mfl-btn--error   { background: #dc2626; }
.mfl-btn--loading { background: #6366f1; }

.mfl-panel {
  background: #1e1e2e;
  border: 1px solid #3f3f5a;
  border-radius: 8px;
  padding: 12px 16px;
  margin: 8px;
  font-family: monospace;
  font-size: 13px;
  color: #e2e8f0;
  max-width: 600px;
}

.mfl-panel.hidden { display: none; }
.mfl-swap-row { margin: 4px 0; }
.mfl-out { color: #f87171; display: block; }
.mfl-in  { color: #4ade80; display: block; }
.mfl-warning { color: #fbbf24; margin-bottom: 8px; }
```

**Step 3: Run all tests to confirm nothing broken**

```bash
npm test
```

Expected: All tests PASS.

**Step 4: Commit**

```bash
git add content_script.js styles.css
git commit -m "feat: inject optimize button and swap summary UI into tactics page"
```

---

## Task 9: Manual End-to-End Verification

**Step 1: Reload extension**

In `chrome://extensions`, click the refresh icon on MFL Enhancement Suite.

**Step 2: Navigate to tactics page**

Go to `https://app.playmfl.com/clubs/5992/tactics`.

**Step 3: Verify token capture**

Open DevTools → Console. Run:
```javascript
chrome.storage.session.get('mflToken', console.log);
```
Expected: `{ mflToken: "Bearer eyJ..." }` (a real JWT)

**Step 4: Verify button appears**

Expected: "Optimize Lineup" button visible on the tactics page.

**Step 5: Click "Optimize Lineup"**

Watch the button cycle through states. Check DevTools Console for any errors.

**Step 6: Confirm API calls**

In DevTools Network tab, verify the extension's background worker made GET calls to `/squad` and `/tactics`, and a POST to `/tactics` if swaps were made.

**Step 7: Fix any field name mismatches**

If the API response shape doesn't match what `background.js` expects, update the normalization logic in `handleOptimize` and `applySwaps`. Re-test.

**Step 8: Final commit**

```bash
git add -p  # stage any fixes
git commit -m "fix: align API field names with real MFL response shape"
```

---

## Summary

| Task | What it builds |
|------|---------------|
| 1    | Project scaffold, manifest, package.json |
| 2    | Manual network inspection to confirm API endpoints |
| 3    | Scoring algorithm (TDD) |
| 4    | Lineup optimizer (TDD) |
| 5    | MFL API client (TDD with mocks) |
| 6    | Auth token capture in content script |
| 7    | Background.js orchestration |
| 8    | Button UI and swap summary panel |
| 9    | Manual end-to-end verification |
