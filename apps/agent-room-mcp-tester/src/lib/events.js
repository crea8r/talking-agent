function parseJson(rawText, label) {
  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new Error(`${label} must be valid JSON.`);
  }
}

export function bindEvents({ dom, store, controller, render }) {
  function guard(task) {
    return async (...args) => {
      try {
        await task(...args);
      } catch (error) {
        store.pushHumanLog({
          kind: 'ui-error',
          payload: {
            error: error instanceof Error ? error.message : 'Unknown UI error.',
          },
        });
        render();
      }
    };
  }

  dom.createCall.addEventListener('click', guard(async () => {
    await controller.createCall({
      title: dom.callTitle.value.trim(),
      humanIdentity: dom.humanIdentity.value.trim(),
      humanName: dom.humanName.value.trim(),
    });
  }));

  dom.markLive.addEventListener('click', guard(async () => {
    await controller.updateCallState('live');
  }));

  dom.endCall.addEventListener('click', guard(async () => {
    await controller.updateCallState('ended', 'operator ended tester call');
  }));

  dom.sendTyped.addEventListener('click', guard(async () => {
    await controller.finalizeTranscript(dom.typedInput.value, {
      source: 'typed',
      humanIdentity: dom.humanIdentity.value.trim(),
      humanName: dom.humanName.value.trim(),
    });
    dom.typedInput.value = '';
  }));

  dom.startMic.addEventListener('click', guard(async () => {
    await controller.startListening({
      humanIdentity: dom.humanIdentity.value.trim(),
      humanName: dom.humanName.value.trim(),
    });
  }));

  dom.stopMic.addEventListener('click', () => {
    controller.stopListening();
  });

  dom.connectMcp.addEventListener('click', guard(async () => {
    await controller.connectMcp();
  }));

  dom.resetMcp.addEventListener('click', guard(async () => {
    await controller.resetMcp();
  }));

  dom.mcpInitialize.addEventListener('click', guard(async () => {
    const response = await controller.sendMcpRequest({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'agent-room-mcp-tester',
          version: '1.0.0',
        },
      },
    });
    dom.rawMcpRequest.value = JSON.stringify(response, null, 2);
  }));

  dom.mcpTools.addEventListener('click', guard(async () => {
    await controller.sendMcpRequest({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
    });
  }));

  dom.mcpResources.addEventListener('click', guard(async () => {
    await controller.sendMcpRequest({
      jsonrpc: '2.0',
      method: 'resources/list',
      params: {},
    });
  }));

  dom.mcpPrompts.addEventListener('click', guard(async () => {
    await controller.sendMcpRequest({
      jsonrpc: '2.0',
      method: 'prompts/list',
      params: {},
    });
  }));

  dom.mcpJoinCall.addEventListener('click', guard(async () => {
    const response = await controller.sendMcpRequest(
      controller.buildToolRequest('join_call', {
        agentId: dom.agentId.value.trim(),
        agentLabel: dom.agentLabel.value.trim(),
      }),
    );
    const cursor = response?.result?.structuredContent?.cursor;
    if (cursor) {
      dom.waitCursor.value = cursor;
    }
  }));

  dom.mcpWaitEvents.addEventListener('click', guard(async () => {
    if (!store.state.session?.id) {
      throw new Error('Create a call first.');
    }

    const response = await controller.sendMcpRequest(
      controller.buildToolRequest('wait_for_events', {
        callId: store.state.session.id,
        cursor: dom.waitCursor.value.trim() || '0',
        waitMs: Number.parseInt(dom.waitMs.value || '0', 10) || 0,
        maxEvents: Number.parseInt(dom.waitMaxEvents.value || '20', 10) || 20,
      }),
    );
    const nextCursor = response?.result?.structuredContent?.nextCursor;
    if (nextCursor) {
      dom.waitCursor.value = nextCursor;
    }
  }));

  dom.mcpRecentTurns.addEventListener('click', guard(async () => {
    if (!store.state.session?.id) {
      throw new Error('Create a call first.');
    }

    await controller.sendMcpRequest(
      controller.buildToolRequest('get_recent_turns', {
        callId: store.state.session.id,
        limit: 10,
      }),
    );
  }));

  dom.mcpLeaveCall.addEventListener('click', guard(async () => {
    if (!store.state.session?.id) {
      throw new Error('Create a call first.');
    }

    await controller.sendMcpRequest(
      controller.buildToolRequest('leave_call', {
        callId: store.state.session.id,
        agentId: dom.agentId.value.trim(),
        reason: 'operator detached from tester',
      }),
    );
  }));

  dom.mcpPublishActions.addEventListener('click', guard(async () => {
    if (!store.state.session?.id) {
      throw new Error('Create a call first.');
    }

    const actions = [];
    const gestureId = dom.publishGesture.value.trim();
    const emoteId = dom.publishEmote.value.trim();
    const stageId = dom.publishStage.value.trim();
    const text = dom.publishText.value.trim();
    const mood = dom.publishMood.value.trim();
    const notes = dom.publishNotes.value.trim();

    if (gestureId || emoteId || stageId) {
      actions.push({
        gestureId,
        emoteId,
        stageId,
      });
    }

    if (text) {
      actions.push({
        text,
        mood,
        notes,
      });
    }

    if (!actions.length) {
      throw new Error('Enter a text or motion payload first.');
    }

    await controller.sendMcpRequest(
      controller.buildToolRequest('publish_actions', {
        callId: store.state.session.id,
        actions,
      }),
    );
  }));

  dom.sendRawMcp.addEventListener('click', guard(async () => {
    const message = parseJson(dom.rawMcpRequest.value, 'Raw MCP request');
    await controller.sendMcpRequest(message);
  }));

  dom.refreshBridge.addEventListener('click', guard(async () => {
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
