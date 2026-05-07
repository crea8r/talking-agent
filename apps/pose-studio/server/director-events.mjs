function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function forwardChildOutput(stream, prefix, { onLine } = {}) {
  if (!stream?.on) {
    return;
  }

  stream.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      console.log(`${prefix} ${line}`);
      onLine?.(line);
    }
  });
}

export function createDirectorEventLogger(runId, startedAtMs) {
  let sawFirstStdout = false;
  let sawFirstStderr = false;

  function logMilestone(label, extra = undefined) {
    console.log('[pose-studio director timeline]', {
      runId,
      elapsedMs: Date.now() - startedAtMs,
      label,
      ...(extra ? { extra } : {}),
    });
  }

  return {
    onStdoutLine(line) {
      if (!sawFirstStdout) {
        sawFirstStdout = true;
        logMilestone('first_stdout_line');
      }

      const payload = parseJsonLine(line);
      if (!payload?.type) {
        return;
      }
      if (payload.type === 'thread.started' || payload.type === 'turn.started') {
        logMilestone(payload.type);
        return;
      }
      if (payload.type === 'turn.completed') {
        logMilestone('turn.completed', payload.usage || null);
        return;
      }

      const item = payload.item;
      if (!item?.type) {
        return;
      }
      if (item.type === 'mcp_tool_call' || item.type === 'collab_tool_call') {
        logMilestone(payload.type, {
          itemType: item.type,
          tool: item.tool,
          server: item.server,
          status: item.status,
        });
        return;
      }
      if (item.type === 'agent_message') {
        logMilestone(payload.type, {
          itemType: item.type,
          text: typeof item.text === 'string' ? item.text.slice(0, 140) : '',
        });
      }
    },
    onStderrLine() {
      if (!sawFirstStderr) {
        sawFirstStderr = true;
        logMilestone('first_stderr_line');
      }
    },
    logMilestone,
  };
}

export function serializeActiveDirectorRequest(activeDirectorRequest) {
  if (!activeDirectorRequest) {
    return { active: false };
  }

  return {
    active: true,
    requestId: activeDirectorRequest.id,
    modelId: activeDirectorRequest.modelId,
    prompt: activeDirectorRequest.prompt,
    startedAt: new Date(activeDirectorRequest.startedAt).toISOString(),
  };
}
