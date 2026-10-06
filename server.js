const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const publicDir = path.join(__dirname, 'public');
const trashDir = path.join(os.tmpdir(), 'commander-trash');
const token = crypto.randomBytes(24).toString('hex');
const MAX_TEXT = 2 * 1024 * 1024;
const { systemSnapshot } = require('./lib/system');
const SEARCH_WINDOW = 8 * 1024 * 1024;
function byteOffset(value) { if (!Number.isSafeInteger(value) || value < 0) throw Error('Offset must be a nonnegative safe integer.'); return value; }
async function binaryOperation(body, searchMode = false) {
  const offset = byteOffset(body.offset ?? 0), handle = await fs.open(absolute(body.path), 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw Error('Choose a regular file.');
    if (!Number.isSafeInteger(stat.size)) throw Error('This file exceeds the supported offset range.');
    if (body.modified !== undefined && (body.modified !== stat.mtimeMs || body.size !== stat.size)) throw Error('The file changed on disk. Reopen the viewer.');
    let pattern, length;
    if (searchMode) {
      if (typeof body.pattern !== 'string') throw Error('Enter a hexadecimal byte pattern.');
      const hex = body.pattern.replace(/\s/g, '');
      if (!/^(?:[0-9a-fA-F]{2}){1,256}$/.test(hex)) throw Error('Enter 1–256 complete hexadecimal bytes, for example DE AD BE EF.');
      pattern = Buffer.from(hex, 'hex'); length = SEARCH_WINDOW + pattern.length - 1;
    } else {
      length = body.length ?? 1024;
      if (!Number.isSafeInteger(length) || length < 1 || length > 65536) throw Error('Read size must be between 1 and 65,536 bytes.');
    }
    length = Math.min(length, Math.max(0, stat.size - offset));
    const buffer = Buffer.alloc(length); let read = 0;
    while (read < length) { const result = await handle.read(buffer, read, length - read, offset + read); if (!result.bytesRead) break; read += result.bytesRead; }
    const after = await handle.stat();
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw Error('The file changed during reading. Reopen the viewer.');
    const data = buffer.subarray(0, read), metadata = { size: stat.size, modified: stat.mtimeMs };
    if (!searchMode) return { ...metadata, offset, bytes: [...data] };
    const end = Math.min(stat.size, offset + SEARCH_WINDOW), index = data.indexOf(pattern);
    const found = index >= 0 && offset + index < end ? offset + index : null;
    return { ...metadata, found, nextOffset: found === null ? end : found + 1, done: found === null && end >= stat.size };
  } finally { await handle.close(); }
}
function absolute(p) { if (typeof p !== 'string' || !path.isAbsolute(p)) throw Error('An absolute path is required.'); return path.resolve(p); }
function child(dir, name) { if (typeof name !== 'string' || !name.trim() || name === '.' || name === '..' || /[\\/\x00]/.test(name) || (process.platform === 'win32' && (/[<>:"|?*]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)))) throw Error('Enter a valid file name without slashes or reserved characters.'); return path.join(absolute(dir), name); }
async function exists(p) { try { await fs.lstat(p); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
async function list(dir) {
  dir = absolute(dir);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async e => {
    try {
      const p = path.join(dir, e.name), s = await fs.lstat(p);
      return { name: e.name, path: p, directory: s.isDirectory(), link: s.isSymbolicLink(), size: s.size, modified: s.mtimeMs, hidden: e.name.startsWith('.'), extension: path.extname(e.name).slice(1).toLowerCase() };
    } catch { return null; }
  }));
  let disk = null;
  try { const s = await fs.statfs(dir); disk = { free: Number(s.bavail) * Number(s.bsize), total: Number(s.blocks) * Number(s.bsize) }; } catch {}
  return { path: dir, parent: path.dirname(dir), files: files.filter(Boolean), disk };
}
async function transfer(sources, destination, move) {
  if (!Array.isArray(sources) || !sources.length) throw Error('Choose at least one source.');
  destination = absolute(destination);
  if (!(await fs.stat(destination)).isDirectory()) throw Error('Destination must be a folder.');
  const pairs = [];
  for (const source of sources) {
    const src = absolute(source), dest = path.join(destination, path.basename(src));
    const realSrc = await fs.realpath(src), realDestination = await fs.realpath(destination);
    const rel = path.relative(realSrc, realDestination);
    if (rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel))) throw Error('A folder cannot be placed inside itself.');
    if (await exists(dest)) throw Error(`“${path.basename(dest)}” already exists at the destination. Rename it or choose another folder.`);
    if (pairs.some(p => p.dest === dest)) throw Error('Multiple sources have the same name.');
    pairs.push({ src, dest });
  }
  const completed = [];
  try {
    for (const { src, dest } of pairs) {
      if (move) { try { await fs.rename(src, dest); } catch (e) { if (e.code !== 'EXDEV') throw e; await fs.cp(src, dest, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true }); await fs.rm(src, { recursive: true }); } }
      else await fs.cp(src, dest, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
      completed.push(dest);
    }
  } catch (e) { throw Error(`${e.message}${completed.length ? ` (${completed.length} item(s) completed; remaining items were not processed.)` : ''}`); }
  return { completed };
}
async function recycle(sources) {
  if (!Array.isArray(sources) || !sources.length) throw Error('Choose at least one item.');
  await fs.mkdir(trashDir, { recursive: true });
  const batch = path.join(trashDir, crypto.randomUUID()); await fs.mkdir(batch);
  const items = [];
  try {
    for (let i = 0; i < sources.length; i++) {
      const original = absolute(sources[i]);
      if (path.dirname(original) === original || original === __dirname || original === os.homedir()) throw Error('This protected folder cannot be deleted.');
      const stored = path.join(batch, String(i));
      try { await fs.rename(original, stored); } catch (e) { if (e.code !== 'EXDEV') throw e; await fs.cp(original, stored, { recursive: true, verbatimSymlinks: true }); await fs.rm(original, { recursive: true }); }
      items.push({ original, stored });
      await fs.writeFile(path.join(batch, 'manifest.json'), JSON.stringify(items));
    }
  } catch(e) { throw Error(`${e.message} ${items.length ? 'Some items were recycled; use Trash to restore them.' : ''}`); }
  return { count: items.length };
}
async function trash() {
  await fs.mkdir(trashDir, { recursive: true }); const result = [];
  for (const batch of await fs.readdir(trashDir)) {
    try { const entries = JSON.parse(await fs.readFile(path.join(trashDir, batch, 'manifest.json'), 'utf8')); for (const [i, e] of entries.entries()) if (await exists(e.stored)) result.push({ id: `${batch}/${i}`, name: path.basename(e.original), original: e.original }); } catch {}
  } return result;
}
async function restore(id) {
  if (!/^[0-9a-f-]+\/\d+$/.test(id)) throw Error('Invalid trash entry.');
  const [batch, index] = id.split('/'); const items = JSON.parse(await fs.readFile(path.join(trashDir, batch, 'manifest.json'), 'utf8')); const item = items[Number(index)];
  if (!item || await exists(item.original)) throw Error('The original name is already in use.');
  await fs.mkdir(path.dirname(item.original), { recursive: true });
  try { await fs.rename(item.stored, item.original); } catch (e) { if (e.code !== 'EXDEV') throw e; await fs.cp(item.stored, item.original, { recursive: true }); await fs.rm(item.stored, { recursive: true }); }
  return {};
}
async function search(dir, query) {
  dir = absolute(dir); if (!query.trim()) throw Error('Enter a search term.');
  const found = []; let scanned = 0, limited = false;
  async function visit(p, depth) {
    if (depth > 15 || scanned >= 20000 || found.length >= 500) { limited = true; return; }
    let entries; try { entries = await fs.readdir(p, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (++scanned > 20000 || found.length >= 500) { limited = true; break; }
      const full = path.join(p, e.name);
      if (e.name.toLowerCase().includes(query.toLowerCase())) found.push({ name: e.name, path: full, directory: e.isDirectory() });
      if (e.isDirectory() && !e.isSymbolicLink()) await visit(full, depth + 1);
    }
  }
  await visit(dir, 0); return { files: found, limited };
}
async function api(route, body, options = {}) {
  switch (route) {
    case '/api/config': {
      const roots = process.platform === 'win32' ? (await Promise.all('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(async c => await exists(c + ':\\') ? c + ':\\' : null))).filter(Boolean) : ['/'];
      return { home: os.homedir(), cwd: options.cwd || process.cwd(), rightPath: options.rightPath, explicitPaths: options.explicitPaths || [], roots, separator: path.sep, platform: process.platform };
    }
    case '/api/list': return list(body.path);
    case '/api/details': {
      const p = absolute(body.path), s = await fs.lstat(p);
      const result = { path: p, name: path.basename(p) || p, parent: path.dirname(p), type: s.isSymbolicLink() ? 'Symbolic link' : s.isDirectory() ? 'Folder' : s.isFile() ? 'File' : 'Special item', size: s.size, modified: s.mtimeMs, created: s.birthtimeMs, accessed: s.atimeMs, mode: (s.mode & 0o777).toString(8).padStart(3, '0'), owner: process.platform === 'win32' ? null : { uid: s.uid, gid: s.gid }, hidden: path.basename(p).startsWith('.') };
      if (s.isSymbolicLink()) result.linkTarget = await fs.readlink(p);
      if (s.isDirectory()) {
        try { const contents = await list(p); result.contents = { folders: contents.files.filter(f => f.directory).length, files: contents.files.filter(f => !f.directory).length, bytes: contents.files.filter(f => !f.directory).reduce((n, f) => n + f.size, 0), disk: contents.disk }; }
        catch (e) { result.contentsError = ['EACCES', 'EPERM'].includes(e.code) ? 'Access denied when listing this folder.' : e.message; }
      }
      return result;
    }
    case '/api/system': return systemSnapshot();
    case '/api/permissions': {
      let p = absolute(body.path);
      while (true) { try { await fs.stat(p); break; } catch (e) { if (e.code !== 'ENOENT' || path.dirname(p) === p) throw e; p = path.dirname(p); } }
      if (process.platform === 'win32') {
        const literal = value => "'" + value.replace(/'/g, "''") + "'";
        const script = `$shell = New-Object -ComObject Shell.Application; $folder = $shell.Namespace(${literal(path.dirname(p))}); $item = $folder.ParseName(${literal(path.basename(p))}); if ($null -eq $item) { throw 'Cannot open file properties' }; $item.InvokeVerb('properties')`;
        await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000 });
        return { message: 'File Properties opened. Check General → Read-only first. For an access-control restriction, use Security → Edit to grant your account Write access for this item if appropriate, then retry saving here. If Windows asks for administrator approval, approve it in the system dialog. Your unsaved text remains in the editor. If this process is sandboxed, run Panevrix from your own terminal instead.' };
      }
      await exec(process.platform === 'darwin' ? 'open' : 'xdg-open', process.platform === 'darwin' ? ['-R', p] : [path.dirname(p)], { timeout: 15000 });
      return { message: process.platform === 'darwin' ? 'Finder opened. Select the item → Get Info → Sharing & Permissions and grant your account Read & Write access, then retry saving. Your unsaved text remains in the editor.' : 'The containing folder opened. Use the item’s Properties → Permissions to grant your account write access, then retry saving. Your unsaved text remains in the editor.' };
    }
    case '/api/copy': return transfer(body.sources, body.destination, false);
    case '/api/move': return transfer(body.sources, body.destination, true);
    case '/api/rename': {
      const source = absolute(body.path), dest = child(path.dirname(source), body.name);
      if (source === dest) return {}; if (await exists(dest)) throw Error('That name is already in use.'); await fs.rename(source, dest); return {};
    }
    case '/api/mkdir': await fs.mkdir(child(body.path, body.name)); return {};
    case '/api/create': await fs.writeFile(child(body.path, body.name), '', { flag: 'wx' }); return {};
    case '/api/delete': return recycle(body.sources);
    case '/api/trash': return { files: await trash() };
    case '/api/restore': return restore(body.id);
    case '/api/hex': return binaryOperation(body);
    case '/api/hex-search': return binaryOperation(body, true);
    case '/api/read': {
      const p = absolute(body.path), s = await fs.stat(p); if (s.size > MAX_TEXT) throw Object.assign(Error('Text editor supports files up to 2 MB. Use Hex view for large files.'), { code: 'HEX_REQUIRED' });
      const buf = await fs.readFile(p); if (buf.includes(0)) throw Object.assign(Error('This is a binary file. Use Hex view to inspect it.'), { code: 'HEX_REQUIRED' });
      return { text: buf.toString('utf8'), modified: s.mtimeMs };
    }
    case '/api/write': {
      const p = absolute(body.path), s = await fs.stat(p); if (s.mtimeMs !== body.modified) throw Error('This file changed on disk. Reopen it before saving.');
      if (Buffer.byteLength(body.text) > MAX_TEXT) throw Error('Text exceeds 2 MB.'); await fs.writeFile(p, body.text, 'utf8'); return { modified: (await fs.stat(p)).mtimeMs };
    }
    case '/api/search': return search(body.path, body.query);
    case '/api/open': {
      const p = absolute(body.path); await fs.access(p);
      if (process.platform === 'win32') await exec('rundll32.exe', ['url.dll,FileProtocolHandler', p], { windowsHide: true });
      else await exec(process.platform === 'darwin' ? 'open' : 'xdg-open', [p]); return {};
    }
    case '/api/command': {
      const cwd = absolute(body.path); if (!body.command.trim()) return { output: '' };
      try {
        const r = process.platform === 'win32' ? await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', body.command], { cwd, windowsHide: true, timeout: 30000, maxBuffer: MAX_TEXT }) : await exec('/bin/sh', ['-c', body.command], { cwd, timeout: 30000, maxBuffer: MAX_TEXT });
        return { output: r.stdout + r.stderr, success: true };
      } catch (e) { return { output: (e.stdout || '') + (e.stderr || '') + '\n' + e.message, success: false }; }
    }
    default: throw Error('Unknown operation.');
  }
}
function start(port = Number(process.env.PORT) || 3847, options = {}) {
  const server = http.createServer(async (req, res) => {
    const reject = (code, error) => { res.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ code, error })); };
    if (!/^((127\.0\.0\.1)|(localhost)):\d+$/.test(req.headers.host || '')) return reject('HOST_FORBIDDEN', 'Panevrix only accepts requests through localhost or 127.0.0.1.');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'");
    try {
      if (req.url.startsWith('/api/')) {
        if (req.method !== 'POST') return reject('METHOD_FORBIDDEN', 'This operation requires a POST request.');
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return reject('ORIGIN_FORBIDDEN', 'This request came from a different website. Open Panevrix directly at its local address.');
        if (req.headers['x-commander-token'] !== token) return reject('SESSION_EXPIRED', 'This app session has expired. Reconnect to the local Panevrix server.');
        let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 3 * MAX_TEXT) throw Error('Request too large.'); }
        const result = await api(req.url, JSON.parse(raw || '{}'), options); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result));
      } else {
        const url = new URL(req.url, 'http://localhost');
        const files = { '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/system.css': 'system.css' };
        if (!files[url.pathname]) { res.writeHead(404); return res.end('Not found'); }
        let content = await fs.readFile(path.join(publicDir, files[url.pathname]));
        if (url.pathname === '/') content = Buffer.from(content.toString().replace('__TOKEN__', token));
        res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'text/html');
        res.setHeader('Cache-Control', 'no-store'); res.end(content);
      }
    } catch (e) {
      const message = ['EPERM', 'EACCES'].includes(e.code)
        ? `Access denied${e.path ? `: ${e.path}` : ''}. Grant your account access through system permissions and retry, or choose a writable location. If Panevrix is running in a development sandbox, start it from your own terminal. Protected system folders may require administrator approval.`
        : e.message;
      res.writeHead(['EPERM', 'EACCES'].includes(e.code) ? 403 : 400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: message, code: e.code, path: ['EPERM', 'EACCES'].includes(e.code) ? e.path : undefined }));
    }
  });
  server.listen(port, '127.0.0.1', () => console.log(`Panevrix ready at http://127.0.0.1:${server.address().port}`)); return server;
}
if (require.main === module) start();
module.exports = { list, transfer, recycle, trash, restore, search, api, start };
