import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ANIMATION_MANIFEST,
  BUNDLED_ANIMATIONS,
  BUNDLED_MODELS,
  getGesturePresets,
  pickVoiceForModel,
  resolveGesturePreset,
} from './index.js';

test('all bundled models expose the same shared VRMA gesture catalog', () => {
  const expectedIds = [
    'Pose',
    'LookAround',
    'Thinking',
    'Greeting',
    'Goodbye',
    'Peace',
    'Clapping',
    'Surprised',
    'Sad',
    'Angry',
    'Blush',
    'Apologize',
    'Excuse',
    'Cheer',
    'Jumping',
    'Sleepy',
    'No',
    'Full Body Pose',
    'Shoot',
    'Spin',
    'Hand Squat',
    'Stretching',
    'Dance',
    'Walking',
    'drinkwater',
    'dramtic hello',
    'motion_pose',
    'smartphone',
  ];

  assert.deepEqual(
    getGesturePresets('bhf-1-2').map((gesture) => gesture.id),
    expectedIds,
  );
  assert.deepEqual(
    getGesturePresets('fbf-1-0').map((gesture) => gesture.id),
    expectedIds,
  );
  assert.deepEqual(
    getGesturePresets('smg-1-0').map((gesture) => gesture.id),
    expectedIds,
  );
});

test('legacy gesture ids resolve to shared VRMA names', () => {
  assert.equal(resolveGesturePreset('bhf-1-2', 'bhf-side-wave')?.id, 'Greeting');
  assert.equal(resolveGesturePreset('fbf-1-0', 'fbf-aside-think')?.id, 'Thinking');
  assert.equal(resolveGesturePreset('smg-1-0', 'smg-ready-listen')?.id, 'LookAround');
});

test('semantic bridge gesture ids still resolve to shared VRMA names', () => {
  assert.equal(resolveGesturePreset('bhf-1-2', 'idle')?.id, 'Pose');
  assert.equal(resolveGesturePreset('bhf-1-2', 'listen')?.id, 'Pose');
  assert.equal(resolveGesturePreset('bhf-1-2', 'thinking')?.id, 'Thinking');
  assert.equal(resolveGesturePreset('bhf-1-2', 'greet')?.id, 'Greeting');
  assert.equal(resolveGesturePreset('bhf-1-2', 'celebrate')?.id, 'Clapping');
  assert.equal(resolveGesturePreset('bhf-1-2', 'react')?.id, 'Surprised');
  assert.equal(resolveGesturePreset('bhf-1-2', 'sad')?.id, 'Sad');
  assert.equal(resolveGesturePreset('bhf-1-2', 'explain')?.id, 'Pose');
  assert.equal(resolveGesturePreset('bhf-1-2', 'blush')?.id, 'Blush');
  assert.equal(resolveGesturePreset('bhf-1-2', 'angry')?.id, 'Angry');
  assert.equal(resolveGesturePreset('bhf-1-2', 'jump')?.id, 'Pose');
  assert.equal(resolveGesturePreset('bhf-1-2', 'sleepy')?.id, 'Sleepy');
});

test('bundled animation entries point at the renamed vrma files', () => {
  const expectedFiles = [
    'Pose.vrma',
    'LookAround.vrma',
    'Thinking.vrma',
    'Greeting.vrma',
    'Goodbye.vrma',
    'Peace.vrma',
    'Clapping.vrma',
    'Surprised.vrma',
    'Sad.vrma',
    'Angry.vrma',
    'Blush.vrma',
    'Apologize.vrma',
    'Excuse.vrma',
    'Cheer.vrma',
    'Jumping.vrma',
    'Sleepy.vrma',
    'No.vrma',
    'FullBody.vrma',
    'Shoot.vrma',
    'Spin.vrma',
    'Squat.vrma',
    'Stretching.vrma',
    'Swing.vrma',
    'Walking.vrma',
    'drinkwater.vrma',
    'hello_1.vrma',
    'motion_pose.vrma',
    'smartphone.vrma',
  ];

  assert.deepEqual(
    BUNDLED_ANIMATIONS.map((animation) => animation.path.replace('/animations/', '')),
    expectedFiles,
  );
});

test('animation manifest keeps a single clean bestFor list with no aliases or camera hints', () => {
  for (const entry of ANIMATION_MANIFEST) {
    assert.equal('avoidFor' in entry, false);
    assert.equal('aliases' in entry, false);
    assert.equal('cameraFit' in entry, false);
    assert.equal(Array.isArray(entry.bestFor), true);
  }

  assert.deepEqual(ANIMATION_MANIFEST[0].bestFor.slice(0, 5), [
    'listen',
    'listening',
    'idle',
    'relax',
    'resting',
  ]);
});

test('bundled model labels use the public nicknames', () => {
  assert.deepEqual(
    BUNDLED_MODELS.map((model) => model.label),
    ['Red Tinker Bell', 'Green Fairy', 'Snowshoe'],
  );
});

test('voice matching picks the expected local voice for each character', () => {
  const voices = [
    { name: 'Samantha', lang: 'en-US', default: true },
    { name: 'Shelley (English (US))', lang: 'en-US', default: false },
    { name: 'Flo (English (US))', lang: 'en-US', default: false },
  ];

  assert.equal(pickVoiceForModel('bhf-1-2', voices), 'Flo (English (US))');
  assert.equal(pickVoiceForModel('fbf-1-0', voices), 'Shelley (English (US))');
  assert.equal(pickVoiceForModel('smg-1-0', voices), 'Samantha');
});
