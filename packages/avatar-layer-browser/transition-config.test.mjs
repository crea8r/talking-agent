import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_AVATAR_FEATURE_FLAGS,
  resolveGestureTransitionConfig,
} from './index.js';

test('gesture transition config can be switched off with a feature flag', () => {
  assert.equal(DEFAULT_AVATAR_FEATURE_FLAGS.smoothGestureTransitions, true);

  const enabledConfig = resolveGestureTransitionConfig({
    nextFadeIn: 0.18,
  });
  const disabledConfig = resolveGestureTransitionConfig({
    nextFadeIn: 0.18,
    featureFlags: {
      smoothGestureTransitions: false,
    },
  });

  assert.equal(enabledConfig.useCrossFade, true);
  assert.equal(enabledConfig.warp, true);
  assert.equal(enabledConfig.fadeIn, 0.36);
  assert.equal(disabledConfig.useCrossFade, false);
  assert.equal(disabledConfig.warp, false);
  assert.equal(disabledConfig.fadeIn, 0.18);
});
