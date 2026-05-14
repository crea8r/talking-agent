import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveLaunchContext } from './launch-context.js';

test('resolveLaunchContext defaults to manual mode and setup-first navigation', () => {
  const launch = resolveLaunchContext({
    locationHref: 'http://127.0.0.1:4384/',
    runtimeConfig: {
      codexProjectName: 'talking-agent',
      codexProjectPath: '/Users/hieu/Work/crea8r/talking-agent',
      manualMode: {
        workspaceRoot: '/tmp/manual-workspace',
      },
    },
  });

  assert.deepEqual(launch, {
    mode: 'manual',
    autoStart: false,
    initialScreen: 'setup',
    workspaceRoot: '/tmp/manual-workspace',
    workspaceKey: 'tmp-manual-workspace',
    displayTitle: 'manual-workspace',
    launchId: '',
    originalSessionId: '',
    callSessionId: '',
    callStatus: '',
    endedSummary: '',
    linkedSessionId: '',
  });
});

test('resolveLaunchContext honors linked-call query params and prefers the linked workspace', () => {
  const launch = resolveLaunchContext({
    locationHref:
      'http://127.0.0.1:4384/?mode=linked-call&cwd=%2Ftmp%2Fworkspace-alpha&title=Fix%20Auth&session=session-42',
    runtimeConfig: {
      codexProjectName: 'talking-agent',
      codexProjectPath: '/Users/hieu/Work/crea8r/talking-agent',
    },
  });

  assert.equal(launch.mode, 'linked-call');
  assert.equal(launch.autoStart, true);
  assert.equal(launch.initialScreen, 'call');
  assert.equal(launch.workspaceRoot, '/tmp/workspace-alpha');
  assert.equal(launch.workspaceKey, 'tmp-workspace-alpha');
  assert.equal(launch.displayTitle, 'Fix Auth');
  assert.equal(launch.linkedSessionId, 'session-42');
  assert.equal(launch.launchId, '');
  assert.equal(launch.originalSessionId, '');
  assert.equal(launch.callSessionId, '');
});

test('resolveLaunchContext lets manual mode override the initial screen explicitly', () => {
  const launch = resolveLaunchContext({
    locationHref: 'http://127.0.0.1:4384/?screen=call',
    runtimeConfig: {
      codexProjectName: 'talking-agent',
      codexProjectPath: '/Users/hieu/Work/crea8r/talking-agent',
    },
  });

  assert.equal(launch.mode, 'manual');
  assert.equal(launch.initialScreen, 'call');
  assert.equal(launch.autoStart, false);
});

test('resolveLaunchContext keeps the launch token for linked calls created from a call link', () => {
  const launch = resolveLaunchContext({
    locationHref: 'http://127.0.0.1:4384/?mode=linked-call&launch=launch-123',
    runtimeConfig: {
      codexProjectName: 'talking-agent',
      codexProjectPath: '/Users/hieu/Work/crea8r/talking-agent',
    },
  });

  assert.equal(launch.mode, 'linked-call');
  assert.equal(launch.launchId, 'launch-123');
  assert.equal(launch.callStatus, '');
  assert.equal(launch.endedSummary, '');
});
