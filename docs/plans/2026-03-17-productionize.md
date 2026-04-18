# Productionize MFL Enhancement Suite

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare the Chrome extension for distribution via the Chrome Web Store (unlisted) with proper icons, manifest metadata, privacy policy, and a clean packaging script.

**Architecture:** No build system needed — extension files are plain JS. We add a `scripts/` directory for dev tooling (icon generation + packaging), update manifest metadata, and create a privacy policy hosted via GitHub Pages. The extension zip is built by `scripts/package.sh` which includes only the files Chrome needs.

**Tech Stack:** Chrome Extension MV3, Node.js (icon generation via `sharp`), bash (packaging), GitHub Pages (privacy policy hosting).

---

### Task 1: Generate extension icons

**Files:**
- Create: `scripts/generate-icons.js`
- Create: `icons/16.png`, `icons/48.png`, `icons/128.png`

Icons must be PNG. Design: dark green circle (`#16a34a`) with white bold "MFL" text centered. Use `sharp` + inline SVG — no external assets needed.

**Step 1: Install sharp as devDependency**

```bash
npm install --save-dev sharp
```

Expected: `node_modules/sharp` present, `package.json` updated.

**Step 2: Create `scripts/generate-icons.js`**

```javascript
// scripts/generate-icons.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

fs.mkdirSync(path.join(__dirname, '..', 'icons'), { recursive: true });

const sizes = [16, 48, 128];

for (const size of sizes) {
  const fontSize = Math.round(size * 0.38);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="#111827"/>
  <text x="50%" y="54%" font-family="Arial Black, Arial, sans-serif"
        font-size="${fontSize}" font-weight="900" fill="#a3e635"
        text-anchor="middle" dominant-baseline="middle">MFL</text>
</svg>`;

  sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(__dirname, '..', 'icons', `${size}.png`))
    .then(() => console.log(`icons/${size}.png ✓`));
}
```

**Step 3: Run the script**

```bash
node scripts/generate-icons.js
```

Expected output:
```
icons/16.png ✓
icons/48.png ✓
icons/128.png ✓
```

Verify: `ls icons/` shows three PNG files with non-zero size.

**Step 4: Commit**

```bash
git add icons/ scripts/generate-icons.js package.json package-lock.json
git commit -m "feat: add extension icons (16/48/128px)"
```

---

### Task 2: Update manifest.json

**Files:**
- Modify: `manifest.json`

**Step 1: Replace manifest.json with the following**

```json
{
  "manifest_version": 3,
  "name": "MFL Enhancement Suite",
  "version": "1.0.0",
  "description": "Lineup optimizer and position OVR display for playmfl.com",
  "icons": {
    "16":  "icons/16.png",
    "48":  "icons/48.png",
    "128": "icons/128.png"
  },
  "permissions": [
    "storage"
  ],
  "host_permissions": [
    "https://*.playmfl.com/*"
  ],
  "action": {
    "default_title": "MFL Enhancement Suite",
    "default_icon": {
      "16":  "icons/16.png",
      "48":  "icons/48.png",
      "128": "icons/128.png"
    }
  },
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://app.playmfl.com/*"],
      "js": ["fetch_interceptor.js"],
      "world": "MAIN",
      "run_at": "document_start"
    },
    {
      "matches": ["https://app.playmfl.com/*"],
      "js": ["content_script.js"],
      "css": ["styles.css"],
      "run_at": "document_idle"
    }
  ]
}
```

**Step 2: Also bump version in package.json**

Change `"version": "0.1.0"` to `"version": "1.0.0"`.

**Step 3: Commit**

```bash
git add manifest.json package.json
git commit -m "feat: bump to v1.0.0, add icons and action metadata to manifest"
```

---

### Task 3: Create privacy policy

**Files:**
- Create: `privacy-policy.html`

The Chrome Web Store requires a publicly accessible privacy policy URL. We'll create an HTML file in the repo root and enable GitHub Pages so it's hosted at `https://<owner>.github.io/<repo>/privacy-policy.html`.

**Step 1: Create `privacy-policy.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — MFL Enhancement Suite</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 680px; margin: 48px auto; padding: 0 24px; color: #1f2937; line-height: 1.6; }
    h1 { font-size: 1.5rem; }
    h2 { font-size: 1.1rem; margin-top: 2rem; }
  </style>
</head>
<body>
  <h1>Privacy Policy — MFL Enhancement Suite</h1>
  <p><em>Last updated: March 2026</em></p>

  <h2>What data is collected</h2>
  <p>The extension captures your playmfl.com authentication token from outgoing API requests made by the app. This token is used solely to make authorized API calls on your behalf (fetching your club's tactics and player data to run the lineup optimizer).</p>

  <h2>Where data is stored</h2>
  <p>The auth token is stored in <code>chrome.storage.local</code> — local to your browser, on your device only. It is never transmitted to any server other than <code>playmfl.com</code>.</p>

  <h2>What data is sent externally</h2>
  <p>The extension communicates exclusively with <code>https://app.playmfl.com</code> and <code>https://api.playmfl.com</code>. No data is sent to any third-party server. The extension has no analytics, tracking, or telemetry.</p>

  <h2>Data retention</h2>
  <p>The token persists in local storage until you uninstall the extension or clear browser storage. It is refreshed automatically on each playmfl.com session.</p>

  <h2>Contact</h2>
  <p>Questions? Open an issue on the <a href="https://github.com/allspain/mfles">GitHub repository</a>.</p>
</body>
</html>
```

