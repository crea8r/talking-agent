import {
  isAcceptedVoiceSampleFile,
  VOICE_SAMPLE_REQUIREMENT,
} from './voice-sample.js';

export function bindAppEvents({
  state,
  dom,
  humanVoiceLayer,
  agentVoiceLayer,
  avatarController,
  sessionController,
  setupPreviewController,
  localCameraController,
  presenter,
  persistState,
  addLog,
  formatError,
}) {
  let lastSavedAgentSelfSettings = null;

  const readAgentSelfSettings = () => ({
    agentMode: dom.agentModeSelect?.value || 'standard',
    selfProfile: {
      name: dom.agentSelfName?.value || '',
      pronouns: dom.agentSelfPronouns?.value || '',
      personality: dom.agentSelfPersonality?.value || '',
      interests: dom.agentSelfInterests?.value || '',
      selfPrompt: dom.agentSelfPrompt?.value || '',
    },
  });

  const cloneAgentSelfSettings = (settings) => ({
    agentMode: settings?.agentMode === 'continuity' ? 'continuity' : 'standard',
    selfProfile: {
      name: settings?.selfProfile?.name || '',
      pronouns: settings?.selfProfile?.pronouns || '',
      personality: settings?.selfProfile?.personality || '',
      interests: settings?.selfProfile?.interests || '',
      selfPrompt: settings?.selfProfile?.selfPrompt || '',
    },
  });

  const writeAgentSelfSettings = (settings) => {
    const nextSettings = cloneAgentSelfSettings(settings);
    if (dom.agentModeSelect) {
      dom.agentModeSelect.value = nextSettings.agentMode;
    }
    if (dom.agentSelfName) {
      dom.agentSelfName.value = nextSettings.selfProfile.name;
    }
    if (dom.agentSelfPronouns) {
      dom.agentSelfPronouns.value = nextSettings.selfProfile.pronouns;
    }
    if (dom.agentSelfPersonality) {
      dom.agentSelfPersonality.value = nextSettings.selfProfile.personality;
    }
    if (dom.agentSelfInterests) {
      dom.agentSelfInterests.value = nextSettings.selfProfile.interests;
    }
    if (dom.agentSelfPrompt) {
      dom.agentSelfPrompt.value = nextSettings.selfProfile.selfPrompt;
    }
  };

  const settingsEqual = (left, right) => JSON.stringify(left || null) === JSON.stringify(right || null);

  const continuitySettingsDirty = () => {
    if (!lastSavedAgentSelfSettings) {
      return false;
    }
    return !settingsEqual(readAgentSelfSettings(), lastSavedAgentSelfSettings);
  };

  const renderContinuityDirtyState = () => {
    const dirty = continuitySettingsDirty();
    if (dom.continuitySettingsDirty) {
      dom.continuitySettingsDirty.hidden = !dirty;
    }
    if (dom.continuitySettingsSave) {
      dom.continuitySettingsSave.disabled = !dirty;
    }
  };

  const syncSavedAgentSelfSettingsFromForm = () => {
    lastSavedAgentSelfSettings = cloneAgentSelfSettings(readAgentSelfSettings());
    renderContinuityDirtyState();
  };

  const closeContinuitySettings = () => {
    const dialog = dom.continuitySettingsDialog;
    if (!dialog?.open) {
      return;
    }
    if (typeof dialog.close === 'function') {
      dialog.close();
      return;
    }
    dialog.open = false;
  };

  const closeDialog = (dialog) => {
    if (!dialog?.open) {
      return;
    }
    if (typeof dialog.close === 'function') {
      dialog.close();
      return;
    }
    dialog.open = false;
  };

  const openDialog = (dialog) => {
    if (!dialog || dialog.open) {
      return;
    }
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
      return;
    }
    dialog.open = true;
  };

  const openContinuitySettings = () => {
    const dialog = dom.continuitySettingsDialog;
    if (!lastSavedAgentSelfSettings) {
      syncSavedAgentSelfSettingsFromForm();
    } else {
      renderContinuityDirtyState();
    }
    openDialog(dialog);
  };

  const renderPluginSettingsList = (plugins = []) => {
    if (dom.codexPluginEmpty) {
      dom.codexPluginEmpty.hidden = plugins.length > 0;
    }
    if (!dom.codexPluginList) {
      return;
    }
    if (typeof document === 'undefined') {
      dom.codexPluginList.textContent = plugins.map((plugin) => plugin.displayName || plugin.id).join(', ');
      return;
    }

    const selectedPluginIds = new Set(state.preferences.enabledPluginIds || []);
    const items = plugins.map((plugin) => {
      const label = document.createElement('label');
      label.className = 'plugin-setting-card';

      const input = document.createElement('input');
      input.className = 'plugin-setting-checkbox';
      input.type = 'checkbox';
      input.checked = selectedPluginIds.has(plugin.id);
      input.dataset.pluginId = plugin.id;

      const copy = document.createElement('span');
      copy.className = 'plugin-setting-copy';

      const title = document.createElement('strong');
      title.textContent = plugin.displayName || plugin.name || plugin.id;

      const detail = document.createElement('span');
      const detailParts = [
        plugin.marketplace ? `${plugin.marketplace}` : '',
        plugin.version ? `v${plugin.version}` : '',
        plugin.description || '',
      ].filter(Boolean);
      detail.textContent = detailParts.join(' · ');

      copy.append(title, detail);
      label.append(input, copy);
      return label;
    });
    dom.codexPluginList.replaceChildren(...items);
  };

  const readSelectedPluginIds = () => {
    if (!dom.codexPluginList?.querySelectorAll) {
      return Array.isArray(state.preferences.enabledPluginIds) ? [...state.preferences.enabledPluginIds] : [];
    }
    return Array.from(dom.codexPluginList.querySelectorAll('input[data-plugin-id]:checked'))
      .map((element) => `${element.dataset?.pluginId || ''}`.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  };

  const openPluginSettings = async () => {
    try {
      await sessionController.loadAvailablePlugins?.();
    } catch (error) {
      addLog('error', 'Loading Codex plugins failed.', formatError(error));
    }
    renderPluginSettingsList(state.codex?.availablePlugins || []);
    openDialog(dom.pluginSettingsDialog);
  };

  const savePluginSettings = async () => {
    state.preferences.enabledPluginIds = readSelectedPluginIds();
    persistState();
    await sessionController.syncWorkspaceSetup?.({
      activeModelId: dom.bundledModelSelect?.value || state.preferences.bundledModelId,
      activeModelLabel: dom.bundledModelSelect?.selectedOptions?.[0]?.textContent || '',
      enabledPluginIds: state.preferences.enabledPluginIds,
      enableControlComputer: state.preferences.enableControlComputer,
      enableComplexTasks: state.preferences.enableComplexTasks,
    });
    await sessionController.syncSessionSetup?.();
    closeDialog(dom.pluginSettingsDialog);
  };

  const openAdvancedSettings = () => {
    if (dom.advancedControlComputer) {
      dom.advancedControlComputer.checked = state.preferences.enableControlComputer === true;
    }
    if (dom.advancedComplexTasks) {
      dom.advancedComplexTasks.checked = state.preferences.enableComplexTasks === true;
    }
    openDialog(dom.advancedSettingsDialog);
  };

  const saveAdvancedSettings = async () => {
    state.preferences.enableControlComputer = dom.advancedControlComputer?.checked === true;
    state.preferences.enableComplexTasks = dom.advancedComplexTasks?.checked === true;
    persistState();
    await sessionController.syncWorkspaceSetup?.({
      activeModelId: dom.bundledModelSelect?.value || state.preferences.bundledModelId,
      activeModelLabel: dom.bundledModelSelect?.selectedOptions?.[0]?.textContent || '',
      enabledPluginIds: state.preferences.enabledPluginIds,
      enableControlComputer: state.preferences.enableControlComputer,
      enableComplexTasks: state.preferences.enableComplexTasks,
    });
    await sessionController.syncSessionSetup?.();
    closeDialog(dom.advancedSettingsDialog);
  };

  const confirmDiscardContinuityChanges = () => {
    if (!continuitySettingsDirty()) {
      return true;
    }
    if (typeof window.confirm !== 'function') {
      return false;
    }
    return window.confirm('Discard unsaved continuity changes?');
  };

  const attemptCloseContinuitySettings = () => {
    if (!confirmDiscardContinuityChanges()) {
      renderContinuityDirtyState();
      return;
    }
    if (lastSavedAgentSelfSettings) {
      writeAgentSelfSettings(lastSavedAgentSelfSettings);
    }
    renderContinuityDirtyState();
    closeContinuitySettings();
  };

  const saveContinuitySettings = async () => {
    if (!sessionController.saveAgentSelfSettings) {
      syncSavedAgentSelfSettingsFromForm();
      closeContinuitySettings();
      return;
    }

    const nextSettings = cloneAgentSelfSettings(readAgentSelfSettings());

    try {
      await sessionController.saveAgentSelfSettings(nextSettings);
      lastSavedAgentSelfSettings = nextSettings;
      renderContinuityDirtyState();
      closeContinuitySettings();
    } catch (error) {
      addLog('error', 'Saving continuity settings failed.', formatError(error));
    }
  };

  dom.joinCall.addEventListener('click', async () => {
    try {
      await sessionController.handlePrimaryCallAction();
      await localCameraController?.syncCallState?.({
        activeCall: state.activeCall,
      });
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

  dom.callCameraToggle?.addEventListener('click', async () => {
    try {
      await localCameraController?.toggleEnabled?.();
    } catch (error) {
      addLog('error', 'Camera toggle failed.', formatError(error));
    }
  });

  dom.callSpeakerToggle?.addEventListener('click', async () => {
    try {
      const speakerSnapshot = agentVoiceLayer?.getSnapshot?.() || {};
      const nextSpeakReplies = speakerSnapshot.speakReplies === false;
      agentVoiceLayer?.updateConfig?.({
        speakReplies: nextSpeakReplies,
      });
      if (!nextSpeakReplies) {
        agentVoiceLayer?.cancelSpeech?.();
      }
      presenter.renderCallSnapshot?.();
      presenter.renderAgentStatus?.();
    } catch (error) {
      addLog('error', 'Speaker toggle failed.', formatError(error));
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

  dom.smoothGestureTransitionsToggle?.addEventListener('change', () => {
    const nextEnabled = dom.smoothGestureTransitionsToggle.checked !== false;
    avatarController.setSmoothGestureTransitions?.(nextEnabled);
    persistState();
  });

  dom.cameraDistanceInput?.addEventListener('input', () => {
    avatarController.setCameraDistance?.(Number(dom.cameraDistanceInput.value));
    persistState();
  });

  dom.continuitySettingsOpen?.addEventListener('click', () => {
    openContinuitySettings();
  });

  dom.pluginSettingsOpen?.addEventListener('click', () => {
    void openPluginSettings();
  });

  dom.advancedSettingsOpen?.addEventListener('click', () => {
    openAdvancedSettings();
  });

  dom.continuitySettingsClose?.addEventListener('click', () => {
    attemptCloseContinuitySettings();
  });

  dom.continuitySettingsSave?.addEventListener('click', async () => {
    await saveContinuitySettings();
  });

  dom.pluginSettingsClose?.addEventListener('click', () => {
    closeDialog(dom.pluginSettingsDialog);
  });

  dom.pluginSettingsSave?.addEventListener('click', async () => {
    try {
      await savePluginSettings();
    } catch (error) {
      addLog('error', 'Saving plugin settings failed.', formatError(error));
    }
  });

  dom.advancedSettingsClose?.addEventListener('click', () => {
    closeDialog(dom.advancedSettingsDialog);
  });

  dom.advancedSettingsSave?.addEventListener('click', async () => {
    try {
      await saveAdvancedSettings();
    } catch (error) {
      addLog('error', 'Saving advanced settings failed.', formatError(error));
    }
  });

  dom.continuitySettingsDialog?.addEventListener?.('click', (event) => {
    if (event.target === dom.continuitySettingsDialog) {
      attemptCloseContinuitySettings();
    }
  });

  dom.pluginSettingsDialog?.addEventListener?.('click', (event) => {
    if (event.target === dom.pluginSettingsDialog) {
      closeDialog(dom.pluginSettingsDialog);
    }
  });

  dom.advancedSettingsDialog?.addEventListener?.('click', (event) => {
    if (event.target === dom.advancedSettingsDialog) {
      closeDialog(dom.advancedSettingsDialog);
    }
  });

  dom.continuitySettingsDialog?.addEventListener?.('cancel', (event) => {
    if (confirmDiscardContinuityChanges()) {
      if (lastSavedAgentSelfSettings) {
        writeAgentSelfSettings(lastSavedAgentSelfSettings);
      }
      renderContinuityDirtyState();
      return;
    }
    event.preventDefault?.();
    renderContinuityDirtyState();
  });

  dom.pluginSettingsDialog?.addEventListener?.('cancel', (event) => {
    event.preventDefault?.();
    closeDialog(dom.pluginSettingsDialog);
  });

  dom.advancedSettingsDialog?.addEventListener?.('cancel', (event) => {
    event.preventDefault?.();
    closeDialog(dom.advancedSettingsDialog);
  });

  dom.callHistoryToggle?.addEventListener('click', () => {
    state.callHistoryCollapsed = !state.callHistoryCollapsed;
    presenter.renderTranscriptList();
  });

  [
    dom.agentModeSelect,
    dom.agentSelfName,
    dom.agentSelfPronouns,
    dom.agentSelfPersonality,
    dom.agentSelfInterests,
    dom.agentSelfPrompt,
  ].filter(Boolean).forEach((element) => {
    const eventName = element.tagName === 'SELECT' ? 'change' : 'input';
    element.addEventListener(eventName, renderContinuityDirtyState);
    if (eventName !== 'change') {
      element.addEventListener('change', renderContinuityDirtyState);
    }
  });

  const handlePageClose = () => {
    setupPreviewController?.destroy?.();
    localCameraController?.destroy?.();
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
