# One-to-One Agent Room MCP Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the snapshot-based room bridge with a singleton-call event bridge, implement the new MCP server surface and browser client flow, and add an inspector for debugging.

**Architecture:** Keep one file-backed active call in `packages/agent-room-bridge`, but change its state shape from pending-turn snapshots to event log plus action queue. The stdio MCP server becomes the external agent surface with tools/resources/prompts, while the browser app uses thin HTTP endpoints to append user speech events, consume pending agent actions, and inspect call state.

**Tech Stack:** Node.js `node:test`, stdio MCP server, browser fetch polling, LiveKit browser client, local JSON bridge store

---

## File Map

- Modify: `packages/agent-room-bridge/index.mjs`
  - add singleton active-call state, event log, action queue, avatar catalog metadata, join/wait/publish/leave APIs, and browser-side append/ack helpers
- Create: `packages/agent-room-bridge/resources.mjs`
  - build `bridge://capabilities`, `avatar://catalog`, and `avatar://catalog/<modelId>` payloads
- Modify: `packages/agent-room-bridge/mcp-server.mjs`
  - expose `join_call`, `wait_for_events`, `publish_actions`, `leave_call`, `get_recent_turns`, resources, and prompts
- Modify: `packages/agent-room-bridge/index.test.mjs`
  - cover event cursor reads, avatar catalog sync, join/wait flow, idempotent action publish, and recent-turn recovery
- Create: `packages/agent-room-bridge/mcp-server.test.mjs`
  - smoke-test MCP protocol frames for tools/resources/prompts
- Modify: `apps/one-to-one-agent-room/server.mjs`
  - replace old bridge endpoints with singleton-call HTTP endpoints for event append, action polling, action ack, inspector snapshot, and runtime config updates
- Modify: `apps/one-to-one-agent-room/src/lib/app/call-session.js`
  - update operator instructions to the new MCP tool names and singleton-call semantics
- Modify: `apps/one-to-one-agent-room/src/lib/app/store.js`
  - track active utterance state, inspector snapshot state, and new runtime config bridge metadata
- Modify: `apps/one-to-one-agent-room/src/lib/app/session-controller.js`
  - emit `utt.start` / `utt.partial` / `utt.final`, poll pending actions instead of pending replies, ack playback, and feed inspector data
- Modify: `apps/one-to-one-agent-room/src/app.js`
  - wire interim transcript events into the bridge client loop
- Modify: `apps/one-to-one-agent-room/src/lib/app/presenter.js`
  - render action/event-based bridge status and inspector widgets
- Modify: `apps/one-to-one-agent-room/src/ui/dom.js`
  - bind new inspector elements
- Modify: `apps/one-to-one-agent-room/src/ui/render.js`
  - render event stream and action queue inspector views
- Modify: `apps/one-to-one-agent-room/src/index.html`
  - add inspector panel and refresh diagnostics copy
- Modify: `apps/one-to-one-agent-room/src/styles.css`
  - style inspector tables / event stream
- Modify: `apps/one-to-one-agent-room/src/lib/app/session-controller.test.mjs`
  - cover event emission, action playback, and inspector refresh
- Modify: `README.md`
  - document new MCP tool names and inspector usage

## Task 1: Bridge Store Event Log

**Files:**
- Modify: `packages/agent-room-bridge/index.mjs`
- Test: `packages/agent-room-bridge/index.test.mjs`

- [ ] **Step 1: Write the failing bridge-store tests**

