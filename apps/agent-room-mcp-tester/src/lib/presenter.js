import { safeStringify } from './format.js';

function renderPendingActionControls(dom, state) {
  const actions = state.pendingActions || [];
  if (!actions.length) {
    dom.pendingActionControls.innerHTML = '<div class="callout">No pending actions.</div>';
    return;
  }

  dom.pendingActionControls.innerHTML = actions
    .map((action) => {
      const summary = action.text
        ? action.text
        : [action.gestureId, action.emoteId, action.stageId].filter(Boolean).join(' · ') || 'action';
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

  dom.mcpState.textContent = state.mcpState.connected ? 'connected' : 'disconnected';
  dom.mcpDetail.textContent = state.mcpState.connected
    ? `pid=${state.mcpState.pid || 'unknown'} · transcript=${state.mcpState.transcriptCount}`
    : state.mcpState.lastError || 'Harness offline.';

  dom.speechSupport.textContent = state.speechSupported
    ? state.speechActive
      ? 'mic live'
      : 'speech ready'
    : 'typed only';

  dom.interimTranscript.textContent = state.activeUtteranceText || 'none';
  dom.humanLog.textContent = safeStringify(state.humanLog);
  dom.mcpLastResponse.textContent = safeStringify(state.lastMcpResponse);
  dom.mcpTranscript.textContent = safeStringify(state.mcpTranscript);
  dom.bridgeSummary.textContent = safeStringify(
    state.session
      ? {
          id: state.session.id,
          title: state.session.title,
          state: state.session.state,
          currentCursor: state.session.currentCursor,
          agent: state.session.agent,
        }
      : null,
  );
  dom.bridgeEvents.textContent = safeStringify(state.inspector?.recentEvents || []);
  dom.pendingActionsJson.textContent = safeStringify(state.pendingActions);
  dom.recentTurns.textContent = safeStringify(state.session?.turns || []);
  dom.autoAck.checked = state.autoAck;

  renderPendingActionControls(dom, state);
}
