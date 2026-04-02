const { filterMessages, chunkMessages } = require('./analyze');

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
