# Agent Room MCP Tester Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone browser app that simulates the human side of a call, drives the real MCP server through a local harness, and shows raw event/action/debug payloads without LiveKit, 3D avatar rendering, or TTS playback.

**Architecture:** Add a new app under `apps/agent-room-mcp-tester` with its own bridge state file and a minimal Node server. Reuse `packages/agent-room-bridge/index.mjs` for call state and add a new `mcp-harness.mjs` helper that speaks JSON-RPC to the real stdio MCP server. The browser client stays intentionally small: human simulator, MCP console, and bridge inspector with auto/manual action acknowledgement.

**Tech Stack:** Node.js HTTP server, ES modules, browser Web Speech API, `node:test`, `packages/agent-room-bridge`, plain HTML/CSS/JS

---

## File Map

### Shared package work

- Create: `packages/agent-room-bridge/mcp-harness.mjs`
  - Spawn the MCP server child process
  - Send framed JSON-RPC requests
  - Track pending responses by id
  - Persist raw transcript entries for UI inspection
- Create: `packages/agent-room-bridge/mcp-harness.test.mjs`
  - Verify initialize/ping/tool flow against the real MCP server

### New tester app

- Create: `apps/agent-room-mcp-tester/package.json`
  - Standard app package entrypoint
- Create: `apps/agent-room-mcp-tester/server.mjs`
  - Static serving
  - Runtime config
  - Bridge session endpoints
  - MCP harness endpoints
- Create: `apps/agent-room-mcp-tester/src/index.html`
  - Three-pane debug UI
- Create: `apps/agent-room-mcp-tester/src/styles.css`
  - Layout and debug views
- Create: `apps/agent-room-mcp-tester/src/app.js`
  - Bootstrap
- Create: `apps/agent-room-mcp-tester/src/lib/http.js`
  - `fetchRuntimeConfig`, `fetchJson`, `postJson`
- Create: `apps/agent-room-mcp-tester/src/lib/store.js`
  - App state
- Create: `apps/agent-room-mcp-tester/src/lib/presenter.js`
  - DOM rendering
- Create: `apps/agent-room-mcp-tester/src/lib/events.js`
  - User interaction wiring
- Create: `apps/agent-room-mcp-tester/src/lib/controller.js`
  - Human simulator flow
  - MCP request flow
  - Auto-ack/manual-ack flow
- Create: `apps/agent-room-mcp-tester/src/lib/format.js`
  - JSON formatting helpers
- Create: `apps/agent-room-mcp-tester/src/lib/store.test.mjs`
  - Store defaults and transcript helpers
- Create: `apps/agent-room-mcp-tester/src/lib/controller.test.mjs`
  - Human send flow
  - Auto/manual ack flow

### Documentation

- Modify: `README.md`
  - Add the new tester app and its purpose

## Task 1: Add the shared MCP harness

**Files:**
- Create: `packages/agent-room-bridge/mcp-harness.mjs`
- Create: `packages/agent-room-bridge/mcp-harness.test.mjs`
- Test: `packages/agent-room-bridge/mcp-harness.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { createAgentRoomBridgeStore } from './index.mjs';
import { createMcpHarness } from './mcp-harness.mjs';

test('mcp harness can initialize and call tools against the real server', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-room-mcp-harness-'));
  const stateFilePath = path.join(tempDir, 'bridge.json');
  const store = createAgentRoomBridgeStore({ stateFilePath });
  const session = await store.createSession({
    roomName: 'tester-call',
    livekitUrl: 'debug://local',
    humanIdentity: 'tester-human',
    humanName: 'Tester Human',
    title: 'MCP Tester',
    metadata: {},
  });
  await store.setCallState({ sessionId: session.id, state: 'live' });

  const harness = createMcpHarness({ stateFilePath });
  await harness.connect();

  const init = await harness.request({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {},
  });
  assert.equal(init.result.serverInfo.name, 'talking-agent-room-bridge');

  const tools = await harness.request({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });
  assert.ok(tools.result.tools.find((tool) => tool.name === 'join_call'));

  await harness.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/agent-room-bridge/mcp-harness.test.mjs`

Expected: FAIL with `Cannot find module './mcp-harness.mjs'` or missing export errors.

- [ ] **Step 3: Write minimal implementation**

