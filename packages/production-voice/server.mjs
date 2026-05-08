import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PRODUCTION_VOICE_SERVER_PATH = path.join(__dirname, 'production_voice_server.py');

export function resolveProductionVoiceServerPath() {
  return PRODUCTION_VOICE_SERVER_PATH;
}
