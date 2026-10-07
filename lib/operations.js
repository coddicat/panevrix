'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { log } = require('./logging');
const jobs = new Map(); let queue = Promise.resolve();
const absolute = p => { if (typeof p !== 'string' || !path.isAbsolute(p)) throw Error('An absolute path is required.'); return path.resolve(p); };
const exists = async p => { try { await fs.lstat(p); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
const inside = (parent, child) => { const r = path.relative(parent, child); return r === '' || (!r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r)); };
function createJob(type, run) {
  for (const [id, j] of jobs) if (j.finished && Date.now() - j.finished > 30 * 60 * 1000) jobs.delete(id);
  if ([...jobs.values()].filter(j => !j.finished).length >= 8) throw Error('The task queue is full. Wait for or cancel a task.');
  if (jobs.size >= 100) { const oldest = [...jobs.values()].find(j => j.finished); if (oldest) jobs.delete(oldest.id); }
  const job = { id: crypto.randomUUID(), type, state: 'queued', phase: 'Queued', bytes: 0, total: null, processed: 0, items: null, current: '', created: Date.now(), controller: new AbortController(), cancelable: true };
  jobs.set(job.id, job);
  log('info', `Task ${type} queued (${job.id})`);
  queue = queue.then(async () => {
    if (job.finished) return;
    try { job.controller.signal.throwIfAborted(); job.state = 'running'; job.result = await run(job); job.state = 'completed'; job.phase = 'Completed'; }
    catch (e) { job.state = e.name === 'AbortError' ? 'canceled' : 'failed'; job.error = e.message; job.code = e.code; job.path = e.path; job.phase = job.state === 'canceled' ? 'Canceled' : 'Failed'; }
    finally { job.finished = Date.now(); job.cancelable = false; log(job.state === 'failed' ? 'error' : 'info', `Task ${type} ${job.state} (${job.id})${job.error ? ': ' + job.error : ''}`); }
  });
  return { id: job.id };
}
function getJob(id) { const job = jobs.get(id); if (!job) throw Error('Task expired or the server restarted. Check the destination before retrying.'); const { controller, ...publicJob } = job; return publicJob; }
function cancelJob(id) { const job = jobs.get(id); if (!job) throw Error('Task not found.'); if (job.cancelable) { job.controller.abort(); if (job.state === 'queued') { job.state = 'canceled'; job.phase = 'Canceled'; job.finished = Date.now(); job.cancelable = false; log('info', `Task ${job.type} canceled before starting (${job.id})`); } } return getJob(id); }
async function transfer(sources, destination, move, { conflict = 'error', signal, progress = {} } = {}) {
  if (!Array.isArray(sources) || !sources.length || sources.length > 10000) throw Error('Choose 1–10,000 source items.');
  if (!['error', 'skip', 'rename'].includes(conflict)) throw Error('Unknown conflict policy.');
  const check = () => signal?.throwIfAborted(); check();
  destination = await fs.realpath(absolute(destination)); if (!(await fs.stat(destination)).isDirectory()) throw Error('Destination must be a folder.');
  const completed = [], skipped = [], pairs = [], reserved = new Set(), originals = [];
  progress.phase = 'Scanning'; progress.total = null; progress.bytes = 0; progress.processed = 0;
  for (const source of sources) {
    check(); const src = absolute(source), real = await fs.realpath(src);
    if (inside(real, destination)) throw Error('A folder cannot be placed inside itself.');
    if (originals.some(p => inside(p, real) || inside(real, p))) throw Error('Selected sources overlap. Choose the parent or its children, not both.'); originals.push(real);
    let dest = path.join(destination, path.basename(src));
    const key = p => process.platform === 'win32' ? p.toLowerCase() : p;
    if (await exists(dest) || reserved.has(key(dest))) {
      if (conflict === 'skip') { skipped.push(src); continue; }
      if (conflict === 'error') throw Error(`“${path.basename(dest)}” already exists at the destination.`);
      const parsed = path.parse(dest); let n = 1;
      do { dest = path.join(destination, `${parsed.name} (${n++})${parsed.ext}`); } while (await exists(dest) || reserved.has(key(dest)));
    }
    reserved.add(key(dest)); const entries = [];
    async function scan(p, relative = '', depth = 0) {
      check(); if (depth > 256) throw Error('Folder nesting exceeds the transfer limit.');
      const stat = await fs.lstat(p); progress.current = p;
      const entry = { src: p, relative, stat }; entries.push(entry);
      if (stat.isDirectory()) for (const name of await fs.readdir(p)) await scan(path.join(p, name), path.join(relative, name), depth + 1);
      else if (stat.isFile()) progress.bytes += stat.size;
      else if (!stat.isSymbolicLink()) throw Error(`Special files cannot be transferred: ${p}`);
    }
    await scan(src); pairs.push({ src, dest, entries });
  }
  progress.total = progress.bytes; progress.bytes = 0; progress.items = pairs.reduce((n, p) => n + p.entries.length, 0); progress.phase = move ? 'Moving' : 'Copying';
  for (const pair of pairs) {
    const created = []; let copied = false;
    try {
      for (const e of pair.entries) {
        check(); const dest = path.join(pair.dest, e.relative); progress.current = e.src;
        const current = await fs.lstat(e.src);
        if (current.dev !== e.stat.dev || current.ino !== e.stat.ino || current.isSymbolicLink() !== e.stat.isSymbolicLink()) throw Error('Source was replaced after scanning: ' + e.src);
        if (!(inside(destination, await fs.realpath(path.dirname(dest))))) throw Error('Destination folder was replaced during copying.');
        if (e.stat.isDirectory()) { await fs.mkdir(dest); created.push({ dest, dir: true, stat: await fs.lstat(dest) }); }
        else if (e.stat.isSymbolicLink()) { await fs.symlink(await fs.readlink(e.src), dest, process.platform === 'win32' ? (await fs.stat(e.src)).isDirectory() ? 'dir' : 'file' : undefined); created.push({ dest, link: true, stat: await fs.lstat(dest) }); }
        else {
          const input = await fs.open(e.src, 'r'); let output;
          try {
            const start = await input.stat(); if (start.dev !== e.stat.dev || start.ino !== e.stat.ino || start.size !== e.stat.size || start.mtimeMs !== e.stat.mtimeMs) throw Error('Source changed after scanning: ' + e.src);
            output = await fs.open(dest, 'wx'); created.push({ dest, stat: await output.stat() }); const buffer = Buffer.alloc(1024 * 1024); let offset = 0;
            while (offset < start.size) {
              check(); const { bytesRead } = await input.read(buffer, 0, Math.min(buffer.length, start.size - offset), offset); if (!bytesRead) throw Error('Source changed during copying: ' + e.src);
              let written = 0; while (written < bytesRead) { check(); const r = await output.write(buffer, written, bytesRead - written, offset + written); if (!r.bytesWritten) throw Error('Unable to write copied data.'); written += r.bytesWritten; }
              offset += bytesRead; progress.bytes += bytesRead;
            }
            const end = await input.stat(); if (end.size !== start.size || end.mtimeMs !== start.mtimeMs) throw Error('Source changed during copying: ' + e.src);
            await output.sync(); await output.chmod(e.stat.mode & 0o777); await output.utimes(e.stat.atime, e.stat.mtime);
          } finally { await output?.close(); await input.close(); }
        }
        progress.processed++;
      }
      check(); copied = true;
      if (move) {
        progress.phase = 'Removing copied source'; progress.cancelable = false;
        try {
          for (const e of [...pair.entries].reverse()) {
            const now = await fs.lstat(e.src);
            if (now.dev !== e.stat.dev || now.ino !== e.stat.ino || now.isDirectory() !== e.stat.isDirectory() || now.isSymbolicLink() !== e.stat.isSymbolicLink()) throw Error('Source replaced before removal: ' + e.src);
            if (e.stat.isDirectory()) await fs.rmdir(e.src);
            else { if (now.size !== e.stat.size || now.mtimeMs !== e.stat.mtimeMs) throw Error('Source changed before removal: ' + e.src); await fs.unlink(e.src); }
          }
        } finally { progress.cancelable = true; progress.phase = 'Moving'; }
      }
      completed.push(pair.dest);
    } catch (e) {
      const retained = [];
      if (!copied) for (const c of created.reverse()) { try {
        const now = await fs.lstat(c.dest);
        if (now.dev !== c.stat.dev || now.ino !== c.stat.ino || now.isSymbolicLink() !== c.stat.isSymbolicLink()) throw Error('Created output was replaced.');
        if (c.dir) await fs.rmdir(c.dest); else { if (!c.link) await fs.chmod(c.dest, 0o600).catch(() => {}); await fs.unlink(c.dest); }
      } catch (failure) { if (failure.code !== 'ENOENT') retained.push(c.dest); } }
      const failure = new Error(e.message + ` ${completed.length} top-level item(s) completed.${copied ? ' The complete destination copy was kept; source removal was incomplete.' : retained.length ? ` Cleanup could not remove: ${retained.join(', ')}` : ' The incomplete current item was removed; originals were kept.'}`, { cause: e });
      failure.name = e.name; failure.code = e.code; failure.path = e.path; throw failure;
    }
  }
  return { completed, skipped };
}
async function hashFile(file, signal, progress = {}) {
  file = absolute(file); const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat(); if (!stat.isFile()) throw Error('Choose a regular file.');
    progress.phase = 'Hashing SHA-256'; progress.current = file; progress.total = stat.size; progress.bytes = 0;
    const hash = crypto.createHash('sha256'), buffer = Buffer.alloc(1024 * 1024); let offset = 0;
    while (offset < stat.size) { signal?.throwIfAborted(); const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, stat.size - offset), offset); if (!bytesRead) throw Error('File changed during hashing.'); hash.update(buffer.subarray(0, bytesRead)); offset += bytesRead; progress.bytes = offset; }
    signal?.throwIfAborted(); const after = await handle.stat(); if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw Error('File changed during hashing.');
    return { path: file, size: stat.size, sha256: hash.digest('hex') };
  } finally { await handle.close(); }
}
async function compareFiles(left, right, signal, progress = {}) {
  const a = await fs.open(absolute(left), 'r'); let b;
  try {
    b = await fs.open(absolute(right), 'r'); const sa = await a.stat(), sb = await b.stat();
    if (!sa.isFile() || !sb.isFile()) throw Error('Choose two regular files.');
    progress.phase = 'Comparing bytes'; progress.total = Math.min(sa.size, sb.size); progress.bytes = 0;
    const ba = Buffer.alloc(65536), bb = Buffer.alloc(65536); let firstDifference = null;
    for (let offset = 0; offset < progress.total && firstDifference === null;) {
      signal?.throwIfAborted(); const length = Math.min(ba.length, progress.total - offset);
      async function read(h, buffer) { let n = 0; while (n < length) { const r = await h.read(buffer, n, length - n, offset + n); if (!r.bytesRead) throw Error('File changed during comparison.'); n += r.bytesRead; } }
      await Promise.all([read(a, ba), read(b, bb)]);
      for (let n = 0; n < length; n++) if (ba[n] !== bb[n]) { firstDifference = offset + n; break; }
      offset += length; progress.bytes = offset;
    }
    signal?.throwIfAborted(); const ea = await a.stat(), eb = await b.stat();
    if (ea.size !== sa.size || ea.mtimeMs !== sa.mtimeMs || eb.size !== sb.size || eb.mtimeMs !== sb.mtimeMs) throw Error('A file changed during comparison.');
    if (firstDifference === null && sa.size !== sb.size) firstDifference = Math.min(sa.size, sb.size);
    return { identical: firstDifference === null, firstDifference, leftSize: sa.size, rightSize: sb.size };
  } finally { await b?.close(); await a.close(); }
}
module.exports = { transfer, createJob, getJob, cancelJob, hashFile, compareFiles, listJobs: () => [...jobs.keys()].map(getJob).reverse() };
