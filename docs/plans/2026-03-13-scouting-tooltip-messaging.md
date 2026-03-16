# Scouting Tooltip + Messaging Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move position OVR tooltip augmentation to `content_script.js` (isolated world), route OVR computation through `background.js` via messaging, and extend tooltip support to the scouting page.

**Architecture:** `fetch_interceptor.js` is stripped to fetch-wrapping and router refresh only. `content_script.js` gains hover detection, React fiber traversal for player extraction, popover observation, and SVG augmentation. `background.js` handles `GET_POSITION_OVRS` by calling `ovrAtPosition()` for all 15 positions.

**Tech Stack:** Chrome Extension MV3, vanilla JS, React fiber tree traversal, chrome.runtime messaging, SVG DOM manipulation.

---

### Task 1: Add `GET_POSITION_OVRS` handler to `background.js`

**Files:**
- Modify: `background.js:38-51`

**Step 1: Add the handler inside the existing `onMessage` listener**

In `background.js`, add a new branch in the `onMessage` listener after the `OPTIMIZE_LINEUP` branch:

```javascript
  if (message.type === 'GET_POSITION_OVRS') {
    const ALL_POSITIONS = ['GK','CB','RB','LB','RWB','LWB','CDM','CM','CAM','RM','LM','RW','LW','CF','ST'];
    const ovrs = {};
    for (const pos of ALL_POSITIONS) {
      ovrs[pos] = ovrAtPosition(message.player, pos);
    }
    sendResponse({ ovrs });
    return true;
  }
```

`ovrAtPosition` is already available via `importScripts('src/positions.js')` at the top of background.js.

`message.player` is `{ id, metadata: { positions, pace, shooting, passing, dribbling, defense, physical, goalkeeping } }` — the same shape the scouting page's React fiber `row` prop provides, and the same shape as `playersListStore.players` entries on the tactics page.

**Step 2: Verify the handler is wired correctly**

The listener currently returns `true` only for `OPTIMIZE_LINEUP`. The new branch also returns `true` (keeps channel open for async `sendResponse`). Confirm the structure looks like:

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STORE_TOKEN') { ...; return; }
  if (message.type === 'OPTIMIZE_LINEUP') { ...; return true; }
  if (message.type === 'GET_POSITION_OVRS') { ...; return true; }
});
```

**Step 3: Commit**

```bash
git add background.js
git commit -m "feat: add GET_POSITION_OVRS message handler to background"
```

---

### Task 2: Add position tooltip augmentation to `content_script.js`

**Files:**
- Modify: `content_script.js`

This task adds all the tooltip logic to the isolated-world content script. It replaces the MAIN world implementation that currently lives in `fetch_interceptor.js`.

**Step 1: Add player extraction helpers at the top of `content_script.js` (after the auth token section)**

```javascript
// ── Position OVR tooltip augmentation ───────────────────────────────
// Player extraction from React fiber tree.
// DOM node expando properties (__reactFiber$...) are accessible from
// the isolated world because they are properties of shared DOM objects.

// Tactics page: walk fiber up from any player-position element to find
// the shared playersListStore, then look up the player by ID.
function getPlayerFromTacticsStore(playerId) {
  const el = document.querySelector('[class*="player-position-"]');
  if (!el) return null;
  const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber'));
  if (!fiberKey) return null;
  let fiber = el[fiberKey];
  while (fiber) {
    if (fiber.memoizedProps?.playersListStore?.players) {
      return fiber.memoizedProps.playersListStore.players.find(p => p.id === playerId) || null;
    }
    fiber = fiber.return;
  }
  return null;
}

// Scouting page: the row fiber prop contains the full player object directly.
function getPlayerFromRowFiber(el) {
  const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber'));
  if (!fiberKey) return null;
  let fiber = el[fiberKey];
  while (fiber) {
    if (fiber.memoizedProps?.row?.metadata?.positions) {
      return fiber.memoizedProps.row;
    }
    fiber = fiber.return;
  }
  return null;
}
```

**Step 2: Add the coordinate map and SVG helpers**

```javascript
// Coordinate → position label for grey (no-affinity) circles.
// Derived from MFL pitch SVG layout — fixed across all players/pages.
const PITCH_COORD_POSITIONS = {
  '8,34':  'GK',
  '20,55': 'RB',  '20,13': 'LB',  '20,34': 'CB',
  '37,55': 'RWB', '37,13': 'LWB',
  '43,34': 'CDM',
  '62,55': 'RM',  '62,13': 'LM',  '62,34': 'CM',
  '75,34': 'CAM',
  '84,55': 'RW',  '84,13': 'LW',
  '86,34': 'CF',
  '97,34': 'ST',
};

