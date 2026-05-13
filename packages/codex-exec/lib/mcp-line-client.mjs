import { createAbortError } from './process-runner.mjs';
import { normalizeString, summarizeOutput } from './strings.mjs';

function createRpcError(error = {}) {
  const message = normalizeString(error?.message) || 'MCP request failed.';
  const rpcError = new Error(message);
  rpcError.code = error?.code;
  return rpcError;
}

export function createMcpLineClient({
  command,
  args,
  cwd,
  env,
  spawnCodex,
  onNotification = null,
  onStderrLine = null,
} = {}) {
  let nextId = 1;
  let closed = false;
  let stdoutBuffer = '';
  let stderrBuffer = '';
  let stderrLineBuffer = '';
  const pending = new Map();
  const child = spawnCodex(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });

  function rejectPending(error) {
    for (const { reject } of pending.values()) {
      reject(error);
    }
    pending.clear();
  }

  function finalizeClose(error = createAbortError('MCP client closed.')) {
    if (closed) {
      return;
    }
    closed = true;
    rejectPending(error);
  }

  function handleMessage(message) {
    if (typeof message?.id === 'undefined') {
      onNotification?.(message);
      return;
    }
    if (!pending.has(message.id)) {
      return;
    }
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(createRpcError(message.error));
      return;
    }
    resolve(message.result);
  }

  child.stdout?.on('data', (chunk) => {
    stdoutBuffer += `${chunk || ''}`;
    let newlineIndex = stdoutBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line) {
        handleMessage(JSON.parse(line));
      }
      newlineIndex = stdoutBuffer.indexOf('\n');
    }
  });
  child.stderr?.on('data', (chunk) => {
    const text = `${chunk || ''}`;
    stderrBuffer += text;
    stderrLineBuffer += text;
    let newlineIndex = stderrLineBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = stderrLineBuffer.slice(0, newlineIndex).trim();
      stderrLineBuffer = stderrLineBuffer.slice(newlineIndex + 1);
      if (line) {
        onStderrLine?.(line);
      }
      newlineIndex = stderrLineBuffer.indexOf('\n');
    }
  });
  child.once('error', (error) => {
    finalizeClose(error);
  });
  child.once('exit', (code, signal) => {
    const trailingStderr = stderrLineBuffer.trim();
    if (trailingStderr) {
      onStderrLine?.(trailingStderr);
      stderrLineBuffer = '';
    }
    const summary = summarizeOutput(stderrBuffer) || summarizeOutput(stdoutBuffer);
    const reason =
      code === 0
        ? createAbortError('MCP client exited.')
        : new Error(`MCP client exited with ${signal || `code ${code}`}${summary ? `: ${summary}` : ''}`);
    finalizeClose(reason);
  });

  function request(method, params = undefined) {
    if (closed) {
      return {
        id: 0,
        promise: Promise.reject(createAbortError('MCP client is closed.')),
      };
    }
    const id = nextId++;
    const promise = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    const payload = { jsonrpc: '2.0', id, method };
    if (params !== undefined) {
      payload.params = params;
    }
    child.stdin?.write(`${JSON.stringify(payload)}\n`);
    return { id, promise };
  }

  function notify(method, params = undefined) {
    if (closed) {
      return false;
    }
    const payload = { jsonrpc: '2.0', method };
    if (params !== undefined) {
      payload.params = params;
    }
    child.stdin?.write(`${JSON.stringify(payload)}\n`);
    return true;
  }

  function cancel(requestId, reason = 'Request cancelled.') {
    return notify('notifications/cancelled', {
      requestId,
      reason: normalizeString(reason) || 'Request cancelled.',
    });
  }

  function close(reason = 'MCP client closed.') {
    const normalizedReason = normalizeString(reason) || 'MCP client closed.';
    finalizeClose(createAbortError(normalizedReason));
    child.kill('SIGTERM');
    return true;
  }

  return {
    request,
    notify,
    cancel,
    close,
    isClosed() {
      return closed;
    },
  };
}
