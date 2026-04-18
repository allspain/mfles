# MFL Enhancement Suite — Design Document
**Date:** 2026-03-09
**Status:** Approved

---

## Overview

A Chrome extension that adds an "Optimize Lineup" button to the MFL tactics page. It automatically substitutes fatigued players with fresher alternatives using a scoring algorithm that combines player OVR and energy. Supports one account with N clubs. All optimization logic lives in background.js; content_script.js handles only UI and click events.

---

## Architecture

```
Chrome Extension (Manifest V3)
├── manifest.json
├── background.js (service worker)
│   ├── Auth token capture & storage (chrome.storage.session)
│   ├── MFL API client (fetch squad, energy, tactics, set lineup)
│   └── Lineup optimizer (scoring algorithm)
└── content_script.js
    ├── Detects tactics page (/clubs/:id/tactics)
    ├── Intercepts outgoing requests to capture auth token
    ├── Injects "Optimize Lineup" button
    ├── Sends click event → background.js via chrome.runtime.sendMessage
    └── Receives result → shows success/error feedback UI
```

**Data flow:**
1. User loads any MFL page → content script wraps `fetch`/`XHR` to intercept auth token → forwarded to background.js via `chrome.runtime.sendMessage` → stored in `chrome.storage.session`
2. User clicks "Optimize Lineup" → content script messages background.js with current club ID (from URL)
3. Background.js fetches squad + tactics, runs optimizer, POSTs new lineup
4. Background.js messages back result → content script shows inline feedback

---

## Scoring Algorithm

Effective score for any player:

```
effective_score = (energy/100) × OVR                                    when energy ≤ 92
effective_score = (0.92 + 0.08 × (1 − e^(−3×(energy−92)/8))) × OVR    when energy > 92
```

- Below 92%: energy linearly scales OVR
- Above 92%: diminishing returns — a player at 100% energy is only marginally better than one at 92%
- 60% energy is a warning threshold (players below this cannot train; fielding 5+ forfeits match)

**Substitution logic:**
1. Score every player in the squad (starters + bench)
2. For each position slot in the starting XI, find the highest-scoring eligible player (by primary or secondary position)
3. If a bench player scores higher than the current starter → swap
4. Always maintain valid formation (at least 1 GK, correct positional counts)
5. Players below 60% energy trigger a warning in the UI but are still selectable if no better option exists

---

## API & Auth

No public MFL API exists. The extension reverse-engineers the internal API at runtime.

**Token capture:**
- Content script injects a page-level script wrapping `fetch` and `XMLHttpRequest`
- First authenticated request to `*.playmfl.com` yields the auth token (`Authorization: Bearer <jwt>`)
- Token stored in `chrome.storage.session` (cleared on browser close, never persisted)

**Endpoints (to be confirmed via network inspection):**
```
GET  /clubs/{clubId}/squad          → all players with OVR, position, energy
GET  /clubs/{clubId}/tactics        → current formation, starting XI, bench
POST /clubs/{clubId}/tactics        → submit new lineup
GET  /users/me/clubs                → all club IDs for the account
```

**Background.js flow per club:**
1. `GET /squad` → score all players
2. `GET /tactics` → get current lineup + formation
3. Run optimizer → produce new starting XI
4. `POST /tactics` → submit
5. Return swap diff to content script

---

## UI

Content script only — no popup for v1.

**Button injection:** Injected into the tactics page toolbar, styled to match MFL's UI. Only shown when auth token is available.

**Button states:**
- `[Optimize Lineup]` — idle
- `[Optimizing...]` — spinner, disabled
- `[✓ 3 swaps made]` — success with swap count
- `[✗ Already optimal]` — no changes needed
- `[✗ Error: ...]` — failure with reason

**Swap summary panel (on success):**
```
OUT  Player A (OVR 85, energy 58% → score 43.8)
IN   Player B (OVR 80, energy 94% → score 73.8)
```

---

## Future: Multi-Club Page

Background.js already supports N clubs via `GET /users/me/clubs`. A future extension popup will list all clubs with an "Optimize All" button and per-club status. Content script stays thin.

---

## File Structure

```
mfles/
├── manifest.json
├── background.js
├── content_script.js
├── styles.css              (injected button/panel styles)
└── docs/
    └── plans/
        └── 2026-03-09-mfl-enhancement-suite-design.md
```
