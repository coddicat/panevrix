'use strict';
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { list } = require('../server');
async function main() {
  const count = Number(process.argv[2] || 10000);
  if (!Number.isInteger(count) || count < 1 || count > 100000) throw Error('Choose between 1 and 100,000 files.');
  const base = path.resolve(os.tmpdir()), root = await fs.mkdtemp(path.join(base, 'panevrix-benchmark-'));
  try {
    for (let n = 0; n < count; n += 64) await Promise.all(Array.from({ length: Math.min(64, count - n) }, (_, i) => fs.writeFile(path.join(root, `file-${String(n + i).padStart(6, '0')}.txt`), 'benchmark')));
    const start = performance.now(), result = await list(root), elapsed = performance.now() - start;
    console.log(JSON.stringify({ platform: process.platform, node: process.version, files: result.files.length, listingMs: Math.round(elapsed), residentMemoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024), note: 'Synthetic local-disk listing; excludes fixture creation and browser rendering. Network drives differ.' }, null, 2));
  } finally {
    if (path.dirname(path.resolve(root)) !== base || !path.basename(root).startsWith('panevrix-benchmark-')) throw Error('Unexpected fixture path.');
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
