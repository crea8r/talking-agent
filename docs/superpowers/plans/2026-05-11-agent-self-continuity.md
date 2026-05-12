# Agent Self Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable `packages/agent-self` module that provides global app-level `standard` versus `continuity` behavior, persistent self settings, a hidden poem project, and short reserve packets that the room app can play before the main reply starts.

**Architecture:** Keep persistence and continuity logic in `packages/agent-self`, expose thin server endpoints in `apps/one-to-one-agent-room/server.mjs`, and keep the browser app limited to settings UI, turn lifecycle hooks, and reserve playback arbitration. The hidden poem project may steer journal updates but must never directly author canonical agent replies or actions.

**Tech Stack:** Node ESM modules, filesystem JSON/TXT persistence under `output/`, existing one-to-one room server/browser app, `node:test`

---

### Task 1: Add reusable agent-self package and storage contract

**Files:**
- Create: `packages/agent-self/index.mjs`
- Create: `packages/agent-self/index.test.mjs`
- Modify: `packages/README.md`

- [ ] Add storage-backed settings, journal, project, reserve generation, and turn-complete update APIs.
- [ ] Persist global settings separately from per-workspace continuity state.
- [ ] Save completed poems as `.txt` files and reset the hidden project after completion.

### Task 2: Expose agent-self through the room server

**Files:**
- Modify: `apps/one-to-one-agent-room/server.mjs`

- [ ] Initialize `packages/agent-self` once at server boot with an app-scoped output root.
- [ ] Add `GET/POST /api/agent-self/settings`.
- [ ] Add `POST /api/agent-self/reserve` for reserve packet generation.
- [ ] Add `POST /api/agent-self/turn-complete` for asynchronous journal/project updates.
- [ ] Add agent-self settings to `/api/runtime-config`.

### Task 3: Add browser settings state and UI

**Files:**
- Modify: `apps/one-to-one-agent-room/src/index.html`
- Modify: `apps/one-to-one-agent-room/src/ui/dom.js`
- Modify: `apps/one-to-one-agent-room/src/lib/app/store.js`
- Modify: `apps/one-to-one-agent-room/src/app.js`
- Modify: `apps/one-to-one-agent-room/src/styles.css`

- [ ] Add a minimal global settings panel for `standard|continuity`, name, pronouns, personality, interests, and self prompt.
- [ ] Load server settings into app state during boot.
- [ ] Save settings back to the server when edited.

### Task 4: Add reserve playback before main replies

**Files:**
- Modify: `apps/one-to-one-agent-room/src/lib/app/session-controller.js`
- Modify if needed: `apps/one-to-one-agent-room/lib/server/direct-session-runtime.mjs`

- [ ] Request reserve packets in parallel with the canonical turn request.
- [ ] Play at most one reserve packet before the main reply starts.
- [ ] Cancel reserve playback on interruption, call end, or when the canonical reply starts first.
- [ ] Keep the existing generic thinking prompt loop as fallback.

### Task 5: Verify with targeted tests

**Files:**
- Modify: `apps/one-to-one-agent-room/src/lib/app/session-controller.thinking-prompt.test.mjs`
- Create or modify focused tests as needed

- [ ] Add failing tests for package persistence, reserve generation, and poem completion.
- [ ] Add failing tests for browser reserve playback arbitration.
- [ ] Run the targeted tests and `node --check` for changed modules.
