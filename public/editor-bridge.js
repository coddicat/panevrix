'use strict';
// Only the extension webview exposes acquireVsCodeApi. Browser mode stays unchanged.
(() => {
  if (typeof acquireVsCodeApi !== 'function') return;
  const editor = acquireVsCodeApi(), pending = new Map(); let sequence = 0;
  window.addEventListener('message', event => {
    const message = event.data;
    if (message?.kind !== 'panevrix-response') return;
    const request = pending.get(message.id); if (!request) return;
    pending.delete(message.id); request.cleanup();
    if (message.error) request.reject(Object.assign(new Error(message.error.message), { code: message.error.code, path: message.error.path }));
    else request.resolve(message.result);
  });
  window.panevrixBridge = {
    request(route, data, signal) {
      signal?.throwIfAborted();
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const abort = () => { if (!pending.delete(id)) return; cleanup(); editor.postMessage({ kind: 'panevrix-cancel', id }); reject(signal.reason); };
        const cleanup = () => signal?.removeEventListener('abort', abort);
        pending.set(id, { resolve, reject, cleanup }); signal?.addEventListener('abort', abort, { once: true });
        editor.postMessage({ kind: 'panevrix-request', id, route, data });
      });
    }
  };
})();
