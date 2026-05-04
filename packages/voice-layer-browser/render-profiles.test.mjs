import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveVoiceRenderProfile } from './render-profiles.js';

test('resolveVoiceRenderProfile applies a fixed mood preset on top of the character base voice', () => {
  const resolved = resolveVoiceRenderProfile({
    preferredVoiceName: 'Fallback Voice',
    speechRate: 1,
    speechPitch: 1,
    characterId: 'ava',
    mood: 'happy',
    voiceCharacters: {
      ava: {
        voiceName: 'Ava Voice',
        baseRate: 0.95,
        basePitch: 1.02,
      },
    },
  });

  assert.equal(resolved.voiceName, 'Ava Voice');
  assert.equal(resolved.characterId, 'ava');
  assert.equal(resolved.mood, 'happy');
  assert.equal(resolved.speechRate, 1.026);
  assert.equal(resolved.speechPitch, 1.122);
});
