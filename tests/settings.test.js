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
    _stored['mfles_settings'] = {
      schemaVersion: 1,
      features: { lineupOptimizer: { enabled: true } }
    };
    const feature = FEATURES.find(f => f.id === 'lineupOptimizer');
    const originalParams = feature.params;
    try {
      feature.params = [{ key: 'energyThreshold', default: 50 }];
      const settings = await loadSettings();
      expect(settings.features.lineupOptimizer.energyThreshold).toBe(50);
    } finally {
      feature.params = originalParams;
    }
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
