# MFL Enhancement Suite — Promo Video & Marketing Website Design Spec

**Date:** 2026-03-20
**Branch:** feat/position-ovr-tooltip → master
**Domain:** mfles.com

---

## Overview

Build two deliverables to support the Chrome Web Store listing and user acquisition:

1. **A 60-second promo video** produced with Remotion, hosted on YouTube/Vimeo and embedded on the website.
2. **A marketing website** at mfles.com — a single dark-themed page promoting the extension.

---

## Placeholders

The following values are not yet known and must be substituted before publishing:

| Placeholder | Replace with |
|-------------|-------------|
| `CHROME_STORE_URL` | `https://chromewebstore.google.com/detail/<extension-id>` — available after CWS submission |
| `DISCORD_INVITE_URL` | `https://discord.gg/<invite-code>` — available after creating Discord server |
| `VIDEO_EMBED_URL` | YouTube or Vimeo embed URL — available after uploading the rendered video |

Use these literal strings as placeholder values in code so they are easy to grep and replace.

---

## Part 1: The Promo Video

### Goal

A 60-second, slick/premium Chrome Web Store promo video that demonstrates the three core features of MFL Enhancement Suite and drives installs.

### Production Stack

- **Remotion** (`@remotion/core`, `@remotion/player`, `@remotion/transitions`) — React-based programmatic video composition
- **Screen recordings** — captured from the live extension on MFL, imported as `<OffthreadVideo>` clips
- **Audio** — background music track only (no voiceover). Music: royalty-free, dark/premium tone.
- **Text overlays** — animated with `spring()` and `interpolate()` from Remotion
- **Output** — 1920×1080, 60fps, H.264 via `npx remotion render`

### Scene Structure

| Scene | Time | Frames (60fps) | Description | Overlay text |
|-------|------|---------------|-------------|--------------|
| Hook / Title card | 0–6s | 0–360 | Dark background, logo animates in | *"Stop leaving OVR on the table"* |
| Single squad optimizer | 6–22s | 360–1320 | Screen recording: Tactics page → click Optimize → lineup updates, OVR jumps | *"Best XI in one click, energy-aware"* |
| All Teams page | 22–40s | 1320–2400 | Screen recording: Extension icon → all clubs load → expand lineups, OVR diffs → Optimize All | *"All your clubs. One page."* |
| Position OVR tooltip | 40–50s | 2400–3000 | Screen recording: hover player on scouting/tactics page → tooltip appears with per-position OVR | *"Know exactly where every player fits"* |
| Free for Season 13 | 50–56s | 3000–3360 | Full-screen text moment, purple accent | *"Free for Season 13"* |
| Install CTA | 56–60s | 3360–3600 | Chrome Web Store button + URL, logo holds | `CHROME_STORE_URL` displayed as text |

### Screen Recording Files

Place recordings in `video/src/assets/recordings/`. These files are gitignored (large binaries).

| File | Scene |
|------|-------|
| `optimizer.mp4` | Single squad optimizer (6–22s) |
| `all-teams.mp4` | All Teams page (22–40s) |
| `tooltip.mp4` | Position OVR tooltip (40–50s) |

### Remotion Project Layout

```
video/
  src/
    Root.tsx           # registerRoot + <Composition> definition
    Video.tsx          # Top-level composition, sequences each scene
    scenes/
      TitleCard.tsx
      SingleOptimizer.tsx
      AllTeams.tsx
      PositionTooltip.tsx
      FreeCallout.tsx
      InstallCTA.tsx
    components/
      TextOverlay.tsx  # Reusable animated text overlay with spring entrance
      Logo.tsx         # Animated logo mark
    assets/
      recordings/      # .mp4 screen recordings (gitignored)
      music.mp3        # Background track (royalty-free, gitignored if >10MB)
      logo.png         # Extension icon (128px, copied from /icons/128.png)
  package.json
  remotion.config.ts
```

### `video/package.json`

