import test from 'node:test';
import assert from 'node:assert/strict';

import { renderSelectOptions, renderTranscriptList } from './render.js';

test('renderSelectOptions assigns readable native option colors for browser select menus', () => {
  globalThis.document = {
    createElement() {
      return {
        value: '',
        textContent: '',
        title: '',
        style: {},
      };
    },
  };

  const selectElement = {
    value: '',
    options: [],
    replaceChildren() {
      this.options = [];
    },
    append(option) {
      this.options.push(option);
    },
  };

  renderSelectOptions(
    selectElement,
    [
      { id: 'bhf-1-2', label: 'Red Tinker Bell', note: 'Playful' },
      { id: 'fbf-1-0', label: 'Green Fairy' },
    ],
    'fbf-1-0',
  );

  assert.equal(selectElement.options.length, 2);
  assert.equal(selectElement.options[0].style.color, '#08111d');
  assert.equal(selectElement.options[0].style.backgroundColor, '#f5f7ff');
  assert.equal(selectElement.options[1].style.color, '#08111d');
  assert.equal(selectElement.options[1].style.backgroundColor, '#f5f7ff');
  assert.equal(selectElement.value, 'fbf-1-0');
});

test('renderTranscriptList removes repeated participant labels and keeps transcript content', () => {
  globalThis.document = {
    createElement() {
      return {
        className: '',
        dataset: {},
        innerHTML: '',
      };
    },
  };

  const container = {
    innerHTML: '',
    children: [],
    append(node) {
      this.children.push(node);
    },
  };

  renderTranscriptList(container, {
    turns: [
      {
        source: 'voice',
        createdAt: '2026-05-08T10:00:00.000Z',
        transcript: 'Hello there',
        human: { name: 'Human Caller' },
        agentReply: {
          createdAt: '2026-05-08T10:00:01.000Z',
          subtitle: 'Hi back to you',
          text: 'Hi back to you',
          agentLabel: 'Codex OpenAI',
          emoteId: 'warm',
          gestureId: 'Greeting',
          playedAt: '2026-05-08T10:00:03.000Z',
        },
      },
    ],
  });

  assert.equal(container.children.length, 2);
  assert.equal(container.children[0].dataset.role, 'agent');
  assert.match(container.children[0].innerHTML, /Hi back to you/);
  assert.doesNotMatch(container.children[0].innerHTML, /Codex OpenAI/);
  assert.equal(container.children[1].dataset.role, 'human');
  assert.match(container.children[1].innerHTML, /Hello there/);
  assert.doesNotMatch(container.children[1].innerHTML, /voice/);
  assert.doesNotMatch(container.children[1].innerHTML, /Human Caller/);
});

test('renderTranscriptList shows the latest history entry first', () => {
  globalThis.document = {
    createElement() {
      return {
        className: '',
        dataset: {},
        innerHTML: '',
      };
    },
  };

  const container = {
    innerHTML: '',
    children: [],
    append(node) {
      this.children.push(node);
    },
  };

  renderTranscriptList(container, {
    turns: [
      {
        source: 'voice',
        createdAt: '2026-05-08T10:00:00.000Z',
        transcript: 'First hello',
        agentReply: {
          createdAt: '2026-05-08T10:00:01.000Z',
          text: 'First reply',
          subtitle: 'First reply',
          emoteId: 'warm',
          gestureId: 'Greeting',
          playedAt: '2026-05-08T10:00:02.000Z',
        },
      },
      {
        source: 'typed',
        createdAt: '2026-05-08T10:05:00.000Z',
        transcript: 'Latest human turn',
        agentReply: {
          createdAt: '2026-05-08T10:05:03.000Z',
          text: 'Latest agent reply',
          subtitle: 'Latest agent reply',
          emoteId: 'playful',
          gestureId: 'Cheer',
          playedAt: '2026-05-08T10:05:04.000Z',
        },
      },
    ],
  });

  assert.equal(container.children[0].dataset.role, 'agent');
  assert.match(container.children[0].innerHTML, /Latest agent reply/);
  assert.equal(container.children[1].dataset.role, 'human');
  assert.match(container.children[1].innerHTML, /Latest human turn/);
  assert.match(container.children.at(-1).innerHTML, /First hello/);
});
