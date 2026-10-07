'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { transfer, hashFile, compareFiles, createJob, getJob, cancelJob } = require('../lib/operations');
const { api } = require('../server');
async function fixture(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'panevrix-operations-')); t.after(() => fs.rm(root, { recursive: true, force: true })); const dest = path.join(root, 'dest'); await fs.mkdir(dest); return { root, dest }; }
test('conflict policies preserve existing content, skip, and keep both', async t => {
  const { root, dest } = await fixture(t), source = path.join(root, 'data.txt'), target = path.join(dest, 'data.txt'); await fs.writeFile(source, 'new'); await fs.writeFile(target, 'old');
  assert.equal((await transfer([source], dest, false, { conflict: 'skip' })).skipped.length, 1);
  await transfer([source], dest, false, { conflict: 'rename' }); assert.equal(await fs.readFile(path.join(dest, 'data (1).txt'), 'utf8'), 'new'); assert.equal(await fs.readFile(target, 'utf8'), 'old');
});
test('canceling a partially copied file removes incomplete output and keeps source', async t => {
  const { root, dest } = await fixture(t), source = path.join(root, 'large.bin'); await fs.writeFile(source, Buffer.alloc(3 * 1024 * 1024, 7));
  const controller = new AbortController(), progress = {}; let bytes = 0; Object.defineProperty(progress, 'bytes', { get() { return bytes; }, set(n) { bytes = n; if (this.phase === 'Copying' && n > 0) controller.abort(); } });
  await assert.rejects(transfer([source], dest, false, { signal: controller.signal, progress }), e => e.name === 'AbortError');
  assert.equal((await fs.stat(source)).size, 3 * 1024 * 1024); assert.deepEqual(await fs.readdir(dest), []);
});
test('canceling after a completed top-level copy keeps that copy and removes current item', async t => {
  const { root, dest } = await fixture(t), a = path.join(root, 'a'), b = path.join(root, 'b'); await fs.writeFile(a, 'done'); await fs.writeFile(b, Buffer.alloc(2 * 1024 * 1024));
  const controller = new AbortController(), progress = {}; Object.defineProperty(progress, 'current', { set(p) { if (this.phase === 'Copying' && p === b) controller.abort(); } });
  await assert.rejects(transfer([a, b], dest, false, { signal: controller.signal, progress }), /1 top-level item/);
  assert.equal(await fs.readFile(path.join(dest, 'a'), 'utf8'), 'done'); assert.deepEqual(await fs.readdir(dest), ['a']); assert.ok(await fs.stat(b));
});
test('hash and comparison stream files, detect exact offsets and length-only differences', async t => {
  const { root } = await fixture(t), a = path.join(root, 'a'), b = path.join(root, 'b'), bytes = Buffer.alloc(131080, 42); await fs.writeFile(a, bytes); await fs.writeFile(b, bytes);
  assert.equal((await hashFile(a)).sha256, crypto.createHash('sha256').update(bytes).digest('hex')); assert.equal((await compareFiles(a, b)).identical, true);
  bytes[65537] = 1; await fs.writeFile(b, bytes); assert.equal((await compareFiles(a, b)).firstDifference, 65537);
  await fs.writeFile(b, Buffer.alloc(131081, 42)); assert.equal((await compareFiles(a, b)).firstDifference, 131080);
  const controller = new AbortController(); controller.abort(); await assert.rejects(hashFile(a, controller.signal), e => e.name === 'AbortError');
});
test('queued task cancellation does not run its operation; HTTP task routes report results', async t => {
  let release; const barrier = new Promise(r => release = r), first = createJob('test', () => barrier); let ran = false;
  const second = createJob('test', () => { ran = true; }); cancelJob(second.id); release({ ok: true });
  assert.equal(getJob(second.id).state, 'canceled'); while (!getJob(first.id).finished) await new Promise(r => setTimeout(r, 5)); assert.equal(ran, false); assert.equal(getJob(first.id).state, 'completed');
  const { root } = await fixture(t), file = path.join(root, 'hash.txt'); await fs.writeFile(file, 'hello'); const job = await api('/api/task-start', { type: 'hash', path: file });
  while (!(await api('/api/task', job)).finished) await new Promise(r => setTimeout(r, 5)); assert.equal((await api('/api/task', job)).result.sha256.length, 64); assert.ok((await api('/api/logs', {})).entries.some(e => /Task hash completed/.test(e.message)));
  await assert.rejects(api('/api/task-start', { type: 'toString' }), /Unknown task/);
});
test('folder comparison distinguishes names and types without claiming equal contents', async t => {
  const { root, dest } = await fixture(t); const left = path.join(root, 'left'); await fs.mkdir(left); await fs.writeFile(path.join(left, 'only-left'), 'x'); await fs.writeFile(path.join(dest, 'only-right'), 'x'); await fs.mkdir(path.join(left, 'type')); await fs.writeFile(path.join(dest, 'type'), 'x');
  const job = await api('/api/task-start', { type: 'folders', left, right: dest }); while (!(await api('/api/task', job)).finished) await new Promise(r => setTimeout(r, 5));
  assert.deepEqual((await api('/api/task', job)).result.entries.map(e => e.status), ['Only left', 'Only right', 'Different types']);
});
