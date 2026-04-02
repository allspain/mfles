# Settings Page & Feature Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a feature registry, settings storage, popup, and settings page so users can enable/disable extension features independently with settings that survive browser restarts.

**Architecture:** A central feature registry (`src/features.js`) drives both the settings UI and the content script feature gating. Settings are stored in `chrome.storage.local` with a versioned migration system. A new Chrome action popup replaces the current `onClicked` handler, presenting two buttons: Optimize All Teams and Settings.

**Tech Stack:** Chrome Extension MV3, plain JS (no bundler, no ES modules — same pattern as existing `src/` files), Jest for tests.

---

### Task 1: Feature registry, migrations stub, and settings-sync stub

**Files:**
- Create: `src/features.js`
- Create: `src/migrations.js`
- Create: `src/settings-sync.js`

- [ ] **Step 1: Create `src/features.js`**

```js
// src/features.js
// Central registry of all extension features.
// To add a new feature: add an entry to FEATURES. The settings page renders
// from this array automatically — no changes to settings.html needed.
// Gate the feature in content_script.js behind its `enabled` flag.

const FEATURES = [
  {
    id:             'lineupOptimizer',
    label:          'Lineup Optimizer',
    description:    'Best XI button on the tactics page',
    tier:           'free',       // 'free' | 'pro'
    defaultEnabled: true,
    params:         []
    // params example for future use:
    // { key: 'energyThreshold', label: 'Energy threshold', description: 'Min energy % to consider',
    //   type: 'range', default: 50, min: 0, max: 100 }
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FEATURES };
} else {
  globalThis.FEATURES = FEATURES;
}
```

- [ ] **Step 2: Create `src/migrations.js`**

```js
// src/migrations.js
// Versioned migration functions for chrome.storage.local settings schema.
// Increment CURRENT_VERSION and add a migration function when making a
// breaking change (rename, type change, removal). Additive changes
// (new features, new params) do NOT need migrations — loadSettings merges
// new registry entries with defaults automatically.

const CURRENT_VERSION = 1;

const MIGRATIONS = {
  // Example:
  // 2: (settings) => {
  //   // Rename old key to new key
  //   if (settings.features.oldFeature) {
  //     settings.features.newFeature = settings.features.oldFeature;
  //     delete settings.features.oldFeature;
  //   }
  //   return settings;
  // }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CURRENT_VERSION, MIGRATIONS };
} else {
  globalThis.CURRENT_VERSION = CURRENT_VERSION;
  globalThis.MIGRATIONS = MIGRATIONS;
}
```

- [ ] **Step 3: Create `src/settings-sync.js`**

```js
// src/settings-sync.js
// Firebase sync stub for future paid-tier settings storage.
// Replace with real Firestore write when Firebase auth is integrated.

function syncToFirebase(settings) {
  // TODO: check if user is authenticated (firebase auth)
  // TODO: write settings to Firestore user doc under their uid
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { syncToFirebase };
} else {
  globalThis.syncToFirebase = syncToFirebase;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/features.js src/migrations.js src/settings-sync.js
git commit -m "feat: add feature registry, migrations stub, and settings-sync stub"
```

---

### Task 2: Settings module with tests