```js
import { spawn } from 'node:child_process';
import path from 'node:path';

export function createMcpHarness({ stateFilePath, cwd = process.cwd() } = {}) {
  let child = null;
  let nextId = 1;
  const transcript = [];
  const pending = new Map();

  function connect() {
    child = spawn(process.execPath, [path.join(cwd, 'packages/agent-room-bridge/mcp-server.mjs')], {
      env: {
        ...process.env,
        AGENT_ROOM_BRIDGE_STATE_PATH: stateFilePath,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  async function request(message) {
    const id = message.id ?? nextId++;
    const payload = { ...message, id };
    transcript.push({ direction: 'request', payload });
    // frame body, write to stdin, and resolve when matching id returns
  }

  return {
    connect,
    request,
    getTranscript() {
      return transcript.slice();
    },
    async close() {
      child?.kill();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/agent-room-bridge/mcp-harness.test.mjs`

Expected: PASS for initialize/tools flow and transcript capture.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-room-bridge/mcp-harness.mjs packages/agent-room-bridge/mcp-harness.test.mjs
git commit -m "feat: add MCP harness for local tester app"
```

## Task 2: Scaffold the standalone tester app server

**Files:**
- Create: `apps/agent-room-mcp-tester/package.json`
- Create: `apps/agent-room-mcp-tester/server.mjs`
- Create: `apps/agent-room-mcp-tester/src/index.html`
- Create: `apps/agent-room-mcp-tester/src/styles.css`
- Test: `apps/agent-room-mcp-tester/server.mjs` via smoke check

- [ ] **Step 1: Write the app package and static shell**

```json
{
  "name": "@talking-agent/agent-room-mcp-tester",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node server.mjs",
    "start": "node server.mjs"
  }
}
```

```html
<main class="shell">
  <header class="topbar">
    <h1>Agent Room MCP Tester</h1>
  </header>
  <section class="grid">
    <article id="human-pane"></article>
    <article id="mcp-pane"></article>
    <article id="inspector-pane"></article>
  </section>
  <script type="module" src="/app.js"></script>
</main>
```

- [ ] **Step 2: Add the server routes**

```js
const BRIDGE_STATE_PATH = path.join(REPO_ROOT, 'output', 'agent-room-mcp-tester-bridge.json');
const bridgeStore = createAgentRoomBridgeStore({ stateFilePath: BRIDGE_STATE_PATH });
const mcpHarness = createMcpHarness({ stateFilePath: BRIDGE_STATE_PATH, cwd: REPO_ROOT });

if (req.method === 'GET' && url.pathname === '/api/runtime-config') {
  sendJson(res, 200, {
    ok: true,
    appName: 'agent-room-mcp-tester',
    port: PORT,
    bridge: {
      stateFilePath: BRIDGE_STATE_PATH,
      tools: ['join_call', 'wait_for_events', 'publish_actions', 'leave_call', 'get_recent_turns'],
    },
    mcp: {
      command: `AGENT_ROOM_BRIDGE_STATE_PATH="${BRIDGE_STATE_PATH}" node "${MCP_SERVER_PATH}"`,
    },
  });
  return;
}
```

- [ ] **Step 3: Add bridge mutation routes**

```js
if (req.method === 'POST' && url.pathname === '/api/bridge/sessions') {
  const body = await readJsonBody(req);
  const session = await bridgeStore.createSession(body);
  await bridgeStore.setCallState({ sessionId: session.id, state: 'live' });
  await sendBridgePayload(res, session.id);
  return;
}

if (req.method === 'POST' && utteranceFinalMatch) {
  await bridgeStore.appendUserUtteranceFinal({
    sessionId,
    utteranceId: body.utteranceId,
    text: body.text,
    source: body.source,
    humanIdentity: body.humanIdentity,
    humanName: body.humanName,
  });
  await sendBridgePayload(res, sessionId);
  return;
}
```

- [ ] **Step 4: Add MCP harness routes**

```js
if (req.method === 'POST' && url.pathname === '/api/mcp/connect') {
  await mcpHarness.connect();
  sendJson(res, 200, { ok: true, state: await mcpHarness.getState() });
  return;
}

