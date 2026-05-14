import { execFile } from 'node:child_process';

function normalizeString(value) {
  return `${value || ''}`.trim();
}

function escapeAppleScriptString(value) {
  return normalizeString(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function runExecFile(execFileImpl, file, args) {
  return new Promise((resolve, reject) => {
    execFileImpl(file, args, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        stdout: `${stdout || ''}`,
        stderr: `${stderr || ''}`,
      });
    });
  });
}

export async function selectManualWorkspaceRoot({
  defaultPath = '',
  execFileImpl = execFile,
  platform = process.platform,
} = {}) {
  if (platform !== 'darwin') {
    const error = new Error('Manual workspace folder selection is currently only supported on macOS.');
    error.code = 'MANUAL_WORKSPACE_PICKER_UNSUPPORTED';
    throw error;
  }

  const cleanedDefaultPath = normalizeString(defaultPath).replace(/\/+$/g, '');
  const args = [];
  if (cleanedDefaultPath) {
    args.push(
      '-e',
      `set defaultFolder to POSIX file "${escapeAppleScriptString(cleanedDefaultPath)}"`,
      '-e',
      'set chosenFolder to choose folder with prompt "Select manual workspace root" default location defaultFolder',
    );
  } else {
    args.push(
      '-e',
      'set chosenFolder to choose folder with prompt "Select manual workspace root"',
    );
  }
  args.push('-e', 'POSIX path of chosenFolder');

  try {
    const result = await runExecFile(execFileImpl, 'osascript', args);
    return normalizeString(result.stdout).replace(/\/+$/g, '');
  } catch (error) {
    const message = normalizeString(error?.message);
    if (/user canceled/i.test(message)) {
      const cancelled = new Error('Manual workspace selection canceled.');
      cancelled.code = 'MANUAL_WORKSPACE_PICKER_CANCELED';
      throw cancelled;
    }
    throw error;
  }
}