**Files:**
- Create: `src/settings.js`
- Create: `tests/settings.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/settings.test.js

// ── Mock chrome.storage.local ────────────────────────────────────────
let _stored = {};
global.chrome = {
  storage: {
    local: {
      get:  jest.fn((key) => Promise.resolve({ [key]: _stored[key] })),
      set:  jest.fn((obj)  => { Object.assign(_stored, obj); return Promise.resolve(); }),
    }
  }
};

beforeEach(() => {
  _stored = {};
  jest.clearAllMocks();
});

// ── Load dependencies as globals (mirrors browser script-load order) ─
const { FEATURES }                    = require('../src/features');
const { CURRENT_VERSION, MIGRATIONS } = require('../src/migrations');
const { syncToFirebase }              = require('../src/settings-sync');
global.FEATURES         = FEATURES;
global.CURRENT_VERSION  = CURRENT_VERSION;
global.MIGRATIONS       = MIGRATIONS;
global.syncToFirebase   = syncToFirebase;

const { loadSettings, saveSettings, getFeature } = require('../src/settings');

// ── Tests ────────────────────────────────────────────────────────────

describe('loadSettings', () => {
  test('returns defaults when storage is empty', async () => {
    const settings = await loadSettings();
    expect(settings.schemaVersion).toBe(1);
    expect(settings.features.lineupOptimizer.enabled).toBe(true);
    expect(settings.features.positionOvr.enabled).toBe(true);
  });

  test('preserves stored enabled:false after reload', async () => {
    await saveSettings({
      schemaVersion: 1,
      features: { lineupOptimizer: { enabled: false }, positionOvr: { enabled: true } }
    });
    const settings = await loadSettings();
    expect(settings.features.lineupOptimizer.enabled).toBe(false);
    expect(settings.features.positionOvr.enabled).toBe(true);
  });

  test('merges a registry feature that is missing from storage', async () => {
    // Simulate storage that was saved before positionOvr existed
    _stored['mfles_settings'] = {
      schemaVersion: 1,
      features: { lineupOptimizer: { enabled: false } }
    };
    const settings = await loadSettings();
    // Preserved existing value
    expect(settings.features.lineupOptimizer.enabled).toBe(false);
    // New feature appeared with its defaultEnabled
    expect(settings.features.positionOvr.enabled).toBe(true);
  });

  test('merges a new param from registry into existing feature', async () => {
    // Simulate a feature stored without a param that now exists in registry
    _stored['mfles_settings'] = {
      schemaVersion: 1,
      features: { lineupOptimizer: { enabled: true } }
    };
    // Temporarily add a param to the registry
    FEATURES.find(f => f.id === 'lineupOptimizer').params = [
      { key: 'energyThreshold', default: 50 }
    ];
    const settings = await loadSettings();
    expect(settings.features.lineupOptimizer.energyThreshold).toBe(50);
    // Restore registry state
    FEATURES.find(f => f.id === 'lineupOptimizer').params = [];
  });

  test('runs a pending migration and bumps schemaVersion', async () => {
    _stored['mfles_settings'] = { schemaVersion: 0, features: {} };
    MIGRATIONS[1] = (s) => ({ ...s, _migrated: true });
    const settings = await loadSettings();
    expect(settings._migrated).toBe(true);
    expect(settings.schemaVersion).toBe(CURRENT_VERSION);
    delete MIGRATIONS[1];
  });

  test('skips migrations already applied', async () => {
    const spy = jest.fn((s) => s);
    MIGRATIONS[1] = spy;
    _stored['mfles_settings'] = { schemaVersion: 1, features: {} };
    await loadSettings();
    expect(spy).not.toHaveBeenCalled();
    delete MIGRATIONS[1];
  });
});

describe('saveSettings', () => {
  test('writes to chrome.storage.local', async () => {
    const settings = { schemaVersion: 1, features: { lineupOptimizer: { enabled: false }, positionOvr: { enabled: true } } };
    await saveSettings(settings);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ mfles_settings: settings });
  });
});

describe('getFeature', () => {
  test('returns the specific feature object', async () => {
    const feature = await getFeature('lineupOptimizer');
    expect(feature).toEqual({ enabled: true });
  });

  test('returns undefined for unknown feature id', async () => {
    const feature = await getFeature('nonexistent');
    expect(feature).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- tests/settings.test.js
```

Expected: fail with `Cannot find module '../src/settings'`

- [ ] **Step 3: Create `src/settings.js`**

```js
// src/settings.js
// Settings storage module. All reads/writes go through loadSettings and saveSettings.
// Dependencies (FEATURES, CURRENT_VERSION, MIGRATIONS, syncToFirebase) are globals
// set by the scripts loaded before this one.

const STORAGE_KEY = 'mfles_settings';

async function loadSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  let settings = result[STORAGE_KEY] || { schemaVersion: 0, features: {} };

  // Run any pending migrations in version order
  const storedVersion = settings.schemaVersion || 0;
  for (let v = storedVersion + 1; v <= CURRENT_VERSION; v++) {
    if (MIGRATIONS[v]) {
      settings = MIGRATIONS[v](settings);
    }
  }
  settings.schemaVersion = CURRENT_VERSION;

  // Merge registry defaults — handles new features and new params added after
  // the user's settings were last saved
  settings.features = settings.features || {};
  for (const feature of FEATURES) {
    if (!settings.features[feature.id]) {
      settings.features[feature.id] = { enabled: feature.defaultEnabled };
    }
    for (const param of feature.params) {
      if (!(param.key in settings.features[feature.id])) {
        settings.features[feature.id][param.key] = param.default;
      }
    }
  }

  return settings;
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
  syncToFirebase(settings);
}

async function getFeature(id) {
  const settings = await loadSettings();
  return settings.features[id];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { loadSettings, saveSettings, getFeature };
} else {
  globalThis.loadSettings  = loadSettings;
  globalThis.saveSettings  = saveSettings;
  globalThis.getFeature    = getFeature;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- tests/settings.test.js
```

