'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const metadata = require('../package.json');
async function verify() {
  const tempBase = path.resolve(os.tmpdir()), root = await fs.mkdtemp(path.join(tempBase, 'panevrix-package-'));
  let child;
  try {
    const archive = path.resolve(__dirname, '..', `${metadata.name.replace(/^@/, '').replace('/', '-')}-${metadata.version}.tgz`);
    await exec('tar', ['-xf', archive, '-C', root]);
    const cli = path.join(root, 'package', 'bin', 'panevrix.js');
    const version = await exec(process.execPath, [cli, '--version']); assert.equal(version.stdout.trim(), metadata.version);
    child = spawn(process.execPath, [cli, root, '--port', '0', '--no-open'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    const url = await new Promise((resolve, reject) => {
      let output = '', error = '';
      const timer = setTimeout(() => reject(Error('Packed CLI did not start within 10 seconds.')), 10000); timer.unref();
      child.stderr.on('data', data => { error += data; });
      child.stdout.on('data', data => { output += data; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
      child.on('error', e => { clearTimeout(timer); reject(e); });
      child.on('exit', code => { clearTimeout(timer); reject(Error(`Packed CLI exited (${code}): ${error}`)); });
    });
    const response = await fetch(url); assert.equal(response.status, 200); const html = await response.text(); assert.match(html, /Panevrix/);
    for (const asset of ['app.js', 'style.css', 'system.css', 'tasks.css']) assert.equal((await fetch(`${url}/${asset}`)).status, 200);
    const token = html.match(/commander-token" content="([^"]+)"/)[1];
    const headers = { 'X-Commander-Token': token };
    const config = await (await fetch(url + '/api/config', { method: 'POST', headers })).json(); assert.equal(config.cwd, root);
    const system = await (await fetch(url + '/api/system', { method: 'POST', headers })).json(); assert.ok(system.memory.total > 0); assert.ok(system.processes.length > 0); assert.equal(system.processError, null);
    for (const file of ['docs/USER_GUIDE.md', 'docs/ROADMAP.md', 'SECURITY.md', 'PUBLISHING.md']) await fs.access(path.join(root, 'package', file));
    const jobResponse = await fetch(url + '/api/task-start', { method: 'POST', headers, body: JSON.stringify({ type: 'hash', path: cli }) }); assert.equal(jobResponse.status, 200); const job = await jobResponse.json();
    let snapshot; for (let n = 0; n < 100; n++) { snapshot = await (await fetch(url + '/api/task', { method: 'POST', headers, body: JSON.stringify(job) })).json(); if (snapshot.finished) break; await new Promise(r => setTimeout(r, 20)); }
    assert.equal(snapshot.state, 'completed'); assert.match(snapshot.result.sha256, /^[a-f0-9]{64}$/);
    const logs = await (await fetch(url + '/api/logs', { method: 'POST', headers })).json(); assert.ok(logs.entries.some(e => /Task hash completed/.test(e.message)));
    console.log('Packed CLI verified: startup, folder arguments, browser assets, documentation, system/process API, background task/hash and logs.');
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
    }
    assert.equal(path.dirname(path.resolve(root)), tempBase); assert.ok(path.basename(root).startsWith('panevrix-package-'));
    await fs.rm(root, { recursive: true, force: true });
  }
}
verify().catch(e => { console.error(e.message); process.exitCode = 1; });
