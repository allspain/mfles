// popup.js
document.getElementById('btn-optimize').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('teams.html') });
});

document.getElementById('btn-settings').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
});
