'use strict';
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createBridge } = require('./bridge');
let panel, runtime, output, ready = Promise.resolve(false), resolveReady;
function escape(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
async function webviewHtml(root, webview) {
  const publicPath = path.join(root, 'runtime', 'public'), nonce = crypto.randomBytes(24).toString('hex');
  let html = await fs.readFile(path.join(publicPath, 'index.html'), 'utf8');
  html = html.replace('__TOKEN__', '').replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${escape(webview.cspSource)} data:; style-src ${escape(webview.cspSource)} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none';">`);
  html = html.replace(/(href|src)="\/([a-z-]+\.(?:css|js))"/g, (_, attr, asset) => `${attr}="${escape(webview.asWebviewUri(vscode.Uri.file(path.join(publicPath, asset))))}"`);
  html = html.replace(/<script /g, `<script nonce="${nonce}" `).replace('href="/"', 'href="#"');
  html = html.replace('Local filesystem', vscode.env.remoteName ? 'Extension host filesystem' : 'Local filesystem');
  return html;
}
function dirtySource(data, route) {
  const sources = route === 'write' || route === 'rename' ? [data.path] : route === 'delete' || route === 'task-start' && data.type === 'move' ? data.sources || [] : [];
  const normalize = p => process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
  return vscode.workspace.textDocuments.find(document => document.isDirty && sources.some(source => {
    if (typeof source !== 'string') return false;
    const relative = path.relative(normalize(source), normalize(document.uri.fsPath));
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
  }));
}
async function openWorkspace(context, resource) {
  if (!vscode.workspace.isTrusted) throw Error('Panevrix requires a trusted workspace.');
  if (Number(process.versions.node.split('.')[0]) < 20) throw Error('This editor uses an older Node runtime. Update VS Code/Cursor to a version with Node 20 or newer.');
  const chosen = resource || vscode.workspace.workspaceFolders?.[0]?.uri;
  if (chosen && !['file', 'vscode-remote'].includes(chosen.scheme)) throw Error('Virtual filesystem workspaces are not supported.');
  let cwd = chosen?.fsPath || os.homedir(); const stat = await fs.stat(cwd); if (!stat.isDirectory()) cwd = path.dirname(cwd);
  if (panel) {
    const tasks = await runtime.api('/api/tasks', {});
    if (tasks.tasks.some(j => !j.finished)) throw Error('Finish or cancel background tasks before changing the Panevrix workspace.');
    const choice = await vscode.window.showWarningMessage('Reload Panevrix with this folder? Save any unsaved text in its viewer first.', 'Reload');
    if (choice !== 'Reload') { panel.reveal(); return; }
    panel.dispose();
  }
  if (!runtime) runtime = require('./runtime/server');
  const currentPanel = vscode.window.createWebviewPanel('panevrix.workspace', 'Panevrix', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'runtime', 'public'))] });
  panel = currentPanel;
  ready = new Promise(resolve => { resolveReady = resolve; });
  const bridge = createBridge({ webview: currentPanel.webview, isTrusted: () => vscode.workspace.isTrusted, dispatch: async (route, data, signal) => {
    const dirty = dirtySource(data, route); if (dirty) throw Error(`Save or revert the editor's unsaved changes first: ${dirty.uri.fsPath}`);
    if (route === 'open') {
      if (typeof data.path !== 'string' || !path.isAbsolute(data.path)) throw Error('An absolute path is required.');
      await fs.access(data.path); await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(data.path)); return {};
    }
    const started = Date.now();
    try {
      const result = await runtime.api('/api/' + route, data, { cwd, rightPath: os.homedir(), explicitPaths: [true, true], signal });
      if (route === 'config') { resolveReady?.(true); resolveReady = undefined; }
      if (!['task', 'tasks', 'logs', 'system'].includes(route)) output.appendLine(`${route}: completed in ${Date.now() - started} ms`);
      return result;
    } catch (e) { if (e.name !== 'AbortError') output.appendLine(`${route}: ${e.message}`); throw e; }
  } });
  const listener = currentPanel.webview.onDidReceiveMessage(message => bridge.receive(message));
  currentPanel.onDidDispose(() => { bridge.dispose(); listener.dispose(); if (panel === currentPanel) { panel = undefined; resolveReady?.(false); resolveReady = undefined; } output.appendLine('Workspace panel closed; existing background jobs remain in this extension host.'); });
  try { currentPanel.webview.html = await webviewHtml(context.extensionPath, currentPanel.webview); }
  catch (e) { currentPanel.dispose(); throw e; }
  output.appendLine(`Panevrix opened at ${cwd}${vscode.env.remoteName ? ' (remote extension host)' : ''}`);
}
function activate(context) {
  output = vscode.window.createOutputChannel('Panevrix'); context.subscriptions.push(output);
  let opening;
  const run = resource => {
    if (opening) return opening;
    opening = openWorkspace(context, resource).catch(e => { output.appendLine(e.message); vscode.window.showErrorMessage('Panevrix: ' + e.message); }).finally(() => { opening = undefined; }); return opening;
  };
  context.subscriptions.push(vscode.commands.registerCommand('panevrix.open', () => panel ? panel.reveal() : run()), vscode.commands.registerCommand('panevrix.openHere', run), vscode.commands.registerCommand('panevrix.showLogs', () => output.show()));
  context.subscriptions.push({ dispose() { panel?.dispose(); } });
  return { get isOpen() { return Boolean(panel); }, get ready() { return ready; } };
}
module.exports = { activate, webviewHtml, dirtySource };
