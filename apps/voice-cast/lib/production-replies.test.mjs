import test from 'node:test';
import assert from 'node:assert/strict';

import { PRODUCTION_TEST_REPLIES, pickRandomProductionReply } from './production-replies.mjs';

test('production reply pool contains 100 neutral english replies', () => {
  assert.equal(PRODUCTION_TEST_REPLIES.length, 100);

  for (const reply of PRODUCTION_TEST_REPLIES) {
    assert.equal(typeof reply, 'string');
    assert.notEqual(reply.trim(), '');
    const sentenceCount = reply
      .split(/[.!?]+/)
      .map((part) => part.trim())
      .filter(Boolean).length;
    assert.equal(sentenceCount >= 1, true);
    assert.equal(sentenceCount <= 3, true);
  }
});

test('pickRandomProductionReply returns a reply from the fixed pool', () => {
  const first = pickRandomProductionReply(0);
  const middle = pickRandomProductionReply(50);
  const last = pickRandomProductionReply(99);

  assert.equal(first, PRODUCTION_TEST_REPLIES[0]);
  assert.equal(middle, PRODUCTION_TEST_REPLIES[50]);
  assert.equal(last, PRODUCTION_TEST_REPLIES[99]);
});
