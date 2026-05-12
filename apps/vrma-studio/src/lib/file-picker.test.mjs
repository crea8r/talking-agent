import test from 'node:test';
import assert from 'node:assert/strict';

import { openFilePicker } from './file-picker.js';

test('openFilePicker prefers showPicker when available', () => {
  let showPickerCalls = 0;
  let clickCalls = 0;

  const input = {
    showPicker() {
      showPickerCalls += 1;
    },
    click() {
      clickCalls += 1;
    },
  };

  assert.equal(openFilePicker(input), true);
  assert.equal(showPickerCalls, 1);
  assert.equal(clickCalls, 0);
});

test('openFilePicker falls back to click for browsers without showPicker', () => {
  let clickCalls = 0;

  const input = {
    click() {
      clickCalls += 1;
    },
  };

  assert.equal(openFilePicker(input), true);
  assert.equal(clickCalls, 1);
});

test('openFilePicker returns false when no input is available', () => {
  assert.equal(openFilePicker(null), false);
});