```js
test('joinCall returns the active call cursor and avatar catalog metadata', async () => {
  const store = createAgentRoomBridgeStore({ stateFilePath: createStateFilePath('join') });
  const call = await store.createSession({
    title: 'talking-agent',
    roomName: 'talking-agent-call',
    livekitUrl: 'ws://127.0.0.1:7880',
    humanIdentity: 'human-room-host',
    humanName: 'Human Caller',
    metadata: { app: 'one-to-one-agent-room' },
  });

  await store.syncAvatarCatalog({
    sessionId: call.id,
    activeModelId: 'bhf-1-2',
    catalogVersion: 'avatar-v1',
    catalogUri: 'avatar://catalog/bhf-1-2',
  });

  const joined = await store.joinCall({ agentId: 'codex-openai', agentLabel: 'Codex OpenAI' });

  assert.equal(joined.callId, call.id);
  assert.equal(joined.activeModelId, 'bhf-1-2');
  assert.equal(joined.avatarCatalogUri, 'avatar://catalog/bhf-1-2');
});

test('waitForEvents returns partial and final utterance events in cursor order', async () => {
  const store = createAgentRoomBridgeStore({ stateFilePath: createStateFilePath('events') });
  const call = await store.createSession({
    title: 'talking-agent',
    roomName: 'talking-agent-call',
    livekitUrl: 'ws://127.0.0.1:7880',
    humanIdentity: 'human-room-host',
    humanName: 'Human Caller',
    metadata: { app: 'one-to-one-agent-room' },
  });

  await store.appendUserUtteranceStart({ sessionId: call.id, utteranceId: 'u1' });
  await store.appendUserUtterancePartial({ sessionId: call.id, utteranceId: 'u1', delta: 'hello' });
  await store.appendUserUtteranceFinal({ sessionId: call.id, utteranceId: 'u1', text: 'hello there' });

  const joined = await store.joinCall({ agentId: 'codex-openai', agentLabel: 'Codex OpenAI' });
  const result = await store.waitForEvents({
    callId: joined.callId,
    cursor: '0',
    maxEvents: 10,
    waitMs: 0,
  });

  assert.deepEqual(result.events.map((event) => event.type), ['call.joined', 'utt.start', 'utt.partial', 'utt.final']);
});

test('publishActions is idempotent by actionId and exposes pending browser actions once', async () => {
  const store = createAgentRoomBridgeStore({ stateFilePath: createStateFilePath('actions') });
  const call = await store.createSession({
    title: 'talking-agent',
    roomName: 'talking-agent-call',
    livekitUrl: 'ws://127.0.0.1:7880',
    humanIdentity: 'human-room-host',
    humanName: 'Human Caller',
    metadata: { app: 'one-to-one-agent-room' },
  });

  await store.publishActions({
    callId: call.id,
    actions: [
      { actionId: 'a1', type: 'anim', gestureId: 'Thinking', emoteId: 'focused' },
      { actionId: 'a2', type: 'speech', text: 'Let me think about that.' },
    ],
  });

  await store.publishActions({
    callId: call.id,
    actions: [
      { actionId: 'a1', type: 'anim', gestureId: 'Thinking', emoteId: 'focused' },
      { actionId: 'a2', type: 'speech', text: 'Let me think about that.' },
    ],
  });

  const pending = await store.listPendingActions({ sessionId: call.id });
  assert.equal(pending.actions.length, 2);
  assert.deepEqual(pending.actions.map((action) => action.actionId), ['a1', 'a2']);
});
```

- [ ] **Step 2: Run the bridge tests to verify they fail**

Run: `node --test packages/agent-room-bridge/index.test.mjs`
Expected: FAIL with missing methods such as `syncAvatarCatalog`, `joinCall`, `waitForEvents`, or `publishActions`

- [ ] **Step 3: Implement the bridge event-log and action-queue store**

