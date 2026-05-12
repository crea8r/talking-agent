import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocalCameraController } from './local-camera.js';

function createTrack() {
  return {
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
}

function createMediaStream() {
  const tracks = [createTrack(), createTrack()];
  return {
    tracks,
    getTracks() {
      return tracks;
    },
  };
}

test('local camera starts when the call goes live and attaches the stream to the video element', async () => {
  const stream = createMediaStream();
  const requests = [];
  const videoElement = {
    srcObject: null,
    muted: false,
    autoplay: false,
    playsInline: false,
    play() {
      return Promise.resolve();
    },
  };
  const snapshots = [];

  const controller = createLocalCameraController({
    videoElement,
    getUserMedia: async (constraints) => {
      requests.push(constraints);
      return stream;
    },
    onStateChange(snapshot) {
      snapshots.push(snapshot);
    },
  });

  await controller.syncCallState({ activeCall: true });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].audio, false);
  assert.equal(videoElement.srcObject, stream);
  assert.equal(videoElement.muted, true);
  assert.equal(videoElement.autoplay, true);
  assert.equal(videoElement.playsInline, true);
  assert.equal(snapshots.at(-1).active, true);
  assert.equal(snapshots.at(-1).permissionState, 'granted');
});

test('local camera toggle off stops all active tracks and clears the preview', async () => {
  const stream = createMediaStream();
  const videoElement = {
    srcObject: null,
    play() {
      return Promise.resolve();
    },
  };

  const controller = createLocalCameraController({
    videoElement,
    getUserMedia: async () => stream,
  });

  await controller.syncCallState({ activeCall: true });
  await controller.toggleEnabled();

  assert.equal(videoElement.srcObject, null);
  assert.equal(stream.getTracks().every((track) => track.stopped), true);
  assert.equal(controller.getSnapshot().active, false);
  assert.equal(controller.getSnapshot().enabled, false);
});

test('local camera records permission denial without crashing the controller', async () => {
  const videoElement = {
    srcObject: null,
    play() {
      return Promise.resolve();
    },
  };

  const controller = createLocalCameraController({
    videoElement,
    getUserMedia: async () => {
      const error = new Error('Permission denied.');
      error.name = 'NotAllowedError';
      throw error;
    },
  });

  await controller.syncCallState({ activeCall: true });

  assert.equal(controller.getSnapshot().active, false);
  assert.equal(controller.getSnapshot().permissionState, 'denied');
  assert.match(controller.getSnapshot().status, /Permission denied/i);
});
