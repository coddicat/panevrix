'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/app.js'), 'utf8');
test('large folders render only visible rows and keyboard navigation reaches the last item', () => {
  const all = Array.from({ length: 20001 }, (_, n) => ({ name: String(n), path: '/item/' + n, size: n, modified: 0, directory: false, parent: n === 0 }));
  const tab = { cursor: 0, files: all.slice(1), selected: new Set() }, list = { scrollTop: 0, clientHeight: 340, innerHTML: '' }, footer = {}, count = {};
  const context = { state: { active: 0, panels: [{}] }, document: { body: { classList: { contains: () => false } } }, matchMedia: () => ({ matches: false }), current: () => tab, files: () => all, icon: () => ['file', 'x'], escape: String, fmt: String, updateDetails() {}, $$: () => [], $: selector => selector === '.file-list' ? list : selector === '.filter-count' ? count : selector === '.panel-footer' ? footer : {} };
  vm.createContext(context); vm.runInContext(source.slice(source.indexOf('function fileRowHeight()'), source.indexOf('function activate(')), context);
  context.renderFiles(0); assert.ok((list.innerHTML.match(/role="option"/g) || []).length <= 35); assert.match(list.innerHTML, /data-index="0"/);
  tab.cursor = 20000; context.ensureCursorVisible(0); assert.match(list.innerHTML, /data-index="20000"/); assert.ok((list.innerHTML.match(/role="option"/g) || []).length < 100);
  all.splice(5); tab.files = all.slice(1); context.renderFiles(0); assert.equal(tab.cursor, 4); assert.equal(list.scrollTop, 0); assert.match(list.innerHTML, /data-index="4"/);
});
