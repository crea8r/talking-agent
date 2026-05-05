const REPLY_PARTS = [
  ['Okay.', 'I can work with that.', 'We can continue from here.', 'Nothing else needs to change right now.', 'I will keep the next step simple.'],
  ['That makes sense.', 'I have the context I need.', 'The next pass can stay narrow.', 'I will keep the output consistent.', 'There is no conflict in that setup.'],
  ['Understood.', 'The input is clear enough.', 'I can use that as the current baseline.', 'The response can stay neutral.', 'It should be straightforward to test again.'],
  ['All right.', 'That gives me a stable direction.', 'I will treat this as the active version.', 'The rest of the flow can stay the same.', 'We do not need extra options yet.'],
  ['Sounds good.', 'The current setup is workable.', 'I can move forward with this shape.', 'The next result should stay predictable.', 'There is enough signal to continue.'],
  ['I see it.', 'That keeps the path narrow.', 'I can reuse the same assumptions for the next turn.', 'The output should stay easy to compare.', 'Nothing looks blocked from here.'],
  ['Noted.', 'The current choice is specific enough.', 'I can keep the process aligned with it.', 'The next reply can stay direct.', 'That should be easy to replay.'],
  ['That works.', 'I can keep the same baseline.', 'The next pass does not need a larger change.', 'The flow can stay close to production.', 'This should remain easy to verify.'],
  ['Fair enough.', 'The requirement is still consistent.', 'I can treat it as the working input.', 'The next result should be comparable.', 'There is no need to widen scope yet.'],
  ['Good.', 'That keeps the test focused.', 'I can continue with the same operating assumptions.', 'The result should stay stable between runs.', 'We can measure the timing cleanly from that point.'],
  ['Right.', 'I can use that as the current anchor.', 'The follow-up can stay controlled.', 'The next output should be easy to judge.', 'That keeps the loop simple.'],
  ['Makes sense.', 'The current setup is still coherent.', 'I can carry it into the next reply.', 'The response can stay measured.', 'It should remain useful for repeated testing.'],
  ['I follow.', 'That is precise enough for the current pass.', 'I can preserve the same boundaries.', 'The next turn should stay readable.', 'There is no extra setup needed from here.'],
  ['That is fine.', 'The input is stable.', 'I can keep the same profile in place.', 'The next response can stay neutral and short.', 'That should keep comparisons clean.'],
  ['Agreed.', 'The current constraints are workable.', 'I can keep them unchanged for the next turn.', 'The output should remain consistent.', 'That keeps the rehearsal realistic enough.'],
  ['I have it.', 'The flow can continue without extra branching.', 'I can keep the same target behavior.', 'The next result should still feel controlled.', 'There is enough context to proceed.'],
  ['No problem.', 'That still fits the active setup.', 'I can continue without changing the baseline.', 'The next reply should stay calm.', 'That keeps the test loop efficient.'],
  ['That is clear.', 'I can treat it as the current reference.', 'The rest of the turn can stay minimal.', 'The output should remain easy to evaluate.', 'There is no mismatch in the request.'],
  ['Confirmed.', 'The current input is usable.', 'I can keep the same structure for the next step.', 'The reply can stay steady.', 'That gives us a clean comparison point.'],
  ['Fine by me.', 'The setup is still narrow enough.', 'I can preserve the same behavior for the next pass.', 'The result should stay repeatable.', 'Nothing else needs to change before testing again.'],
];

export const PRODUCTION_TEST_REPLIES = Object.freeze(
  REPLY_PARTS.flatMap(([a, b, c, d, e]) => [
    `${a}`,
    `${a} ${b}`,
    `${a} ${b} ${c}`,
    `${a} ${d}`,
    `${a} ${b} ${e}`,
  ]),
);

export function pickRandomProductionReply(index = Math.floor(Math.random() * PRODUCTION_TEST_REPLIES.length)) {
  return PRODUCTION_TEST_REPLIES[index] || PRODUCTION_TEST_REPLIES[0];
}
