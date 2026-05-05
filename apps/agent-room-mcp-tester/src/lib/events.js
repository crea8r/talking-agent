export function bindEvents({ dom, store, controller, render }) {
  function guard(task) {
    return async (...args) => {
      try {
        store.setNotice('');
        render();
        await task(...args);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown UI error.';
        store.setNotice(message);
        store.pushHumanLog({
          kind: 'ui-error',
          payload: { error: message },
        });
        render();
      }
    };
  }

  dom.startSession.addEventListener('click', guard(async () => {
    const defaults = store.state.runtimeConfig?.defaults || {};
    const baseTitle = defaults.callTitle || 'MCP Tester';
    await controller.startSession({
      title: `${baseTitle} ${new Date().toISOString()}`,
      humanIdentity: defaults.humanIdentity || 'tester-human',
      humanName: defaults.humanName || 'Tester Human',
      agentId: 'mcp-preview-agent',
      agentLabel: 'Local MCP Preview',
    });
  }));

  dom.copyMcpCommand.addEventListener('click', guard(async () => {
    const command = store.state.runtimeConfig?.mcp?.command || '';
    if (!command) {
      throw new Error('MCP command is not available yet.');
    }
    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard access is unavailable in this browser.');
    }
    await navigator.clipboard.writeText(command);
  }));

  dom.sendTurn.addEventListener('click', guard(async () => {
    const defaults = store.state.runtimeConfig?.defaults || {};
    await controller.sendTurnAndPreview({
      text: dom.turnInput.value,
      source: 'typed',
      humanIdentity: defaults.humanIdentity || 'tester-human',
      humanName: defaults.humanName || 'Tester Human',
    });
    dom.turnInput.value = '';
  }));

  dom.publishReply.addEventListener('click', guard(async () => {
    await controller.publishReply({
      text: dom.replyText.value,
      gestureId: dom.replyGesture.value,
      mood: dom.replyMood.value,
      notes: dom.replyNotes.value,
    });
  }));

  dom.refreshDebug.addEventListener('click', guard(async () => {
    await controller.refreshBridge();
    await controller.refreshMcpState();
  }));

  dom.autoAck.addEventListener('change', guard(async () => {
    store.setAutoAck(dom.autoAck.checked);
    render();
    await controller.consumePendingActions();
  }));

  dom.pendingActionControls.addEventListener('click', guard(async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionId = target.dataset.actionId;
    const phase = target.dataset.ackPhase;
    if (!actionId || !phase) {
      return;
    }

    await controller.ackAction(actionId, phase);
  }));
}
