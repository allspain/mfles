# MFL Enhancement Suite — Settings Page & Feature Management

**Date:** 2026-04-02
**Status:** Approved

---

## Overview

Add a settings system to the extension so users can enable/disable features individually. Clicking the extension icon opens a popup with two actions: "Optimize All Teams" and "Settings". The settings page is a new tab showing a feature list rendered from a central registry. Settings are persisted in `chrome.storage.local` with a versioned migration system for future schema changes.

---

## Goals

- Enable/disable Lineup Optimizer and Position OVR independently
- Settings survive browser restarts (local storage, not session)
- Adding a new feature = adding one entry to the feature registry — no other UI changes
- Data structure flexible enough to support per-feature parameters alongside the toggle
- Firebase sync stub in place for future paid-tier settings storage
- CLAUDE.md reminds developer to register new features

---

## File Changes

### New files

| File | Purpose |
|------|---------|
| `popup.html` | Chrome action popup — two navigation buttons |
| `popup.js` | Popup logic — opens All Teams or Settings in a new tab |
| `settings.html` | Settings page rendered in a new tab |
| `settings.js` | Reads feature registry, renders UI, saves on change |
| `src/features.js` | Feature registry — single source of truth |
| `src/settings.js` | Storage module: load, save, migrate, merge defaults |
| `src/migrations.js` | Versioned migration map (empty at v1) |
| `src/settings-sync.js` | Firebase sync stub |

### Modified files

| File | Change |
|------|--------|
| `manifest.json` | Add `action.default_popup: "popup.html"` |
| `background.js` | Remove `chrome.action.onClicked` handler (popup replaces it) |
| `content_script.js` | Gate feature injection behind settings flags |
| `CLAUDE.md` | Add "Registering new features" section |

---

## Data Model

Stored in `chrome.storage.local` under key `mfles_settings`:

```js
{
  schemaVersion: 1,
  features: {
    lineupOptimizer: { enabled: true },
    positionOvr:     { enabled: true }
  }
}
```

Each feature object is flat. `enabled` is always present. Any additional params are sibling keys:

```js
// Example future state — no migration needed, just add to registry default
lineupOptimizer: {
  enabled: true,
  energyThreshold: 50
}
```

### Why `chrome.storage.local` not `sync`

`storage.local` has a 5MB quota vs sync's 8KB, never fails due to network, and won't conflict with the planned Firebase layer for paid users. Cross-device sync will be handled by Firebase, not Chrome's built-in sync.

---

## Feature Registry (`src/features.js`)

Each feature is defined once here. The settings page renders entirely from this array — no hardcoding in HTML.

```js
export const FEATURES = [
  {
    id:             'lineupOptimizer',
    label:          'Lineup Optimizer',
    description:    'Best XI button on the tactics page',
    tier:           'free',       // 'free' | 'pro'
    defaultEnabled: true,
    params:         []            // param definitions added here as needed
  },
  {
    id:             'positionOvr',
    label:          'Position OVR',
    description:    'Per-position OVR chips on scouting & tactics pages',
    tier:           'free',
    defaultEnabled: true,
    params:         []
  }
];
```

**Param definition shape** (for future use):

```js
{
  key:     'energyThreshold',
  label:   'Energy threshold',
  description: 'Min energy % to consider a player',
  type:    'range',           // 'range' | 'toggle' | 'select'
  default: 50,
  min:     0,                 // for range type
  max:     100
}
```

**Tier behaviour:**
- `free` — toggle enabled, user can turn on/off
- `pro` — row renders as locked with "Coming Soon" badge, no toggle

---

## Settings Module (`src/settings.js`)

Three public functions:

### `loadSettings()`

```
read chrome.storage.local
  → run pending migrations (schemaVersion → CURRENT_VERSION)
  → deep-merge with registry defaults (handles new features/params)
  → return merged settings
```

Merging with defaults means:
- New feature in registry but not in storage → appears with `defaultEnabled`
- New param in registry but not in stored feature object → appears with param's `default`
- Removed feature in storage but not in registry → ignored (sits harmlessly, cleaned by explicit migration if needed)

### `saveSettings(settings)`

```
write to chrome.storage.local
  → call syncToFirebase(settings)  // no-op stub
```

### `getFeature(id)`

Calls `loadSettings()` and returns `settings.features[id]`. Convenience for content script use.

