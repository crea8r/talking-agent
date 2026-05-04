import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_URL = 'http://127.0.0.1:4385/';
const DEFAULT_MODEL_ID = 'bhf-1-2';
const DEFAULT_GESTURE_ID = 'Pose';
const DEFAULT_CAPTURE_MS = 1000;
const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };
const DEFAULT_DEVICE_SCALE_FACTOR = 2;
const DEFAULT_VIRTUAL_TIME_BUDGET_MS = 12000;
const DEFAULT_OUTPUT = path.resolve(
  process.cwd(),
  'apps/call-landing/src/assets/default-loader-poster.png',
);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const chromePath = resolveChromeBinary(options.chromePath);
  await mkdir(path.dirname(options.outputPath), { recursive: true });

  const captureUrl = buildCaptureUrl(options);
  const tempProfileDir = await mkdtemp(path.join(os.tmpdir(), 'call-landing-capture-'));

  try {
    await runChromeScreenshot(chromePath, tempProfileDir, captureUrl, options);
  } finally {
    await rm(tempProfileDir, { recursive: true, force: true });
  }

  if (!existsSync(options.outputPath)) {
    throw new Error(`Chrome finished but did not write ${options.outputPath}`);
  }

  console.log(`Saved loader poster to ${options.outputPath}`);
}

function parseArgs(argv) {
  const options = {
    url: DEFAULT_URL,
    modelId: DEFAULT_MODEL_ID,
    gestureId: DEFAULT_GESTURE_ID,
    captureAtMs: DEFAULT_CAPTURE_MS,
    viewport: DEFAULT_VIEWPORT,
    deviceScaleFactor: DEFAULT_DEVICE_SCALE_FACTOR,
    virtualTimeBudgetMs: DEFAULT_VIRTUAL_TIME_BUDGET_MS,
    outputPath: DEFAULT_OUTPUT,
    chromePath: process.env.CHROME_BIN || '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--url':
        options.url = argv[++index] || options.url;
        break;
      case '--model':
        options.modelId = argv[++index] || options.modelId;
        break;
      case '--gesture':
        options.gestureId = argv[++index] || options.gestureId;
        break;
      case '--time-ms':
        options.captureAtMs = parsePositiveInt(argv[++index], '--time-ms');
        break;
      case '--size':
        options.viewport = parseViewport(argv[++index] || '');
        break;
      case '--scale':
        options.deviceScaleFactor = parsePositiveNumber(argv[++index], '--scale');
        break;
      case '--budget-ms':
        options.virtualTimeBudgetMs = parsePositiveInt(argv[++index], '--budget-ms');
        break;
      case '--output':
        options.outputPath = path.resolve(process.cwd(), argv[++index] || '');
        break;
      case '--chrome':
        options.chromePath = argv[++index] || options.chromePath;
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node apps/call-landing/scripts/capture-loader-poster.mjs \\
    --time-ms 500 \\
    --size 1920x1080 \\
    --output apps/call-landing/src/assets/default-loader-poster.png

Examples:
  node apps/call-landing/scripts/capture-loader-poster.mjs --time-ms 500 --size 1920x1080
  node apps/call-landing/scripts/capture-loader-poster.mjs --time-ms 1000 --size 1920x1080
  node apps/call-landing/scripts/capture-loader-poster.mjs --time-ms 1500 --size 1920x1080

Options:
  --time-ms <ms>     Freeze the pose at N ms after the animation starts. Default: ${DEFAULT_CAPTURE_MS}
  --size <WxH>       Viewport size. Default: ${DEFAULT_VIEWPORT.width}x${DEFAULT_VIEWPORT.height}
  --model <id>       Bundled model id. Default: ${DEFAULT_MODEL_ID}
  --gesture <id>     Gesture id. Default: ${DEFAULT_GESTURE_ID}
  --scale <number>   Device scale factor. Default: ${DEFAULT_DEVICE_SCALE_FACTOR}
  --budget-ms <ms>   Chrome virtual time budget. Default: ${DEFAULT_VIRTUAL_TIME_BUDGET_MS}
  --url <url>        Landing page URL. Default: ${DEFAULT_URL}
  --output <path>    Output PNG path. Default: ${DEFAULT_OUTPUT}
  --chrome <path>    Chrome binary path. Defaults to CHROME_BIN or common macOS installs.`);
}

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/i.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid --size value: ${value}. Expected WIDTHxHEIGHT, e.g. 1920x1080.`);
  }

  return {
    width: Number.parseInt(match[1], 10),
    height: Number.parseInt(match[2], 10),
  };
}

function parsePositiveInt(value, flagName) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${flagName} value: ${value}`);
  }
  return parsed;
}

function parsePositiveNumber(value, flagName) {
  const parsed = Number.parseFloat(value || '');
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${flagName} value: ${value}`);
  }
  return parsed;
}

function resolveChromeBinary(explicitPath) {
  const candidates = [
    explicitPath,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('Chrome binary not found. Pass --chrome or set CHROME_BIN.');
}

function buildCaptureUrl(options) {
  const url = new URL(options.url);
  url.searchParams.set('poster', '1');
  url.searchParams.set('model', options.modelId);
  url.searchParams.set('gesture', options.gestureId);
  url.searchParams.set('captureAtMs', String(options.captureAtMs));
  return url.toString();
}

async function runChromeScreenshot(chromePath, tempProfileDir, captureUrl, options) {
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--force-device-scale-factor=${options.deviceScaleFactor}`,
    `--virtual-time-budget=${options.virtualTimeBudgetMs}`,
    `--window-size=${options.viewport.width},${options.viewport.height}`,
    `--user-data-dir=${tempProfileDir}`,
    `--screenshot=${options.outputPath}`,
    captureUrl,
  ];

  const result = spawnSync(chromePath, args, {
    encoding: 'utf8',
    timeout: options.virtualTimeBudgetMs + 20000,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      [
        result.signal ? `Chrome exited with signal ${result.signal}.` : `Chrome exited with code ${result.status}.`,
        result.stdout ? `STDOUT:\n${result.stdout}` : '',
        result.stderr ? `STDERR:\n${result.stderr}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
