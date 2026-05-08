export const VOICE_SAMPLE_REQUIREMENT = 'missing voice reference, a 3+s wav file';

const WAV_TYPES = new Set([
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/vnd.wave',
]);

export function isAcceptedVoiceSampleFile(file) {
  if (!file) {
    return false;
  }

  const fileName = `${file.name || ''}`.trim().toLowerCase();
  const fileType = `${file.type || ''}`.trim().toLowerCase();

  if (fileName.endsWith('.wav')) {
    return true;
  }

  return WAV_TYPES.has(fileType);
}
