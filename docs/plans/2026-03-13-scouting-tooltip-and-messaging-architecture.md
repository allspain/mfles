# Design: Scouting Page Tooltip + Messaging Architecture

**Date:** 2026-03-13

## Problem

1. The position OVR tooltip only works on the tactics page. The scouting page has the same mini-pitch position popover but receives no OVR augmentation.
2. `fetch_interceptor.js` (MAIN world content script) directly calls `ovrAtPosition()`, violating the principle that content scripts should be display logic and UI extraction only.

## Solution

Move all OVR computation to `background.js`, route through Chrome messaging, and extend hover detection to cover the scouting page.

## Architecture

```
fetch_interceptor.js (MAIN world)
  └─ fetch wrapping + mfl_refresh_ui only

content_script.js (ISOLATED world)
  ├─ hover detection (tactics + scouting)
  ├─ fiber traversal to extract player data
  ├─ MutationObserver for popover
  ├─ chrome.runtime.sendMessage → background
  └─ SVG augmentation with returned OVRs

background.js
  └─ GET_POSITION_OVRS handler → ovrAtPosition() × 15 positions
```

## Message API

**Request:** `{ type: 'GET_POSITION_OVRS', player: { id, metadata: { positions, pace, shooting, passing, dribbling, defense, physical, goalkeeping } } }`

**Response:** `{ ovrs: { GK: 0, CB: 41, RB: 44, LB: 44, RWB: 44, LWB: 44, CDM: 52, CM: 60, CAM: 55, RM: 58, LM: 57, RW: 46, LW: 46, CF: 43, ST: 39 } }`

## Player Extraction Per Page

| Page | Hover element | Player source |
|---|---|---|
| Tactics | `[class*="player-position-{id}"]` | Fiber up to `playersListStore.players` (lookup by ID) |
| Scouting | `.inline.cursor-help` | Fiber up to `row` prop (contains full metadata) |

The scouting `row` object has the same `{ id, metadata: { positions, pace, ... } }` shape that `ovrAtPosition()` already expects.

## SVG Augmentation

`augmentSvgWithOvrs(tooltipEl, ovrs)` replaces direct `ovrAtPosition()` calls with lookups into the pre-computed `ovrs` map. Position label detection is unchanged:

- Coloured circles (2 circles + text): position label from existing `<text>` element
- Grey circles (1 circle, no text): position label from `PITCH_COORD_POSITIONS` coordinate map

## File Changes

| File | Change |
|---|---|
| `fetch_interceptor.js` | Remove all tooltip augmentation code — keep only fetch wrap + `mfl_refresh_ui` handler |
| `content_script.js` | Add `PITCH_COORD_POSITIONS`, `makeSvgText`, `augmentSvgWithOvrs`, hover tracking, fiber extraction helpers, MutationObserver for popover |
| `background.js` | Add `GET_POSITION_OVRS` message handler |
| `manifest.json` | Remove `src/positions.js` from MAIN world content scripts (no longer needed there) |

## URL Scope

`https://app.playmfl.com/*` already covers all scouting pages — no manifest change needed.

## Non-Goals

- No changes to the OVR calculation logic
- No changes to the optimize button or lineup optimizer
- No changes to the auth token capture flow
