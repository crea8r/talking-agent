import test from 'node:test';
import assert from 'node:assert/strict';

import { getNextNeutralSampleIndex, NEUTRAL_SAMPLE_LINES } from './neutral-sample-lines.js';

test('neutral sample pool contains 100 short neutral lines', () => {
  assert.equal(NEUTRAL_SAMPLE_LINES.length, 100);

  const uniqueLines = new Set(NEUTRAL_SAMPLE_LINES);
  assert.equal(uniqueLines.size, 100);

  NEUTRAL_SAMPLE_LINES.forEach((line) => {
    assert.equal(typeof line, 'string');
    assert.ok(line.length > 0);

    const sentenceCount = (line.match(/\./g) || []).length;
    assert.ok(sentenceCount >= 2 && sentenceCount <= 3);
  });
});

test('getNextNeutralSampleIndex wraps at the end of the list', () => {
  assert.equal(getNextNeutralSampleIndex(0), 1);
  assert.equal(getNextNeutralSampleIndex(NEUTRAL_SAMPLE_LINES.length - 1), 0);
});
