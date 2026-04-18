# Discord Roadmap Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js script that reads a DiscordChatExporter JSON export, pipes suggestions through Claude, and writes a prioritized `roadmap.md` tagged Free or Paid.

**Architecture:** Single `analyze.js` script with pure helper functions extracted for testability. Messages are filtered, batched into groups of 50, sent to Claude which returns structured JSON per batch, results are merged/deduplicated/sorted by priority score, then formatted into `roadmap.md`.

**Tech Stack:** Node.js 18+, @anthropic-ai/sdk, Jest (already installed)

---

## File Structure

```
mfles/
├── analyze.js          - filter, chunk, Claude call, aggregate, format, orchestrate
├── analyze.test.js     - unit tests for pure functions
├── suggestions.json    - DiscordChatExporter output (gitignored, not committed)
├── roadmap.md          - generated output
└── package.json        - add @anthropic-ai/sdk
```

---

### Task 1: Project setup

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Install @anthropic-ai/sdk**

```bash
npm install @anthropic-ai/sdk
```

Expected: `package.json` updated with `"@anthropic-ai/sdk": "^0.x.x"`

- [ ] **Step 2: Add suggestions.json to .gitignore**

Add to `.gitignore`:
```
suggestions.json
roadmap.md
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: add anthropic sdk, gitignore suggestions.json and roadmap.md"
```

---

### Task 2: Message filter

**Files:**
- Create: `analyze.js`
- Create: `analyze.test.js`

- [ ] **Step 1: Write failing test**

Create `analyze.test.js`:

```js
const { filterMessages } = require('./analyze');

describe('filterMessages', () => {
  test('removes bot messages', () => {
    const msgs = [
      { author: { isBot: true }, content: 'I am a bot' },
      { author: { isBot: false }, content: 'Real suggestion here please' },
    ];
    expect(filterMessages(msgs)).toHaveLength(1);
  });

  test('removes messages under 10 characters', () => {
    const msgs = [
      { author: { isBot: false }, content: 'ok' },
      { author: { isBot: false }, content: 'Add player stats to the squad page please' },
    ];
    expect(filterMessages(msgs)).toHaveLength(1);
  });

  test('removes pure emoji messages', () => {
    const msgs = [
      { author: { isBot: false }, content: '👍🔥💯' },
      { author: { isBot: false }, content: 'Would love a dark mode option' },
    ];
    expect(filterMessages(msgs)).toHaveLength(1);
  });

  test('keeps valid suggestion messages', () => {
    const msgs = [
      { author: { isBot: false }, content: 'Please add lineup history so I can compare previous weeks' },
    ];
    expect(filterMessages(msgs)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest analyze.test.js --testNamePattern="filterMessages" --no-coverage
```

Expected: FAIL — `filterMessages is not a function`

- [ ] **Step 3: Create analyze.js with filterMessages**

Create `analyze.js`:

```js
'use strict';

const EMOJI_ONLY_RE = /^[\p{Emoji}\s]+$/u;

function filterMessages(messages) {
  return messages.filter(m => {
    if (m.author.isBot) return false;
    const text = (m.content || '').trim();
    if (text.length < 10) return false;
    if (EMOJI_ONLY_RE.test(text)) return false;
    return true;
  });
}

module.exports = { filterMessages };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest analyze.test.js --testNamePattern="filterMessages" --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add analyze.js analyze.test.js
git commit -m "feat: add message filter with tests"
```

---

### Task 3: Message chunking

**Files:**
- Modify: `analyze.js`
- Modify: `analyze.test.js`

- [ ] **Step 1: Write failing test**

Add to `analyze.test.js`:

```js
const { filterMessages, chunkMessages } = require('./analyze');

describe('chunkMessages', () => {
  test('splits messages into chunks of given size', () => {
    const msgs = Array.from({ length: 130 }, (_, i) => ({ id: i }));
    const chunks = chunkMessages(msgs, 50);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(50);
    expect(chunks[1]).toHaveLength(50);
    expect(chunks[2]).toHaveLength(30);
  });

  test('returns single chunk when messages fit', () => {
    const msgs = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    expect(chunkMessages(msgs, 50)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest analyze.test.js --testNamePattern="chunkMessages" --no-coverage
```

Expected: FAIL — `chunkMessages is not a function`

- [ ] **Step 3: Add chunkMessages to analyze.js**

Add before `module.exports` in `analyze.js`:

