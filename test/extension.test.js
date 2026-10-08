'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const extensionRequire = require('node:module').createRequire(path.resolve(__dirname, '../extensions/vscode/extension.js')); 
const { createBridge } = require('../extensions/vscode/bridge');
test('extension bridge rejects untrusted, invalid and oversized requests before dispatch', async () => {
  const replies = []; let calls = 0, trusted = false;
  const bridge = createBridge({ webview: { postMessage: m => replies.push(m) }, isTrusted: () => trusted, dispatch: () => { calls++; } });
  await bridge.receive({ kind: 'panevrix-request', id: 1, route: 'list', data: { path: '/tmp' } }); assert.match(replies.pop().error.message, /trusted/);
  trusted = true; await bridge.receive({ kind: 'panevrix-request', id: 2, route: 'toString', data: {} }); assert.match(replies.pop().error.message, /Unknown/);
  await bridge.receive({ kind: 'panevrix-request', id: 3, route: 'list', data: [] }); assert.match(replies.pop().error.message, /Invalid/);
  await bridge.receive({ kind: 'panevrix-request', id: 4, route: 'write', data: { text: 'x'.repeat(6 * 1024 * 1024) } }); assert.match(replies.pop().error.message, /large/); assert.equal(calls, 0);
});
test('extension bridge preserves errors and cancels pending work without late responses', async () => {
  const replies = []; let captured, release;
  const bridge = createBridge({ webview: { postMessage: m => replies.push(m) }, isTrusted: () => true, dispatch: async (route, data, signal) => {
    if (route === 'write') throw Object.assign(Error('Denied'), { code: 'EACCES', path: '/locked' });
    captured = signal; return new Promise(r => release = r);
  } });
  await bridge.receive({ kind: 'panevrix-request', id: 1, route: 'write', data: {} }); assert.equal(replies[0].error.code, 'EACCES'); assert.equal(replies[0].error.path, '/locked');
  const pending = bridge.receive({ kind: 'panevrix-request', id: 2, route: 'list', data: {} }); await bridge.receive({ kind: 'panevrix-cancel', id: 2 }); assert.equal(captured.aborted, true); release({}); await pending; assert.equal(replies.length, 1);
  const next = bridge.receive({ kind: 'panevrix-request', id: 3, route: 'list', data: {} }); bridge.dispose(); assert.equal(captured.aborted, true); release({}); await next; assert.equal(replies.length, 1);
});
test('webview client uses correlated replies, handles permissions, and propagates aborts', async () => {
  const posted = []; let listener;
  const window = { addEventListener: (name, fn) => listener = fn };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/editor-bridge.js'), 'utf8'), { window, acquireVsCodeApi: () => ({ postMessage: m => posted.push(m) }) });
  const request = window.panevrixBridge.request('list', { path: '/test' }); listener({ data: { kind: 'panevrix-response', id: posted[0].id, result: { path: '/test' } } }); assert.equal((await request).path, '/test');
  const failure = window.panevrixBridge.request('write', {}); listener({ data: { kind: 'panevrix-response', id: posted[1].id, error: { message: 'Denied', code: 'EPERM', path: '/file' } } }); await assert.rejects(failure, e => e.code === 'EPERM' && e.path === '/file');
  const controller = new AbortController(), canceled = window.panevrixBridge.request('list', {}, controller.signal); controller.abort(); await assert.rejects(canceled, e => e.name === 'AbortError'); assert.equal(posted.at(-1).kind, 'panevrix-cancel');
  const normal = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/editor-bridge.js'), 'utf8'), { window: normal }); assert.equal(normal.panevrixBridge, undefined);
});
test('extension webview rewrites assets with nonce CSP and only allows packaged resources', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../extensions/vscode/extension.js'), 'utf8');
  const vscode = { Uri: { file: String }, env: {} }, context = { require: name => name === 'vscode' ? vscode : extensionRequire(name), process, module: { exports: {} } }; vm.runInNewContext(source, context);
  const html = await context.module.exports.webviewHtml(path.resolve(__dirname, '../extensions/vscode'), { cspSource: 'https://vscode-resource.example', asWebviewUri: p => 'https://vscode-resource.example/' + path.basename(p) });
  assert.match(html, /connect-src 'none'/); assert.match(html, /script-src 'nonce-[a-f0-9]{48}'/); assert.equal((html.match(/<script nonce=/g) || []).length, 2); assert.match(html, /src="https:\/\/vscode-resource.example\/editor-bridge.js"/); assert.doesNotMatch(html, /__TOKEN__|src="\/app.js"/);
});
test('dirty editor documents block mutation of the file or its parent but permit copy', () => {
  const root = path.resolve('extension-test'), file = path.join(root, 'file.txt');
  const vscode = { workspace: { textDocuments: [{ isDirty: true, uri: { fsPath: file } }] } }, context = { require: name => name === 'vscode' ? vscode : extensionRequire(name), process, module: { exports: {} } }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extensions/vscode/extension.js'), 'utf8'), context);
  const dirty = context.module.exports.dirtySource;
  assert.ok(dirty({ path: file }, 'write')); assert.ok(dirty({ path: root }, 'rename')); assert.ok(dirty({ type: 'move', sources: [root] }, 'task-start')); assert.equal(dirty({ type: 'copy', sources: [root] }, 'task-start'), undefined); assert.equal(dirty({ sources: [root + '-other'] }, 'delete'), undefined);
});
