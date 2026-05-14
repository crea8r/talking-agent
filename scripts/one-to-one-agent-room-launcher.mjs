import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');

function normalizeString(value) {
  return `${value || ''}`.trim();
}

function parsePort(value, fallback) {
  const port = Number.parseInt(normalizeString(value), 10);
  return Number.isFinite(port) ? port : fallback;
}

export function parseOneToOneAgentRoomLauncherArgs(argv = []) {
  const options = {
    mode: 'start',
    tailscale: false,
  };

  for (const rawArg of Array.isArray(argv) ? argv : []) {
    const arg = normalizeString(rawArg);
    if (!arg) {
      continue;
    }
    if (arg === 'start' || arg === 'dev') {
      options.mode = arg;
      continue;
    }
    if (arg === '--tailscale') {
      options.tailscale = true;
      continue;
    }
    if (arg === '--no-tailscale') {
      options.tailscale = false;
      continue;
    }
    throw new Error(`Unknown one-to-one-agent-room launcher argument: ${arg}`);
  }

  return options;
}

export function extractTailscaleDnsName(statusPayload = {}) {
  const dnsName = normalizeString(statusPayload?.Self?.DNSName).replace(/\.$/, '');
  if (!dnsName) {
    throw new Error('Unable to determine the local Tailscale DNS name from `tailscale status --json`.');
  }
  return dnsName;
}

export function resolveTailscalePublicBaseUrl({
  dnsName = '',
  httpsPort = 443,
} = {}) {
  const cleanedDnsName = normalizeString(dnsName).replace(/\.$/, '');
  if (!cleanedDnsName) {
    throw new Error('A Tailscale DNS name is required to build the public room URL.');
  }

  const resolvedHttpsPort = parsePort(httpsPort, 443);
  if (resolvedHttpsPort === 443) {
    return `https://${cleanedDnsName}`;
  }

  return `https://${cleanedDnsName}:${resolvedHttpsPort}`;
}

export function buildTailscaleServeArgs({
  targetPort,
  httpsPort,
} = {}) {
  const resolvedTargetPort = parsePort(targetPort, 0);
  if (!resolvedTargetPort) {
    throw new Error('A local room app port is required for Tailscale Serve.');
  }

  const resolvedHttpsPort = parsePort(httpsPort, resolvedTargetPort);
  return [
    'serve',
    '--bg',
    `--https=${resolvedHttpsPort}`,
    `http://127.0.0.1:${resolvedTargetPort}`,
  ];
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
  enableTailscale = false,
} = {}) {
  const normalizedMode = mode === 'dev' ? 'dev' : 'start';
  const roomPort = parsePort(env.PORT, 4384);
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
      port: roomPort,
      publicBaseUrl: normalizeString(env.ONE_TO_ONE_AGENT_ROOM_PUBLIC_BASE_URL),
    },
    tailscale: {
      enabled: enableTailscale,
      httpsPort: parsePort(env.ONE_TO_ONE_AGENT_ROOM_TAILSCALE_HTTPS_PORT, 443),
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

function runSynchronousCommand(command, args, { cwd = DEFAULT_REPO_ROOT, env = process.env, captureOutput = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const detail = captureOutput
      ? [normalizeString(result.stdout), normalizeString(result.stderr)].filter(Boolean).join('\n')
      : '';
    throw new Error(
      detail
        ? `Command failed: ${command} ${args.join(' ')}\n${detail}`
        : `Command failed: ${command} ${args.join(' ')}`,
    );
  }

  return captureOutput ? normalizeString(result.stdout) : '';
}

function configureTailscaleServe({ plan, repoRoot = DEFAULT_REPO_ROOT, env = process.env } = {}) {
  const statusOutput = runSynchronousCommand('tailscale', ['status', '--json'], {
    cwd: repoRoot,
    env,
    captureOutput: true,
  });

  let statusPayload = null;
  try {
    statusPayload = JSON.parse(statusOutput);
  } catch (error) {
    throw new Error(
      `Unable to parse \`tailscale status --json\` output: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }

  const dnsName = extractTailscaleDnsName(statusPayload);
  const publicBaseUrl = resolveTailscalePublicBaseUrl({
    dnsName,
    httpsPort: plan?.tailscale?.httpsPort,
  });

  runSynchronousCommand('tailscale', buildTailscaleServeArgs({
    targetPort: plan?.roomApp?.port,
    httpsPort: plan?.tailscale?.httpsPort,
  }), {
    cwd: repoRoot,
    env,
    captureOutput: false,
  });

  return publicBaseUrl;
}

async function main() {
  const options = parseOneToOneAgentRoomLauncherArgs(process.argv.slice(2));
  const plan = createOneToOneAgentRoomPlan({
    mode: options.mode,
    repoRoot: DEFAULT_REPO_ROOT,
    env: process.env,
    enableTailscale: options.tailscale,
  });

  const pythonCommand = resolvePythonCommand(plan.productionVoice.pythonCandidates);
  const roomCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const children = [];
  let shuttingDown = false;
  let derivedPublicBaseUrl = '';

  if (plan.tailscale.enabled) {
    derivedPublicBaseUrl = configureTailscaleServe({
      plan,
      repoRoot: DEFAULT_REPO_ROOT,
      env: process.env,
    });
    console.log(`one-to-one-agent-room tailscale url: ${derivedPublicBaseUrl}`);
  }

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
      env: (() => {
        const roomEnv = {
        ...process.env,
        PORT: `${plan.roomApp.port}`,
        ONE_TO_ONE_AGENT_ROOM_PRODUCTION_VOICE_BASE_URL: `http://${plan.productionVoice.host}:${plan.productionVoice.port}`,
        };
        const publicBaseUrl = plan.roomApp.publicBaseUrl || derivedPublicBaseUrl;
        if (publicBaseUrl) {
          roomEnv.ONE_TO_ONE_AGENT_ROOM_PUBLIC_BASE_URL = publicBaseUrl;
        }
        return roomEnv;
      })(),
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
