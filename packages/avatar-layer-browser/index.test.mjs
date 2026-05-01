import test from 'node:test';
import assert from 'node:assert/strict';

import { BUNDLED_ANIMATIONS, getGesturePresets, resolveGesturePreset } from './index.js';

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
    'Jump',
    'Sleepy',
    'No',
    'FullBody',
    'Shoot',
    'Spin',
    'Squat',
    'Stretching',
    'Swing',
    'Walking',
    'drinkwater',
    'hello_1',
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
  assert.equal(resolveGesturePreset('bhf-1-2', 'listen')?.id, 'LookAround');
  assert.equal(resolveGesturePreset('bhf-1-2', 'thinking')?.id, 'Thinking');
  assert.equal(resolveGesturePreset('bhf-1-2', 'greet')?.id, 'Greeting');
  assert.equal(resolveGesturePreset('bhf-1-2', 'celebrate')?.id, 'Clapping');
  assert.equal(resolveGesturePreset('bhf-1-2', 'react')?.id, 'Surprised');
  assert.equal(resolveGesturePreset('bhf-1-2', 'sad')?.id, 'Sad');
  assert.equal(resolveGesturePreset('bhf-1-2', 'explain')?.id, 'Pose');
  assert.equal(resolveGesturePreset('bhf-1-2', 'blush')?.id, 'Blush');
  assert.equal(resolveGesturePreset('bhf-1-2', 'angry')?.id, 'Angry');
  assert.equal(resolveGesturePreset('bhf-1-2', 'jump')?.id, 'Jump');
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
    'Jump.vrma',
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
