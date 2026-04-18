# All Teams Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-tab "All Teams" page accessible from the extension icon that shows all the user's squads with lineup preview and per-squad optimize buttons.

**Architecture:** Background service worker gains three new message handlers (`GET_CLUBS`, `PREVIEW_LINEUPS`, extended `OPTIMIZE_LINEUP`). A new `teams.html` / `teams.js` / `teams.css` page loads clubs in parallel, renders squad cards with expandable pitch-column lineup views, and applies lineups via background messages.

**Tech Stack:** Vanilla JS, Chrome Extension Manifest V3, Jest (unit tests for pure functions), Chrome DevTools (integration testing)

---

## Chunk 1: Backend — API, background handlers, manifest

### Task 1: Discover the MFL "my clubs" API endpoint

**Files:**
- Read: `src/api.js` (existing API patterns)

This must be done before writing any code. Use Chrome DevTools on the live MFL app.

- [ ] **Step 1: Open the MFL app and inspect network traffic**

  Open https://app.playmfl.com in Chrome. Open DevTools → Network tab. Filter by `Fetch/XHR`. Navigate to the home/dashboard page (the one that lists your clubs). Look for requests to `z519wdyajg.execute-api.us-east-1.amazonaws.com/prod/...` that return a list of clubs or franchises.

  Expected: find a request like `GET /users/me` or `GET /franchises` or `GET /franchises?userId=...` that returns an array of club objects each having `id`, a name field, and a `squads` array.

- [ ] **Step 2: Note the endpoint URL, auth header, and response shape**

  Record:
  - Full path (e.g. `/users/me`)
  - Whether it requires `Authorization` header
  - Response JSON shape — particularly which field holds the club array, what field is the club's display name, and whether squads are nested inside each club object

  If no single endpoint returns all clubs: fall back to the storage approach (Task 2B).

---

### Task 2A: Add `fetchMyClubs` to `src/api.js` (if endpoint found)

**Files:**
- Modify: `src/api.js`
- Test: `tests/api.test.js`

- [ ] **Step 1: Write the failing test**

  In `tests/api.test.js`, add after existing tests:
  ```js
  describe('fetchMyClubs', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });
    afterEach(() => { jest.resetAllMocks(); });

    test('calls the my-clubs endpoint with Authorization header', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ([{ id: 'club1', name: 'FC Test', squads: [{ id: 'sq1' }] }]),
      });
      const result = await fetchMyClubs('Bearer tok123');
      // ⚠️ MUST replace '<ACTUAL_PATH>' with the real endpoint path from Task 1 before committing
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('<ACTUAL_PATH>'),
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok123' }) })
      );
      expect(result).toEqual([{ id: 'club1', name: 'FC Test', squads: [{ id: 'sq1' }] }]);
    });

    test('throws on non-ok response', async () => {
      global.fetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' });
      await expect(fetchMyClubs('bad')).rejects.toThrow('401');
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd /Users/rickklein/Development/mfles && npm test -- --testPathPattern=api 2>&1 | tail -20
  ```
  Expected: FAIL — `fetchMyClubs is not a function`

- [ ] **Step 3: Add `fetchMyClubs` to `src/api.js`**

  Add after `fetchFormation`:
  ```js
  // Get all clubs for the authenticated user
  async function fetchMyClubs(token) {
    // Replace <PATH> with the actual endpoint discovered in Task 1
    return apiFetch('<PATH>', token);
  }
  ```
  And export it at the bottom of the file alongside the other exports:
  ```js
  // In the module.exports block:
  module.exports = { fetchClub, fetchPlayers, fetchFormation, setFormation, fetchMyClubs };
  // In the globalThis block:
  globalThis.fetchMyClubs = fetchMyClubs;
  ```

- [ ] **Step 4: Update the test with the real path and run**

  Replace `expect.stringContaining('/')` with `expect.stringContaining('<ACTUAL_PATH>')`.
  ```bash
  npm test -- --testPathPattern=api 2>&1 | tail -20
  ```
  Expected: PASS

- [ ] **Step 5: Commit**

  ```bash
  git add src/api.js tests/api.test.js
  git commit -m "feat: add fetchMyClubs to api.js"
  ```

---

### Task 2B: Fallback — store visited club IDs in content_script.js

**Only do this task if no "my clubs" endpoint was found in Task 1.**

**Files:**
- Modify: `content_script.js`
- Modify: `background.js`

- [ ] **Step 1: Store club ID in chrome.storage.local when visiting a tactics page**

  In `content_script.js`, add inside the `if (onTacticsPage())` block (after line 141):
  ```js
  // Persist club ID so the all-teams page can discover it without a /my-clubs API
  const _visitedClubId = getClubIdFromUrl();
  if (_visitedClubId) {
    chrome.storage.local.get('visitedClubIds', ({ visitedClubIds = [] }) => {
      if (!visitedClubIds.includes(_visitedClubId)) {
        chrome.storage.local.set({ visitedClubIds: [...visitedClubIds, _visitedClubId] });
      }
    });
  }
  ```

- [ ] **Step 2: Test manually**

  Load the extension in Chrome (see Task 8 for load instructions), navigate to a club tactics page, then open DevTools → Application → Storage → Extension Storage → Local. Verify `visitedClubIds` contains the club ID.

- [ ] **Step 3: Commit**

  ```bash
  git add content_script.js
  git commit -m "feat: persist visited club IDs for all-teams page fallback"
  ```

