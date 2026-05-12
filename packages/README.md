# Packages

Shared contracts, schemas, prompts, and utilities live here once at least two apps need them.

- `voice-layer-browser`: reusable browser voice loop for speech recognition, mic metering, turn lifecycle, and speech synthesis.
- `avatar-layer-browser`: reusable browser VRM avatar layer for stage lighting, model loading, gaze, emotes, gestures, and mouth cues.
- `avatar-speech-browser`: reusable browser speech driver that maps text to mouth cues and coordinates avatar animation with browser audio playback.
- `production-voice`: reusable browser/server helpers for production-voice profile storage, synthesis requests, and playback.
- `codex-exec`: reusable isolated `codex exec` launcher with per-session Codex homes and resume support.
- `call-link`: reusable linked-call creation service plus streamable HTTP MCP handler for host integrations like Codex `call me`.
- `agent-self`: reusable continuity package for persistent self settings, hidden poem projects, reserve packet generation, and private history artifacts.
- `agent-room-bridge`: older file-backed room session bridge plus stdio MCP server from the earlier MCP-mediated spike architecture.
