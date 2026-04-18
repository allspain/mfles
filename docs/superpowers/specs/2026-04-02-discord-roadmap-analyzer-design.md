# Discord Roadmap Analyzer — Design Document
**Date:** 2026-04-02
**Status:** Approved

---

## Overview

A one-off Node.js tool that exports a Discord suggestions channel (where the user is a member, not admin), runs every message through Claude, and produces a ranked `roadmap.md` for the MFL Enhancement Suite Chrome extension. Features are tagged Free or Paid and ordered by implementation priority as a single mixed list.

---

## Architecture

```
Phase 1: Export (manual)
  DiscordChatExporter CLI
    └── suggestions.json  (raw Discord export)

Phase 2: Analyze (automated)
  analyze.js
    ├── Parse & filter suggestions.json
    ├── Chunk messages into batches
    ├── Claude API (claude-sonnet-4-6) — extract + categorize
    ├── Aggregate + deduplicate across batches
    └── roadmap.md  (final output)
```

---

## Phase 1 — Export

**Tool:** DiscordChatExporter CLI (open-source, .NET-based)
- Install: download binary from GitHub releases or `dotnet tool install`
- Run: `DiscordChatExporter export --channel 934955719273377832 --output suggestions.json --format Json --token <user-token>`
- User token obtained from browser DevTools → Network tab → any Discord request → `Authorization` header

**Output:** `suggestions.json` — standard DiscordChatExporter JSON schema with messages array including author, content, timestamp, reactions.

---

## Phase 2 — analyze.js

### Input Filtering

Skip messages that are:
- From bots
- Empty or under 10 characters
- Pure emoji/reaction messages (no substantive text)

### Batching

Messages are chunked into batches of ~50 to stay well within Claude's context window. Each batch is sent independently; results are merged at the end.

### Claude Prompt

Each batch is sent with a system prompt instructing Claude to:

1. **Extract suggestions** — identify distinct feature requests within the messages (a single message may contain multiple suggestions)
2. **Deduplicate** — group messages that reference the same underlying idea
3. **For each unique suggestion, output JSON:**
   ```json
   {
     "title": "Short feature name",
     "description": "What the feature does, in 1-2 sentences",
     "mention_count": 14,
     "unique_requestors": 9,
     "sentiment": "High | Medium | Low",
     "complexity": "Low | Medium | High",
     "tier": "Free | Paid",
     "tier_rationale": "One-line reason for tier assignment",
     "priority_score": 71
   }
   ```

### Tier Assignment Rules (passed to Claude)

**Paid** if any of:
- Requires backend infrastructure (scheduling, data persistence, external APIs)
- Highly requested (mention_count ≥ 10 OR unique_requestors ≥ 6)
- Saves significant repetitive time for users (Claude's judgment)

**Free** if:
- Pure UI/frontend change with no backend dependency
- Low-to-medium complexity
- Good-will / quality-of-life improvement

Claude uses judgment when signals conflict (e.g., highly requested but trivially simple → may still be Free).

### Priority Score Formula

Claude computes:
```
priority_score = (mention_count × 2) + (unique_requestors × 3) + sentiment_weight − complexity_penalty
```
Where:
- `sentiment_weight`: High=10, Medium=5, Low=0
- `complexity_penalty`: High=15, Medium=7, Low=0

### Aggregation

After all batches complete, `analyze.js` merges results:
- Deduplicates features with the same title (sum mention counts, union requestors, take max sentiment)
- Sorts by `priority_score` descending
- Writes final `roadmap.md`

---

## Output — roadmap.md

```markdown
# MFL Enhancement Suite — Community Roadmap
_Generated from Discord #suggestions — {date}_

## Implementation Priority

### #1 — Show Player OVR on Squad Page [FREE]
- Mentions: 14 | Unique requestors: 9 | Sentiment: High | Complexity: Low
- Priority score: 71
- Description: Display each player's overall rating directly on the squad management page.
- Tier rationale: Pure UI change, zero backend, highest mention count.

### #2 — Auto-Optimizer for All Clubs [PAID]
- Mentions: 12 | Unique requestors: 7 | Sentiment: High | Complexity: High
- Priority score: 58
- Description: Run lineup optimization across all clubs in one click from a dashboard.
- Tier rationale: Requires backend scheduling + high demand → paid tier.
```

---

## File Structure

```
mfles/
├── analyze.js          (the analyzer script)
├── suggestions.json    (DiscordChatExporter output — gitignored)
├── roadmap.md          (generated output)
└── docs/superpowers/specs/
    └── 2026-04-02-discord-roadmap-analyzer-design.md
```

`suggestions.json` is added to `.gitignore` (contains Discord message content / user data).

---

## Dependencies

```json
{
  "@anthropic-ai/sdk": "^0.39.0"
}
```

No other runtime dependencies. Node.js 18+.

---

## Environment

`ANTHROPIC_API_KEY` must be set in the environment before running `analyze.js`.
