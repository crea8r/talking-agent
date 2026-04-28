# Packages

Shared contracts, schemas, prompts, and utilities live here once at least two apps need them.

- `voice-layer-browser`: reusable browser voice loop for speech recognition, mic metering, turn lifecycle, and speech synthesis.
- `avatar-layer-browser`: reusable browser VRM avatar layer for stage lighting, model loading, gaze, emotes, gestures, and mouth cues.
- `avatar-speech-browser`: reusable browser speech driver that maps text to mouth cues and coordinates avatar animation with browser TTS.
- `agent-room-bridge`: reusable file-backed room session bridge plus stdio MCP server so external agents can claim turns and submit replies.
