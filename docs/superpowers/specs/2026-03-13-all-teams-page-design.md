# All Teams Page — Design Spec

**Date:** 2026-03-13
**Status:** Approved

---

## Overview

A full-tab browser page accessible by clicking the extension icon. Shows all of the user's MFL clubs and squads on one screen, allowing per-squad lineup optimization and bulk "Optimize All" without needing to navigate to individual tactics pages.

---

## Entry Point

- `manifest.json` adds a `chrome.action` (no `default_popup`)
- `background.js` listens for `chrome.action.onClicked` and calls `chrome.tabs.create({ url: 'teams.html' })`
- New files: `teams.html`, `teams.js`, `teams.css`

---

## Page Structure

### Header (sticky)
- Title: "MFL Enhancement Suite — All Teams"
- Logged-in username (fetched from user profile API)

### Squad Cards (vertical list)
One card per squad. Cards stack vertically; user scrolls to see more.

**Card header:**
- Squad/club name
- Formation type, player count
- Current OVR (sum of 11 starters' OVR at their slot positions)
- Best possible OVR (optimizer's pick) with diff (e.g. "+24")
- "Expand All" button — toggles all lineup rows open/closed at once

**Lineup rows (7 per card):**
- CURRENT — the active lineup as it exists today
- ★ BEST — the optimizer's recommended lineup
- ALT 1–5 — five near-optimal alternative lineups, ranked by total OVR descending

Each row shows:
- Badge (CURRENT / ★ BEST / ALT 1–5)
- Short description (e.g. "3 swaps", "keep Vargas at RB")
- Total OVR (sum of 11 slot OVRs)
- Diff vs current (e.g. "+24"), hidden for CURRENT row
- "Show ▾ / Hide ▴" toggle — expands the pitch-column lineup view
- "Apply" button — saves that lineup via the MFL API. Disabled/shows "Applied" for the currently active lineup.

**Expanded lineup view (pitch columns):**
Players grouped into four columns: GK | Defenders | Midfielders | Attackers, left to right. Each player card shows: slot position label, name, OVR at that slot, energy %. Players that differ from the CURRENT lineup are highlighted in gold.

### Bottom Bar (sticky)
- "⚡ Optimize All Squads" button — applies the optimizer's pick (★ BEST) to every squad in sequence.

---

## OVR Calculation

Total OVR for a lineup = sum of `ovrAtPosition(player, slotPosition)` for all 11 starters, using the same `ovrAtPosition()` function already used by the existing optimizer. Slot positions are derived from `FORMATION_SLOT_POSITIONS` keyed on the formation type.

---

## Generating 5 Alternatives

1. Run `optimizeLineup()` → **best** lineup
2. Collect the set of players swapped *in* by the optimizer
3. For each of 5 rounds: force-exclude the most recently introduced swap player from the eligible pool, re-run `optimizeLineup()` → produces the next-best distinct lineup
4. Deduplicate: if a round produces an identical assignment to a previous one, skip and continue

All 6 lineups (best + 5 alts) are computed in `background.js` via a new `PREVIEW_LINEUPS` message handler and returned to `teams.js` before any lineup is applied.

---

## API Integration

### Auth check + club discovery
- New background message: `GET_CLUBS`
  1. Read `mflToken` from `chrome.storage.session`
  2. Call `GET /users/me` (authenticated) → get username + list of club IDs
  3. For each club ID: call `fetchClub(clubId)` → get squad IDs, formation type
  4. Return `{ success, username, clubs: [{ id, name, squadId, formationType, playerCount }] }`

### Preview lineups (no write)
- New background message: `PREVIEW_LINEUPS` with `{ clubId }`
  1. Fetch players + formation (same as existing `handleOptimize`)
  2. Run optimizer + generate 5 alternatives
  3. Return `{ success, currentOvr, lineups: [{ label, description, totalOvr, diff, assignment }] }` — no `setFormation` call

### Apply a specific lineup
- Reuse existing `OPTIMIZE_LINEUP` message, extended to accept an optional `assignment` parameter
  - If `assignment` provided: skip optimizer, apply that assignment directly via `setFormation`
  - If no `assignment`: run optimizer as today (backwards compatible)

---

## Error States

- **Not logged in:** Show a card-level message "Browse any MFL page first to authenticate" with a link to playmfl.com
- **API error fetching clubs:** Show inline error with retry button
- **Apply fails:** Show error inline on the lineup row, button resets to "Apply"
- **No clubs found:** Show empty state "No clubs found for your account"

---

## Files Changed / Created

| File | Change |
|------|--------|
| `manifest.json` | Add `action: {}` key (no popup) |
| `background.js` | Add `chrome.action.onClicked` listener; add `GET_CLUBS` and `PREVIEW_LINEUPS` message handlers; extend `OPTIMIZE_LINEUP` to accept optional `assignment` |
| `teams.html` | New — full-tab page shell |
| `teams.js` | New — page logic: load clubs, preview lineups, handle apply/optimize-all |
| `teams.css` | New — styles for the all-teams page |

---

## Out of Scope

- Editing formation type or tactical sliders
- Drag-and-drop lineup editing
- Historical OVR tracking
- Push notifications for energy changes
