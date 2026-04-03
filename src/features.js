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
