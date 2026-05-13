import { normalizeString } from './strings.mjs';

export function createMcpSubscriberStore() {
  const subscribers = new Map();

  function get(sessionId, { create = false } = {}) {
    const key = normalizeString(sessionId);
    const existing = subscribers.get(key);
    if (existing || !create) {
      return existing || null;
    }
    const created = new Set();
    subscribers.set(key, created);
    return created;
  }

  function emit(sessionId, event) {
    if (!event) {
      return;
    }
    for (const listener of get(sessionId) || []) {
      listener(event);
    }
  }

  function subscribe({ sessionId, listener } = {}) {
    const normalizedSessionId = normalizeString(sessionId);
    if (!normalizedSessionId) {
      throw new Error('subscribeSessionEvents requires a sessionId.');
    }
    if (typeof listener !== 'function') {
      throw new Error('subscribeSessionEvents requires a listener.');
    }
    const listeners = get(normalizedSessionId, { create: true });
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        subscribers.delete(normalizedSessionId);
      }
    };
  }

  return { emit, subscribe };
}
