import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

function sanitizeFileStem(value = '') {
  const normalized = `${value || ''}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'prompt-asset';
}

export function createPromptAssetStore({ rootDir } = {}) {
  if (!rootDir) {
    throw new Error('createPromptAssetStore requires a rootDir.');
  }

  async function savePromptAsset({
    fileNameStem,
    audioBuffer,
    promptText,
    characterPrompt,
    instructText,
    presetSpeaker,
    model,
    speed,
  }) {
    const safeStem = sanitizeFileStem(fileNameStem);
    const wavPath = path.join(rootDir, `${safeStem}.wav`);
    const metaPath = path.join(rootDir, `${safeStem}.json`);

    await mkdir(rootDir, { recursive: true });
    await writeFile(wavPath, audioBuffer);
    await writeFile(
      metaPath,
      JSON.stringify(
        {
          fileNameStem: safeStem,
          promptText,
          characterPrompt,
          instructText,
          presetSpeaker,
          model,
          speed,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    return {
      wavPath,
      metaPath,
      fileNameStem: safeStem,
    };
  }

  async function findAssetMetadataByFileName(fileName = '') {
    const parsed = path.parse(`${fileName || ''}`);
    if (!parsed.name) {
      return null;
    }

    const metaPath = path.join(rootDir, `${parsed.name}.json`);

    try {
      const raw = await readFile(metaPath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  return {
    findAssetMetadataByFileName,
    savePromptAsset,
  };
}
