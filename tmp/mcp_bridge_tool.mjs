import { spawn } from 'node:child_process';

const serverPath = process.argv[2];
const toolName = process.argv[3];
const rawArgs = process.argv[4] || '{}';

if (!serverPath || !toolName) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: 'Usage: node tmp/mcp_bridge_tool.mjs <serverPath> <toolName> [jsonArgs]',
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

let toolArgs = {};
try {
  toolArgs = JSON.parse(rawArgs);
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Invalid JSON args',
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const child = spawn(process.execPath, [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: process.env,
});

let buffer = Buffer.alloc(0);
let nextId = 1;

function send(message) {
  const body = JSON.stringify(message);
  const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\nContent-Type: application/json\r\n\r\n${body}`;
  child.stdin.write(frame);
}

function parseStructuredContent(message) {
  if (message?.result?.structuredContent) {
    return message.result.structuredContent;
  }

  const text = message?.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

function waitFor(id) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for MCP response ${id}`));
    }, 5000);

    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) {
          return;
        }

        const header = buffer.slice(0, headerEnd).toString('utf8');
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          buffer = buffer.slice(headerEnd + 4);
          continue;
        }

        const bodyLength = Number.parseInt(match[1], 10);
        const bodyStart = headerEnd + 4;
        const bodyEnd = bodyStart + bodyLength;

        if (buffer.length < bodyEnd) {
          return;
        }

        const body = buffer.slice(bodyStart, bodyEnd).toString('utf8');
        buffer = buffer.slice(bodyEnd);

        const message = JSON.parse(body);
        if (message.id === id) {
          clearTimeout(timeout);
          child.stdout.off('data', onData);
          resolve(message);
          return;
        }
      }
    };

    child.stdout.on('data', onData);
  });
}

async function callTool(name, args) {
  const id = nextId++;
  send({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name,
      arguments: args,
    },
  });
  const message = await waitFor(id);
  if (message.error) {
    throw new Error(message.error.message || `Tool call failed: ${name}`);
  }
  return parseStructuredContent(message);
}

async function main() {
  const initializeId = nextId++;
  send({
    jsonrpc: '2.0',
    id: initializeId,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'codex-live-room-helper',
        version: '1.0.0',
      },
    },
  });
  await waitFor(initializeId);
  send({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  });

  const result = await callTool(toolName, toolArgs);
  console.log(JSON.stringify({ ok: true, result }, null, 2));
  child.kill('SIGTERM');
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      null,
      2,
    ),
  );
  child.kill('SIGTERM');
  process.exitCode = 1;
});
