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
