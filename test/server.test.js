const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { api, list, transfer, recycle, trash, restore, search, start } = require('../server');
async function fixture(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'commander-test-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; }
test('listing returns real metadata and parent; search discovers nested files', async t => {
  const dir = await fixture(t); await fs.mkdir(path.join(dir, 'nested')); await fs.writeFile(path.join(dir, 'nested', 'report.txt'), 'hello');
  const result = await list(dir); assert.equal(result.parent, path.dirname(dir)); assert.equal(result.files[0].directory, true);
  const found = await search(dir, 'report'); assert.equal(found.files.length, 1); assert.equal(found.files[0].name, 'report.txt');
});
test('copy is recursive, preserves source and refuses collisions; move removes source', async t => {
  const dir = await fixture(t), source = path.join(dir, 'source'), dest = path.join(dir, 'dest'), other = path.join(dir, 'other');
  await fs.mkdir(source); await fs.mkdir(dest); await fs.mkdir(other); await fs.writeFile(path.join(source, 'file.txt'), 'contents');
  await transfer([source], dest, false); assert.equal(await fs.readFile(path.join(dest, 'source', 'file.txt'), 'utf8'), 'contents'); assert.equal(await fs.readFile(path.join(source, 'file.txt'), 'utf8'), 'contents');
  await assert.rejects(transfer([source], dest, false), /already exists/);
  await transfer([source], other, true); await assert.rejects(fs.stat(source), /ENOENT/); assert.equal(await fs.readFile(path.join(other, 'source', 'file.txt'), 'utf8'), 'contents');
});
test('transfer rejects putting a folder inside itself before copying anything', async t => {
  const dir = await fixture(t); const nested = path.join(dir, 'nested'); await fs.mkdir(nested);
  await assert.rejects(transfer([dir], nested, false), /inside itself/);
});
test('delete and restore round-trip contents without overwriting a new file', async t => {
  const dir = await fixture(t), file = path.join(dir, 'recover.txt'); await fs.writeFile(file, 'original');
  await recycle([file]); await assert.rejects(fs.stat(file), /ENOENT/);
  const item = (await trash()).find(f => f.original === file); assert.ok(item);
  await fs.writeFile(file, 'new'); await assert.rejects(restore(item.id), /already in use/); assert.equal(await fs.readFile(file, 'utf8'), 'new');
  await fs.unlink(file); await restore(item.id); assert.equal(await fs.readFile(file, 'utf8'), 'original');
});
test('editor guards external changes and binary files; new names cannot escape folders', async t => {
  const dir = await fixture(t), file = path.join(dir, 'text.txt'); await fs.writeFile(file, 'old');
  const read = await api('/api/read', { path: file }); await api('/api/write', { path: file, modified: read.modified, text: 'updated' }); assert.equal(await fs.readFile(file, 'utf8'), 'updated');
  await assert.rejects(api('/api/write', { path: file, modified: -1, text: 'wrong' }), /changed on disk/);
  await assert.rejects(api('/api/create', { path: dir, name: '../outside' }), /valid file name/);
  await fs.writeFile(file, Buffer.from([0, 1, 2])); await assert.rejects(api('/api/read', { path: file }), /binary/);
});
test('HTTP server serves application and rejects unauthenticated operations and hostile origins', async t => {
  const server = start(0); await new Promise(r => server.once('listening', r)); t.after(() => new Promise(r => server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const html = await (await fetch(url)).text(); assert.match(html, /Panevrix/); const token = html.match(/commander-token" content="([^"]+)"/)[1];
  assert.equal((await fetch(url + '/api/config', { method: 'POST' })).status, 403);
  assert.equal((await fetch(url + '/api/config', { method: 'POST', headers: { 'X-Commander-Token': token, Origin: 'https://example.com' } })).status, 403);
  const response = await fetch(url + '/api/config', { method: 'POST', headers: { 'X-Commander-Token': token } }); assert.equal(response.status, 200); assert.ok((await response.json()).roots.length);
  assert.equal((await fetch(url + '/missing')).status, 404);
});
test('hex reader loads bounded pages with exact offsets, empty files and EOF', async t => {
  const dir = await fixture(t), file = path.join(dir, 'bytes.bin');
  const bytes = Buffer.from(Array.from({ length: 4099 }, (_, n) => n % 256)); await fs.writeFile(file, bytes);
  const page = await api('/api/hex', { path: file, offset: 1024, length: 1024 });
  assert.equal(page.size, bytes.length); assert.equal(page.offset, 1024); assert.deepEqual(page.bytes, [...bytes.subarray(1024, 2048)]);
  const end = await api('/api/hex', { path: file, offset: 4096, length: 1024 }); assert.deepEqual(end.bytes, [...bytes.subarray(4096)]);
  assert.deepEqual((await api('/api/hex', { path: file, offset: 2 ** 32 + 16 })).bytes, []);
  await assert.rejects(api('/api/hex', { path: file, offset: -1 }), /Offset/);
  await assert.rejects(api('/api/hex', { path: file, offset: 1.5 }), /Offset/);
  await assert.rejects(api('/api/hex', { path: file, length: 65537 }), /Read size/);
  await fs.writeFile(file, ''); assert.deepEqual((await api('/api/hex', { path: file })).bytes, []);
});
test('hex search finds cross-window patterns, successive overlapping matches and EOF', async t => {
  const dir = await fixture(t), file = path.join(dir, 'large.bin'), boundary = 8 * 1024 * 1024;
  const data = Buffer.alloc(boundary + 64, 0); Buffer.from('deadbeef', 'hex').copy(data, boundary - 2); Buffer.from('aaaaaa', 'hex').copy(data, boundary + 20); await fs.writeFile(file, data);
  const first = await api('/api/hex-search', { path: file, pattern: 'DE AD BE EF', offset: 0 }); assert.equal(first.found, boundary - 2);
  const nextWindow = await api('/api/hex-search', { path: file, pattern: 'AA AA', offset: 0 }); assert.equal(nextWindow.found, null); assert.equal(nextWindow.nextOffset, boundary); assert.equal(nextWindow.done, false);
  const found = await api('/api/hex-search', { path: file, pattern: 'AAAA', offset: nextWindow.nextOffset }); assert.equal(found.found, boundary + 20);
  const overlap = await api('/api/hex-search', { path: file, pattern: 'AAAA', offset: found.nextOffset }); assert.equal(overlap.found, boundary + 21);
  const missing = await api('/api/hex-search', { path: file, pattern: 'FFFF', offset: boundary }); assert.equal(missing.done, true); assert.equal(missing.found, null);
  for (const pattern of ['', 'F', 'GG', 'AA'.repeat(257)]) await assert.rejects(api('/api/hex-search', { path: file, pattern }), /hexadecimal bytes/);
});
test('hex pages and search reject stale file snapshots; large binary F3 falls back to hex', async t => {
  const dir = await fixture(t), file = path.join(dir, 'large.bin'); await fs.writeFile(file, Buffer.alloc(3 * 1024 * 1024));
  await assert.rejects(api('/api/read', { path: file }), e => e.code === 'HEX_REQUIRED');
  const page = await api('/api/hex', { path: file }); assert.equal(page.bytes.length, 1024);
  await fs.appendFile(file, 'changed');
  for (const route of ['/api/hex', '/api/hex-search']) await assert.rejects(api(route, { path: file, modified: page.modified, size: page.size, pattern: '00' }), /changed on disk/);
});
