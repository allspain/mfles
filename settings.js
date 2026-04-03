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

  if (feature.params && feature.params.length > 0) {
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

    for (const param of (feature.params || [])) {
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
