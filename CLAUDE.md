## Registering New Features (Extension)

When adding a new feature to the Chrome extension:

1. Add an entry to `src/features.js` — this is the ONLY place you need to touch for the feature to appear in the settings UI.
2. Set `tier: 'free'` for features available to all users, `tier: 'pro'` for future paid features (renders as locked with "Coming Soon").
3. Gate the feature in `content_script.js` behind `settings.features.<id>.enabled` inside the async IIFE at the bottom of the file.
4. If the feature has configurable parameters, add them to the `params` array on the registry entry. The settings page renders param controls automatically.
5. Only add a migration to `src/migrations.js` if you are making a breaking change (renaming a key, changing a type, removing a feature). Additive changes (new features, new params) do not need migrations — `loadSettings` merges new registry entries with defaults automatically.
