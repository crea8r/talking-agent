import test from 'node:test';
import assert from 'node:assert/strict';

import { createAvatarDock } from './avatar-dock.js';

class FakeHost {
  constructor(id) {
    this.id = id;
    this.children = [];
  }

  append(child) {
    if (!child) {
      return;
    }

    if (child.parentNode) {
      child.parentNode.children = child.parentNode.children.filter((item) => item !== child);
    }

    this.children.push(child);
    child.parentNode = this;
  }
}

test('avatar dock mounts the shared preview shell into the active tab host', () => {
  const setupHost = new FakeHost('setup');
  const callHost = new FakeHost('call');
  const previewShell = { parentNode: null };

  const dock = createAvatarDock({
    setupHost,
    callHost,
    previewShell,
  });

  dock.sync('setup');
  assert.equal(previewShell.parentNode, setupHost);
  assert.deepEqual(setupHost.children, [previewShell]);
  assert.deepEqual(callHost.children, []);

  dock.sync('call');
  assert.equal(previewShell.parentNode, callHost);
  assert.deepEqual(setupHost.children, []);
  assert.deepEqual(callHost.children, [previewShell]);
});

test('avatar dock falls back to setup for unknown screen ids', () => {
  const setupHost = new FakeHost('setup');
  const callHost = new FakeHost('call');
  const previewShell = { parentNode: null };

  const dock = createAvatarDock({
    setupHost,
    callHost,
    previewShell,
  });

  dock.sync('unknown');
  assert.equal(previewShell.parentNode, setupHost);
});
