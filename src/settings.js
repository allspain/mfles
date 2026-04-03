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
    for (const param of (feature.params || [])) {
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