```js
function chunkMessages(messages, size = 50) {
  const chunks = [];
  for (let i = 0; i < messages.length; i += size) {
    chunks.push(messages.slice(i, i + size));
  }
  return chunks;
}
```

Update `module.exports`:
```js
module.exports = { filterMessages, chunkMessages };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest analyze.test.js --testNamePattern="chunkMessages" --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add analyze.js analyze.test.js
git commit -m "feat: add message chunking with tests"
```

---

### Task 4: Suggestion aggregation (merge, deduplicate, sort)

**Files:**
- Modify: `analyze.js`
- Modify: `analyze.test.js`

- [ ] **Step 1: Write failing test**

Add to `analyze.test.js`:

```js
const { filterMessages, chunkMessages, aggregateSuggestions } = require('./analyze');

describe('aggregateSuggestions', () => {
  const batch1 = [
    {
      title: 'Show OVR on squad page',
      description: 'Display OVR ratings on squad page.',
      mention_count: 8,
      unique_requestors: 5,
      sentiment: 'High',
      complexity: 'Low',
      tier: 'Free',
      tier_rationale: 'Pure UI change.',
      priority_score: 46,
    },
    {
      title: 'Auto-optimize all clubs',
      description: 'One-click optimizer for all clubs.',
      mention_count: 6,
      unique_requestors: 4,
      sentiment: 'High',
      complexity: 'High',
      tier: 'Paid',
      tier_rationale: 'Requires backend.',
      priority_score: 19,
    },
  ];

  const batch2 = [
    {
      title: 'Show OVR on squad page',
      description: 'Display OVR ratings on squad page.',
      mention_count: 4,
      unique_requestors: 3,
      sentiment: 'Medium',
      complexity: 'Low',
      tier: 'Free',
      tier_rationale: 'Pure UI change.',
      priority_score: 20,
    },
  ];

  test('merges duplicate titles, summing mention_count', () => {
    const result = aggregateSuggestions([batch1, batch2]);
    const ovrFeature = result.find(s => s.title === 'Show OVR on squad page');
    expect(ovrFeature.mention_count).toBe(12);
  });

  test('takes max unique_requestors for duplicates', () => {
    const result = aggregateSuggestions([batch1, batch2]);
    const ovrFeature = result.find(s => s.title === 'Show OVR on squad page');
    expect(ovrFeature.unique_requestors).toBe(5);
  });

  test('takes highest sentiment for duplicates', () => {
    const result = aggregateSuggestions([batch1, batch2]);
    const ovrFeature = result.find(s => s.title === 'Show OVR on squad page');
    expect(ovrFeature.sentiment).toBe('High');
  });

  test('sorts by priority_score descending', () => {
    const result = aggregateSuggestions([batch1, batch2]);
    expect(result[0].priority_score).toBeGreaterThanOrEqual(result[1].priority_score);
  });

  test('preserves non-duplicate entries', () => {
    const result = aggregateSuggestions([batch1, batch2]);
    expect(result).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest analyze.test.js --testNamePattern="aggregateSuggestions" --no-coverage
```

Expected: FAIL — `aggregateSuggestions is not a function`

- [ ] **Step 3: Add aggregateSuggestions to analyze.js**

Add before `module.exports` in `analyze.js`:

```js
const SENTIMENT_RANK = { High: 2, Medium: 1, Low: 0 };

function aggregateSuggestions(batches) {
  const map = new Map();

  for (const batch of batches) {
    for (const s of batch) {
      const key = s.title.toLowerCase().trim();
      if (!map.has(key)) {
        map.set(key, { ...s });
      } else {
        const existing = map.get(key);
        existing.mention_count += s.mention_count;
        existing.unique_requestors = Math.max(existing.unique_requestors, s.unique_requestors);
        if (SENTIMENT_RANK[s.sentiment] > SENTIMENT_RANK[existing.sentiment]) {
          existing.sentiment = s.sentiment;
        }
        const sentimentWeight = { High: 10, Medium: 5, Low: 0 }[existing.sentiment];
        const complexityPenalty = { High: 15, Medium: 7, Low: 0 }[existing.complexity];
        existing.priority_score =
          existing.mention_count * 2 + existing.unique_requestors * 3 + sentimentWeight - complexityPenalty;
      }
    }
  }

  return [...map.values()].sort((a, b) => b.priority_score - a.priority_score);
}
```

