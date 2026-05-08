import {
  isAcceptedVoiceSampleFile,
  VOICE_SAMPLE_REQUIREMENT,
} from './voice-sample.js';

export function bindAppEvents({
  state,
  dom,
  humanVoiceLayer,
  avatarController,
  sessionController,
  setupPreviewController,
  presenter,
  persistState,
  addLog,
  formatError,
}) {
  dom.joinCall.addEventListener('click', async () => {
    try {
      await sessionController.handlePrimaryCallAction();
    } catch (error) {
      addLog('error', 'Primary call action failed.', formatError(error));
    }
  });

  if (dom.refreshInspector) {
    dom.refreshInspector.addEventListener('click', async () => {
      try {
        await sessionController.refreshSession();
      } catch (error) {
        addLog('error', 'Inspector refresh failed.', formatError(error));
      }
    });
  }

  if (dom.sendTyped && dom.typedInput) {
    const sendTypedTurn = async () => {
      const text = dom.typedInput.value.trim();
      if (!text) {
        return;
      }

      dom.typedInput.value = '';
      presenter.refreshActionButtons();

      try {
        await sessionController.ensureSessionReady();
        await humanVoiceLayer.runTextTurn(text, 'typed');
      } catch (error) {
        addLog('error', 'Send typed turn failed.', formatError(error));
      }
    };

    dom.sendTyped.addEventListener('click', async () => {
      await sendTypedTurn();
    });
  }

  if (dom.clearTyped && dom.typedInput) {
    dom.clearTyped.addEventListener('click', () => {
      dom.typedInput.value = '';
      presenter.refreshActionButtons();
    });
  }

  if (dom.typedInput) {
    dom.typedInput.addEventListener('input', () => {
      presenter.refreshActionButtons();
    });
    dom.typedInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey) {
        return;
      }

      event.preventDefault();
      dom.sendTyped?.click?.();
    });
  }

  dom.callMicToggle?.addEventListener('click', async () => {
    try {
      await sessionController.toggleMicrophoneMuted?.();
    } catch (error) {
      addLog('error', 'Microphone toggle failed.', formatError(error));
    }
  });

  dom.bundledModelSelect.addEventListener('change', () => {
    void avatarController
      .selectBundledModel(dom.bundledModelSelect.value)
      .then(() => {
        persistState();
        void sessionController.syncWorkspaceSetup?.({
          activeModelId: dom.bundledModelSelect.value,
          activeModelLabel: dom.bundledModelSelect.selectedOptions?.[0]?.textContent || '',
        });
        void sessionController.syncSessionSetup();
      })
      .catch((error) => {
        addLog('error', 'Character model change failed.', formatError(error));
      });
  });

  dom.stageSelect.addEventListener('change', () => {
    avatarController.selectStage(dom.stageSelect.value);
  });

  dom.emoteSelect.addEventListener('change', () => {
    avatarController.selectEmote(dom.emoteSelect.value);
  });

  dom.gestureSelect.addEventListener('change', () => {
    avatarController.selectGesture(dom.gestureSelect.value);
  });

  dom.voiceSampleFile.addEventListener('change', async () => {
    const file = dom.voiceSampleFile.files?.[0] || null;
    if (!file) {
      return;
    }

    if (!isAcceptedVoiceSampleFile(file)) {
      sessionController.setVoiceSampleValidationMessage?.(VOICE_SAMPLE_REQUIREMENT);
      dom.voiceSampleFile.value = '';
      return;
    }

    try {
      sessionController.setVoiceSampleValidationMessage?.('');
      await sessionController.uploadVoiceSample(file);
      persistState();
    } catch (error) {
      addLog('error', 'Voice sample upload failed.', formatError(error));
    } finally {
      dom.voiceSampleFile.value = '';
    }
  });

  dom.previewVoiceSample?.addEventListener('click', async () => {
    try {
      await setupPreviewController?.playVoicePreview?.();
    } catch (error) {
      addLog('error', 'Voice preview failed.', formatError(error));
    }
  });

  dom.previewCharacterAnimation?.addEventListener('click', async () => {
    try {
      await setupPreviewController?.playCharacterAnimationPreview?.();
    } catch (error) {
      addLog('error', 'Animation preview failed.', formatError(error));
    }
  });

  dom.callHistoryToggle?.addEventListener('click', () => {
    state.callHistoryCollapsed = !state.callHistoryCollapsed;
    presenter.renderTranscriptList();
  });

  const handlePageClose = () => {
    setupPreviewController?.destroy?.();
    sessionController.destroy({ reason: 'call window closed' });
  };

  window.addEventListener('pagehide', handlePageClose);

  window.addEventListener('beforeunload', handlePageClose);

  window.addEventListener('error', (event) => {
    addLog('error', 'Window error.', formatError(event.error || event.message));
    presenter.renderDebugSnapshot();
  });

  window.addEventListener('unhandledrejection', (event) => {
    addLog('error', 'Unhandled promise rejection.', formatError(event.reason));
    presenter.renderDebugSnapshot();
  });
}
