'use strict';

require('dotenv').config();
const fs = require('fs');

const CHANNEL_ID = '934955719273377832';
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error('Error: DISCORD_TOKEN env var not set.');
  process.exit(1);
}

async function fetchMessages() {
  const all = [];
  let before = null;

  console.log('Fetching messages...');
  while (true) {
    const url = new URL(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`);
    url.searchParams.set('limit', '100');
    if (before) url.searchParams.set('before', before);

    const res = await fetch(url.toString(), {
      headers: { Authorization: TOKEN },
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Discord API error ${res.status}: ${body}`);
      process.exit(1);
    }

    const batch = await res.json();
    if (batch.length === 0) break;

    all.push(...batch);
    before = batch[batch.length - 1].id;
    console.log(`  Fetched ${all.length} messages so far...`);

    await new Promise(r => setTimeout(r, 500));
  }

  // Normalize to the shape analyze.js expects
  const messages = all.map(m => ({
    id: m.id,
    content: m.content,
    timestamp: m.timestamp,
    author: {
      id: m.author.id,
      name: m.author.username,
      isBot: m.author.bot === true,
    },
  }));

  messages.reverse(); // oldest first

  fs.writeFileSync('suggestions.json', JSON.stringify({ messages }, null, 2));
  console.log(`Done. Saved ${messages.length} messages to suggestions.json.`);
}

fetchMessages().catch(err => {
  console.error(err);
  process.exit(1);
});
