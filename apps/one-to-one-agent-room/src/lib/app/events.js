export function bindAppEvents({
  dom,
  state,
  humanVoiceLayer,
  avatarController,
  sessionController,
  presenter,
  persistState,
  syncAgentVoiceConfig,
  addLog,
  formatError,
}) {
  [
    dom.livekitUrl,
    dom.roomName,
    dom.identity,
    dom.participantName,
    dom.enableCamera,
    dom.enableMicrophone,
    dom.humanLocale,
  ].forEach((element) => {
    element.addEventListener('change', persistState);
    element.addEventListener('input', persistState);
  });

  [dom.livekitUrl, dom.roomName, dom.identity].forEach((element) => {
    element.addEventListener('change', () => {
      presenter.refreshActionButtons();
      sessionController.scheduleLobbySessionPreparation({ force: true, immediate: true });
    });
    element.addEventListener('input', () => {
      presenter.refreshActionButtons();
      sessionController.scheduleLobbySessionPreparation();
    });
  });

  dom.joinCall.addEventListener('click', async () => {
    try {
      await sessionController.handlePrimaryCallAction();
    } catch (error) {
      addLog('error', 'Primary call action failed.', formatError(error));
    }
  });

  if (dom.disconnectCallLive) {
    dom.disconnectCallLive.addEventListener('click', async () => {
      await sessionController.disconnectCall();
    });
  }

  if (dom.openConnectPrompt) {
    dom.openConnectPrompt.addEventListener('click', () => {
      sessionController.openConnectPrompt();
    });
  }

  if (dom.copyConnectPrompt) {
    dom.copyConnectPrompt.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(dom.connectPromptBody.value);
        addLog('info', 'Copied agent chat prompt.');
      } catch (error) {
        addLog('error', 'Copy agent chat prompt failed.', formatError(error));
      }
    });
  }

  if (dom.closeConnectPrompt) {
    dom.closeConnectPrompt.addEventListener('click', () => {
      dom.connectPromptDialog?.close?.();
    });
  }

  if (dom.connectPromptDialog) {
    dom.connectPromptDialog.addEventListener('click', (event) => {
      if (event.target === dom.connectPromptDialog) {
        dom.connectPromptDialog.close?.();
      }
    });
  }

  dom.copyMcpCommand.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(dom.mcpCommand.value);
      addLog('info', 'Copied MCP bootstrap command.');
    } catch (error) {
      addLog('error', 'Copy MCP command failed.', formatError(error));
    }
  });

  if (dom.refreshInspector) {
    dom.refreshInspector.addEventListener('click', async () => {
      try {
        await sessionController.pollSession();
      } catch (error) {
        addLog('error', 'Inspector refresh failed.', formatError(error));
      }
    });
  }

  dom.runDemoReply.addEventListener('click', async () => {
    try {
      await sessionController.runDemoReply();
    } catch (error) {
      addLog('error', 'Local fallback reply failed.', formatError(error));
    }
  });

  dom.startListening.addEventListener('click', async () => {
    try {
      await sessionController.ensureSessionReady();
      await humanVoiceLayer.startListening();
    } catch (error) {
      addLog('error', 'Start listening failed.', formatError(error));
    }
  });

  dom.stopListening.addEventListener('click', () => {
    humanVoiceLayer.stopListening();
  });

  dom.sendTyped.addEventListener('click', async () => {
    const text = dom.typedInput.value.trim();
    if (!text) {
      return;
    }

    try {
      await sessionController.ensureSessionReady();
      await humanVoiceLayer.runTextTurn(text, 'typed');
      dom.typedInput.value = '';
      presenter.refreshActionButtons();
    } catch (error) {
      addLog('error', 'Queue typed turn failed.', formatError(error));
    }
  });

  dom.clearTyped.addEventListener('click', () => {
    dom.typedInput.value = '';
    presenter.refreshActionButtons();
  });

  dom.typedInput.addEventListener('input', () => {
    presenter.refreshActionButtons();
  });

  dom.humanLocale.addEventListener('change', () => {
    state.preferences.humanLocale = dom.humanLocale.value;
    humanVoiceLayer.updateConfig({
      locale: state.preferences.humanLocale,
    });
    persistState();
  });

  dom.bundledModelSelect.addEventListener('change', () => {
    void avatarController.selectBundledModel(dom.bundledModelSelect.value).then(() => {
      void sessionController.syncAvatarCatalogForSession();
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

  dom.voiceSelect.addEventListener('change', () => {
    state.preferences.voiceName = dom.voiceSelect.value;
    syncAgentVoiceConfig();
    persistState();
  });

  dom.speechRate.addEventListener('input', () => {
    state.preferences.speechRate = Number.parseFloat(dom.speechRate.value);
    presenter.updateRateLabels();
    syncAgentVoiceConfig();
    persistState();
  });

  dom.speechPitch.addEventListener('input', () => {
    state.preferences.speechPitch = Number.parseFloat(dom.speechPitch.value);
    presenter.updateRateLabels();
    syncAgentVoiceConfig();
    persistState();
  });

  window.addEventListener('beforeunload', () => {
    sessionController.destroy();
  });

  window.addEventListener('error', (event) => {
    addLog('error', 'Window error.', formatError(event.error || event.message));
    presenter.renderDebugSnapshot();
  });

  window.addEventListener('unhandledrejection', (event) => {
    addLog('error', 'Unhandled promise rejection.', formatError(event.reason));
    presenter.renderDebugSnapshot();
  });
}
