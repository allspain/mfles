'use strict';

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

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

function chunkMessages(messages, size = 50) {
  const chunks = [];
  for (let i = 0; i < messages.length; i += size) {
    chunks.push(messages.slice(i, i + size));
  }
  return chunks;
}

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
        existing.unique_requestors += s.unique_requestors;
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
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: transcript }],
  });

  let text = response.content[0].text.trim();
  // Strip markdown fences if Claude wraps output despite instructions
  text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('Claude returned non-array response');
  return parsed;
}

async function main() {
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

module.exports = { filterMessages, chunkMessages, aggregateSuggestions, formatRoadmap };
