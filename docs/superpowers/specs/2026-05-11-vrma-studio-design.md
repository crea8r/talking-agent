# VRMA Studio Design

Date: 2026-05-11

## Summary

Build a new browser-first spike app, `apps/vrma-studio`, for creating and editing real `.vrma` files with a desktop-style editor UI. The app loads a `.vrm` avatar and either creates a new single-clip animation or opens an existing single-clip `.vrma` for editing. The editor authors humanoid body motion only in v1 while preserving any existing expression and look-at data unchanged on save.

The spike should feel like a small DCC tool rather than a web dashboard:

- menu bar with file commands
- large 3D viewport for character posing
- right-side inspector for selected controls and key metadata
- bottom timeline using a dope sheet plus a compact selected-track detail band

The editor is browser-first for speed and repo fit. Native desktop shell packaging is explicitly out of scope for v1.

## Goals

- Create a new animation from a loaded `.vrm`.
- Open an existing `.vrma` and edit supported body tracks.
- Save a valid single-clip `.vrma`.
- Preserve existing expression and look-at payload if present.
- Provide a desktop-style pose-and-key workflow with playback preview.
- Support IK-based posing for hands, feet, head, hips, and elbow/knee pole targets.

## Non-Goals

- Expression authoring.
- Look-at authoring.
- Multi-clip or take management in one file.
- Full curve editor in v1.
- Native desktop shell packaging.
- General retargeting workflows beyond standard VRM humanoid mapping.

## Product Scope

### Supported file workflows

- `File > New`
  Load a `.vrm`, create a new empty single-clip animation, and initialize clip timing defaults.
- `File > Open VRM`
  Load or replace the current avatar with unsaved-change protection.
- `File > Open VRMA`
  Load an existing single-clip `.vrma`. If a `.vrm` is already loaded, attach it for immediate preview and editing. If not, allow the clip to load but require a `.vrm` before viewport editing.
- `File > Save`
  Save back to the current `.vrma` target when available.
- `File > Save As`
  Write a new `.vrma` file.

### Supported animation authoring

- Humanoid bone rotation tracks.
- `hips` translation and rotation.
- Single clip only.
- Time stored in seconds with a 30 FPS editor grid by default.
- Hybrid keying model:
  - auto-key toggle
  - manual add key
  - scrubbing and preview playback

### Preserved but not editable

- Expression tracks.
- Look-at data.
- Unknown extension payload we can safely round-trip unchanged.

## Architecture

The spike consists of one new app and one new shared package.

### `apps/vrma-studio`

Owns:

- browser-based editor shell
- editor state and commands
- viewport rendering and rig interaction
- timeline, selection, playback, and undo/redo behavior
- file open/save user flows

### `packages/vrma-core`

Owns:

- `.vrma` GLB parsing
- normalized editable clip model
- preservation of unsupported sections
- `.vrma` serialization back to valid GLB output

This boundary is deliberate. The app should not mutate raw glTF JSON directly. It should edit a normalized clip model and delegate serialization to `vrma-core`.

## File Model

`packages/vrma-core` should expose a model shaped around the actual v1 editing scope rather than raw loader structures.

### `VrmaDocument`

Represents one parsed `.vrma` file:

- original asset metadata
- original single animation clip payload
- humanoid mapping metadata
- preserved unsupported payload
- unknown extension payload that can be round-tripped safely

### `EditableClip`

Represents the editable authoring surface for one clip:

- clip name
- duration in seconds
- frame grid metadata for UI display
- humanoid rotation tracks keyed by VRM human bone name, including `hips` rotation
- `hips.translation` track
- interpolation metadata

### Track rules

- `hips` may contain translation and rotation.
- Other supported humanoid bones contain rotation only.
- No scale tracks in v1.
- No direct eye-bone authoring.
- No expression or look-at editing in v1.

### Preservation rules

If a source `.vrma` contains expression or look-at data:

- parse and store it
- show in the UI as preserved but not editable
- write it back unchanged on save

If the file contains unsupported structures that cannot be preserved safely, saving must be blocked with a precise error.

## UI Design

The interface should feel like a desktop animation editor, not a web app. Use panel structure, chrome, density, and control affordances that match a lightweight DCC tool.

### Layout

- top menu bar
- left tool rail
- center 3D viewport
- right inspector
- bottom timeline strip
- bottom status bar

### Chosen timeline layout

Use the validated `Option B` layout:

- a compact selected-track detail band above the dope sheet
- a track list and keyframe area below
- no full curve editor in v1

This gives the spike a serious editor feel without spending v1 on curve tooling.

### Menu structure

- `File`
  - New
  - Open VRM
  - Open VRMA
  - Save
  - Save As
- `Edit`
  - Undo
  - Redo
  - Delete Key
  - Duplicate Key
