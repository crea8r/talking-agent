import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createDefaultPoseStudioBridgeStore, createPoseStudioMcpServer, logMcp } from './mcp-core.mjs';
export { createPoseStudioMcpServer } from './mcp-core.mjs';
export { createPoseStudioMcpHttpHandler } from './mcp-http.mjs';

export async function startPoseStudioStdioMcpServer({
  store = createDefaultPoseStudioBridgeStore(),
} = {}) {
  const transport = new StdioServerTransport();
  const { server } = createPoseStudioMcpServer({ store });
  logMcp('server/start', { stateFilePath: store.stateFilePath });
  server.onerror = (error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  };
  await server.connect(transport);
  return server;
}

async function main() {
  await startPoseStudioStdioMcpServer();
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exit(1);
  });
}
