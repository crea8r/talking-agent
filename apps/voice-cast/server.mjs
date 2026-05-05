import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createVoiceCastServer } from './lib/server.mjs';
import { createTtsClient } from './lib/tts-client.mjs';
import { createPromptAssetStore } from './lib/prompt-assets.mjs';
import { createProductionTestStore } from './lib/production-test-store.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT || '4388', 10);
const SRC_DIR = path.join(__dirname, 'src');
const PROMPT_ASSET_ROOT = path.join(__dirname, '..', '..', 'output', 'voice-cast', 'prompt-assets');
const PRODUCTION_TEST_ROOT = path.join(__dirname, '..', '..', 'output', 'voice-cast', 'production-test');
const DEFAULT_TEXT_ONLY_BASE_URL = 'http://127.0.0.1:50001';
const DEFAULT_PRODUCTION_BASE_URL = 'http://127.0.0.1:50003';

const textOnlyBaseUrl = process.env.VOICE_CAST_TEXT_ONLY_BASE_URL || DEFAULT_TEXT_ONLY_BASE_URL;
const productionBaseUrl = process.env.VOICE_CAST_PRODUCTION_BASE_URL || DEFAULT_PRODUCTION_BASE_URL;

const ttsClient = createTtsClient({
  textOnlyBaseUrl,
  productionBaseUrl,
});

const promptAssetStore = createPromptAssetStore({
  rootDir: PROMPT_ASSET_ROOT,
});

const productionTestStore = createProductionTestStore({
  rootDir: PRODUCTION_TEST_ROOT,
});

const server = createVoiceCastServer({
  host: HOST,
  port: PORT,
  srcDir: SRC_DIR,
  promptAssetStore,
  productionTestStore,
  ttsClient,
  runtimeConfig: {
    backends: {
      textOnlyConfigured: Boolean(textOnlyBaseUrl),
      productionConfigured: Boolean(productionBaseUrl),
    },
    promptAssetRoot: PROMPT_ASSET_ROOT,
    productionTestRoot: PRODUCTION_TEST_ROOT,
  },
});

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use on ${HOST}. Kill the process on that port and rerun.`);
    process.exit(1);
  }

  console.error('voice-cast failed to start', error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`voice-cast listening at http://${HOST}:${PORT}`);
});
