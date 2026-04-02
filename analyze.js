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

module.exports = { filterMessages, chunkMessages, aggregateSuggestions, formatRoadmap };
