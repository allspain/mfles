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
