// content_script.js

// ── Auth token capture ──────────────────────────────────────────────
// Inject a script into the page context to intercept fetch calls.
// Content scripts run in an isolated world and cannot observe window.fetch,
// so we inject a <script> tag to wrap it at the page level.
const interceptor = document.createElement('script');
interceptor.textContent = `
  (function() {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      const options = args[1] || {};
      const headers = options.headers || {};
      const authHeader =
        headers.Authorization ||
        headers.authorization ||
        (headers instanceof Headers ? headers.get('Authorization') : null);

      if (authHeader && url.includes('playmfl.com')) {
        window.dispatchEvent(new CustomEvent('mfl_auth_token', {
          detail: { token: authHeader }
        }));
      }
      return originalFetch.apply(this, args);
    };
  })();
`;
(document.head || document.documentElement).appendChild(interceptor);
interceptor.remove();

// Listen for the token dispatched from page context
window.addEventListener('mfl_auth_token', (event) => {
  const { token } = event.detail;
  chrome.runtime.sendMessage({ type: 'STORE_TOKEN', token });
});

// ── Page detection ──────────────────────────────────────────────────
function getClubIdFromUrl() {
  const match = window.location.pathname.match(/\/clubs\/(\w+)\/tactics/);
  return match ? match[1] : null;
}

function onTacticsPage() {
  return getClubIdFromUrl() !== null;
}

// ── UI injection ────────────────────────────────────────────────────
// Stub — replaced in Task 8
function injectOptimizeButton() {
  // implemented in Task 8
}

if (onTacticsPage()) {
  injectOptimizeButton();
}

// Handle SPA navigation: React changes the URL without a full page reload
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (onTacticsPage()) {
      setTimeout(injectOptimizeButton, 500);
    }
  }
}).observe(document, { subtree: true, childList: true });