Update `module.exports`:
```js
module.exports = { filterMessages, chunkMessages, aggregateSuggestions };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest analyze.test.js --testNamePattern="aggregateSuggestions" --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add analyze.js analyze.test.js
git commit -m "feat: add suggestion aggregation with tests"
```

---

### Task 5: Roadmap formatter

**Files:**
- Modify: `analyze.js`
- Modify: `analyze.test.js`

- [ ] **Step 1: Write failing test**

Add to `analyze.test.js`:

```js
const { filterMessages, chunkMessages, aggregateSuggestions, formatRoadmap } = require('./analyze');

describe('formatRoadmap', () => {
  const suggestions = [
    {
      title: 'Show OVR on squad page',
      description: 'Display OVR ratings directly on the squad management page.',
      mention_count: 12,
      unique_requestors: 5,
      sentiment: 'High',
      complexity: 'Low',
      tier: 'Free',
      tier_rationale: 'Pure UI change, zero backend.',
      priority_score: 71,
    },
  ];

  test('includes ranked heading with tier tag', () => {
    const md = formatRoadmap(suggestions);
    expect(md).toContain('### #1 — Show OVR on squad page [FREE]');
  });

  test('includes metrics line', () => {
    const md = formatRoadmap(suggestions);
    expect(md).toContain('Mentions: 12 | Unique requestors: 5 | Sentiment: High | Complexity: Low');
  });

  test('includes priority score', () => {
    const md = formatRoadmap(suggestions);
    expect(md).toContain('Priority score: 71');
  });

  test('includes description', () => {
    const md = formatRoadmap(suggestions);
    expect(md).toContain('Display OVR ratings directly on the squad management page.');
  });

  test('includes tier rationale', () => {
    const md = formatRoadmap(suggestions);
    expect(md).toContain('Pure UI change, zero backend.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest analyze.test.js --testNamePattern="formatRoadmap" --no-coverage
```

Expected: FAIL — `formatRoadmap is not a function`

- [ ] **Step 3: Add formatRoadmap to analyze.js**

Add before `module.exports` in `analyze.js`:

