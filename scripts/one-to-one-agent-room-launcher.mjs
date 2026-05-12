import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');

function parsePort(value, fallback) {
  const port = Number.parseInt(`${value || ''}`.trim(), 10);
  return Number.isFinite(port) ? port : fallback;
}

export function resolveProductionVoicePythonCandidates({
  env = process.env,
  repoRoot = DEFAULT_REPO_ROOT,
} = {}) {
  const explicitPython = `${env.ONE_TO_ONE_AGENT_ROOM_PRODUCTION_VOICE_PYTHON || ''}`.trim();
  const candidates = [];
  if (explicitPython) {
    candidates.push(explicitPython);
  }
  candidates.push(
    path.join(repoRoot, 'packages', 'production-voice', '.venv', 'bin', 'python'),
    path.join(repoRoot, 'apps', 'voice-cast', 'vendor', 'production-voice', '.venv', 'bin', 'python'),
    'python3',
  );
  return candidates;
}

export function resolveProductionVoiceVendorRoot({
  env = process.env,
  repoRoot = DEFAULT_REPO_ROOT,
  existsSync = fs.existsSync,
} = {}) {
  const explicitRoot = `${env.PRODUCTION_VOICE_VENDOR_ROOT || ''}`.trim();
  if (explicitRoot) {
    return explicitRoot;
  }

  const packageVendorRoot = path.join(repoRoot, 'packages', 'production-voice', 'vendor');
  if (existsSync(packageVendorRoot)) {
    return packageVendorRoot;
  }

  return path.join(repoRoot, 'apps', 'voice-cast', 'vendor');
}

export function createOneToOneAgentRoomPlan({
  mode = 'start',
  repoRoot = DEFAULT_REPO_ROOT,
  env = process.env,
  existsSync = fs.existsSync,
} = {}) {
  const normalizedMode = mode === 'dev' ? 'dev' : 'start';
  return {
    productionVoice: {
      pythonCandidates: resolveProductionVoicePythonCandidates({ env, repoRoot }),
      scriptPath: path.join(repoRoot, 'packages', 'production-voice', 'production_voice_server.py'),
      host: `${env.ONE_TO_ONE_AGENT_ROOM_PRODUCTION_VOICE_HOST || '127.0.0.1'}`.trim() || '127.0.0.1',
      port: parsePort(env.ONE_TO_ONE_AGENT_ROOM_PRODUCTION_VOICE_PORT, 50003),
      vendorRoot: resolveProductionVoiceVendorRoot({ env, repoRoot, existsSync }),
    },
    roomApp: {
      workspaceName: '@talking-agent/one-to-one-agent-room',
      npmScript: normalizedMode,
      port: parsePort(env.PORT, 4384),
    },
  };
}

function resolvePythonCommand(candidates, existsSync = fs.existsSync) {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (candidate.includes(path.sep)) {
      if (existsSync(candidate)) {
        return candidate;
      }
      continue;
    }
    return candidate;
  }
  throw new Error('Could not resolve a Python runtime for production-voice.');
}

function spawnProcess(command, args, options) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    ...options,
  });
  child.on('error', (error) => {
    console.error(`Failed to start ${command}`, error);
  });
  return child;
}

async function main() {
  const mode = process.argv[2] || 'start';
  const plan = createOneToOneAgentRoomPlan({
    mode,
    repoRoot: DEFAULT_REPO_ROOT,
    env: process.env,
  });

  const pythonCommand = resolvePythonCommand(plan.productionVoice.pythonCandidates);
  const roomCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const children = [];
  let shuttingDown = false;

  function terminateChildren(signal = 'SIGTERM') {
    for (const child of children) {
      if (!child.killed) {
        try {
          child.kill(signal);
        } catch {}
      }
    }
  }

  function shutdown(code = 0, signal = 'SIGTERM') {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    terminateChildren(signal);
    process.exitCode = code;
  }

  process.on('SIGINT', () => shutdown(130, 'SIGINT'));
  process.on('SIGTERM', () => shutdown(143, 'SIGTERM'));

  const productionVoice = spawnProcess(
    pythonCommand,
    [
      plan.productionVoice.scriptPath,
      '--host',
      plan.productionVoice.host,
      '--port',
      `${plan.productionVoice.port}`,
    ],
    {
      cwd: DEFAULT_REPO_ROOT,
      env: {
        ...process.env,
        PRODUCTION_VOICE_VENDOR_ROOT: plan.productionVoice.vendorRoot,
      },
    },
  );
  children.push(productionVoice);

  const roomApp = spawnProcess(
    roomCommand,
    ['run', plan.roomApp.npmScript, '-w', plan.roomApp.workspaceName],
    {
      cwd: DEFAULT_REPO_ROOT,
      env: {
        ...process.env,
        PORT: `${plan.roomApp.port}`,
        ONE_TO_ONE_AGENT_ROOM_PRODUCTION_VOICE_BASE_URL: `http://${plan.productionVoice.host}:${plan.productionVoice.port}`,
      },
    },
  );
  children.push(roomApp);

  for (const child of children) {
    child.on('exit', (code, signal) => {
      if (shuttingDown) {
        return;
      }

      const exitCode = Number.isInteger(code) ? code : signal ? 1 : 0;
      shutdown(exitCode, signal || 'SIGTERM');
    });
  }
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  main().catch((error) => {
    console.error('one-to-one-agent-room launcher failed', error);
    process.exitCode = 1;
  });
}