```js
// packages/agent-room-bridge/index.mjs
export function createAgentRoomBridgeStore({ stateFilePath = resolveDefaultBridgeStatePath(), sessionTtlMs = DEFAULT_SESSION_TTL_MS } = {}) {
  return {
    stateFilePath,
    async createSession(input) { /* reuse existing session creation, but initialize events/actions/avatar metadata */ },
    async syncAvatarCatalog({ sessionId, activeModelId, catalogVersion, catalogUri }) { /* persist avatar metadata and append avatar.catalog.changed when needed */ },
    async joinCall({ agentId, agentLabel, resumeFromCursor = null }) { /* attach to active call, append call.joined once, return cursor + catalog metadata */ },
    async waitForEvents({ callId, cursor = '0', maxEvents = 20, waitMs = 0 }) { /* read ordered events after cursor */ },
    async appendUserUtteranceStart({ sessionId, utteranceId }) { /* append utt.start */ },
    async appendUserUtterancePartial({ sessionId, utteranceId, delta }) { /* append utt.partial */ },
    async appendUserUtteranceFinal({ sessionId, utteranceId, text, humanIdentity, humanName, source = 'voice' }) { /* append utt.final and finalized turn */ },
    async publishActions({ callId, inReplyToEventId = null, actions = [] }) { /* enqueue actions once by actionId */ },
    async listPendingActions({ sessionId }) { /* return pending actions for browser playback */ },
    async markActionPlaybackStarted({ sessionId, actionId }) { /* append agent.playback.started */ },
    async markActionPlaybackFinished({ sessionId, actionId }) { /* append agent.playback.finished and mark done */ },
    async leaveCall({ callId, agentId, reason = '', endCall = false }) { /* detach agent, append call.ending/call.ended when requested */ },
    async getRecentTurns({ callId, limit = 10 }) { /* return finalized turns only */ },
    async getInspectorSnapshot({ sessionId }) { /* active call + recent events + pending actions */ },
  };
}
```

- [ ] **Step 4: Run the bridge tests to verify they pass**

Run: `node --test packages/agent-room-bridge/index.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit the bridge-store foundation**

```bash
git add packages/agent-room-bridge/index.mjs packages/agent-room-bridge/index.test.mjs
git commit -m "feat: add event-driven room bridge store"
```

## Task 2: MCP Server Tools, Resources, And Prompts

**Files:**
- Create: `packages/agent-room-bridge/resources.mjs`
- Modify: `packages/agent-room-bridge/mcp-server.mjs`
- Test: `packages/agent-room-bridge/mcp-server.test.mjs`

- [ ] **Step 1: Write failing MCP server protocol tests**

```js
test('tools/list exposes the new singleton-call protocol', async () => {
  const result = await requestMcp('tools/list');
  assert.deepEqual(
    result.tools.map((tool) => tool.name),
    ['join_call', 'wait_for_events', 'publish_actions', 'leave_call', 'get_recent_turns'],
  );
});

test('resources/read returns the bridge capabilities manifest', async () => {
  const resources = await requestMcp('resources/list');
  assert.ok(resources.resources.some((resource) => resource.uri === 'bridge://capabilities'));

  const payload = await requestMcp('resources/read', { uri: 'bridge://capabilities' });
  assert.match(payload.contents[0].text, /wait_for_events/);
});

test('prompts/get returns the bootstrap operating instructions', async () => {
  const payload = await requestMcp('prompts/get', { name: 'call_agent_bootstrap' });
  assert.match(payload.messages[0].content.text, /join_call/);
  assert.match(payload.messages[0].content.text, /publish_actions/);
});
```

- [ ] **Step 2: Run the MCP server tests to verify they fail**

Run: `node --test packages/agent-room-bridge/mcp-server.test.mjs`
Expected: FAIL because the MCP server still exposes the old tool list and no resources/prompts

- [ ] **Step 3: Implement MCP resources and the new server surface**

```js
// packages/agent-room-bridge/resources.mjs
export function createBridgeCapabilitiesResource() {
  return {
    uri: 'bridge://capabilities',
    mimeType: 'application/json',
    text: JSON.stringify({
      protocolVersion: '2026-05-01',
      tools: ['join_call', 'wait_for_events', 'publish_actions', 'leave_call', 'get_recent_turns'],
      eventTypes: ['call.joined', 'call.ready', 'avatar.catalog.changed', 'utt.start', 'utt.partial', 'utt.final', 'agent.playback.started', 'agent.playback.finished', 'call.ended'],
      actionTypes: ['anim', 'speech', 'hangup'],
    }, null, 2),
  };
}

