const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const navigation = source.slice(source.indexOf('const folderLoads ='), source.indexOf('async function history('));
function setup() {
  const panel = { path: '/old', files: [{ path: '/old/file' }], cursor: 0, selected: new Set(), revision: 0, filter: '', history: ['/old'], historyIndex: 0 };
  const root = { hidden: true, innerHTML: '' }, pending = [], buttons = [];
  const context = vm.createContext({ AbortController, state: { panels: [panel] }, current: p => p, files: t => t.files, escape: String, status: () => {}, toast: () => {}, render: () => {}, saveSession: () => {}, $: () => root,
    $$: () => { buttons.length = 0; for (const match of root.innerHTML.matchAll(/data-cancel-load="(\d+)"/g)) buttons.push({ dataset: { cancelLoad: match[1] } }); return buttons; },
    api: (route, body, retried, signal) => new Promise(resolve => pending.push({ resolve, signal, path: body.path })) });
  vm.runInContext(navigation, context); return { context, panel, root, pending, buttons };
}
function result(path) { return { path, files: [{ path: path + '/file' }] }; }
test('Cancel hides progress immediately and a late result cannot change the visible folder', async () => {
  const { context, panel, root, pending, buttons } = setup();
  const loading = context.navigate(0, '/slow'); assert.equal(root.hidden, false); assert.match(root.innerHTML, /progress/);
  buttons[0].onclick(); assert.equal(root.hidden, true); assert.equal(pending[0].signal.aborted, true); assert.equal(panel.path, '/old');
  pending[0].resolve(result('/slow')); assert.equal(await loading, null); assert.equal(panel.path, '/old'); assert.deepEqual(panel.history, ['/old']);
});
test('a newer navigation cancels its predecessor and ignores out-of-order results', async () => {
  const { context, panel, pending, root } = setup();
  const first = context.navigate(0, '/slow'), second = context.navigate(0, '/new'); assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve(result('/new')); assert.equal(await second, true); assert.equal(panel.path, '/new');
  pending[0].resolve(result('/slow')); await first; assert.equal(panel.path, '/new'); assert.equal(root.hidden, true);
});