Expected:
```
PASS tests/settings.test.js
  loadSettings
    ✓ returns defaults when storage is empty
    ✓ preserves stored enabled:false after reload
    ✓ merges a registry feature that is missing from storage
    ✓ merges a new param from registry into existing feature
    ✓ runs a pending migration and bumps schemaVersion
    ✓ skips migrations already applied
  saveSettings
    ✓ writes to chrome.storage.local
  getFeature
    ✓ returns the specific feature object
    ✓ returns undefined for unknown feature id
```

- [ ] **Step 5: Run full test suite — verify nothing broken**

```bash
npm test
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/settings.js tests/settings.test.js
git commit -m "feat: add settings storage module with load/save/migrate"
```

---

### Task 3: Popup

**Files:**
- Create: `popup.html`
- Create: `popup.js`
- Modify: `manifest.json`

- [ ] **Step 1: Create `popup.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 280px;
      background: #0f1923;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 14px;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 1px solid #1e2d3d;
    }
    .logo {
      width: 28px;
      height: 28px;
      border-radius: 6px;
    }
    .title {
      color: #e6edf3;
      font-size: 13px;
      font-weight: 600;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 9px 12px;
      margin-bottom: 8px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #e6edf3;
      font-size: 13px;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .btn:last-child { margin-bottom: 0; }
    .btn:hover {
      background: #1a2f1a;
      border-color: #3fb950;
      color: #3fb950;
    }
    .btn--secondary { font-weight: 400; color: #8b949e; }
    .btn--secondary:hover { color: #3fb950; }
  </style>
</head>
<body>
  <div class="header">
    <img class="logo" src="icons/48.png" alt="">
    <span class="title">MFL Enhancement Suite</span>
  </div>
  <button class="btn" id="btn-optimize">⚡ Optimize All Teams</button>
  <button class="btn btn--secondary" id="btn-settings">⚙ Settings</button>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `popup.js`**

```js
// popup.js
document.getElementById('btn-optimize').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('teams.html') });
});