// packages/agent-room-bridge/mcp-server.mjs
const TOOL_DEFINITIONS = [joinCallTool, waitForEventsTool, publishActionsTool, leaveCallTool, getRecentTurnsTool];

async function handleToolCall(name, args = {}) {
  switch (name) {
    case 'join_call':
      return store.joinCall(args);
    case 'wait_for_events':
      return store.waitForEvents(args);
    case 'publish_actions':
      return store.publishActions(args);
    case 'leave_call':
      return store.leaveCall(args);
    case 'get_recent_turns':
      return store.getRecentTurns(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
```

- [ ] **Step 4: Run the MCP server tests to verify they pass**

Run: `node --test packages/agent-room-bridge/mcp-server.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit the MCP server protocol update**

```bash
git add packages/agent-room-bridge/resources.mjs packages/agent-room-bridge/mcp-server.mjs packages/agent-room-bridge/mcp-server.test.mjs
git commit -m "feat: expose event-driven MCP room protocol"
```

## Task 3: Browser Bridge Client Migration

**Files:**
- Modify: `apps/one-to-one-agent-room/server.mjs`
- Modify: `apps/one-to-one-agent-room/src/app.js`
- Modify: `apps/one-to-one-agent-room/src/lib/app/call-session.js`
- Modify: `apps/one-to-one-agent-room/src/lib/app/store.js`
- Modify: `apps/one-to-one-agent-room/src/lib/app/session-controller.js`
- Test: `apps/one-to-one-agent-room/src/lib/app/session-controller.test.mjs`

- [ ] **Step 1: Write failing browser-bridge tests**

```js
test('enqueueHumanTurn emits start, partial delta, and final events before refreshing the inspector', async () => {
  const calls = [];
  const controller = createSessionController({
    /* existing harness */,
    postJson: async (url, body) => {
      calls.push({ url, body });
      return { session: buildSession(), inspector: buildInspectorSnapshot() };
    },
  });

  await controller.beginUserUtterance('u1');
  await controller.appendUserUtterancePartial('u1', 'hello');
  await controller.finalizeUserUtterance('u1', 'hello there', 'voice');

  assert.deepEqual(
    calls.map((entry) => entry.url),
    [
      '/api/bridge/calls/current/utterances/start',
      '/api/bridge/calls/current/utterances/partial',
      '/api/bridge/calls/current/utterances/final',
    ],
  );
});

test('pollSession consumes pending actions and acknowledges playback', async () => {
  const playbackCalls = [];
  const controller = createSessionController({
    /* existing harness */,
    fetchJson: async () => ({
      session: buildSession(),
      pendingActions: [
        { actionId: 'a1', type: 'anim', gestureId: 'Thinking', emoteId: 'focused' },
        { actionId: 'a2', type: 'speech', text: 'Working on it.' },
      ],
      inspector: buildInspectorSnapshot(),
    }),
    postJson: async (url, body) => {
      playbackCalls.push({ url, body });
      return { ok: true, inspector: buildInspectorSnapshot() };
    },
  });

  await controller.pollSession();
  assert.equal(playbackCalls.length, 3);
});
```

- [ ] **Step 2: Run the browser bridge tests to verify they fail**

Run: `node --test apps/one-to-one-agent-room/src/lib/app/session-controller.test.mjs`
Expected: FAIL because the controller still queues old pending turns and played replies

- [ ] **Step 3: Implement singleton-call HTTP endpoints and browser event/action flow**

```js
// apps/one-to-one-agent-room/server.mjs
if (req.method === 'POST' && url.pathname === '/api/bridge/calls/current/utterances/start') {
  const payload = await bridgeStore.appendUserUtteranceStart({ sessionId: requireCurrentSessionId(), ...body });
  sendJson(res, 200, { ok: true, session: payload.session, inspector: await bridgeStore.getInspectorSnapshot({ sessionId: payload.session.id }) });
}

// apps/one-to-one-agent-room/src/app.js
onTranscript({ text, isFinal }) {
  state.transcriptPreview = text || 'none';
  if (!isFinal) {
    void sessionController.syncInterimTranscript(text);
  }
  presenter.renderHumanStatus();
}

// apps/one-to-one-agent-room/src/lib/app/session-controller.js
async function syncInterimTranscript(text) { /* start utterance once, compute delta, POST partial */ }
async function enqueueHumanTurn(transcript, source) { /* finalize current utterance via new endpoint */ }
async function playAgentRepliesIfReady() { /* replaced with consumePendingActions() over action queue */ }
```

- [ ] **Step 4: Run the browser bridge tests to verify they pass**

Run: `node --test apps/one-to-one-agent-room/src/lib/app/session-controller.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit the browser bridge client migration**

```bash
git add apps/one-to-one-agent-room/server.mjs apps/one-to-one-agent-room/src/app.js apps/one-to-one-agent-room/src/lib/app/call-session.js apps/one-to-one-agent-room/src/lib/app/store.js apps/one-to-one-agent-room/src/lib/app/session-controller.js apps/one-to-one-agent-room/src/lib/app/session-controller.test.mjs
git commit -m "feat: migrate room app to event-driven bridge client"
```

## Task 4: Inspector UI And Docs

**Files:**
- Modify: `apps/one-to-one-agent-room/src/index.html`
- Modify: `apps/one-to-one-agent-room/src/ui/dom.js`
- Modify: `apps/one-to-one-agent-room/src/ui/render.js`
- Modify: `apps/one-to-one-agent-room/src/lib/app/presenter.js`
- Modify: `apps/one-to-one-agent-room/src/styles.css`
- Modify: `README.md`

- [ ] **Step 1: Write the failing inspector rendering test**

```js
test('renderDebugSnapshot shows inspector events and pending actions', () => {
  const element = { textContent: '' };
  renderDebugSnapshot(element, {
    inspector: {
      events: [{ seq: 4, type: 'utt.final' }],
      pendingActions: [{ actionId: 'a2', type: 'speech' }],
    },
  });

  assert.match(element.textContent, /utt.final/);
  assert.match(element.textContent, /a2/);
});
```

- [ ] **Step 2: Run the inspector-focused tests to verify they fail**

Run: `node --test apps/one-to-one-agent-room/src/lib/app/session-controller.test.mjs`
Expected: FAIL or remain incomplete because the diagnostics UI does not yet render event/action inspector data

- [ ] **Step 3: Add the inspector panel and update docs**

```html
<!-- apps/one-to-one-agent-room/src/index.html -->
<article class="panel stack-lg">
  <div class="section-head">
    <h2>MCP Inspector</h2>
    <button id="refresh-inspector" type="button">Refresh Inspector</button>
  </div>
  <div id="inspector-summary" class="callout status-detail">Waiting for bridge data.</div>
  <pre id="inspector-events" class="debug-output">[]</pre>
  <pre id="inspector-actions" class="debug-output">[]</pre>
</article>
```

```md
<!-- README.md -->
## MCP Inspector

Open the `Diagnostics` tab in `one-to-one-agent-room` to inspect:

- current active call metadata
- recent bridge events and cursors
- pending and completed agent actions
- avatar catalog version and active model id
```

- [ ] **Step 4: Run the relevant tests and a smoke build to verify the inspector path**

Run: `node --test packages/agent-room-bridge/index.test.mjs packages/agent-room-bridge/mcp-server.test.mjs apps/one-to-one-agent-room/src/lib/app/session-controller.test.mjs`
Expected: PASS

Run: `npm run start:one-to-one-agent-room`
Expected: server starts and the diagnostics screen shows inspector sections

- [ ] **Step 5: Commit the inspector and docs**

```bash
git add apps/one-to-one-agent-room/src/index.html apps/one-to-one-agent-room/src/ui/dom.js apps/one-to-one-agent-room/src/ui/render.js apps/one-to-one-agent-room/src/lib/app/presenter.js apps/one-to-one-agent-room/src/styles.css README.md
git commit -m "feat: add room bridge inspector"
```
