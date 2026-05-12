# Agent Room Silent Artifacts and Historical Canvas Design

## Summary

Extend the one-to-one agent room so agent replies can emit silent, non-spoken artifacts that appear in call history and can be reopened later. The first release adds two artifact types:

- `historyText`: long raw text such as URLs, formulas, or machine-readable output that the agent knows but should not speak.
- `canvasEvent`: presentation-layer updates for images and diagrams, with reopenable historical versions.

This starts with approach 1: extend the current reply model and history rendering instead of building a separate presentation timeline.

## Goals

- Let the agent return long raw text without speaking it.
- Persist silent agent artifacts in call history.
- Let the agent show a canvas with images or diagrams.
- Preserve historical presentation versions so the user can reopen them from history.
- Support a mixed history strategy for canvas updates:
  - Major updates create a new history entry.
  - Minor updates stay grouped under the current presentation entry.

## Non-Goals

- User-authored drawing tools in phase 1.
- A general collaborative whiteboard.
- Replaying every canvas operation as a low-level event stream.
- Feeding artifact bodies back into future agent prompts.

## Current Constraints

The current app has a good visual shell for this feature, but the data flow is text-turn-centric:

- Typed input becomes a normal user turn and is sent to Codex.
- Prompt construction pulls recent `session.turns` back into the agent prompt.
- The history panel renders transcript turns only.
- The call stage already has an overlay-heavy layout and an existing dialog pattern that can be reused for a presentation popup.

This means raw artifact text must not be modeled as user turns or transcript text.

## Product Behavior

### Silent text artifacts

When the agent needs to surface raw text that should not be spoken, it emits a `historyText` artifact alongside the normal spoken reply.

Examples:

- A long URL
- A formula
- A shell command
- A block of machine-readable data

Behavior:

- The content appears in the call history as an agent artifact card.
- The content is not sent to TTS.
- The content is not shown in live spoken subtitles unless the agent also includes a separate spoken summary.
- The content is copyable.
- The content is not re-injected into future prompt history except, optionally, as a short label.

### Canvas artifacts

The agent can emit a `canvasEvent` artifact to update a presentation layer.

Phase 1 canvas content kinds:

- `image`
- `diagram`

Behavior:

- A major canvas update creates a new history entry with a saved presentation snapshot.
- A minor canvas update is attached to the latest major entry for the same presentation thread.
- Clicking a canvas history entry reopens the saved presentation state for that historical version.
- Inside the reopened viewer, the user can inspect the grouped minor revisions for that major version.

### Major versus minor updates

Major updates create a new history card.

Examples:

- Generate a new image
- Replace the current image
- Create a new diagram
- Redraw a diagram
- Commit a new annotated state that should stand on its own in history

Minor updates stay grouped under the current major card.

Examples:

- Zoom in
- Pan
- Focus on a region
- Add or move a temporary highlight
- Change the viewport without changing the underlying content

User-driven zooming in the viewer does not create history. Only agent-emitted canvas updates do.

## Data Model

### Reply contract extension

Extend `agentReply` with an optional `artifacts` array.

```json
{
  "spokenText": "Here is the chart.",
  "subtitle": "Here is the chart.",
  "mood": "focused",
  "animationSequence": [],
  "artifacts": [
    {
      "type": "historyText",
      "id": "artifact-text-1",
      "label": "Raw URL",
      "text": "https://example.com/very/long/path?...",
      "format": "text/plain",
      "copyable": true,
      "spoken": false
    },
    {
      "type": "canvasEvent",
      "id": "artifact-canvas-1",
      "presentationId": "pres-1",
      "revisionId": "rev-3",
      "entryMode": "major",
      "contentKind": "image",
      "contentPayload": {},
      "viewport": {},
      "highlights": [],
      "caption": "Reference image",
      "thumbnailPayload": {}
    }
  ]
}
```

### `historyText`

Required fields:

- `type`
- `id`
- `label`
- `text`

Optional fields:

- `format`
- `copyable`
- `spoken`

Rules:

- `spoken` must default to `false`.
- Empty text is invalid.
- The UI may truncate previews, but the full text must remain available on reopen or expand.

### `canvasEvent`

Required fields:

- `type`
- `id`
- `presentationId`
- `revisionId`
- `entryMode`
- `contentKind`
- `contentPayload`

Optional fields:

- `viewport`
- `highlights`
- `caption`
- `thumbnailPayload`
- `parentRevisionId`

Rules:

- `entryMode` is `major` or `minor`.
- `presentationId` identifies one presentation thread.
- `revisionId` uniquely identifies a saved revision.
- `contentPayload` stores a self-contained representation of the visual state needed to reopen that revision later.

## Persistence Strategy

Approach 1 remains turn-centric:

- Artifacts are emitted as part of agent replies.
- History is derived from the ordered sequence of turns and their attached artifacts.

To support historical reopen behavior cleanly, the runtime should also materialize a normalized presentation index in session state at load time or refresh time:

- presentation thread by `presentationId`
- ordered revisions by `revisionId`
- mapping from major entries to grouped minor revisions

This normalized index is a derived store, not a separate source of truth.

## Prompt Rules

Prompt history must remain transcript-centric.

Rules:

