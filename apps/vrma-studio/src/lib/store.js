function createTrack(valueType) {
  return {
    interpolation: 'LINEAR',
    times: [],
    values: [],
    valueType,
  };
}

function upsertTrackSample(track, time, value) {
  const existingIndex = track.times.findIndex((candidate) => candidate === time);

  if (existingIndex >= 0) {
    track.values.splice(existingIndex * value.length, value.length, ...value);
    return;
  }

  track.times.push(time);
  track.values.push(...value);
}

function upsertKeyframe(clip, { time, rotations = {}, translations = {} }) {
  Object.entries(rotations).forEach(([boneName, value]) => {
    if (!clip.rotationTracks.has(boneName)) {
      clip.rotationTracks.set(boneName, createTrack('rotation'));
    }

    upsertTrackSample(clip.rotationTracks.get(boneName), time, value);
  });

  Object.entries(translations).forEach(([boneName, value]) => {
    if (!clip.translationTracks.has(boneName)) {
      clip.translationTracks.set(boneName, createTrack('translation'));
    }

    upsertTrackSample(clip.translationTracks.get(boneName), time, value);
  });

  clip.duration = Math.max(clip.duration || 0, time);
}

export function createEditorStore({ createEmptyDocument } = {}) {
  const state = {
    document: null,
    dirty: false,
    selection: null,
    autoKey: false,
    timeline: {
      currentTime: 0,
      fps: 30,
    },
  };

  return {
    getState() {
      return state;
    },
    createEmptyClip({ clipName, humanoidSkeleton }) {
      if (typeof createEmptyDocument !== 'function') {
        throw new Error('createEditorStore requires a createEmptyDocument dependency.');
      }

      state.document = createEmptyDocument({
        clipName,
        humanoidSkeleton,
      });
      state.dirty = true;
      state.timeline.currentTime = 0;
    },
    loadDocument(document) {
      state.document = document;
      state.dirty = false;
      state.timeline.currentTime = 0;
    },
    setAutoKey(value) {
      state.autoKey = Boolean(value);
    },
    setCurrentTime(time) {
      state.timeline.currentTime = Math.max(0, Number.isFinite(time) ? time : 0);
    },
    selectControl(selection) {
      state.selection = selection;
    },
    applyPoseAtTime({ time, scope, rotations = {}, translations = {} }) {
      if (!state.document) {
        throw new Error('Cannot apply pose without a loaded document.');
      }

      state.timeline.currentTime = time;

      if (!state.autoKey) {
        state.selection = state.selection ? { ...state.selection, pendingScope: scope } : { pendingScope: scope };
        return;
      }

      upsertKeyframe(state.document.clip, {
        time,
        rotations,
        translations,
      });
      state.dirty = true;
    },
  };
}
