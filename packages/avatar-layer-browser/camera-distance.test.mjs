import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CAMERA_DISTANCE,
  STAGES,
  normalizeAvatarCameraDistance,
} from './index.js';

test('camera distance preference is clamped to the supported framing range', () => {
  assert.equal(normalizeAvatarCameraDistance(), DEFAULT_CAMERA_DISTANCE);
  assert.equal(normalizeAvatarCameraDistance('0.6'), 0.85);
  assert.equal(normalizeAvatarCameraDistance('2.25'), 2);
  assert.equal(normalizeAvatarCameraDistance('1.85'), 1.85);
});

test('stage catalog includes a portrait-focused studio preset', () => {
  const portraitStage = STAGES.find((stage) => stage.id === 'portrait-studio');
  assert.ok(portraitStage);
  assert.match(portraitStage.note, /portrait/i);
});
