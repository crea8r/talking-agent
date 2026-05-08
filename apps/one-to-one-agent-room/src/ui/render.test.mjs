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
  assert.equal(container.children[0].dataset.role, 'human');
  assert.match(container.children[0].innerHTML, /Hello there/);
  assert.doesNotMatch(container.children[0].innerHTML, /voice/);
  assert.doesNotMatch(container.children[0].innerHTML, /Human Caller/);
  assert.equal(container.children[1].dataset.role, 'agent');
  assert.match(container.children[1].innerHTML, /Hi back to you/);
  assert.doesNotMatch(container.children[1].innerHTML, /Codex OpenAI/);
});