if (req.method === 'POST' && url.pathname === '/api/mcp/request') {
  const body = await readJsonBody(req);
  const response = await mcpHarness.request(body);
  sendJson(res, 200, { ok: true, response });
  return;
}
```

- [ ] **Step 5: Smoke the server**

Run:

```bash
PORT=4386 npm run start -w @talking-agent/agent-room-mcp-tester
curl -s http://127.0.0.1:4386/api/runtime-config
curl -i -s http://127.0.0.1:4386/
```

Expected:

- server boots on `4386`
- runtime config returns tester metadata
- `/` serves the static shell

- [ ] **Step 6: Commit**

```bash
git add apps/agent-room-mcp-tester/package.json apps/agent-room-mcp-tester/server.mjs apps/agent-room-mcp-tester/src/index.html apps/agent-room-mcp-tester/src/styles.css
git commit -m "feat: scaffold agent room MCP tester app"
```

## Task 3: Build the human simulator client flow

**Files:**
- Create: `apps/agent-room-mcp-tester/src/app.js`
- Create: `apps/agent-room-mcp-tester/src/lib/http.js`
- Create: `apps/agent-room-mcp-tester/src/lib/store.js`
- Create: `apps/agent-room-mcp-tester/src/lib/presenter.js`
- Create: `apps/agent-room-mcp-tester/src/lib/events.js`
- Create: `apps/agent-room-mcp-tester/src/lib/controller.js`
- Create: `apps/agent-room-mcp-tester/src/lib/format.js`
- Create: `apps/agent-room-mcp-tester/src/lib/store.test.mjs`

- [ ] **Step 1: Write the failing store test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppStore } from './store.js';

test('store tracks bridge events and pending actions separately', () => {
  const store = createAppStore();
  store.pushHumanLog({ kind: 'partial', text: 'hello' });
  store.pushMcpLog({ direction: 'request', payload: { method: 'tools/list' } });

  assert.equal(store.state.humanLog.length, 1);
  assert.equal(store.state.mcpTranscript.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/agent-room-mcp-tester/src/lib/store.test.mjs`

Expected: FAIL with missing `createAppStore`.

- [ ] **Step 3: Implement the store and HTTP helpers**

```js
export function createAppStore() {
  return {
    state: {
      runtimeConfig: null,
      session: null,
      interimTranscript: '',
      humanLog: [],
      mcpTranscript: [],
      pendingActions: [],
      autoAck: true,
    },
    pushHumanLog(entry) {
      this.state.humanLog = [...this.state.humanLog, entry];
    },
    pushMcpLog(entry) {
      this.state.mcpTranscript = [...this.state.mcpTranscript, entry];
    },
  };
}
```

- [ ] **Step 4: Implement the controller for call creation and utterance flow**

```js
async function createCall() {
  const payload = await postJson('/api/bridge/sessions', {
    roomName: 'agent-room-mcp-tester',
    livekitUrl: 'debug://local',
    humanIdentity: state.identity,
    humanName: state.humanName,
    title: state.callTitle,
    metadata: {},
  });
  state.session = payload.session;
}

async function sendTypedTurn(text) {
  const utteranceId = crypto.randomUUID();
  await postJson(`/api/bridge/sessions/${state.session.id}/utterances/final`, {
    utteranceId,
    text,
    source: 'typed',
    humanIdentity: state.identity,
    humanName: state.humanName,
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test apps/agent-room-mcp-tester/src/lib/store.test.mjs`

Expected: PASS and the UI shell can create a call and send a typed turn.

- [ ] **Step 6: Commit**

```bash
git add apps/agent-room-mcp-tester/src/app.js apps/agent-room-mcp-tester/src/lib/http.js apps/agent-room-mcp-tester/src/lib/store.js apps/agent-room-mcp-tester/src/lib/presenter.js apps/agent-room-mcp-tester/src/lib/events.js apps/agent-room-mcp-tester/src/lib/controller.js apps/agent-room-mcp-tester/src/lib/format.js apps/agent-room-mcp-tester/src/lib/store.test.mjs
git commit -m "feat: add tester human simulator flow"
```

## Task 4: Add the MCP console and bridge inspector

**Files:**
- Modify: `apps/agent-room-mcp-tester/src/index.html`
- Modify: `apps/agent-room-mcp-tester/src/styles.css`
- Modify: `apps/agent-room-mcp-tester/src/lib/controller.js`
- Modify: `apps/agent-room-mcp-tester/src/lib/presenter.js`
- Create: `apps/agent-room-mcp-tester/src/lib/controller.test.mjs`

- [ ] **Step 1: Write the failing controller test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from './controller.js';

