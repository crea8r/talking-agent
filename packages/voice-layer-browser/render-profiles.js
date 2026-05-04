const MIN_SPEECH_RATE = 0.8;
const MAX_SPEECH_RATE = 1.2;
const MIN_SPEECH_PITCH = 0.85;
const MAX_SPEECH_PITCH = 1.2;

export const DEFAULT_VOICE_MOOD = 'neutral';

export const VOICE_MOOD_PRESETS = Object.freeze({
  neutral: Object.freeze({ rate: 1, pitch: 1 }),
  happy: Object.freeze({ rate: 1.08, pitch: 1.1 }),
  excited: Object.freeze({ rate: 1.15, pitch: 1.16 }),
  playful: Object.freeze({ rate: 1.1, pitch: 1.13 }),
  warm: Object.freeze({ rate: 0.98, pitch: 1.05 }),
  confident: Object.freeze({ rate: 1.02, pitch: 0.97 }),
  focused: Object.freeze({ rate: 0.96, pitch: 0.96 }),
  calm: Object.freeze({ rate: 0.9, pitch: 0.95 }),
  sad: Object.freeze({ rate: 0.86, pitch: 0.9 }),
  angry: Object.freeze({ rate: 1.06, pitch: 0.92 }),
});

export const VOICE_MOOD_IDS = Object.freeze(Object.keys(VOICE_MOOD_PRESETS));

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function normalizeCharacterProfile(id, profile = {}, fallbackVoiceName, fallbackRate, fallbackPitch) {
  return {
    id: `${id || profile.id || ''}`.trim(),
    voiceName: `${profile.voiceName || profile.preferredVoiceName || fallbackVoiceName || ''}`.trim(),
    baseRate: clampNumber(
      profile.baseRate ?? profile.speechRate,
      MIN_SPEECH_RATE,
      MAX_SPEECH_RATE,
      fallbackRate,
    ),
    basePitch: clampNumber(
      profile.basePitch ?? profile.speechPitch,
      MIN_SPEECH_PITCH,
      MAX_SPEECH_PITCH,
      fallbackPitch,
    ),
  };
}

function normalizeVoiceCharacters(voiceCharacters, fallbackVoiceName, fallbackRate, fallbackPitch) {
  if (Array.isArray(voiceCharacters)) {
    return new Map(
      voiceCharacters
        .map((profile) =>
          normalizeCharacterProfile(
            typeof profile?.id === 'string' ? profile.id : '',
            profile,
            fallbackVoiceName,
            fallbackRate,
            fallbackPitch,
          ),
        )
        .filter((profile) => profile.id)
        .map((profile) => [profile.id, profile]),
    );
  }

  if (voiceCharacters && typeof voiceCharacters === 'object') {
    return new Map(
      Object.entries(voiceCharacters).map(([id, profile]) => [
        id,
        normalizeCharacterProfile(id, profile, fallbackVoiceName, fallbackRate, fallbackPitch),
      ]),
    );
  }

  return new Map();
}

export function resolveVoiceRenderProfile({
  preferredVoiceName = '',
  speechRate = 1,
  speechPitch = 1,
  characterId = '',
  mood = DEFAULT_VOICE_MOOD,
  defaultCharacterId = 'default',
  voiceCharacters = {},
} = {}) {
  const fallbackVoiceName = `${preferredVoiceName || ''}`.trim();
  const fallbackRate = clampNumber(speechRate, MIN_SPEECH_RATE, MAX_SPEECH_RATE, 1);
  const fallbackPitch = clampNumber(speechPitch, MIN_SPEECH_PITCH, MAX_SPEECH_PITCH, 1);
  const normalizedCharacterId = `${characterId || ''}`.trim();
  const normalizedDefaultCharacterId = `${defaultCharacterId || ''}`.trim() || 'default';
  const normalizedMood = `${mood || ''}`.trim();
  const resolvedMood = VOICE_MOOD_PRESETS[normalizedMood] ? normalizedMood : DEFAULT_VOICE_MOOD;
  const characters = normalizeVoiceCharacters(
    voiceCharacters,
    fallbackVoiceName,
    fallbackRate,
    fallbackPitch,
  );
  const selectedCharacter =
    (normalizedCharacterId && characters.get(normalizedCharacterId)) ||
    characters.get(normalizedDefaultCharacterId) ||
    null;
  const effectiveCharacterId =
    selectedCharacter?.id || normalizedCharacterId || normalizedDefaultCharacterId;
  const effectiveVoiceName = selectedCharacter?.voiceName || fallbackVoiceName;
  const effectiveBaseRate = selectedCharacter?.baseRate ?? fallbackRate;
  const effectiveBasePitch = selectedCharacter?.basePitch ?? fallbackPitch;
  const moodProfile = VOICE_MOOD_PRESETS[resolvedMood];

  return {
    characterId: effectiveCharacterId,
    mood: resolvedMood,
    voiceName: effectiveVoiceName,
    speechRate: clampNumber(
      effectiveBaseRate * moodProfile.rate,
      MIN_SPEECH_RATE,
      MAX_SPEECH_RATE,
      fallbackRate,
    ),
    speechPitch: clampNumber(
      effectiveBasePitch * moodProfile.pitch,
      MIN_SPEECH_PITCH,
      MAX_SPEECH_PITCH,
      fallbackPitch,
    ),
  };
}