```js
function formatRoadmap(suggestions) {
  const date = new Date().toISOString().split('T')[0];
  const lines = [
    '# MFL Enhancement Suite — Community Roadmap',
    `_Generated from Discord #suggestions — ${date}_`,
    '',
    '## Implementation Priority',
    '',
  ];

  suggestions.forEach((s, i) => {
    lines.push(`### #${i + 1} — ${s.title} [${s.tier.toUpperCase()}]`);
    lines.push(`- Mentions: ${s.mention_count} | Unique requestors: ${s.unique_requestors} | Sentiment: ${s.sentiment} | Complexity: ${s.complexity}`);
    lines.push(`- Priority score: ${s.priority_score}`);
    lines.push(`- ${s.description}`);
    lines.push(`- Tier rationale: ${s.tier_rationale}`);
    lines.push('');
  });

  return lines.join('\n');
}
```

Update `module.exports`:
```js
module.exports = { filterMessages, chunkMessages, aggregateSuggestions, formatRoadmap };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest analyze.test.js --testNamePattern="formatRoadmap" --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add analyze.js analyze.test.js
git commit -m "feat: add roadmap formatter with tests"
```

---

### Task 6: Claude API integration + main orchestrator

**Files:**
- Modify: `analyze.js` (add Anthropic require at top, analyzeChunk function, main())

- [ ] **Step 1: Add Anthropic import at top of analyze.js**

Add as the very first line of `analyze.js` (before `'use strict'` or right after it):

```js
'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
```

- [ ] **Step 2: Add analyzeChunk function**

Add before `module.exports` in `analyze.js`:

```js
async function analyzeChunk(messages) {
  const transcript = messages
    .map(m => `[${m.author.name}]: ${m.content}`)
    .join('\n');

  const systemPrompt = `You are analyzing Discord messages from a suggestions channel for a Chrome extension called "MFL Enhancement Suite" — a lineup optimizer for the fantasy football game playmfl.com.

Extract every distinct feature suggestion from the messages. A single message may contain multiple suggestions. Group messages that refer to the same underlying idea.

For each unique suggestion, return a JSON object with these exact fields:
- title: short feature name (5-8 words max)
- description: what the feature does (1-2 sentences)
- mention_count: how many messages reference this idea
- unique_requestors: how many different users requested it
- sentiment: "High" | "Medium" | "Low" (based on urgency/enthusiasm in messages)
- complexity: "Low" | "Medium" | "High" (engineering effort estimate)
- tier: "Free" | "Paid"
- tier_rationale: one-line reason for tier assignment
- priority_score: integer computed as (mention_count × 2) + (unique_requestors × 3) + sentiment_weight − complexity_penalty
  where sentiment_weight = High:10, Medium:5, Low:0
  and complexity_penalty = High:15, Medium:7, Low:0

Tier assignment rules:
- Mark as PAID if: requires backend infrastructure (scheduling, data persistence, external APIs), OR highly requested (mention_count ≥ 10 OR unique_requestors ≥ 6), OR saves significant repetitive time for users
- Mark as FREE if: pure UI/frontend change with no backend dependency, low-to-medium complexity, quality-of-life improvement
- Use your judgment when signals conflict

Return ONLY a JSON array of suggestion objects. No markdown, no explanation, no preamble.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: transcript }],
  });

  const text = response.content[0].text.trim();
  return JSON.parse(text);
}
```

- [ ] **Step 3: Add main() orchestrator**

Add at the bottom of `analyze.js`, after all functions and before `module.exports`:

```js
async function main() {
  const fs = require('fs');
  const path = require('path');

  const exportPath = path.join(__dirname, 'suggestions.json');
  if (!fs.existsSync(exportPath)) {
    console.error('Error: suggestions.json not found. Run DiscordChatExporter first.');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  const allMessages = raw.messages ?? raw;

  console.log(`Total messages: ${allMessages.length}`);

  const filtered = filterMessages(allMessages);
  console.log(`After filtering: ${filtered.length}`);

  const chunks = chunkMessages(filtered, 50);
  console.log(`Processing ${chunks.length} chunk(s)...`);

  const batchResults = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  Chunk ${i + 1}/${chunks.length}...`);
    const result = await analyzeChunk(chunks[i]);
    batchResults.push(result);
  }

  const suggestions = aggregateSuggestions(batchResults);
  console.log(`Unique suggestions found: ${suggestions.length}`);

  const markdown = formatRoadmap(suggestions);
  fs.writeFileSync(path.join(__dirname, 'roadmap.md'), markdown, 'utf8');
  console.log('roadmap.md written successfully.');
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
```

Update `module.exports`:
```js
module.exports = { filterMessages, chunkMessages, aggregateSuggestions, formatRoadmap };
```

- [ ] **Step 4: Run all unit tests to confirm nothing broke**

```bash
npx jest analyze.test.js --no-coverage
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add analyze.js
git commit -m "feat: add Claude API integration and main orchestrator"
```

---

### Task 7: End-to-end run

- [ ] **Step 1: Export the Discord channel**

Download DiscordChatExporter CLI binary from GitHub releases (latest release, macOS arm64 or x64):
```
https://github.com/Tyrrrz/DiscordChatExporter/releases/latest
```

Get your Discord user token:
1. Open `https://discord.com` in your browser
2. Open DevTools (Cmd+Option+I) → Network tab
3. Filter by `Fetch/XHR`, click any request to `discord.com`
4. Find the `Authorization` request header — copy that value

Run the export (replace `<your-token>` with the token copied above):
```bash
chmod +x ./DiscordChatExporter.Cli
./DiscordChatExporter.Cli export \
  --channel 934955719273377832 \
  --output suggestions.json \
  --format Json \
  --token <your-token>
```

Expected: `suggestions.json` created in the project directory.

- [ ] **Step 2: Run the analyzer**

```bash
ANTHROPIC_API_KEY=<your-key> node analyze.js
```

Expected output:
```
Total messages: <N>
After filtering: <M>
Processing <K> chunk(s)...
  Chunk 1/<K>...
  ...
Unique suggestions found: <X>
roadmap.md written successfully.
```

- [ ] **Step 3: Review roadmap.md**

```bash
open roadmap.md
```

Verify:
- Features are ranked #1, #2, #3...
- Each has metrics (mentions, requestors, sentiment, complexity, priority score)
- Mix of [FREE] and [PAID] tags throughout the list
- Tier rationales are coherent

- [ ] **Step 4: Commit roadmap.md if it looks good**

```bash
git add roadmap.md
git commit -m "docs: add community feature roadmap from Discord suggestions"
```
