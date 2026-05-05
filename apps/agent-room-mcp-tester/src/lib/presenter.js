import { safeStringify } from './format.js';

function renderPendingActionControls(dom, state) {
  if (!dom.pendingActionControls) {
    return;
  }

  const actions = state.pendingActions || [];
  if (!actions.length) {
    dom.pendingActionControls.innerHTML = '<div class="callout">No pending actions.</div>';
    return;
  }

  dom.pendingActionControls.innerHTML = actions
    .map((action) => {
      const summary =
        action.text ||
        [action.gestureId].filter(Boolean).join(' · ') ||
        'action';
      const buttons = state.autoAck
        ? ''
        : action.type === 'speech'
          ? `
            <div class="actions">
              <button type="button" data-action-id="${action.actionId}" data-ack-phase="started">Start</button>
              <button type="button" data-action-id="${action.actionId}" data-ack-phase="finished">Finish</button>
            </div>
          `
          : `
            <div class="actions">
              <button type="button" data-action-id="${action.actionId}" data-ack-phase="completed">Complete</button>
            </div>
          `;

      return `
        <article class="action-card">
          <h3>${action.type} · ${action.actionId}</h3>
          <p>${summary}</p>
          ${buttons}
        </article>
      `;
    })
    .join('');
}

export function render(dom, state) {
  dom.callState.textContent = state.session?.state || 'idle';
  dom.callDetail.textContent = state.session?.id
    ? `${state.session.title || 'session'} · ${state.session.id}`
    : 'No active session.';

  dom.mcpState.textContent = state.mcpState.connected ? 'preview connected' : 'preview offline';
  dom.mcpDetail.textContent = state.mcpState.connected
    ? `pid=${state.mcpState.pid || 'unknown'} · cursor=${state.localAgentCursor || '0'}`
    : state.mcpState.lastError || 'Start a session to run the local MCP preview.';

  dom.notice.hidden = !state.notice;
  dom.notice.textContent = state.notice || '';
  dom.mcpCommand.textContent = state.runtimeConfig?.mcp?.command || 'Loading MCP command...';

  dom.startSessionRequest.textContent = safeStringify(
    [
      state.bootstrapDebug.initializeRequest,
      state.bootstrapDebug.initializedNotification,
      state.bootstrapDebug.toolsListRequest,
      state.bootstrapDebug.joinCallRequest,
    ].filter(Boolean),
  );

  dom.startSessionResponse.textContent = safeStringify({
    initialize: state.bootstrapDebug.initializeResponse,
    toolsList: state.bootstrapDebug.toolsListResponse,
    joinCall: state.bootstrapDebug.joinCallResponse,
  });

  dom.lastEventRequest.textContent = safeStringify(state.lastEventDebug.request);
  dom.lastEventResponse.textContent = safeStringify(state.lastEventDebug.response);
  dom.lastPublishRequest.textContent = safeStringify(state.lastPublishDebug.request);
  dom.latestAgentReply.textContent = safeStringify({
    activeAgent: state.session?.agent || null,
    lastAgentReply: state.session?.lastAgentReply || null,
    pendingActions: state.pendingActions,
  });

  dom.autoAck.checked = state.autoAck;
  dom.fullTranscript.textContent = safeStringify(state.mcpTranscript);
  dom.recentEvents.textContent = safeStringify(state.inspector?.recentEvents || []);
  dom.recentTurns.textContent = safeStringify(state.session?.turns || []);
  dom.pendingActionsJson.textContent = safeStringify(state.pendingActions);
  dom.humanLog.textContent = safeStringify(state.humanLog);

  renderPendingActionControls(dom, state);
}