**Step 2: Commit**

```bash
git add privacy-policy.html
git commit -m "docs: add privacy policy for Chrome Web Store submission"
```

**Step 3: Enable GitHub Pages**

In the GitHub repo → Settings → Pages → Source: Deploy from branch → Branch: `master`, folder: `/ (root)` → Save.

After a minute, verify `https://allspain.github.io/mfles/privacy-policy.html` loads.

> This step requires manual action in the GitHub UI — cannot be automated.

---

### Task 4: Create packaging script

**Files:**
- Create: `scripts/package.sh`

Produces `mfl-enhancement-suite.zip` containing only the files Chrome needs — no tests, docs, node_modules, or dev scripts.

**Step 1: Create `scripts/package.sh`**

```bash
#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/mfl-enhancement-suite.zip"

cd "$ROOT"
rm -f "$OUT"

zip -r "$OUT" \
  manifest.json \
  background.js \
  content_script.js \
  fetch_interceptor.js \
  styles.css \
  src/ \
  icons/ \
  teams.html \
  teams.css \
  teams.js

echo "✓ Built: $OUT ($(du -h "$OUT" | cut -f1))"
```

**Step 2: Make it executable**

```bash
chmod +x scripts/package.sh
```

**Step 3: Run it and verify**

```bash
./scripts/package.sh
```

Expected: `✓ Built: .../mfl-enhancement-suite.zip` with a size < 200KB.

Verify contents: `unzip -l mfl-enhancement-suite.zip` — should list only extension files, no `node_modules` or `docs`.

**Step 4: Add zip to .gitignore**

Add to `.gitignore` (create if it doesn't exist):
```
mfl-enhancement-suite.zip
node_modules/
```

**Step 5: Add package script to package.json**

```json
"scripts": {
  "test": "jest",
  "test:watch": "jest --watch",
  "icons": "node scripts/generate-icons.js",
  "package": "bash scripts/package.sh"
}
```

**Step 6: Commit**

```bash
git add scripts/package.sh .gitignore package.json
git commit -m "chore: add packaging script and .gitignore"
```

---

### Task 5: Clean up dev artifacts from docs/

**Files:**
- Delete: `docs/mock-pos-ovr.png`
- Delete: `docs/mock-styles.html`

These were generated during UI prototyping and shouldn't be in the repo.

**Step 1: Delete the files**

```bash
git rm docs/mock-pos-ovr.png docs/mock-styles.html
```

**Step 2: Commit**

```bash
git commit -m "chore: remove mock UI prototyping files"
```

---

### Task 6: Build the final zip and verify

**Step 1: Regenerate icons (ensure fresh)**

```bash
npm run icons
```

**Step 2: Run tests to confirm nothing broken**

```bash
npm test
```

Expected: all tests pass.

**Step 3: Build zip**

```bash
npm run package
```

**Step 4: Load the zip as an unpacked extension to do a final smoke test**

- Go to `chrome://extensions`
- Click "Load unpacked" → select the project folder (not the zip — Chrome loads unpacked folders)
- Verify the extension icon appears in the toolbar with the MFL icon
- Navigate to `https://app.playmfl.com/scouting` and confirm OVR chips display
- Navigate to a tactics page and confirm Optimize Lineup button appears

**Step 5: Push**

```bash
git push
```

---

### Task 7: Web Store submission checklist (manual steps)

> These steps cannot be automated — document them here for the user.

**What you need before submitting:**

1. **Developer account**: Go to [https://chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole) → pay the one-time $5 registration fee.

2. **Store listing assets to prepare manually:**
   - At least 1 screenshot at 1280×800 or 640×400 (take one of the scouting page with OVR chips, and one of the tactics page with the Optimize button)
   - Optional: 440×280 promotional tile image

3. **Submit:**
   - Upload `mfl-enhancement-suite.zip`
   - Set visibility to **Unlisted** (users install via direct link, no public discovery)
   - Privacy policy URL: `https://allspain.github.io/mfles/privacy-policy.html`
   - Category: "Productivity"
   - Submit for review (typically 1–3 business days)
