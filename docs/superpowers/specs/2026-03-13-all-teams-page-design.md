# All Teams Page — Design Spec

**Date:** 2026-03-13
**Status:** Approved

---

## Overview

A full-tab browser page accessible by clicking the extension icon. Shows all of the user's MFL clubs and squads on one screen, allowing per-squad lineup optimization and bulk "Optimize All" without needing to navigate to individual tactics pages.

---

## Entry Point

- `manifest.json` adds an `action: {}` key (no `default_popup`)
- `background.js` adds a `chrome.action.onClicked` listener that calls:
  ```js
  chrome.tabs.create({ url: chrome.runtime.getURL('teams.html') });
  ```
  Note: the URL **must** use `chrome.runtime.getURL()` — a bare `'teams.html'` will fail in MV3.
- New files: `teams.html`, `teams.js`, `teams.css`

---

## Page Structure

### Header (sticky)
- Title: "MFL Enhancement Suite — All Teams"
- Logged-in username (from `GET_CLUBS` response)

### Squad Cards (vertical list)
One card per squad, stacked vertically.

**Card states:**
- **Loading** — skeleton placeholder while `PREVIEW_LINEUPS` is in flight
- **Loaded** — full card content shown below
- **Error** — inline error message with a Retry button

**Card header (shown once loaded):**
- Club name
- Formation type, player count (both available from `PREVIEW_LINEUPS` response)
- Current OVR (sum of 11 starters' slot OVRs — see OVR Calculation)
- Best possible OVR with diff (e.g. "+24")
- "Expand All" button — toggles all lineup rows open/closed at once. Default state: all rows **collapsed**. Button label switches between "Expand All" and "Collapse All" to reflect the current action.

**Lineup rows (7 per card):**
- CURRENT — the active lineup as it exists on the server today
- ★ BEST — the optimizer's recommended lineup
- ALT 1–5 — five near-optimal alternative lineups, ranked by total OVR descending

Each row shows:
- Badge (CURRENT / ★ BEST / ALT 1–5)
- Short description (see Description Generation below)
- Total OVR
- Diff vs current (hidden for the CURRENT row)
- "Show ▾ / Hide ▴" toggle — expands the pitch-column lineup view
- "Apply" button — saves that lineup via the MFL API. Disabled/shows "Applied" for the CURRENT lineup.

**Expanded lineup view (pitch columns):**
Players in four columns left to right: **GK | Defenders | Midfielders | Attackers**. Each player card shows: slot position label, name, OVR at that slot, energy %. Players whose `id` differs from the corresponding slot in the CURRENT lineup are highlighted in gold with a ↑ arrow.

### Bottom Bar (sticky)
- "⚡ Optimize All Squads" — applies the ★ BEST lineup to every squad sequentially. On error for a given squad, log the error inline on that squad's card and continue to the next squad (do not abort).

---

## OVR Calculation

**Total OVR for a lineup** = sum of `ovrAtPosition(player, slotPosition)` for all 11 starters, using:
- The same `ovrAtPosition()` function already used by the existing optimizer
- Slot positions derived from `FORMATION_SLOT_POSITIONS[formationType]` in `background.js`

**Current OVR** = sum computed using the formation as returned by `fetchFormation`, with the players currently in each slot. If a slot's player is suspended (present in `matchesSuspensions`), their OVR still counts toward `currentOvr` — it reflects the raw state on the server, not a corrected state.

---

## Generating 5 Alternatives

**Definition — "swap-in players":** for a given assignment, a player is a "swap-in" if their ID differs from the player in the same slot in the CURRENT lineup. Only these differing players are added to `excludedIds`; unchanged players are never excluded.

1. Run `optimizeLineup(allSquad, formationSlots)` → **best** assignment.
   Compute swap-ins vs CURRENT: `swapInIds = Set of player IDs in best assignment where id !== currentFormation slot's playerId`.
   Initialise `excludedIds = new Set(swapInIds)`.
2. For each of 5 rounds:
   a. Build `reducedSquad = allSquad.filter(p => !excludedIds.has(p.id))`
   b. **Guard**: if `reducedSquad.length < formationSlots.length`, stop — not enough players to fill all slots. No more alternatives are generated.
   c. Run `optimizeLineup(reducedSquad, formationSlots)` → new assignment
   d. **Deduplication**: if this assignment's player-ID-per-slot map is identical to any previously recorded lineup, stop generating.
   e. Record the alternative. Compute this alt's swap-ins vs CURRENT (same definition) and add them to `excludedIds` for the next round.
3. The card shows however many distinct alternatives were generated (0–5). Rows for missing alternatives are simply not rendered.

---

## Description Generation

Each lineup row's description is generated as follows:

| Lineup | Rule |
|--------|------|
| CURRENT | `"Active lineup"` |
| ★ BEST | `"N swap(s)"` where N = number of players differing from CURRENT. If N = 0: `"No changes needed"` |
| ALT 1–5 | `"N swap(s) from current"`. If N = 1, also append the name of the player being *kept from the current lineup* (i.e., the player in CURRENT's slot who is retained in this alt but was replaced in ★ BEST): e.g. `"1 swap — keep Vargas"` means Vargas was swapped out in ★ BEST but is kept in this alternative. "Keep" always refers to a player from the current lineup who is being retained. |

---

## API Integration

### Auth check + club discovery — `GET_CLUBS` message

The exact "list my clubs" endpoint must be discovered at the start of implementation by inspecting network traffic in the MFL app (DevTools → Network tab while logged in and browsing to the My Clubs / Home page). It likely follows `GET /users/me` or `GET /franchises` with the stored `Authorization` header. A new `fetchMyClubs(token)` function must be added to `src/api.js` once the endpoint and response shape are confirmed.

**Fallback if no such endpoint exists:** Store club IDs in `chrome.storage.local` whenever the user visits a `/clubs/:id/tactics` page (captured in `content_script.js`), and surface those stored IDs in `GET_CLUBS` instead.

Implementation steps:
1. Read `mflToken` from `chrome.storage.session`. If absent → return `{ success: false, error: 'not_authenticated' }`
2. Call `fetchMyClubs(token)` → returns array of club objects, each with at minimum: `id`, display name, `squads[0].id`
3. Return `{ success: true, username, clubs: [{ id, name, squadId }] }`

Formation type and player count are **not** fetched here — they are included in the `PREVIEW_LINEUPS` response to avoid N extra round-trips at startup.

### Preview lineups (no write) — `PREVIEW_LINEUPS` message

Accepts `{ clubId }`. Steps:
1. Fetch players + formation (same as existing `handleOptimize`)
2. Compute `currentOvr` from the raw formation
3. Run optimizer + generate up to 5 alternatives (see above)
4. Return:
   ```js
   {
     success: true,
     formationType,      // string e.g. "4-3-3"
     playerCount,        // total squad size (all players, not just starters)
     currentOvr,         // number
     lineups: [
       {
         label,          // "CURRENT" | "BEST" | "ALT_1" … "ALT_5"
         description,    // string per Description Generation rules
         totalOvr,       // number
         diff,           // number (totalOvr - currentOvr); 0 for CURRENT
         assignment,     // { [slotIndex]: { id, name, ovr, energy, position } }
       },
       // …up to 7 entries
     ]
   }
   ```
   `assignment` is a **transformed** map — not the raw `newAssignment` from `optimizeLineup()`. The `PREVIEW_LINEUPS` handler must build it explicitly:
   ```js
   // After running optimizeLineup(), build the assignment map for the response:
   const assignment = {};
   for (const slot of formationSlots) {
     const player = newAssignment[slot.index]; // { id, energy, name, playerObj }
     assignment[slot.index] = {
       id:       player.id,
       name:     player.name,
       ovr:      ovrAtPosition(player.playerObj, slot.position),  // computed
       energy:   player.energy,
       position: slot.position,  // from formationSlots, not from playerObj
     };
   }
   ```
   This transformation is required for all 7 lineups (CURRENT + BEST + ALT 1–5). For CURRENT, build the same shape from the existing starters using the same `ovrAtPosition()` call.

### Apply a specific lineup — extend `OPTIMIZE_LINEUP`

Add an optional `assignment` parameter: `{ type: 'OPTIMIZE_LINEUP', clubId, assignment? }`.

- If `assignment` is provided: skip the optimizer, but **still fetch the current formation** via `fetchFormation(clubId, squadId, mflToken)` (needed by `applySwaps`), then call `applySwaps(formation, assignment)` and `setFormation`. This path is used by the "Apply" buttons on `teams.html`.
- If `assignment` is absent: run the full optimizer as today. Fully backwards compatible with the tactics-page button.

Both code paths use `chrome.runtime.sendMessage` and are handled by `chrome.runtime.onMessage` in `background.js` — no routing changes needed.

---

## Loading Strategy

Cards are loaded **in parallel**: `teams.js` fires a `PREVIEW_LINEUPS` message for every club simultaneously after `GET_CLUBS` resolves. Each card renders a skeleton while its request is in flight and switches to full content (or error state) independently as responses arrive.

---

## Error States

| Situation | UI |
|-----------|-----|
| Not authenticated | Full-page message: "Browse any MFL page first to authenticate" + link to playmfl.com |
| `GET_CLUBS` API error | Full-page error with Retry button |
| `PREVIEW_LINEUPS` error for one club | That squad card shows inline error + Retry button; other cards unaffected |
| Apply fails | Inline error on that lineup row; "Apply" button resets to active state |
| Optimize All — one squad fails | Log error on that squad's card, continue to remaining squads |
| No clubs found | Empty state: "No clubs found for your account" |

---

## Files Changed / Created

**Note on `web_accessible_resources`:** Extension pages opened via `chrome.runtime.getURL()` by the extension itself do **not** require a `web_accessible_resources` entry — that is only needed for external web pages accessing extension resources. `teams.html` does not need it.

| File | Change |
|------|--------|
| `manifest.json` | Add `"action": {}` key |
| `background.js` | Add `chrome.action.onClicked` listener; add `GET_CLUBS` and `PREVIEW_LINEUPS` handlers; extend `OPTIMIZE_LINEUP` to accept optional `assignment` |
| `teams.html` | New — full-tab page shell |
| `teams.js` | New — page logic: load clubs, preview lineups per card, handle apply / optimize-all |
| `teams.css` | New — styles (dark theme matching existing extension styles) |

---

## Out of Scope

- Editing formation type or tactical sliders
- Drag-and-drop lineup editing
- Historical OVR tracking
- Push notifications for energy changes