function makeSvgText(x, y, fontSize, fontWeight, fill, content) {
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  t.setAttribute('x', x);
  t.setAttribute('y', y);
  t.setAttribute('font-size', fontSize);
  t.setAttribute('font-family', 'sans-serif');
  t.setAttribute('font-weight', fontWeight);
  t.setAttribute('fill', fill);
  t.setAttribute('text-anchor', 'middle');
  t.setAttribute('transform', 'rotate(90)');
  t.textContent = content;
  return t;
}
```

**Step 3: Add the SVG augmentation function**

This version takes a pre-computed `ovrs` map (`{ GK: 0, CB: 41, ... }`) instead of calling `ovrAtPosition` directly.

```javascript
function augmentSvgWithOvrs(tooltipEl, ovrs) {
  const svg = tooltipEl.querySelector('svg');
  if (!svg) return;

  for (const g of svg.querySelectorAll('g')) {
    const circles = g.querySelectorAll(':scope > circle');
    const textEl = g.querySelector(':scope > text');

    if (circles.length === 2 && textEl) {
      // Coloured circle — already labelled, add OVR below
      const posLabel = textEl.textContent.trim();
      if (!posLabel || !(posLabel in ovrs)) continue;

      circles[0].setAttribute('r', '5.8');
      circles[1].setAttribute('r', '5');
      textEl.setAttribute('y', '-1.5');
      textEl.setAttribute('font-size', '2.3');
      g.appendChild(makeSvgText('0', '2.8', '3', '900', '#111', String(ovrs[posLabel])));

    } else if (circles.length === 1 && !textEl) {
      // Grey circle — derive position from SVG coordinates
      const m = g.getAttribute('transform')?.match(/translate\((\d+),\s*(\d+)\)/);
      if (!m) continue;
      const posLabel = PITCH_COORD_POSITIONS[`${m[1]},${m[2]}`];
      if (!posLabel || !(posLabel in ovrs)) continue;

      circles[0].setAttribute('r', '5');
      g.appendChild(makeSvgText('0', '-1.5', '2.3', '700', '#fff', posLabel));
      g.appendChild(makeSvgText('0', '2.8', '3', '900', '#fff', String(ovrs[posLabel])));
    }
  }
}
```

**Step 4: Add hover tracking and the MutationObserver**

```javascript
// Track the last hovered player object. Updated on mouseover for both
// tactics ([class*="player-position-"]) and scouting (.inline.cursor-help).
let _lastHoveredPlayer = null;

document.addEventListener('mouseover', (e) => {
  // Tactics page
  const tacticsEl = e.target.closest('[class*="player-position-"]');
  if (tacticsEl) {
    const match = [...tacticsEl.classList].join(' ').match(/player-position-(\d+)/);
    if (match) {
      _lastHoveredPlayer = getPlayerFromTacticsStore(parseInt(match[1], 10));
    }
    return;
  }
  // Scouting page
  const scoutEl = e.target.closest('.inline.cursor-help');
  if (scoutEl) {
    const player = getPlayerFromRowFiber(scoutEl);
    if (player?.metadata?.positions) _lastHoveredPlayer = player;
  }
}, true);

function setupTooltipObserver() {
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (!node.classList?.contains('react-tiny-popover-container')) continue;
        if (!_lastHoveredPlayer) continue;

        const player = _lastHoveredPlayer;
        chrome.runtime.sendMessage({ type: 'GET_POSITION_OVRS', player })
          .then(response => {
            if (response?.ovrs && node.isConnected) {
              augmentSvgWithOvrs(node, response.ovrs);
            }
          });
      }
    }
  }).observe(document.body, { childList: true });
}