document.getElementById('btn-settings').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
});
```

- [ ] **Step 3: Update `manifest.json` — add default_popup**

In the `"action"` object, add `"default_popup": "popup.html"`:

```json
"action": {
  "default_title": "MFL Enhancement Suite",
  "default_popup": "popup.html",
  "default_icon": {
    "16":  "icons/16.png",
    "48":  "icons/48.png",
    "128": "icons/128.png"
  }
}
```

- [ ] **Step 4: Verify manifest is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 5: Commit**

```bash
git add popup.html popup.js manifest.json
git commit -m "feat: add extension popup with Optimize All Teams and Settings buttons"
```

---

### Task 4: Settings page

**Files:**
- Create: `settings.html`
- Create: `settings.js`

- [ ] **Step 1: Create `settings.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MFL Enhancement Suite — Settings</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0d1117;
      color: #e6edf3;
      font-family: system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      padding: 48px 24px;
    }
    .page { max-width: 560px; margin: 0 auto; }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 32px;
      padding-bottom: 20px;
      border-bottom: 1px solid #21262d;
    }
    .logo { width: 32px; height: 32px; border-radius: 7px; }
    h1 { font-size: 20px; font-weight: 700; }

    .section-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #8b949e;
      margin-bottom: 10px;
    }

    .feature-list {
      background: #161b22;
      border: 1px solid #21262d;
      border-radius: 8px;
      overflow: hidden;
    }
    .feature-row {
      border-bottom: 1px solid #21262d;
    }
    .feature-row:last-child { border-bottom: none; }

    .feature-main {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 16px;
      gap: 16px;
    }
    .feature-info { flex: 1; min-width: 0; }
    .feature-label {
      display: block;
      font-size: 14px;
      font-weight: 600;
      color: #e6edf3;
      margin-bottom: 3px;
      cursor: pointer;
    }
    .feature-desc {
      font-size: 12px;
      color: #8b949e;
    }

    /* Toggle switch */
    .toggle { position: relative; display: inline-block; width: 40px; height: 22px; flex-shrink: 0; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle-track {
      position: absolute; inset: 0;
      background: #30363d;
      border-radius: 11px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .toggle-track::before {
      content: '';
      position: absolute;
      width: 18px; height: 18px;
      left: 2px; top: 2px;
      background: #fff;
      border-radius: 50%;
      transition: transform 0.2s;
    }
    .toggle input:checked + .toggle-track { background: #3fb950; }
    .toggle input:checked + .toggle-track::before { transform: translateX(18px); }

    /* Inline params */
    .feature-params {
      padding: 10px 16px 14px 32px;
      border-top: 1px solid #21262d;
      background: #0d1117;
    }
    .feature-params.hidden { display: none; }
    .param-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .param-row:last-child { margin-bottom: 0; }
    .param-info { flex: 1; }
    .param-label { font-size: 12px; font-weight: 500; color: #8b949e; margin-bottom: 2px; }
    .param-desc { font-size: 11px; color: #484f58; }
    .param-control { display: flex; align-items: center; gap: 8px; }
    .param-control input[type=range] { width: 80px; accent-color: #3fb950; }
    .param-value { font-size: 12px; color: #8b949e; width: 32px; text-align: right; }

    /* Pro row */
    .feature-row--pro .feature-main { opacity: 0.6; }
    .badge-pro {
      font-size: 11px;
      font-weight: 600;
      color: #bc8cff;
      background: #1a1430;
      border: 1px solid #3d2b6b;
      border-radius: 4px;
      padding: 3px 8px;
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <img class="logo" src="icons/48.png" alt="">
      <h1>Settings</h1>
    </div>
    <div class="section-label">Features</div>
    <div class="feature-list" id="feature-list">
      <!-- Populated by settings.js -->
    </div>
  </div>
  <script src="src/features.js"></script>
  <script src="src/migrations.js"></script>
  <script src="src/settings-sync.js"></script>
  <script src="src/settings.js"></script>
  <script src="settings.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `settings.js`**

```js
// settings.js — settings page controller
// Renders FEATURES array into the feature list and saves on any change.

function renderParamControl(param, value) {
  const row = document.createElement('div');
  row.className = 'param-row';
  row.dataset.paramKey = param.key;

  if (param.type === 'range') {
    row.innerHTML = `
      <div class="param-info">
        <div class="param-label">${param.label}</div>
        <div class="param-desc">${param.description}</div>
      </div>
      <div class="param-control">
        <input type="range" min="${param.min}" max="${param.max}" value="${value}">
        <span class="param-value">${value}%</span>
      </div>
    `;
    const input = row.querySelector('input');
    const display = row.querySelector('.param-value');
    input.addEventListener('input', () => { display.textContent = input.value + '%'; });
    return row;
  }

  if (param.type === 'toggle') {
    row.innerHTML = `
      <div class="param-info">
        <div class="param-label">${param.label}</div>
        <div class="param-desc">${param.description}</div>
      </div>
      <label class="toggle">
        <input type="checkbox" ${value ? 'checked' : ''}>
        <span class="toggle-track"></span>
      </label>
    `;
    return row;
  }

  return row;
}

function renderFeatureRow(feature, storedFeature) {
  const row = document.createElement('div');
  row.className = 'feature-row' + (feature.tier === 'pro' ? ' feature-row--pro' : '');
  row.dataset.featureId = feature.id;

  if (feature.tier === 'pro') {
    row.innerHTML = `
      <div class="feature-main">
        <div class="feature-info">
          <span class="feature-label">🔒 ${feature.label}</span>
          <span class="feature-desc">${feature.description}</span>
        </div>
        <span class="badge-pro">Coming Soon</span>
      </div>
    `;
    return row;
  }

  const toggleId = `toggle-${feature.id}`;
  const mainDiv = document.createElement('div');
  mainDiv.className = 'feature-main';
  mainDiv.innerHTML = `
    <div class="feature-info">
      <label class="feature-label" for="${toggleId}">${feature.label}</label>
      <span class="feature-desc">${feature.description}</span>
    </div>
    <label class="toggle">
      <input type="checkbox" id="${toggleId}" ${storedFeature.enabled ? 'checked' : ''}>
      <span class="toggle-track"></span>
    </label>
  `;
  row.appendChild(mainDiv);

  if (feature.params.length > 0) {
    const paramsDiv = document.createElement('div');
    paramsDiv.className = 'feature-params' + (storedFeature.enabled ? '' : ' hidden');
    for (const param of feature.params) {
      paramsDiv.appendChild(renderParamControl(param, storedFeature[param.key] ?? param.default));
    }
    row.appendChild(paramsDiv);
  }

  return row;
}

function collectSettings(currentSettings) {
  const list = document.getElementById('feature-list');
  for (const featureEl of list.querySelectorAll('[data-feature-id]')) {
    const id = featureEl.dataset.featureId;
    const feature = FEATURES.find(f => f.id === id);
    if (!feature || feature.tier === 'pro') continue;

    const checkbox = featureEl.querySelector(`#toggle-${id}`);
    currentSettings.features[id] = currentSettings.features[id] || {};
    currentSettings.features[id].enabled = checkbox.checked;

    for (const param of feature.params) {
      const paramRow = featureEl.querySelector(`[data-param-key="${param.key}"]`);
      if (!paramRow) continue;
      if (param.type === 'range') {
        currentSettings.features[id][param.key] = Number(paramRow.querySelector('input').value);
      } else if (param.type === 'toggle') {
        currentSettings.features[id][param.key] = paramRow.querySelector('input').checked;
      }
    }
  }
  return currentSettings;
}

async function init() {
  const settings = await loadSettings();
  const list = document.getElementById('feature-list');

  for (const feature of FEATURES) {
    const stored = settings.features[feature.id] || { enabled: feature.defaultEnabled };
    const row = renderFeatureRow(feature, stored);
    list.appendChild(row);

    // Wire up toggle → save + show/hide params
    const checkbox = row.querySelector(`#toggle-${feature.id}`);
    if (checkbox) {
      checkbox.addEventListener('change', async () => {
        const paramsDiv = row.querySelector('.feature-params');
        if (paramsDiv) paramsDiv.classList.toggle('hidden', !checkbox.checked);
        const current = await loadSettings();
        await saveSettings(collectSettings(current));
      });
    }

    // Wire up param controls → save on change
    for (const paramRow of row.querySelectorAll('[data-param-key]')) {
      const input = paramRow.querySelector('input');
      if (input) {
        input.addEventListener('change', async () => {
          const current = await loadSettings();
          await saveSettings(collectSettings(current));
        });
      }
    }
  }
}

init();
```

- [ ] **Step 3: Commit**

```bash
git add settings.html settings.js
git commit -m "feat: add settings page with feature toggles rendered from registry"
```

---

### Task 5: Wire up content script, background, manifest, and packaging

**Files:**
- Modify: `content_script.js`
- Modify: `background.js`
- Modify: `manifest.json`
- Modify: `scripts/package.sh`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `content_script.js` — wrap initialization in settings-aware async IIFE**

Find the current initialization block at the bottom of `content_script.js` (the final ~10 lines):

```js
// CURRENT (remove this):
if (document.body) {
  setupTooltipObserver();
  setupInlineOvrObserver();
} else {
  document.addEventListener('DOMContentLoaded', () => {
    setupTooltipObserver();
    setupInlineOvrObserver();
  });
}
```

Also find and remove the eager optimizer injection at line 140 (outside any function):

```js
// CURRENT (remove this):
if (onTacticsPage()) {
  injectOptimizeButton();
}
```

And remove the SPA navigation MutationObserver block (lines 149–165):

```js
// CURRENT (remove this block):
let lastUrl = location.href;
new MutationObserver(() => {
  // Handle URL change
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (onTacticsPage()) {
      setTimeout(injectOptimizeButton, 500);
    } else {
      removeOptimizeButton();
    }
  }
  // Reinject if button was removed while still on tactics page
  if (onTacticsPage() && !document.getElementById('mfl-optimize-btn')) {
    injectOptimizeButton();
  }
}).observe(document, { subtree: true, childList: true });
```

Replace all three removed blocks with a single async IIFE at the bottom of the file:

```js
// ── Initialization — settings-aware ──────────────────────────────────
(async () => {
  const settings = await loadSettings();

  // Feature: Lineup Optimizer
  if (settings.features.lineupOptimizer.enabled) {
    if (onTacticsPage()) injectOptimizeButton();

    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        if (onTacticsPage()) setTimeout(injectOptimizeButton, 500);
        else removeOptimizeButton();
      }
      if (onTacticsPage() && !document.getElementById('mfl-optimize-btn')) {
        injectOptimizeButton();
      }
    }).observe(document, { subtree: true, childList: true });
  }

  // Feature: Position OVR
  if (settings.features.positionOvr.enabled) {
    if (document.body) {
      setupTooltipObserver();
      setupInlineOvrObserver();
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        setupTooltipObserver();
        setupInlineOvrObserver();
      });
    }
  }
})();
```

- [ ] **Step 2: Update `background.js` — remove `chrome.action.onClicked` handler**

Find and remove this block (near the top of background.js, after the importScripts line):

```js
// REMOVE THIS:
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('teams.html') });
});
```

The popup now handles navigation — this handler is no longer needed.

- [ ] **Step 3: Update `manifest.json` content_scripts — add new src files**

In the second `content_scripts` entry (the one with `content_script.js`), prepend the four new src files:

```json
{
  "matches": ["https://app.playmfl.com/*", "https://mfl-es.web.app/*"],
  "js": [
    "src/features.js",
    "src/migrations.js",
    "src/settings-sync.js",
    "src/settings.js",
    "content_script.js"
  ],
  "css": ["styles.css"],
  "run_at": "document_idle"
}
```

- [ ] **Step 4: Verify manifest is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 5: Update `scripts/package.sh` — add new files to zip**

Add `popup.html`, `popup.js`, `settings.html`, `settings.js` to the zip command:

```bash
zip -r "$OUT" \
  manifest.json \
  background.js \
  content_script.js \
  fetch_interceptor.js \
  styles.css \
  popup.html \
  popup.js \
  settings.html \
  settings.js \
  src/ \
  icons/ \
  teams.html \
  teams.css \
  teams.js
