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
