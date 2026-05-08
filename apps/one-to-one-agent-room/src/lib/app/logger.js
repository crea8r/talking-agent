import { renderLogs as renderLogsView } from '../../ui/render.js';

export function createLogger({ state, dom }) {
  function renderLogs() {
    if (!dom.logList) {
      return;
    }
    renderLogsView(dom.logList, state.logs);
  }

  function addLog(level, message, details = null) {
    const entry = {
      at: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      level,
      message,
      details,
    };

    state.logs = [entry, ...state.logs].slice(0, 24);
    renderLogs();
  }

  return {
    addLog,
    renderLogs,
  };
}