---

### Task 3: Add `GET_CLUBS` handler to `background.js`

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Add the handler inside `chrome.runtime.onMessage.addListener`**

  In `background.js`, after the `STORE_TOKEN` block and before the `OPTIMIZE_LINEUP` block, add:

  ```js
  if (message.type === 'GET_CLUBS') {
    handleGetClubs().then(sendResponse);
    return true;
  }
  ```

- [ ] **Step 2: Add the `handleGetClubs` function after `handleOptimize`**

  ```js
  async function handleGetClubs() {
    const { mflToken } = await chrome.storage.session.get('mflToken');
    if (!mflToken) {
      return { success: false, error: 'not_authenticated' };
    }

    try {
      // --- If endpoint found (Task 2A) ---
      const rawClubs = await fetchMyClubs(mflToken);
      // Normalise to { id, name, squadId } — adjust field names to match actual API response
      const clubs = rawClubs.map(c => ({
        id: c.id,
        name: c.name || c.metadata?.name || `Club ${c.id}`,
        squadId: c.squads?.[0]?.id || null,
      })).filter(c => c.squadId !== null);

      // ⚠️ Extract real username from the API response discovered in Task 1.
      // Examples: rawResponse.username, rawResponse.user?.name, rawResponse.metadata?.name
      // Do NOT leave as 'Manager' — update this once the actual field name is known.
      const username = rawClubs.username || rawClubs.user?.name || 'Manager';
      return { success: true, username, clubs };

      // --- If using fallback (Task 2B) ---
      // const { visitedClubIds = [] } = await chrome.storage.local.get('visitedClubIds');
      // if (visitedClubIds.length === 0) {
      //   return { success: false, error: 'not_authenticated' };
      // }
      // const clubDetails = await Promise.all(visitedClubIds.map(async id => {
      //   const club = await fetchClub(id);
      //   return { id, name: club.name || `Club ${id}`, squadId: club.squads?.[0]?.id };
      // }));
      // return { success: true, username: 'Manager', clubs: clubDetails.filter(c => c.squadId) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  ```

  > **Note:** Comment out the block that doesn't apply (endpoint vs fallback). Adjust field names (`c.name`, `c.metadata?.name`) to match what the actual API returns.

- [ ] **Step 3: Commit**

  ```bash
  git add background.js
  git commit -m "feat: add GET_CLUBS background handler"
  ```

---

### Task 4: Add `PREVIEW_LINEUPS` handler to `background.js`

**Files:**
- Modify: `background.js`
- Test: `tests/optimizer.test.js` (extend with alternative generation tests)

- [ ] **Step 1: Verify existing optimizer tests still pass (baseline)**

  `generateAlternatives` lives in `background.js` and uses Chrome APIs, so it cannot be unit-tested with Jest directly. The correctness of its inner logic depends on `optimizeLineup` (already well-tested) and the exclusion set logic (tested via integration in Task 10). We verify the baseline here and add one targeted integration test.

  ```bash
  npm test -- --testPathPattern=optimizer 2>&1 | tail -20
  ```
  Expected: all existing tests PASS

- [ ] **Step 2: Add one integration-style test for the exclusion guard**

  Add to `tests/optimizer.test.js` — this tests the guard condition that `generateAlternatives` relies on (not enough players to fill slots):

  ```js
  test('returns empty newAssignment for empty reduced squad', () => {
    // When all players are excluded, optimizeLineup with empty pool
    // should return empty newAssignment gracefully
    const result = optimizeLineup([], [slot(0, 's1', 'CM')]);
    expect(result).toEqual({ swaps: [], warnings: [], decisions: [], newAssignment: {} });
  });
  ```

  Run:
  ```bash
  npm test -- --testPathPattern=optimizer 2>&1 | tail -20
  ```
  Expected: PASS

- [ ] **Step 3: Add helper `buildAssignmentMap` and `generateAlternatives` to `background.js`**

  Add these helpers before `handleOptimize`:

  ```js
  // Build the serialisable assignment map for PREVIEW_LINEUPS response.
  // newAssignment: { [slotIndex]: { id, energy, name, playerObj } }
  // formationSlots: [{ index, position, ... }]
  function buildAssignmentMap(newAssignment, formationSlots) {
    const map = {};
    for (const slot of formationSlots) {
      const p = newAssignment[slot.index];
      if (!p) continue;
      map[slot.index] = {
        id:       p.id,
        name:     p.name,
        ovr:      ovrAtPosition(p.playerObj, slot.position),
        energy:   p.energy,
        position: slot.position,
      };
    }
    return map;
  }

  // Generate up to 5 near-optimal alternatives by progressively excluding
  // swap-in players from the best lineup.
  function generateAlternatives(allSquad, formationSlots, bestAssignment, currentFormation) {
    const currentById = {};
    for (const s of (currentFormation.positions || [])) currentById[s.index] = s.playerId;

    function swapInIds(assignment) {
      const ids = new Set();
      for (const slot of formationSlots) {
        const p = assignment[slot.index];
        if (p && p.id !== currentById[slot.index]) ids.add(p.id);
      }
      return ids;
    }

    function assignmentKey(assignment) {
      return formationSlots.map(s => assignment[s.index]?.id ?? '').join(',');
    }

    const seen = new Set([assignmentKey(bestAssignment)]);
    const excludedIds = new Set(swapInIds(bestAssignment));
    const alts = [];

    for (let i = 0; i < 5; i++) {
      const reducedSquad = allSquad.filter(p => !excludedIds.has(p.id));
      if (reducedSquad.length < formationSlots.length) break;

      const { newAssignment: altAssignment } = optimizeLineup(reducedSquad, formationSlots);
      const key = assignmentKey(altAssignment);
      if (seen.has(key)) break;

      seen.add(key);
      alts.push(altAssignment);
      // Add this alt's swap-ins to the exclusion set
      for (const id of swapInIds(altAssignment)) excludedIds.add(id);
    }

    return alts;
  }
  ```