```

- [ ] **Step 6: Add "Registering New Features" section to `CLAUDE.md`**

Append to `/Users/rickklein/CLAUDE.md`:

```markdown
## Registering New Features (Extension)

When adding a new feature to the Chrome extension:

1. Add an entry to `src/features.js` — this is the ONLY place you need to touch for the feature to appear in the settings UI.
2. Set `tier: 'free'` for features available to all users, `tier: 'pro'` for future paid features (renders as locked with "Coming Soon").
3. Gate the feature in `content_script.js` behind `settings.features.<id>.enabled` inside the async IIFE at the bottom of the file.
4. If the feature has configurable parameters, add them to the `params` array on the registry entry. The settings page renders param controls automatically.
5. Only add a migration to `src/migrations.js` if you are making a breaking change (renaming a key, changing a type, removing a feature). Additive changes (new features, new params) do not need migrations — `loadSettings` merges new registry entries with defaults automatically.
```

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

Expected: all tests pass (37 + 9 = 46 total).

- [ ] **Step 8: Commit**

```bash
git add content_script.js background.js manifest.json scripts/package.sh /Users/rickklein/CLAUDE.md
git commit -m "feat: gate features behind settings, wire popup, update packaging"
```

---

### Task 6: Smoke test in Chrome

- [ ] **Step 1: Load the extension unpacked**

- Go to `chrome://extensions`
- Enable Developer Mode
- Click "Load unpacked" → select `/Users/rickklein/Development/mfles`

- [ ] **Step 2: Verify the popup**

- Click the MFL ES icon in the toolbar
- Confirm the popup appears with two buttons (neutral style, green on hover)
- Click "Optimize All Teams" → confirms teams.html opens in new tab
- Click the icon again, click "Settings" → confirms settings.html opens in new tab

- [ ] **Step 3: Verify the settings page**

- Both features show as enabled (toggles on)
- Toggle "Lineup Optimizer" off → reload a tactics page → confirm no Optimize button appears
- Toggle back on → reload → confirm button reappears
- Toggle "Position OVR" off → reload a scouting page → confirm OVR chips gone
- Toggle back on → confirm chips reappear
- Close Chrome entirely, reopen → open settings → confirm toggles are still in their saved state

- [ ] **Step 4: Commit**

```bash
git add -p  # stage any tweaks from smoke testing
git commit -m "fix: smoke test adjustments" # only if there were changes
git push
```
