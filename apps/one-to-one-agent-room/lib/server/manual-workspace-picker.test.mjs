import test from 'node:test';
import assert from 'node:assert/strict';

import {
  selectManualWorkspaceRoot,
} from './manual-workspace-picker.mjs';

test('selectManualWorkspaceRoot returns the chosen POSIX path from osascript output', async () => {
  const calls = [];
  const selectedPath = await selectManualWorkspaceRoot({
    defaultPath: '/Users/hieu/Work/crea8r/talking-agent',
    execFileImpl(file, args, callback) {
      calls.push({ file, args });
      callback(null, '/tmp/workspace-beta/\n', '');
    },
  });

  assert.equal(selectedPath, '/tmp/workspace-beta');
  assert.equal(calls[0].file, 'osascript');
  assert.match(calls[0].args.join('\n'), /choose folder/);
  assert.match(calls[0].args.join('\n'), /POSIX file "\/Users\/hieu\/Work\/crea8r\/talking-agent"/);
});

test('selectManualWorkspaceRoot maps macOS cancel to a typed error', async () => {
  await assert.rejects(
    () =>
      selectManualWorkspaceRoot({
        execFileImpl(_file, _args, callback) {
          callback(new Error('execution error: User canceled.'));
        },
      }),
    (error) => error?.code === 'MANUAL_WORKSPACE_PICKER_CANCELED',
  );
});