- [ ] **Step 4: Add the `handlePreviewLineups` function**

  Add after `handleGetClubs`:

  ```js
  async function handlePreviewLineups(clubId) {
    const { mflToken } = await chrome.storage.session.get('mflToken');
    if (!mflToken) return { success: false, error: 'not_authenticated' };

    try {
      const club = await fetchClub(clubId);
      const squadId = club.squads?.[0]?.id;
      if (!squadId) return { success: false, error: 'No squad found.' };

      const [players, formation] = await Promise.all([
        fetchPlayers(clubId),
        fetchFormation(clubId, squadId, mflToken),
      ]);

      const playerById = {};
      for (const p of players) playerById[p.id] = p;

      const slotPositionMap = FORMATION_SLOT_POSITIONS[formation.type] || {};
      const formationSlots = (formation.positions || []).map(s => {
        const p = playerById[s.playerId];
        const position =
          slotPositionMap[s.index] ||
          (p?.metadata?.positions?.[0]) ||
          'UNKNOWN';
        return { index: s.index, playerId: s.playerId, captain: s.captain, position };
      });

      // Build current lineup assignment map
      const currentAssignmentRaw = {};
      for (const s of formationSlots) {
        const p = playerById[s.playerId];
        if (p) currentAssignmentRaw[s.index] = {
          id: p.id, energy: p.energy / 100, name: `${p.metadata.firstName} ${p.metadata.lastName}`.trim(), playerObj: p,
        };
      }

      // All eligible squad members (excluding suspended)
      const suspendedIds = new Set(
        players.filter(p => p.matchesSuspensions?.length > 0).map(p => p.id)
      );
      const allSquad = players
        .filter(p => !suspendedIds.has(p.id))
        .map(p => ({
          id: p.id,
          energy: p.energy / 100,
          name: `${p.metadata.firstName} ${p.metadata.lastName}`.trim(),
          playerObj: p,
        }));

      // Run optimizer for best lineup
      const { newAssignment: bestAssignment } = optimizeLineup(allSquad, formationSlots);

      // Generate alternatives
      const altAssignments = generateAlternatives(allSquad, formationSlots, bestAssignment, formation);

      // Build serialisable lineups array
      const currentMap = buildAssignmentMap(currentAssignmentRaw, formationSlots);
      const currentOvr = Object.values(currentMap).reduce((sum, p) => sum + p.ovr, 0);

      function diffCount(assignment) {
        let n = 0;
        for (const s of formationSlots) {
          if (assignment[s.index]?.id !== currentMap[s.index]?.id) n++;
        }
        return n;
      }

      function makeDescription(label, assignment) {
        if (label === 'CURRENT') return 'Active lineup';
        const n = diffCount(assignment);
        if (label === 'BEST') return n === 0 ? 'No changes needed' : `${n} swap${n !== 1 ? 's' : ''}`;
        // ALT: find the 1-swap "keep" name if applicable
        const base = `${n} swap${n !== 1 ? 's' : ''} from current`;
        if (n === 1) {
          // Find the slot where this alt differs from BEST but not from CURRENT
          for (const s of formationSlots) {
            const altId = assignment[s.index]?.id;
            const bestId = bestAssignment[s.index]?.id;
            const currId = currentMap[s.index]?.id;
            if (altId !== bestId && altId === currId) {
              return `${base} — keep ${currentMap[s.index]?.name?.split(' ').pop() ?? ''}`;
            }
          }
        }
        return base;
      }

      function makeLineup(label, rawAssignment) {
        const assignment = buildAssignmentMap(rawAssignment, formationSlots);
        const totalOvr = Object.values(assignment).reduce((sum, p) => sum + p.ovr, 0);
        return {
          label,
          description: makeDescription(label, rawAssignment),
          totalOvr,
          diff: totalOvr - currentOvr,
          assignment,
        };
      }

      const lineups = [
        makeLineup('CURRENT', currentAssignmentRaw),
        makeLineup('BEST', bestAssignment),
        ...altAssignments.map((a, i) => makeLineup(`ALT_${i + 1}`, a)),
      ];

      return {
        success: true,
        formationType: formation.type,
        playerCount: players.length,
        currentOvr,
        lineups,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  ```

- [ ] **Step 5: Wire up `PREVIEW_LINEUPS` in the message handler**

  Inside `chrome.runtime.onMessage.addListener`, after the `GET_CLUBS` block:
  ```js
  if (message.type === 'PREVIEW_LINEUPS') {
    handlePreviewLineups(message.clubId).then(sendResponse);
    return true;
  }
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add background.js tests/optimizer.test.js
  git commit -m "feat: add PREVIEW_LINEUPS background handler with alternative generation"
  ```

---

### Task 5: Extend `OPTIMIZE_LINEUP` to accept an optional `assignment`

**Files:**
- Modify: `background.js`