- `View`
  - Full Mesh
  - Skeleton Overlay
  - Bones Only
  - Camera Snap Toggle
- `Playback`
  - Play
  - Pause
  - Stop
  - Step Frame Forward
  - Step Frame Back
- `Help`
  - Supported VRMA Scope

## Viewport Behavior

The viewport is the main interaction surface for posing.

### Camera

- orbit around the character
- optional 15-degree snap orbit behavior
- stable focus around the character root

### Display modes

- full mesh
- skeleton overlay
- bones and joints only

### Selection and manipulation

- selectable bones and effectors
- visible hover and active selection feedback
- persistent desktop-style gizmos and handles
- clear active mode state in toolbar and status bar

### IK controls

Direct effectors:

- left hand
- right hand
- left foot
- right foot
- head
- hips

Pole targets:

- left elbow
- right elbow
- left knee
- right knee

IK is an authoring tool only. Solver metadata is not written to the `.vrma` file. The saved output is the resolved humanoid bone motion plus hips translation.

## Timeline And Keyframing

### Timeline model

- single clip only
- time stored in seconds
- 30 FPS grid by default for editor display
- dope-sheet first workflow

### Keying model

Hybrid keying:

- auto-key off:
  pose changes preview live but do not write keys until the user inserts them
- auto-key on:
  the first edit at the current time creates or updates keys for the affected scope
- manual add key:
  writes keys at the current time for the selected scope

### Key scope

The UI should make scope explicit:

- selected control only
- selected chain
- whole current pose

Default manual key behavior should target the selected control or affected IK chain, not the whole body.

### Key actions

- add key
- move key
- delete key
- copy/paste key
- duplicate pose to another time

## Data Flow

The source of truth is editor state plus the editable clip model, not the viewport scene.

1. User input updates editor commands and selection state.
2. Editor state updates the editable clip model or temporary pose state.
3. Viewport pose is derived from current editor state.
4. Timeline reflects the clip model.
5. Save serializes through `packages/vrma-core`.

This avoids drift between what the viewport shows, what the timeline stores, and what the file serializer writes.

## Error Handling

### Import errors

- reject invalid or unreadable `.vrma` files with a concrete reason
- reject unsupported multi-clip files in v1
- report missing VRM requirements for viewport editing

### Preservation warnings

When a file contains preserved but non-editable payload:

- show `Expressions preserved, not editable in v1`
- show `Look-at preserved, not editable in v1`

### Save blocking

If unsupported structures cannot be round-tripped safely:

- block save
- show the exact reason
- do not silently strip data

### Dirty-state protection

Prompt before:

- replacing the current VRM
- opening another VRMA
- starting a new clip
- closing or resetting the editor surface

## Testing Strategy

### `packages/vrma-core`

- parse known `.vrma` fixtures
- verify supported single-clip loading
- verify humanoid track edits serialize correctly
- verify expression payload is preserved unchanged
- verify look-at payload is preserved unchanged
- verify unsupported-save blocking paths

### `apps/vrma-studio`

- store tests for selection, key insertion, and auto-key behavior
- unit tests for command reducers and dirty-state logic
- interaction tests for timeline editing commands
- browser smoke test for load, pose, key, preview, and save

### Manual verification

- load a bundled `.vrm`
- create a new clip and pose with IK
- save and reopen the result
- open an existing `.vrma`, edit supported tracks, save, and reopen
- verify preserved expression/look-at payload survives when present

## Risks And Trade-Offs

- IK with hips and pole targets is the main complexity driver in v1.
- Browser-first delivery accelerates the spike but means native menus and file affordances are simulated rather than truly desktop-native.
- Preserving unsupported payload is required for product credibility, but it constrains serializer design and test depth.
- Avoiding a curve editor keeps scope under control and aligns with the spike goal: validate real VRMA authoring, not build a full animation suite.

## Recommended Execution Order

1. Build `packages/vrma-core` parser, editable clip model, and serializer.
2. Stand up `apps/vrma-studio` shell with menu, viewport, inspector, timeline skeleton, and file commands.
3. Reuse existing VRM preview/runtime pieces where useful, but keep them outside the file model package.
4. Add timeline editing and hybrid key insertion.
5. Add IK effectors and pole targets.
6. Finish save/load verification with preserved unsupported payload.

## Acceptance Criteria

- A user can load a `.vrm`, create a new animation, pose the avatar, key the motion, preview it, and save a valid single-clip `.vrma`.
- A user can open an existing single-clip `.vrma`, edit supported humanoid motion, and save it back.
- Existing expression and look-at payload remain intact after save when present.
- The UI reads as a desktop-style editor with a large viewport and a usable timeline, not as a generic web control panel.
