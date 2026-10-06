const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePs, windowsSamples, cpuSample, systemSnapshot } = require('../lib/system');
test('Unix process parsing preserves names with spaces and memory units', () => {
  const rows = parsePs(' 12 1 3.5 0.4 2048 S /Applications/My App.app/Contents/MacOS/App\n 99 12 0.0 0.1 1024 R node\ninvalid');
  assert.equal(rows.length, 2); assert.equal(rows[0].name, '/Applications/My App.app/Contents/MacOS/App'); assert.equal(rows[0].memory, 2097152); assert.equal(rows[0].parent, 1); assert.equal(rows[1].state, 'R');
});
test('Windows CPU sampling handles first sample, permission gaps and exited processes', () => {
  const row = { Id: 123, ProcessName: 'test', CPU: 1, WorkingSet64: 4096, Handles: 5, MainWindowTitle: 'Window' };
  const first = windowsSamples([row], 1000); assert.equal(first[0].cpu, null); assert.equal(first[0].window, 'Window');
  const next = windowsSamples([{ ...row, CPU: 2 }, { Id: 456, ProcessName: 'protected', CPU: null }], 2000);
  assert.equal(next[0].cpu, 100); assert.equal(next[1].cpu, null);
  windowsSamples([], 3000); assert.equal(windowsSamples([row], 4000)[0].cpu, null);
});
test('system CPU uses interval deltas rather than lifetime average', () => {
  assert.equal(cpuSample([{ times: { idle: 100, user: 100 } }]), null);
  assert.equal(cpuSample([{ times: { idle: 125, user: 175 } }]), 75);
});
test('live system snapshot reports real memory, runtime and local processes', async () => {
  const result = await systemSnapshot(); assert.ok(result.memory.total > 0); assert.ok(result.memory.used >= 0); assert.equal(result.runtime.pid, process.pid); assert.ok(result.cpu.cores > 0);
  assert.equal(result.processError, null); assert.ok(result.processes.some(p => p.pid === process.pid)); assert.ok(Array.isArray(result.network));
});
