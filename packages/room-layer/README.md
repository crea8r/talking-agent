# room-layer

Reusable LiveKit room primitives extracted from `meeting-link-probe`.

## Browser entry

- File: `client.mjs`
- Provides:
  - runtime config loading
  - local token mint requests
  - token claim decoding
  - room event normalization
  - room connect and disconnect helpers
  - audio playback start helper
  - SDK log forwarding

## Server entry

- File: `server.mjs`
- Provides:
  - environment-backed LiveKit defaults
  - token request validation
  - signed token creation
  - runtime config payload creation

## Non-goals

- Probe-specific UI
- Sample media publishing
- Avatar rendering
- Voice loop logic

Those remain app-level concerns until at least one more app needs the same code.
