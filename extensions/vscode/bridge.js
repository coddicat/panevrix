'use strict';
const routes = new Set(['config', 'list', 'details', 'tasks', 'task', 'task-cancel', 'logs', 'task-start', 'system', 'permissions', 'rename', 'mkdir', 'create', 'delete', 'trash', 'restore', 'hex', 'hex-search', 'read', 'write', 'search', 'open', 'command']);
function createBridge({ webview, dispatch, isTrusted }) {
  const requests = new Map(); let disposed = false;
  async function receive(message) {
    if (disposed || !Number.isSafeInteger(message?.id) || message.id < 1) return;
    if (message.kind === 'panevrix-cancel') { requests.get(message.id)?.abort(); return; }
    if (message.kind !== 'panevrix-request') return;
    const respond = value => { if (!disposed) return webview.postMessage({ kind: 'panevrix-response', id: message.id, ...value }); };
    if (requests.has(message.id)) return;
    let controller;
    try {
      if (!isTrusted()) throw Error('Open Panevrix in a trusted workspace.');
      if (!routes.has(message.route)) throw Error('Unknown extension operation.');
      if (!message.data || typeof message.data !== 'object' || Array.isArray(message.data)) throw Error('Invalid request data.');
      if (Buffer.byteLength(JSON.stringify(message.data)) > 6 * 1024 * 1024) throw Error('Request too large.');
      if (requests.size >= 64) throw Error('Too many pending requests.');
      controller = new AbortController(); requests.set(message.id, controller);
      const result = await dispatch(message.route, message.data, controller.signal);
      if (!controller.signal.aborted) await respond({ result });
    } catch (e) { if (!controller?.signal.aborted) await respond({ error: { message: e.message, code: e.code, path: e.path } }); }
    finally { if (controller) requests.delete(message.id); }
  }
  return { receive, dispose() { disposed = true; for (const controller of requests.values()) controller.abort(); requests.clear(); } };
}
module.exports = { createBridge };
