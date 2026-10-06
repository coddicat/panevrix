const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const { parseArgs } = require('../bin/panevrix');
const cli = path.join(__dirname, '../bin/panevrix.js');
test('CLI parses paths, environment, free ports and options; rejects invalid input', () => {
  assert.deepEqual(parseArgs(['left', 'right', '--port', '0', '--no-open'], {}), { paths: ['left', 'right'], port: 0, open: false });
  assert.equal(parseArgs([], { PORT: '4000' }).port, 4000);
  assert.equal(parseArgs(['--port=4001'], {}).port, 4001);
  assert.deepEqual(parseArgs(['--', '-folder'], {}).paths, ['-folder']);
  for (const args of [['--port'], ['--port', '-1'], ['--port', '65536'], ['--port', '1.5'], ['--unknown'], ['a', 'b', 'c']]) assert.throws(() => parseArgs(args, {}));
});
test('CLI help and version exit without starting the server', () => {
  assert.match(execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8' }), /Usage: panevrix/);
  assert.equal(execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' }).trim(), require('../package.json').version);
});
test('CLI starts on a free port with explicit folders and serves the full app', async t => {
  const child = spawn(process.execPath, [cli, __dirname, path.dirname(__dirname), '--port', '0', '--no-open'], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const url = await new Promise((resolve, reject) => {
    let output = ''; const timer = setTimeout(() => reject(Error('CLI startup timed out')), 10000); timer.unref();
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    child.on('exit', code => { clearTimeout(timer); reject(Error(`CLI exited with ${code}: ${output}`)); });
  });
  const html = await (await fetch(url)).text(); assert.match(html, /Panevrix/);
  const token = html.match(/commander-token" content="([^"]+)"/)[1];
  const config = await (await fetch(url + '/api/config', { method: 'POST', headers: { 'X-Commander-Token': token } })).json();
  assert.equal(config.cwd, __dirname); assert.equal(config.rightPath, path.dirname(__dirname)); assert.deepEqual(config.explicitPaths, [true, true]);
  for (const asset of ['/app.js', '/style.css']) assert.equal((await fetch(url + asset)).status, 200);
});