- [ ] **Step 0: Write a smoke test for the precomputed assignment path**

  Add to `tests/tactics.test.js` (or create it if missing):
  ```js
  const { applySwaps } = require('../src/tactics');
  test('applySwaps updates playerIds from assignment', () => {
    const formation = { type: '4-3-3', positions: [{ index: 0, playerId: 'old' }] };
    const assignment = { 0: { id: 'new' } };
    const result = applySwaps(formation, assignment);
    expect(result.positions[0].playerId).toBe('new');
    expect(formation.positions[0].playerId).toBe('old'); // no mutation
  });
  ```
  ```bash
  npm test -- --testPathPattern=tactics 2>&1 | tail -10
  ```
  Expected: PASS

- [ ] **Step 1: Modify `handleOptimize` to accept optional `assignment`**

  Change the function signature and add the shortcut path at the top:

  ```js
  async function handleOptimize(clubId, precomputedAssignment) {
    const { mflToken } = await chrome.storage.session.get('mflToken');
    if (!mflToken) return { success: false, error: 'Not authenticated. Browse any MFL page first.' };

    try {
      const club = await fetchClub(clubId);
      const squadId = club.squads?.[0]?.id;
      if (!squadId) return { success: false, error: 'No squad found for this club.' };

      // Fast path: assignment already computed by PREVIEW_LINEUPS
      if (precomputedAssignment) {
        const formation = await fetchFormation(clubId, squadId, mflToken);
        const newFormation = applySwaps(formation, precomputedAssignment);
        await setFormation(clubId, squadId, newFormation, mflToken);
        return { success: true, swaps: [], warnings: [], suspendedStarters: [] };
      }

      // ... rest of existing handleOptimize code unchanged ...
  ```

  And update the message handler call to pass the optional field:
  ```js
  if (message.type === 'OPTIMIZE_LINEUP') {
    handleOptimize(message.clubId, message.assignment).then(sendResponse);
    return true;
  }
  ```

- [ ] **Step 2: Verify existing tests still pass**

  ```bash
  npm test 2>&1 | tail -20
  ```
  Expected: all existing tests pass (no regressions)

- [ ] **Step 3: Commit**

  ```bash
  git add background.js
  git commit -m "feat: extend OPTIMIZE_LINEUP to accept precomputed assignment"
  ```

---

### Task 6: Update `manifest.json` and add `chrome.action.onClicked` listener

**Files:**
- Modify: `manifest.json`
- Modify: `background.js`

- [ ] **Step 1: Add `"action": {}` to `manifest.json`**

  Open `manifest.json` and add a single `"action": {}` key. Do NOT replace the whole file — add only this line alongside existing keys:

  ```json
  "action": {},
  ```

  Place it after `"host_permissions"` and before `"background"`. The rest of the file stays unchanged.

- [ ] **Step 2: Add `chrome.action.onClicked` listener to `background.js`**

  Add at the top of `background.js`, after the `importScripts` line:

  ```js
  chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL('teams.html') });
  });
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add manifest.json background.js
  git commit -m "feat: add extension action to open all-teams page"
  ```

---

## Chunk 2: Frontend — teams.html, teams.css, teams.js

### Task 7: Create `teams.html`

**Files:**
- Create: `teams.html`