if (document.body) {
  setupTooltipObserver();
} else {
  document.addEventListener('DOMContentLoaded', setupTooltipObserver);
}
```

**Step 5: Remove the stale comment at the bottom of `content_script.js`**

Delete this line (currently line 167-168):
```javascript
// Position OVR tooltip augmentation runs in MAIN world (fetch_interceptor.js)
// where ovrAtPosition() from src/positions.js is available.
```

**Step 6: Commit**

```bash
git add content_script.js
git commit -m "feat: move tooltip augmentation to content_script and add scouting page support"
```

---

### Task 3: Strip tooltip code from `fetch_interceptor.js`

**Files:**
- Modify: `fetch_interceptor.js`

**Step 1: Delete everything from line 35 to the end of the IIFE, leaving only fetch wrap and router refresh**

The file should contain only this after editing:

```javascript
// fetch_interceptor.js
// Runs in MAIN world (same JS context as the page).
// Wraps window.fetch to capture MFL auth tokens and broadcast them
// via CustomEvent so the isolated content script can forward to background.js.
(function () {
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    const options = args[1] || {};
    const headers = options.headers || {};
    const authHeader =
      headers.Authorization ||
      headers.authorization ||
      (headers instanceof Headers ? headers.get('Authorization') : null);

    if (authHeader) {
      window.dispatchEvent(new CustomEvent('mfl_auth_token', {
        detail: { token: authHeader },
      }));
    }
    return originalFetch.apply(this, args);
  };

  // Listen for refresh requests from the content script (isolated world).
  // Soft-navigate away then back to force the tactics component to remount
  // and re-fetch fresh formation data from the API.
  window.addEventListener('mfl_refresh_ui', () => {
    const router = window.next?.router;
    if (!router) return;
    const tacticsPath = router.asPath;
    const clubPath = tacticsPath.replace('/tactics', '');
    router.push(clubPath).then(() => router.replace(tacticsPath));
  });
})();
```

**Step 2: Commit**

```bash
git add fetch_interceptor.js
git commit -m "refactor: strip tooltip augmentation from fetch_interceptor (moved to content_script)"
```

---

### Task 4: Remove `src/positions.js` from MAIN world content scripts

**Files:**
- Modify: `manifest.json`

**Step 1: Remove `src/positions.js` from the MAIN world content scripts entry**

The first content scripts entry currently loads `["src/positions.js", "fetch_interceptor.js"]`. Since `fetch_interceptor.js` no longer calls `ovrAtPosition()`, positions.js is no longer needed in MAIN world.

Change:
```json
{
  "matches": ["https://app.playmfl.com/*"],
  "js": ["src/positions.js", "fetch_interceptor.js"],
  "world": "MAIN",
  "run_at": "document_start"
}
```

To:
```json
{
  "matches": ["https://app.playmfl.com/*"],
  "js": ["fetch_interceptor.js"],
  "world": "MAIN",
  "run_at": "document_start"
}
```

`src/positions.js` is still loaded in `background.js` via `importScripts` — that stays unchanged.

**Step 2: Commit**

```bash
git add manifest.json
git commit -m "refactor: remove positions.js from MAIN world — only needed in background"
```

---

### Task 5: Reload extension and verify end-to-end

**Step 1: Reload the extension**

Navigate to `chrome://extensions` and click the reload button on MFL Enhancement Suite (or use the JS snippet):

```javascript
const manager = document.querySelector('extensions-manager');
const itemList = manager?.shadowRoot?.querySelector('extensions-item-list');
const items = itemList?.shadowRoot?.querySelectorAll('extensions-item');
for (const item of items || []) {
  if (item.shadowRoot?.querySelector('#name')?.textContent?.includes('MFL')) {
    item.shadowRoot?.querySelector('#dev-reload-button')?.click();
  }
}
```

**Step 2: Test tactics page**

- Navigate to `https://app.playmfl.com/clubs/{id}/tactics`
- Hover over any player's position cell (e.g. "CM, LM")
- Verify the mini-pitch popover shows OVR numbers on both coloured circles and grey circles

**Step 3: Test scouting page**

- Navigate to `https://app.playmfl.com/scouting`
- Hover over any player's positions cell (e.g. "LB, LWB, LM")
- Verify the mini-pitch popover shows OVR numbers on all position circles

**Step 4: Verify the fix for missing midfield positions**

- On the scouting page, hover over a GK or ST player (someone with no midfield affinity)
- The grey midfield circles (CM, RM, LM, CAM, CDM) should show position labels and OVR values

**Step 5: Push and update PR**

```bash
git push
```

---

### Task 6: Commit and also fix the grey-circle coordinate bug found earlier

> **Note:** This task is already committed (bc0e11c) — skip if `PITCH_COORD_POSITIONS` already includes CDM (43,34), RM (62,55), LM (62,13), CM (62,34), CAM (75,34). Verify with `git show bc0e11c --stat`.