test('auto ack finishes speech actions and completes animation actions', async () => {
  const posts = [];
  const controller = createController({
    state: {
      session: { id: 'session-1' },
      autoAck: true,
      pendingActions: [
        { actionId: 'a1', type: 'anim' },
        { actionId: 'a2', type: 'speech', text: 'Hello' },
      ],
    },
    postJson: async (url) => {
      posts.push(url);
      return { ok: true };
    },
  });

  await controller.consumePendingActions();

  assert.deepEqual(posts, [
    '/api/bridge/sessions/session-1/actions/a1/completed',
    '/api/bridge/sessions/session-1/actions/a2/started',
    '/api/bridge/sessions/session-1/actions/a2/finished',
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/agent-room-mcp-tester/src/lib/controller.test.mjs`

Expected: FAIL because `consumePendingActions` is missing or incomplete.

- [ ] **Step 3: Implement the MCP console request flow**

```js
async function sendMcpRequest(message) {
  const payload = await postJson('/api/mcp/request', message);
  state.mcpTranscript = payload.transcript || state.mcpTranscript;
  return payload.response;
}

async function joinCall(agentId) {
  return sendMcpRequest({
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: 'join_call',
      arguments: { agentId },
    },
  });
}
```

- [ ] **Step 4: Implement auto/manual action acknowledgement**

```js
async function consumePendingActions() {
  for (const action of state.pendingActions) {
    if (!state.autoAck) {
      return;
    }
    if (action.type === 'anim') {
      await postJson(`/api/bridge/sessions/${state.session.id}/actions/${action.actionId}/completed`, {});
      continue;
    }
    await postJson(`/api/bridge/sessions/${state.session.id}/actions/${action.actionId}/started`, {});
    await postJson(`/api/bridge/sessions/${state.session.id}/actions/${action.actionId}/finished`, {});
  }
}
```

- [ ] **Step 5: Render the three debug panes**

```js
dom.humanLog.textContent = formatJson(state.humanLog);
dom.mcpTranscript.textContent = formatJson(state.mcpTranscript);
dom.bridgeInspector.textContent = formatJson({
  session: state.session,
  pendingActions: state.pendingActions,
  recentEvents: state.inspector?.recentEvents || [],
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test apps/agent-room-mcp-tester/src/lib/controller.test.mjs`

Expected: PASS for auto-ack flow. Manual mode should leave pending actions untouched until clicked.

- [ ] **Step 7: Commit**

```bash
git add apps/agent-room-mcp-tester/src/index.html apps/agent-room-mcp-tester/src/styles.css apps/agent-room-mcp-tester/src/lib/controller.js apps/agent-room-mcp-tester/src/lib/presenter.js apps/agent-room-mcp-tester/src/lib/controller.test.mjs
git commit -m "feat: add tester MCP console and bridge inspector"
```

## Task 5: Final verification and docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

```md
## Agent Room MCP Tester

Run:

```bash
PORT=4386 npm run start -w @talking-agent/agent-room-mcp-tester
```

This app provides:

- human speech/typed turn simulation
- local MCP request console
- bridge inspector with auto/manual action acknowledgement
```

- [ ] **Step 2: Run the focused test suite**

Run:

```bash
node --test packages/agent-room-bridge/mcp-harness.test.mjs apps/agent-room-mcp-tester/src/lib/store.test.mjs apps/agent-room-mcp-tester/src/lib/controller.test.mjs
```

Expected: PASS

- [ ] **Step 3: Run the live smoke test**

Run:

```bash
PORT=4386 npm run start -w @talking-agent/agent-room-mcp-tester
curl -s http://127.0.0.1:4386/api/runtime-config
curl -s http://127.0.0.1:4386/api/mcp/state
```

Expected:

- runtime config reports the dedicated bridge state file
- MCP state endpoint returns disconnected before `connect` and connected after `connect`

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document agent room MCP tester"
```

## Self-Review Notes

- Spec coverage:
  - standalone app: Tasks 2-4
  - real MCP harness: Task 1
  - human simulator with mic and typed input: Task 3
  - raw transcript/debug panes: Task 4
  - auto/manual action acknowledgement: Task 4
  - verification and docs: Task 5
- Placeholder scan:
  - no `TODO` or `TBD` markers remain
- Type consistency:
  - `autoAck`, `pendingActions`, `mcpTranscript`, `utteranceId`, and `actionId` use the same names across tasks

## Execution Handoff

Inline execution is the correct path here because the user explicitly asked to implement immediately, and subagent delegation is not authorized in this session.