```json
{
  "name": "mfles-video",
  "version": "1.0.0",
  "scripts": {
    "start": "npx remotion studio",
    "render": "npx remotion render src/Root.tsx MFLESPromo out/mfles-promo.mp4"
  },
  "dependencies": {
    "@remotion/transitions": "4.0.53",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@remotion/cli": "4.0.53",
    "@types/react": "18.3.1",
    "remotion": "4.0.53",
    "typescript": "5.4.5"
  }
}
```

> `remotion` is the core runtime package. `@remotion/cli` provides the `Config` API and the `remotion` CLI. `@remotion/transitions` is the only scoped package needed at runtime. Run `npm install` after creating this file. Check [npmjs.com/package/remotion](https://www.npmjs.com/package/remotion) for the latest `4.x` version and use it consistently across all three packages.

### `video/remotion.config.ts`

```ts
import { Config } from '@remotion/cli';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
```

> `Config` is exported from `@remotion/cli`, not `remotion`. Resolution (1920×1080) and fps (60) are set in the `<Composition>` in `Root.tsx` — see below.

### `video/src/Root.tsx`

```tsx
import { Composition, registerRoot } from 'remotion';
import { MainVideo } from './Video';

const RemotionRoot = () => {
  return (
    <Composition
      id="MFLESPromo"
      component={MainVideo}
      durationInFrames={3600}  // 60 seconds × 60fps
      fps={60}
      width={1920}
      height={1080}
    />
  );
};

registerRoot(RemotionRoot);
```

> `registerRoot()` is required — without it `npx remotion render` will fail with "No root component found".

### `video/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["es2022", "dom"],
    "jsx": "react",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

### `.gitignore` additions (repo root)

Add to the existing `.gitignore` at the repository root:

```
# Remotion video assets (large binaries)
video/src/assets/recordings/
video/src/assets/music.mp3
video/out/
```

### Key Remotion Patterns

**Scene sequencing** — `from` is the *start frame*, `durationInFrames` is the *length in frames*:
```tsx
// Duration examples: 6s=360f, 16s=960f, 18s=1080f, 10s=600f, 6s=360f, 4s=240f
<Sequence from={0}    durationInFrames={360}>  <TitleCard /> </Sequence>
<Sequence from={360}  durationInFrames={960}>  <SingleOptimizer /> </Sequence>
<Sequence from={1320} durationInFrames={1080}> <AllTeams /> </Sequence>
<Sequence from={2400} durationInFrames={600}>  <PositionTooltip /> </Sequence>
<Sequence from={3000} durationInFrames={360}>  <FreeCallout /> </Sequence>
<Sequence from={3360} durationInFrames={240}>  <InstallCTA /> </Sequence>
```

**Text overlay with spring entrance** — full pattern including `useVideoConfig()`:
```tsx
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

const TextOverlay: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const progress = spring({ frame, fps, config: { damping: 12 } }); // 0 → 1
  const translateY = interpolate(progress, [0, 1], [40, 0]);         // px offset

  return (
    <div style={{ opacity, transform: `translateY(${translateY}px)` }}>
      {text}
    </div>
  );
};
```

**Screen recording playback:**
```tsx
import { OffthreadVideo, staticFile } from 'remotion';

<OffthreadVideo src={staticFile('recordings/optimizer.mp4')} />
```

### Render Command

```bash
cd video
npm run render
# Output: video/out/mfles-promo.mp4
```

---

## Part 2: The Marketing Website

### Goal

A single-page marketing site at mfles.com that drives Chrome Web Store installs, embeds the promo video, and builds community via Discord.

### Tech Stack

- **Plain HTML/CSS/JS** — no framework, no build step
- **Single page** — `index.html` + `styles.css` (+ `script.js` if needed)
- **Hosting** — **Netlify**, deploy from `website/` subdirectory
- **Video** — embedded YouTube or Vimeo `<iframe>` (avoids self-hosting large files); use `VIDEO_EMBED_URL` placeholder until video is uploaded
- **Custom domain** — mfles.com pointed at Netlify via DNS

### Repository Structure

```
website/
  index.html
  styles.css       # Note: separate from /styles.css (extension stylesheet at repo root)
  assets/
    logo.png       # 128px extension icon — copy from /icons/128.png
    favicon.ico    # Convert icons/128.png using: npx sharp-cli -i ../icons/128.png -o assets/favicon.ico resize 32 32
                   # Or use https://favicon.io/favicon-converter/ (upload 128.png, download favicon.ico)
```

> **Important:** `website/styles.css` is the website stylesheet. `/styles.css` at the repo root is the Chrome extension's content script stylesheet. These are different files — do not confuse them.

Netlify publish directory: `website/`

### Page Sections (top to bottom)

#### 1. Nav
- Left: Logo mark (`assets/logo.png` scaled to 32px height) + "MFL Enhancement Suite" wordmark
- Right: "Install Free — Chrome" button → `CHROME_STORE_URL`
- Sticky, `--bg` background, `1px solid --border` bottom border

#### 2. Hero
- Eyebrow: "Chrome Extension for MFL"
- Headline: **"Optimize your MFL clubs in seconds"**
- Subhead: "Energy-aware lineup optimizer, all your clubs on one page, and per-position OVR tooltips — built for serious MFL managers."
- Primary CTA: "⬇ Install Free on Chrome" → `CHROME_STORE_URL`
- Badge: "Free · Season 13" (purple pill, `--accent-purple`)

#### 3. Video
- Full-width embedded player, max-width 860px, centered
- 16:9 aspect ratio wrapper (`padding-top: 56.25%`), dark letterbox background
- `<iframe>` src: `VIDEO_EMBED_URL`
- Placeholder while URL unknown: grey box with "Promo video coming soon"

#### 4. Features (3-card grid)
| Card | Icon | Title | Body |
|------|------|-------|------|
| 1 | 🤖 | Lineup Optimizer | "Best XI in one click. Energy-aware scoring means the freshest team, not just the highest rated." |
| 2 | 🏟 | All Teams Dashboard | "All your clubs on one page. Compare lineups, OVR diffs, and optimize everything at once." |
| 3 | 🎯 | Position OVR Tooltip | "Hover any player to see their OVR at every position — know exactly where they fit in your squad." |

#### 5. Free Season Banner
- Background: linear-gradient with `--accent-purple` tones
- Headline: **"Free for Season 13"**
- Subhead: "No payment. No account. Install and start optimizing today."
- CTA: "⬇ Install Free on Chrome" → `CHROME_STORE_URL`

#### 6. Community (two cards side by side)
| Card | Icon | Title | Body | CTA |
|------|------|-------|------|-----|
| Discord | 💬 | Join the Discord | "Chat with other MFL managers, share lineups, get support, and hear about updates first." | "Join Discord →" → `DISCORD_INVITE_URL` |
| Feature Requests | 💡 | Request a Feature | "Want something added? Drop your idea in #feature-requests — the best suggestions make it into the next release." | "Post in Discord →" → `DISCORD_INVITE_URL` |

#### 7. Footer
- Left: "MFL Enhancement Suite — Not affiliated with MFL / Sorare"
- Right: mfles.com

### Design Tokens

```css
:root {
  --bg:             #0d1117;
  --bg-surface:     #161b22;
  --bg-elevated:    #21262d;
  --border:         #30363d;
  --text:           #e6edf3;
  --text-muted:     #8b949e;
  --text-faint:     #484f58;
  --accent-green:   #3fb950;
  --accent-purple:  #bc8cff;
  --accent-discord: #5865F2;
  --cta-bg:         #238636;
}
```

### Netlify Deployment

1. Push `website/` to `master`
2. Connect repo to Netlify (netlify.com → "Add new site" → "Import from Git")
3. Set **publish directory** to `website/`
4. Set **build command** to blank (no build step)
5. Add custom domain `mfles.com` in Netlify dashboard → Domain management
6. DNS configuration:
   - Apex (`mfles.com`): A record → Netlify's load balancer IP (shown in dashboard)
   - `www`: CNAME → `<your-site>.netlify.app`

---

## Out of Scope

- Analytics / tracking
- Dark/light mode toggle
- Any server-side code
- Blog or changelog page
- Mobile-specific app stores (Chrome only)