---

## Migration System (`src/migrations.js`)

```js
export const CURRENT_VERSION = 1;

// Add entries when making breaking changes (renames, type changes, removals)
// Key = version being migrated TO
// Function receives full settings object, must return transformed settings object
export const MIGRATIONS = {
  // 2: (settings) => { ... }
};
```

The settings module runs migrations in numeric order between stored version and `CURRENT_VERSION`, then updates `schemaVersion` in the saved result. Additive changes (new features, new params) do not require a migration — the merge handles them automatically.

---

## Popup (`popup.html` / `popup.js`)

Width: 280px. Dark theme matching extension style (`#0f1923` background).

**Structure:**
- Header: icon + "MFL Enhancement Suite" wordmark
- Button: "⚡ Optimize All Teams" → `chrome.tabs.create({ url: chrome.runtime.getURL('teams.html') })`
- Button: "⚙ Settings" → `chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') })`

**Styling:**
- Default: `background: #161b22`, `border: 1px solid #30363d`, `color: #e6edf3`
- Hover: `background: #1a2f1a`, `border-color: #3fb950`, `color: #3fb950`
- No permanent green — hover only

---

## Settings Page (`settings.html` / `settings.js`)

Opens as a full browser tab. Same dark theme as teams.html.

**Render loop:**

For each feature in `FEATURES`:
1. Render toggle row: label, description, on/off toggle
2. If feature has `params` and is enabled: render param controls inline below, indented
3. If `tier === 'pro'`: render locked row with "Coming Soon" badge instead of toggle

On any toggle/param change: call `saveSettings()` immediately. No save button.

**Pro row (future upsell stub):**
```
[lock icon]  Feature Name          [Coming Soon]
             Feature description
```
Purple accent (`#bc8cff`) to hint at paid tier.

---

## Content Script Integration

On load, `content_script.js` calls `loadSettings()` once:

```js
const settings = await loadSettings();

if (settings.features.lineupOptimizer.enabled) {
  injectOptimizeButton();
}

if (settings.features.positionOvr.enabled) {
  injectOvrChips();  // existing logic
}
```

If a feature is disabled, its DOM injection is skipped entirely. No other changes to existing feature logic.

---

## Firebase Stub (`src/settings-sync.js`)

```js
/**
 * Sync settings to Firebase for authenticated paid users.
 * Currently a no-op — replace with Firestore write when Firebase auth is integrated.
 *
 * @param {object} settings - Full settings object from saveSettings()
 */
export function syncToFirebase(settings) {
  // TODO: check if user is authenticated (firebase auth)
  // TODO: write settings to Firestore user doc
}
```

---

## CLAUDE.md Addition

```markdown
## Registering New Features

When adding a new feature to the extension:

1. Add an entry to `src/features.js` — this is the ONLY place you need to touch for the feature to appear in the settings UI.
2. Set `tier: 'free'` for features available to all users, `tier: 'pro'` for future paid features.
3. Gate the feature in `content_script.js` behind `settings.features.<id>.enabled`.
4. If the feature has configurable parameters, add them to the `params` array on the registry entry. The settings page renders param controls automatically.
5. Only add a migration to `src/migrations.js` if you are making a breaking change (renaming a key, changing a type, removing a feature). Additive changes do not need migrations.
```

---

## Implementation Notes

### No ES modules — plain script files

The existing codebase uses plain JS with no bundler. `background.js` loads modules via `importScripts()`. Content scripts are plain injected files. To stay consistent:

- `src/features.js`, `src/settings.js`, `src/migrations.js`, `src/settings-sync.js` are plain scripts that attach to a `window.MFLES` namespace (e.g. `window.MFLES = window.MFLES || {}; MFLES.FEATURES = [...]`)
- `manifest.json` adds `src/features.js` and `src/settings.js` to the `content_scripts` `js` array (before `content_script.js`) so they're available as globals
- `background.js` loads them via `importScripts('src/features.js', 'src/settings.js', ...)`
- `popup.html` and `settings.html` load them with `<script src="...">` tags in order

No `export`/`import` syntax anywhere.

---

## What's Out of Scope

- Actual Firebase authentication or Firestore writes
- Pro feature paywall or payment flow
- Cross-device settings sync (deferred to Firebase layer)
- Settings import/export