- Include normal human transcript text.
- Include normal agent spoken replies.
- Do not include raw `historyText.text`.
- Do not include raw canvas payloads.
- If helpful, the prompt formatter may include a short artifact label such as "Agent showed a diagram" or "Agent attached a raw URL", but not the full body.

This keeps prompts small and avoids polluting future reasoning with unreadable or overly long payloads the agent already produced.

## Capability Advertisement

The agent must learn this feature through the same contract surfaces it already uses for call behavior. Silent artifacts and canvas history should not rely on an out-of-band product description.

### Direct reply contract

Update the direct call reply contract so the prompt explicitly advertises `artifacts[]` as a first-class output channel.

The contract text should teach:

- `spokenText` is the speech output.
- `subtitle` is the user-facing subtitle for spoken output.
- `artifacts[]` is optional.
- `historyText` artifacts are visible in call history and must not be spoken.
- `canvasEvent` artifacts update the presentation layer and are persisted in history.
- `canvasEvent.entryMode` controls whether an update creates a new history entry or stays grouped under the current one.

This is the most important layer because it directly affects what the model believes it is allowed to return.

### Session metadata contract

Advertise the capability in the call session metadata alongside the existing Codex contract.

Suggested additions:

- include `artifacts` in the list of accepted turn reply fields
- add `silentArtifacts: true`
- add `canvasPresentation: true`
- add `canvasContentKinds: ['image', 'diagram']`
- add a short policy note that artifact bodies are history-visible and not spoken by default

This allows the runtime and future tooling to reason about the feature without parsing the full natural-language prompt.

### Server validation and persistence

The runtime must validate and persist artifact outputs as a real supported capability.

Rules:

- malformed artifacts are rejected or downgraded to unavailable-state history shells
- valid artifacts are stored in session state
- artifact ordering is preserved relative to the reply that emitted them

If the server silently drops artifacts, the agent will quickly learn not to rely on them.

### MCP and bridge parity

For the direct-call path, prompt-contract support is sufficient for phase 1.

For the bridge path, add the same capability later to:

- bridge bootstrap instructions
- tool descriptions
- tool input schema or a dedicated presentation action channel

This keeps phase 1 scoped while making the parity work explicit.

## UI Design

### History panel

Replace the transcript-only history list with a mixed history timeline that can render:

- human turn items
- agent spoken reply items
- `historyText` artifact cards
- canvas artifact cards

The existing history layout can be reused, but rendering becomes grouped and type-aware.

### History text card

Behavior:

- Show label, timestamp, and a short preview.
- Allow expand/collapse inline.
- Allow copy.

### Canvas history card

Behavior:

- Show label, timestamp, content type, and thumbnail if available.
- Show whether it is a major entry.
- If grouped minor revisions exist, show a count.
- Clicking opens the historical viewer.

### Presentation popup

Use a wide popup based on the existing dialog styling.

Targets:

- Width around `92vw`
- Large max width for desktop
- Panel surface opacity around `0.9`

Viewer responsibilities:

- Render image or diagram content
- Apply saved viewport state
- Render saved highlights
- Allow local zoom and pan for inspection
- Allow stepping through grouped minor revisions for the selected major entry

## API and Runtime Changes

Phase 1 needs additive changes in these areas:

- Reply schema parsing and validation
- Direct reply contract advertisement
- Session metadata capability advertisement
- Session runtime persistence for artifacts
- History rendering in the browser
- Popup presentation viewer

No separate presentation service is required in phase 1.

The runtime must preserve artifact ordering relative to the reply that emitted them.

## Error Handling

### Invalid artifact payload

If an artifact payload is malformed:

- Preserve the enclosing agent reply
- Preserve the history entry shell if enough metadata exists
- Show a recoverable unavailable state in the UI
- Log the validation failure for inspection

### Missing canvas payload on reopen

If a stored canvas entry cannot be rendered later:

- Keep the history card visible
- Open a fallback viewer state with an error message
- Do not silently delete the history entry

### Prompt safety

If prompt-formatting code encounters artifacts:

- Default to omission instead of inclusion
- Never include raw bodies unless a future design explicitly allows it

## Testing

Add tests for:

- reply artifact schema normalization
- history text suppression from TTS and live subtitles
- prompt-history exclusion for artifact bodies
- mixed history rendering
- major/minor canvas grouping
- reopening a historical major version
- stepping through attached minor revisions
- fallback viewer behavior for broken payloads

## Rollout Plan

### Phase 1

- Extend agent replies with `artifacts[]`
- Support `historyText`
- Support `canvasEvent` with saved image or diagram snapshots
- Render mixed history
- Reopen historical presentation versions in a popup

### Later phases

- Richer diagram authoring
- Better thumbnail generation
- More artifact types
- More advanced agent-driven presentation commands
- Potential move toward a dedicated presentation timeline if scope outgrows the turn-centric model

## Implementation Notes

- The current repository state already includes in-flight edits across the target app files, so implementation should be planned as an additive integration, not a clean-room rewrite.
- Keep phase 1 scoped to one durable unknown: silent artifact persistence plus historical presentation reopen behavior.

## Open Decisions Resolved in This Design

- Raw pasted text comes from the agent, not the user.
- Raw pasted text is history-visible but not spoken.
- Canvas history is persistent and reopenable.
- Canvas updates use a mixed strategy:
  - major updates create a new history item
  - minor updates stay grouped under the current item
