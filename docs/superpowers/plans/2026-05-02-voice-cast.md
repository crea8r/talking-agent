# Voice Cast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `apps/voice-cast` spike app that casts prompt assets from text alone and tests the real `CosyVoice3` production path with uploaded prompt WAVs.

**Architecture:** Add a new small Node-served browser app under `apps/voice-cast`. The server owns local prompt-asset persistence and proxies to configured text-only and `CosyVoice3` TTS backends through a thin adapter layer. The browser stays small: two tabs, mode-aware forms, audio preview, and prompt-asset save flow.

**Tech Stack:** Node.js HTTP server, ES modules, browser HTML/CSS/JS, multipart `Request.formData()`, `node:test`

---

## File Map

### New app

- Create: `apps/voice-cast/package.json`
- Create: `apps/voice-cast/server.mjs`
- Create: `apps/voice-cast/lib/server.mjs`
- Create: `apps/voice-cast/lib/tts-client.mjs`
- Create: `apps/voice-cast/lib/prompt-assets.mjs`
- Create: `apps/voice-cast/lib/prompt-assets.test.mjs`
- Create: `apps/voice-cast/lib/tts-client.test.mjs`
- Create: `apps/voice-cast/lib/server.test.mjs`
- Create: `apps/voice-cast/src/index.html`
- Create: `apps/voice-cast/src/styles.css`
- Create: `apps/voice-cast/src/app.js`
- Create: `apps/voice-cast/src/lib/http.js`
- Create: `apps/voice-cast/src/lib/store.js`
- Create: `apps/voice-cast/src/lib/render.js`
- Create: `apps/voice-cast/src/lib/events.js`
- Create: `apps/voice-cast/src/lib/format.js`
- Create: `apps/voice-cast/src/lib/events.test.mjs`
- Create: `apps/voice-cast/src/lib/render.test.mjs`

### Workspace wiring

- Modify: `package.json`

## Task 1: Add prompt asset persistence helpers

**Files:**
- Create: `apps/voice-cast/lib/prompt-assets.mjs`
- Create: `apps/voice-cast/lib/prompt-assets.test.mjs`

- [ ] Write failing tests for saving a WAV plus JSON sidecar and for resolving transcript metadata from an uploaded WAV filename.
- [ ] Run: `node --test apps/voice-cast/lib/prompt-assets.test.mjs`
- [ ] Implement `createPromptAssetStore({ rootDir })` with `savePromptAsset(...)`, `findAssetMetadataByFileName(...)`, and filename sanitization.
- [ ] Re-run: `node --test apps/voice-cast/lib/prompt-assets.test.mjs`

## Task 2: Add TTS client normalization

**Files:**
- Create: `apps/voice-cast/lib/tts-client.mjs`
- Create: `apps/voice-cast/lib/tts-client.test.mjs`

- [ ] Write failing tests for:
  - speaker list normalization from string/object responses
  - audio generation normalization from JSON `audioBase64`
  - audio generation normalization from raw `audio/wav`
  - clear error when a backend base URL is missing
- [ ] Run: `node --test apps/voice-cast/lib/tts-client.test.mjs`
- [ ] Implement `createTtsClient({ fetchImpl, textOnlyBaseUrl, cv3BaseUrl })`.
- [ ] Re-run: `node --test apps/voice-cast/lib/tts-client.test.mjs`

## Task 3: Add the Voice Cast server

**Files:**
- Create: `apps/voice-cast/lib/server.mjs`
- Create: `apps/voice-cast/server.mjs`
- Create: `apps/voice-cast/lib/server.test.mjs`
- Modify: `package.json`

- [ ] Write failing tests for:
  - `GET /api/runtime-config`
  - `GET /api/casting/speakers`
  - `POST /api/prompt-assets/save`
  - `POST /api/production/generate` requiring transcript for `zero_shot` unless sidecar metadata exists
- [ ] Run: `node --test apps/voice-cast/lib/server.test.mjs`
- [ ] Implement `createVoiceCastServer(...)` and a thin `server.mjs` bootstrap entrypoint.
- [ ] Add root scripts `dev:voice-cast` and `start:voice-cast`.
- [ ] Re-run: `node --test apps/voice-cast/lib/server.test.mjs`

## Task 4: Build the browser UI shell

**Files:**
- Create: `apps/voice-cast/package.json`
- Create: `apps/voice-cast/src/index.html`
- Create: `apps/voice-cast/src/styles.css`
- Create: `apps/voice-cast/src/app.js`
- Create: `apps/voice-cast/src/lib/http.js`
- Create: `apps/voice-cast/src/lib/store.js`
- Create: `apps/voice-cast/src/lib/render.js`
- Create: `apps/voice-cast/src/lib/format.js`
- Create: `apps/voice-cast/src/lib/render.test.mjs`

- [ ] Write failing render tests for:
  - `zero_shot` hides instruct input and shows transcript input
  - `instruct2` shows instruct input and hides transcript input
  - result card stays hidden until generation output exists
- [ ] Run: `node --test apps/voice-cast/src/lib/render.test.mjs`
- [ ] Implement the two-tab shell and mode-aware rendering helpers.
- [ ] Re-run: `node --test apps/voice-cast/src/lib/render.test.mjs`

## Task 5: Wire browser events and request flow

**Files:**
- Create: `apps/voice-cast/src/lib/events.js`
- Create: `apps/voice-cast/src/lib/events.test.mjs`
- Modify: `apps/voice-cast/src/app.js`

- [ ] Write failing event tests for:
  - switching tabs updates state
  - switching mode updates conditional field visibility
  - clicking `Generate Prompt Voice` posts the casting request
  - clicking `Save as Prompt WAV` posts the prompt-asset save request
  - clicking `Generate Production Voice` posts multipart form data
- [ ] Run: `node --test apps/voice-cast/src/lib/events.test.mjs`
- [ ] Implement event bindings and async request flow with inline status/error updates.
- [ ] Re-run: `node --test apps/voice-cast/src/lib/events.test.mjs`

## Task 6: Verify end-to-end behavior

**Files:**
- Modify as needed based on verification findings

- [ ] Run focused tests:
  - `node --test apps/voice-cast/lib/prompt-assets.test.mjs apps/voice-cast/lib/tts-client.test.mjs apps/voice-cast/lib/server.test.mjs apps/voice-cast/src/lib/render.test.mjs apps/voice-cast/src/lib/events.test.mjs`
- [ ] Start the app with `npm run start:voice-cast` and verify `/healthz` and `/api/runtime-config`.
- [ ] Fix any issues found during focused verification.
