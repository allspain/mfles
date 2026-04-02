const { filterMessages, chunkMessages, aggregateSuggestions } = require('./analyze');

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
