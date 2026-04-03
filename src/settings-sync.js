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