- [ ] **Step 1: Write `teams.html`**

  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MFL Enhancement Suite — All Teams</title>
    <link rel="stylesheet" href="teams.css">
  </head>
  <body>
    <header class="page-header">
      <div>
        <h1>MFL Enhancement Suite — All Teams</h1>
        <div class="page-subtitle" id="page-subtitle">Loading…</div>
      </div>
    </header>

    <main class="content" id="main-content">
      <!-- Cards injected by teams.js -->
    </main>

    <footer class="bottom-bar">
      <button class="btn-optimize-all" id="btn-optimize-all" disabled>
        ⚡ Optimize All Squads
      </button>
    </footer>

    <script src="teams.js"></script>
  </body>
  </html>
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add teams.html
  git commit -m "feat: add teams.html shell"
  ```

---

### Task 8: Create `teams.css`

**Files:**
- Create: `teams.css`

- [ ] **Step 1: Write `teams.css`**

  ```css
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #0d1117;
    color: #e6edf3;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* ── Header ── */
  .page-header {
    background: #161b22;
    border-bottom: 1px solid #30363d;
    padding: 14px 28px;
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .page-header h1 { font-size: 17px; font-weight: 700; color: #58a6ff; }
  .page-subtitle { font-size: 12px; color: #8b949e; margin-top: 2px; }

  /* ── Main content ── */
  .content { flex: 1; padding: 20px 28px; max-width: 1100px; width: 100%; margin: 0 auto; }

  /* ── Full-page states ── */
  .state-page {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    min-height: 60vh; gap: 12px; color: #8b949e; text-align: center;
  }
  .state-page .state-icon { font-size: 40px; }
  .state-page h2 { font-size: 18px; color: #e6edf3; }
  .state-page a { color: #58a6ff; }
  .btn-retry { background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 6px; padding: 7px 16px; cursor: pointer; font-size: 13px; }
  .btn-retry:hover { background: #30363d; }

  /* ── Squad card ── */
  .squad-card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 10px;
    margin-bottom: 20px;
    overflow: hidden;
  }

  .squad-card-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid #21262d;
  }
  .squad-card-header .squad-name { font-size: 15px; font-weight: 700; }
  .squad-card-header .squad-meta { font-size: 12px; color: #8b949e; margin-top: 2px; }
  .squad-header-right { display: flex; align-items: center; gap: 14px; }
  .ovr-summary { text-align: right; }
  .ovr-summary .ovr-current { font-size: 12px; color: #8b949e; }
  .ovr-summary .ovr-best { font-size: 14px; font-weight: 700; color: #3fb950; }

  .btn-expand-all {
    background: #21262d; border: 1px solid #30363d; color: #8b949e;
    border-radius: 6px; padding: 5px 11px; font-size: 12px; cursor: pointer;
  }
  .btn-expand-all:hover { color: #e6edf3; }

  /* ── Skeleton card ── */
  .squad-card-skeleton { padding: 18px; }
  .skeleton-line {
    background: linear-gradient(90deg, #21262d 25%, #30363d 50%, #21262d 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 4px;
    height: 14px;
    margin-bottom: 8px;
  }
  .skeleton-line.wide { width: 60%; }
  .skeleton-line.narrow { width: 35%; }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  /* ── Card error state ── */
  .card-error { padding: 16px 18px; display: flex; align-items: center; gap: 12px; color: #f85149; font-size: 13px; }

  /* ── Lineups list ── */
  .lineups { padding: 10px 14px; display: flex; flex-direction: column; gap: 7px; }

  /* ── Lineup row ── */
  .lineup-row {
    background: #0d1117; border: 1px solid #21262d; border-radius: 8px; overflow: hidden;
  }
  .lineup-row.lineup-best { border-color: #ffd70033; }
  .lineup-row.lineup-error-row .lineup-summary { color: #f85149; }

  .lineup-summary {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 13px; cursor: pointer;
    user-select: none;
  }
  .lineup-summary:hover { background: #161b22; }

  .lineup-badge {
    font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; flex-shrink: 0;
  }
  .badge-current { background: #1c2d3f; color: #58a6ff; border: 1px solid #388bfd44; }
  .badge-best    { background: #2a2000; color: #ffd700; border: 1px solid #ffd70044; }
  .badge-alt     { background: #1c1c1c; color: #8b949e; border: 1px solid #30363d; }

  .lineup-desc { flex: 1; font-size: 13px; color: #c9d1d9; }
  .lineup-ovr  { font-size: 14px; font-weight: 700; }
  .ovr-blue    { color: #58a6ff; }
  .ovr-green   { color: #3fb950; }
  .lineup-diff { font-size: 11px; color: #3fb950; min-width: 28px; text-align: right; }

  .btn-show {
    background: none; border: 1px solid #30363d; color: #8b949e;
    border-radius: 5px; padding: 3px 9px; font-size: 11px; cursor: pointer; flex-shrink: 0;
  }
  .btn-show:hover { color: #e6edf3; }

  .btn-apply {
    background: #238636; color: #fff; border: none;
    border-radius: 5px; padding: 5px 14px; font-size: 12px; font-weight: 600; cursor: pointer; flex-shrink: 0;
  }
  .btn-apply:hover:not(:disabled) { background: #2ea043; }
  .btn-apply:disabled { background: #21262d; color: #484f58; cursor: default; }
  .btn-apply.applying { background: #1a4a27; color: #aaa; cursor: default; }
  .btn-apply.apply-error { background: #5a1a1a; color: #f85149; cursor: pointer; }

  /* ── Expanded pitch columns ── */
  .lineup-detail { display: none; border-top: 1px solid #21262d; padding: 12px 13px; }
  .lineup-detail.open { display: block; }

  .pitch-cols { display: flex; gap: 0; }
  .pitch-col {
    flex: 1; display: flex; flex-direction: column; gap: 5px;
    padding: 0 10px; border-right: 1px solid #21262d;
  }
  .pitch-col:first-child { padding-left: 0; }
  .pitch-col:last-child  { border-right: none; padding-right: 0; }
  .pitch-col.col-gk { max-width: 130px; }

  .col-header {
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
    text-align: center; padding-bottom: 6px; margin-bottom: 2px;
    border-bottom: 1px solid #21262d;
  }
  .col-header.gk  { color: #e3b341; }
  .col-header.def { color: #58a6ff; }
  .col-header.mid { color: #3fb950; }
  .col-header.atk { color: #f78166; }

  .player-card {
    background: #161b22; border: 1px solid #21262d; border-radius: 6px; padding: 6px 9px;
  }
  .player-card.swapped { border-color: #ffd70055; background: #1e1800; }
  .player-card .pc-pos  { font-size: 9px; font-weight: 700; color: #8b949e; }
  .player-card .pc-name { font-size: 12px; font-weight: 600; color: #e6edf3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 1px 0; }
  .player-card.swapped .pc-name { color: #ffd700; }
  .player-card .pc-stat { font-size: 11px; color: #8b949e; }
  .player-card .pc-stat .ovr { font-weight: 700; color: #3fb950; }

  /* ── Bottom bar ── */
  .bottom-bar {
    background: #161b22; border-top: 1px solid #30363d;
    padding: 16px 28px; display: flex; align-items: center; justify-content: center;
    position: sticky; bottom: 0;
  }
  .btn-optimize-all {
    background: #238636; color: #fff; border: none;
    border-radius: 8px; padding: 11px 36px; font-size: 15px; font-weight: 700; cursor: pointer;
  }
  .btn-optimize-all:hover:not(:disabled) { background: #2ea043; }
  .btn-optimize-all:disabled { background: #21262d; color: #484f58; cursor: default; }
  .btn-optimize-all.optimizing { background: #1a4a27; color: #aaa; cursor: default; }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add teams.css
  git commit -m "feat: add teams.css dark theme styles"
  ```

---

### Task 9: Create `teams.js`

**Files:**
- Create: `teams.js`

This is the main page logic. It handles: loading clubs, rendering cards, previewing lineups per card, expanding/collapsing lineup views, applying lineups, and optimize-all.

- [ ] **Step 1: Write `teams.js`**

  ```js
  // teams.js — All Teams page logic

  // ── Position group mapping ──────────────────────────────────────────
  const POSITION_GROUPS = {
    GK:  'GK',
    GKP: 'GK',
    RB: 'DEF', LB: 'DEF', CB: 'DEF', RWB: 'DEF', LWB: 'DEF', SW: 'DEF',
    CM: 'MID', CDM: 'MID', CAM: 'MID', RM: 'MID', LM: 'MID',
    RW: 'ATK', LW: 'ATK', ST: 'ATK', CF: 'ATK', SS: 'ATK',
  };

  function groupOf(pos) {
    return POSITION_GROUPS[pos] || 'MID';
  }

  // ── Messaging ───────────────────────────────────────────────────────
  function sendMsg(msg) {
    return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
  }

  // ── Rendering helpers ───────────────────────────────────────────────
  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function renderSkeleton() {
    const card = el('div', 'squad-card');
    const inner = el('div', 'squad-card-skeleton');
    inner.innerHTML = `
      <div class="skeleton-line wide"></div>
      <div class="skeleton-line narrow"></div>
      <div class="skeleton-line wide" style="margin-top:14px;height:10px;"></div>
      <div class="skeleton-line narrow" style="height:10px;"></div>
    `;
    card.appendChild(inner);
    return card;
  }

  function renderPitchCols(assignment, currentAssignment) {
    const groups = { GK: [], DEF: [], MID: [], ATK: [] };
    const slots = Object.keys(assignment).map(Number).sort((a, b) => a - b);
    for (const idx of slots) {
      const p = assignment[idx];
      const g = groupOf(p.position);
      groups[g] = groups[g] || [];
      groups[g].push({ ...p, idx });
    }

    const container = el('div', 'pitch-cols');

    const cols = [
      { key: 'GK',  label: 'GK',        cls: 'gk',  extraCls: 'col-gk' },
      { key: 'DEF', label: 'Defenders',  cls: 'def', extraCls: '' },
      { key: 'MID', label: 'Midfielders',cls: 'mid', extraCls: '' },
      { key: 'ATK', label: 'Attackers',  cls: 'atk', extraCls: '' },
    ];

    for (const col of cols) {
      const players = groups[col.key] || [];
      if (players.length === 0) continue;

      const colEl = el('div', `pitch-col ${col.extraCls}`);
      const hdr = el('div', `col-header ${col.cls}`, col.label);
      colEl.appendChild(hdr);

      for (const p of players) {
        const isSwapped = currentAssignment && currentAssignment[p.idx]?.id !== p.id;
        const card = el('div', `player-card${isSwapped ? ' swapped' : ''}`);
        card.innerHTML = `
          <div class="pc-pos">${p.position}</div>
          <div class="pc-name">${p.name}${isSwapped ? ' ↑' : ''}</div>
          <div class="pc-stat"><span class="ovr">${p.ovr}</span> · ${p.energy}%</div>
        `;
        colEl.appendChild(card);
      }
      container.appendChild(colEl);
    }
    return container;
  }

  function renderLineupRow(lineup, currentAssignment, clubId, onApplied) {
    const isCurrent = lineup.label === 'CURRENT';
    const isBest    = lineup.label === 'BEST';

    const row = el('div', `lineup-row${isBest ? ' lineup-best' : ''}`);

    // Badge
    let badgeCls = 'badge-alt';
    let badgeText = lineup.label.replace('_', ' ');
    if (isCurrent) { badgeCls = 'badge-current'; badgeText = 'CURRENT'; }
    if (isBest)    { badgeCls = 'badge-best';    badgeText = '★ BEST'; }

    // Summary bar
    const summary = el('div', 'lineup-summary');
    summary.innerHTML = `
      <span class="lineup-badge ${badgeCls}">${badgeText}</span>
      <span class="lineup-desc">${lineup.description}</span>
      <span class="lineup-ovr ${isCurrent ? 'ovr-blue' : 'ovr-green'}">${lineup.totalOvr}</span>
      <span class="lineup-diff">${lineup.diff > 0 ? '+' + lineup.diff : ''}</span>
    `;

    const showBtn = el('button', 'btn-show', 'Show ▾');
    summary.appendChild(showBtn);

    const applyBtn = el('button', 'btn-apply', isCurrent ? 'Applied' : 'Apply');
    if (isCurrent) applyBtn.disabled = true;
    summary.appendChild(applyBtn);

    row.appendChild(summary);

    // Detail (pitch columns)
    const detail = el('div', 'lineup-detail');
    detail.appendChild(renderPitchCols(lineup.assignment, currentAssignment));
    row.appendChild(detail);

    // Toggle detail
    function toggleDetail() {
      const open = detail.classList.toggle('open');
      showBtn.textContent = open ? 'Hide ▴' : 'Show ▾';
    }
    summary.addEventListener('click', (e) => {
      if (e.target === applyBtn || e.target === showBtn) return;
      toggleDetail();
    });
    showBtn.addEventListener('click', toggleDetail);

    // Apply
    if (!isCurrent) {
      applyBtn.addEventListener('click', async () => {
        applyBtn.textContent = 'Applying…';
        applyBtn.className = 'btn-apply applying';
        applyBtn.disabled = true;

        const resp = await sendMsg({
          type: 'OPTIMIZE_LINEUP',
          clubId,
          assignment: lineup.assignment,
        });

        if (!resp || !resp.success) {
          applyBtn.textContent = '✗ Failed';
          applyBtn.className = 'btn-apply apply-error';
          applyBtn.disabled = false;
          setTimeout(() => {
            applyBtn.textContent = 'Apply';
            applyBtn.className = 'btn-apply';
          }, 4000);
        } else {
          applyBtn.textContent = '✓ Applied';
          applyBtn.className = 'btn-apply';
          applyBtn.disabled = true;
          if (onApplied) onApplied(lineup);
        }
      });
    }

    return row;
  }

  function renderSquadCard(club, previewData) {
    const card = el('div', 'squad-card');
    card.dataset.clubId = club.id;

    if (!previewData.success) {
      const hdr = el('div', 'squad-card-header');
      hdr.innerHTML = `<div><div class="squad-name">${club.name}</div></div>`;
      card.appendChild(hdr);
      const errEl = el('div', 'card-error', `⚠ ${previewData.error}`);
      const retryBtn = el('button', 'btn-retry', 'Retry');
      retryBtn.style.marginLeft = '12px';
      retryBtn.addEventListener('click', () => loadCard(card, club));
      errEl.appendChild(retryBtn);
      card.appendChild(errEl);
      return card;
    }

    const { formationType, playerCount, currentOvr, lineups } = previewData;
    const bestLineup = lineups.find(l => l.label === 'BEST');
    const currentLineup = lineups.find(l => l.label === 'CURRENT');
    const bestOvr = bestLineup ? bestLineup.totalOvr : currentOvr;
    const diff = bestOvr - currentOvr;

    // Header
    const hdr = el('div', 'squad-card-header');
    hdr.innerHTML = `
      <div>
        <div class="squad-name">${club.name}</div>
        <div class="squad-meta">${formationType} · ${playerCount} players</div>
      </div>
    `;
    const right = el('div', 'squad-header-right');
    const expandBtn = el('button', 'btn-expand-all', 'Expand All');
    right.appendChild(expandBtn);
    const ovrSummary = el('div', 'ovr-summary');
    ovrSummary.innerHTML = `
      <div class="ovr-current">Current OVR: ${currentOvr}</div>
      <div class="ovr-best">Best possible: ${bestOvr}${diff > 0 ? ` (+${diff})` : ''}</div>
    `;
    right.appendChild(ovrSummary);
    hdr.appendChild(right);
    card.appendChild(hdr);

    // Lineups
    const lineupsEl = el('div', 'lineups');
    const details = [];
    for (const lineup of lineups) {
      const row = renderLineupRow(lineup, currentLineup?.assignment, club.id, null);
      lineupsEl.appendChild(row);
      details.push(row.querySelector('.lineup-detail'));
    }
    card.appendChild(lineupsEl);

    // Expand All toggle
    expandBtn.addEventListener('click', () => {
      const allOpen = details.every(d => d.classList.contains('open'));
      details.forEach(d => {
        const open = !allOpen;
        d.classList.toggle('open', open);
        const btn = d.previousElementSibling?.querySelector('.btn-show');
        if (btn) btn.textContent = open ? 'Hide ▴' : 'Show ▾';
      });
      expandBtn.textContent = allOpen ? 'Expand All' : 'Collapse All';
    });

    // Store best lineup assignment on the card element for Optimize All
    if (bestLineup) card.dataset.bestAssignment = JSON.stringify(bestLineup.assignment);

    return card;
  }

  // ── Card loading ────────────────────────────────────────────────────
  async function loadCard(existingCard, club) {
    // Show skeleton while loading
    const skeleton = renderSkeleton();
    existingCard.replaceWith(skeleton);

    const previewData = await sendMsg({ type: 'PREVIEW_LINEUPS', clubId: club.id });
    const card = renderSquadCard(club, previewData || { success: false, error: 'No response from background.' });
    skeleton.replaceWith(card);
    return card;
  }

  // ── Main init ────────────────────────────────────────────────────────
  async function init() {
    const subtitleEl = document.getElementById('page-subtitle');
    const mainEl = document.getElementById('main-content');
    const optAllBtn = document.getElementById('btn-optimize-all');

    // Get clubs
    const clubsResp = await sendMsg({ type: 'GET_CLUBS' });

    if (!clubsResp || !clubsResp.success) {
      const err = clubsResp?.error;
      if (err === 'not_authenticated') {
        mainEl.innerHTML = `
          <div class="state-page">
            <div class="state-icon">🔒</div>
            <h2>Not authenticated</h2>
            <p>Browse any <a href="https://app.playmfl.com" target="_blank">MFL page</a> first to authenticate the extension.</p>
          </div>
        `;
      } else {
        mainEl.innerHTML = `
          <div class="state-page">
            <div class="state-icon">⚠️</div>
            <h2>Failed to load clubs</h2>
            <p>${err || 'Unknown error'}</p>
            <button class="btn-retry" onclick="location.reload()">Retry</button>
          </div>
        `;
      }
      return;
    }

    const { username, clubs } = clubsResp;
    subtitleEl.textContent = `Logged in as ${username} · ${clubs.length} club${clubs.length !== 1 ? 's' : ''} found`;

    if (clubs.length === 0) {
      mainEl.innerHTML = `
        <div class="state-page">
          <div class="state-icon">🏟️</div>
          <h2>No clubs found</h2>
          <p>No clubs were found for your account.</p>
        </div>
      `;
      return;
    }

    // Insert skeleton cards, then load in parallel
    const skeletons = clubs.map(() => {
      const s = renderSkeleton();
      mainEl.appendChild(s);
      return s;
    });

    const loadedCards = await Promise.all(clubs.map(async (club, i) => {
      const previewData = await sendMsg({ type: 'PREVIEW_LINEUPS', clubId: club.id });
      const card = renderSquadCard(club, previewData || { success: false, error: 'No response.' });
      skeletons[i].replaceWith(card);
      return card;
    }));

    // Enable Optimize All
    optAllBtn.disabled = false;
    optAllBtn.addEventListener('click', async () => {
      optAllBtn.textContent = 'Optimizing…';
      optAllBtn.className = 'btn-optimize-all optimizing';
      optAllBtn.disabled = true;

      for (const card of loadedCards) {
        const clubId = card.dataset.clubId;
        const assignmentJson = card.dataset.bestAssignment;
        if (!clubId || !assignmentJson) continue;

        let assignment;
        try { assignment = JSON.parse(assignmentJson); } catch (_) { continue; }

        const resp = await sendMsg({ type: 'OPTIMIZE_LINEUP', clubId, assignment });
        if (!resp?.success) {
          // Show error on this card
          const errEl = card.querySelector('.card-error') || el('div', 'card-error');
          errEl.textContent = `⚠ Optimize failed: ${resp?.error || 'Unknown error'}`;
          if (!card.querySelector('.card-error')) card.appendChild(errEl);
        }
      }

      optAllBtn.textContent = '✓ All Done';
      optAllBtn.className = 'btn-optimize-all';
      setTimeout(() => {
        optAllBtn.textContent = '⚡ Optimize All Squads';
        optAllBtn.disabled = false;
      }, 4000);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add teams.js teams.html teams.css
  git commit -m "feat: add all-teams page (teams.html/js/css)"
  ```

---

## Chunk 3: Integration Testing via Chrome DevTools

### Task 10: Load and test the extension in Chrome

**Files:** None (manual testing steps)

- [ ] **Step 1: Load the extension in Chrome**

  1. Open Chrome → `chrome://extensions`
  2. Enable "Developer mode" (toggle top-right)
  3. Click "Load unpacked" → select `/Users/rickklein/Development/mfles`
  4. Verify the extension appears with no errors

- [ ] **Step 2: Verify the action icon opens the all-teams page**

  Click the MFL Enhancement Suite icon in the Chrome toolbar.
  Expected: a new tab opens at `chrome-extension://<id>/teams.html`

- [ ] **Step 3: Test unauthenticated state**

  Without visiting any MFL page first (clear session storage if needed):
  1. Open DevTools on the teams page → Console tab
  2. Reload the teams page
  Expected: page shows "Not authenticated — Browse any MFL page first"

- [ ] **Step 4: Authenticate and reload**

  1. Navigate to `https://app.playmfl.com` in another tab, log in, browse to any page
  2. Return to the teams page tab and reload it
  Expected: clubs load, skeleton cards appear, then squad cards render

- [ ] **Step 5: Verify club cards render correctly**

  Use Chrome DevTools MCP tools to take a screenshot and verify:
  - Squad name matches MFL app
  - Formation type is correct (check against tactics page)
  - Current OVR is a reasonable sum (>500 for a typical squad of 11)

  ```
  Use: mcp__chrome-devtools__take_screenshot
  ```

- [ ] **Step 6: Test "Show lineup" toggle**

  Click a "Show ▾" button on any lineup row.
  Expected: pitch-column grid expands showing GK | Defenders | Midfielders | Attackers.
  Check console for errors:
  ```
  Use: mcp__chrome-devtools__list_console_messages
  ```

- [ ] **Step 7: Test "Expand All" button**

  Click "Expand All" on a squad card.
  Expected: all lineup rows expand. Button label changes to "Collapse All". Clicking again collapses all.

- [ ] **Step 8: Test "Apply" on the ★ BEST lineup**

  1. Click "Apply" on the ★ BEST row for one squad
  2. Expected: button shows "Applying…", then "✓ Applied" and becomes disabled
  3. Navigate to that club's tactics page on playmfl.com — verify the formation changed

- [ ] **Step 9: Test "⚡ Optimize All Squads"**

  Click the bottom "⚡ Optimize All Squads" button.
  Expected:
  - Button label changes to "Optimizing…"
  - Each squad's best lineup is applied sequentially
  - Button shows "✓ All Done" then resets after 4 seconds
  - Check console for any errors

- [ ] **Step 10: Run all unit tests to confirm no regressions**

  ```bash
  cd /Users/rickklein/Development/mfles && npm test 2>&1 | tail -30
  ```
  Expected: all tests PASS

- [ ] **Step 11: Final commit**

  ```bash
  git add -A
  git commit -m "feat: all-teams page — complete implementation and testing"
  ```
