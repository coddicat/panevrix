'use strict';
const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
exports.run = async () => {
  const extension = vscode.extensions.getExtension('coddicat.panevrix'); assert.ok(extension, 'Extension discovered');
  const api = await extension.activate(); assert.equal(extension.isActive, true);
  await vscode.commands.executeCommand('panevrix.open'); assert.equal(api.isOpen, true);
  let timer;
  try { assert.equal(await Promise.race([api.ready, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Webview did not connect through the extension bridge within 20 seconds.')), 20000); })]), true); }
  finally { clearTimeout(timer); }
  await vscode.commands.executeCommand('panevrix.showLogs');
  await fs.writeFile(process.env.PANEVRIX_SMOKE_REPORT, JSON.stringify({ editor: vscode.env.appName, editorVersion: vscode.version, node: process.versions.node, activated: true, webviewConnected: true }));
};
