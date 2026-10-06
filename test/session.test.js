const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const apiSource = source.slice(source.indexOf('async function api('), source.indexOf('let toastTimer;'));
function client(fetch) {
  const context = vm.createContext({ fetch, token: 'old-token', sessionRefresh: null, DOMParser: class {
    parseFromString(html) { return { querySelector: () => ({ content: html.match(/content="([a-f0-9]+)"/)?.[1] }) }; }
  } });
  vm.runInContext(apiSource, context); return context.api;
}
test('expired session refreshes token and retries the same unsaved text once', async () => {
  const calls = [], next = 'a'.repeat(48);
  const api = client(async (url, options) => {
    calls.push({ url, options });
    if (url === '/') return new Response(`<meta content="${next}">`);
    return options.headers['X-Commander-Token'] === next ? Response.json({ modified: 12 }) : Response.json({ code: 'SESSION_EXPIRED' }, { status: 403 });
  });
  assert.equal((await api('write', { path: '/file', text: 'unsaved text', modified: 10 })).modified, 12);
  assert.equal(calls.length, 3); assert.equal(calls[0].options.body, calls[2].options.body);
});
test('legacy plain Forbidden response also reconnects without a JSON parse error', async () => {
  let writes = 0;
  const api = client(async url => url === '/' ? new Response(`<meta content="${'b'.repeat(48)}">`) : ++writes === 1 ? new Response('Forbidden', { status: 403 }) : Response.json({}));
  await api('write'); assert.equal(writes, 2);
});
test('origin rejection and filesystem denial never refresh or replay a mutation', async () => {
  for (const code of ['ORIGIN_FORBIDDEN', 'EACCES']) {
    let calls = 0;
    const api = client(async () => { calls++; return Response.json({ error: 'Denied', code, path: '/file' }, { status: 403 }); });
    await assert.rejects(api('write'), e => e.code === code && e.path === '/file'); assert.equal(calls, 1);
  }
});
test('invalid server response is readable and repeated session failure stops retrying', async () => {
  const api = client(async () => new Response('Bad Gateway', { status: 502 }));
  await assert.rejects(api('write'), /unexpected response.*502/);
  let calls = 0;
  const expired = client(async url => { calls++; return url === '/' ? new Response(`<meta content="${'c'.repeat(48)}">`) : Response.json({ error: 'Expired', code: 'SESSION_EXPIRED' }, { status: 403 }); });
  await assert.rejects(expired('write'), /Expired/); assert.equal(calls, 3);
});
