import { NEUTRAL_SAMPLE_LINES } from './neutral-sample-lines.js';

export function createVoiceCastState() {
  return {
    runtimeConfig: null,
    activeTab: 'casting',
    casting: {
      model: 'CosyVoice-300M-Instruct',
      speakers: [],
      speakersLoading: true,
      backendHealth: {
        running: null,
        detail: '',
      },
      presetSpeaker: '',
      sampleLineIndex: 0,
      speed: '1.0',
      characterPrompt: '',
      instructText: '',
      promptText: NEUTRAL_SAMPLE_LINES[0] || '',
      loading: false,
      result: null,
      error: '',
      saveMessage: '',
    },
    production: {
      speakers: [],
      speakersLoading: true,
      backendHealth: {
        running: null,
        detail: '',
      },
      selectedSpeakerId: '',
      selectedReferenceFile: null,
      profile: null,
      history: [],
      latestTurn: null,
      transcript: '',
      setupOpen: true,
      sttSupported: true,
      listenerEnabled: false,
      listening: false,
      replyPlaying: false,
      savingProfile: false,
      submittingTurn: false,
      error: '',
      saveMessage: '',
    },
  };
}
