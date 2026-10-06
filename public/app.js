'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
let token = $('meta[name="commander-token"]').content;
let sessionRefresh = null;
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`;
const base = p => p.replace(/[\\/]$/, '').split(/[\\/]/).pop() || p;
function stored(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
const state = { active: 0, panels: [], config: null, favorites: stored('commander.favorites', []), settings: { hidden: true, directoriesFirst: true, compact: false, systemRefresh: 5000, ...stored('commander.settings', {}) }, clipboard: null, busy: false, commandHistory: [], commandIndex: 0, activity: stored('panevrix.activity', []) };
state.detailsMode = stored('panevrix.detailsMode', false);
let detailsRevision = 0, detailsTimer;
function toggleDetails() {
  state.detailsMode = !state.detailsMode;
  localStorage.setItem('panevrix.detailsMode', JSON.stringify(state.detailsMode)); render(); focusPanel();
}
function detailsMarkup(i) {
  return `<section class="panel information-panel" aria-label="${i ? 'Right' : 'Left'} information panel"><div class="panel-label"><strong>INFORMATION</strong><span class="active-mark">FOLLOWS ${state.active ? 'RIGHT' : 'LEFT'} PANEL</span></div><div class="information-toolbar"><span>File & folder details</span><button class="button" id="close-information" title="Restore file panel (Ctrl+I)">Close <kbd>Ctrl+I</kbd></button></div><div id="information-content" class="information-content" aria-live="polite"></div><div class="panel-footer">Move through the active panel to inspect another item.</div></section>`;
}
function updateDetails() {
  clearTimeout(detailsTimer); const revision = ++detailsRevision;
  if (!state.detailsMode) return;
  const root = $('#information-content'); if (!root) return;
  const t = current(), f = files(t)[t.cursor], target = !f || f.parent ? t.path : f.path;
  root.innerHTML = `<p class="eyebrow">CURRENT FOLDER</p><p class="information-path">${escape(t.path)}</p><p>Loading details…</p>`;
  detailsTimer = setTimeout(async () => {
    try {
      const d = await api('details', { path: target });
      if (revision !== detailsRevision || !root.isConnected) return;
      const date = value => value > 0 ? new Date(value).toLocaleString() : 'Unavailable';
      const rows = [['Name', d.name], ['Full path', d.path], ['Type', d.type], ['Size', d.type === 'Folder' ? 'See direct contents below' : `${fmt(d.size)} (${d.size.toLocaleString()} bytes)`], ['Modified', date(d.modified)], ['Created', date(d.created)], ['Accessed', date(d.accessed)], ['Hidden name', d.hidden ? 'Yes' : 'No']];
      if (d.owner) rows.push(['Permissions (octal)', d.mode], ['Owner UID / group GID', `${d.owner.uid} / ${d.owner.gid}`]);
      if (d.linkTarget) rows.push(['Link target', d.linkTarget]);
      if (d.contents) { rows.push(['Direct folders', d.contents.folders], ['Direct files', d.contents.files], ['Direct file sizes', fmt(d.contents.bytes)]); if (d.contents.disk) rows.push(['Disk available', fmt(d.contents.disk.free)], ['Disk total', fmt(d.contents.disk.total)]); }
      root.innerHTML = `<p class="eyebrow">CURRENT FOLDER</p><p class="information-path">${escape(t.path)}</p><h2>${escape(d.name)}</h2><span class="local-badge">${escape(d.type)}</span><dl>${rows.map(([label, value]) => `<div class="information-row"><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>${d.contents ? '<p class="information-note">Folder counts and sizes cover immediate contents; subfolders are not scanned recursively.</p>' : ''}${d.contentsError ? `<p role="alert">${escape(d.contentsError)}</p>` : ''}`;
    } catch (e) { if (revision === detailsRevision && root.isConnected) root.innerHTML = `<p class="information-path">${escape(target)}</p><p role="alert">${escape(e.message)}</p>`; }
  }, 120);
}
document.body.classList.toggle('compact', state.settings.compact);
function recordActivity(label, phase, detail = '', duration = 0) {
  state.activity.unshift({ label, phase, detail, duration, at: Date.now() }); state.activity = state.activity.slice(0, 100);
  try { localStorage.setItem('panevrix.activity', JSON.stringify(state.activity)); } catch {}
}
async function api(route, data = {}, retried = false) {
  const response = await fetch('/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Commander-Token': token }, body: JSON.stringify(data) });
  const raw = await response.text(); let result;
  try { result = JSON.parse(raw); } catch { result = { error: response.status === 403 ? 'This app session has expired. Reload Panevrix to reconnect.' : `The server returned an unexpected response (HTTP ${response.status}).`, code: response.status === 403 && raw.trim() === 'Forbidden' ? 'SESSION_EXPIRED' : 'INVALID_RESPONSE' }; }
  if (!response.ok && result.code === 'SESSION_EXPIRED' && !retried) {
    if (!sessionRefresh) sessionRefresh = (async () => {
      const page = await fetch('/', { cache: 'no-store' });
      if (!page.ok) throw Error('Unable to reconnect to Panevrix. Keep your editor open and restart the local server.');
      const next = new DOMParser().parseFromString(await page.text(), 'text/html').querySelector('meta[name="commander-token"]')?.content;
      if (!next || !/^[a-f0-9]{48}$/.test(next)) throw Error('Unable to refresh the Panevrix session. Keep your unsaved text and reload after restarting the server.');
      token = next;
    })().finally(() => { sessionRefresh = null; });
    await sessionRefresh; return api(route, data, true);
  }
  if (!response.ok) throw Object.assign(Error(result.error || 'Operation failed.'), { code: result.code, path: result.path }); return result;
}
let toastTimer;
function toast(message, error = false) { const e = $('#toast'); e.textContent = message; e.className = 'show' + (error ? ' error' : ''); clearTimeout(toastTimer); toastTimer = setTimeout(() => e.className = '', error ? 7000 : 3500); }
function status(message) { $('#global-status').textContent = message; }
function current(p = state.panels[state.active]) { return p.tabs[p.tab]; }
function tab(path) { return { path, files: [], parent: path, selected: new Set(), cursor: 0, filter: '', sort: 'name', direction: 1, history: [path], historyIndex: 0, disk: null, revision: 0 }; }
function saveSession() { localStorage.setItem('commander.session', JSON.stringify(state.panels.map(p => ({ paths: p.tabs.map(t => t.path), tab: p.tab })))); }
function files(t) {
  const result = t.files.filter(f => (state.settings.hidden || !f.hidden) && f.name.toLowerCase().includes(t.filter.toLowerCase()));
  result.sort((a, b) => {
    if (state.settings.directoriesFirst && a.directory !== b.directory) return a.directory ? -1 : 1;
    const comparison = t.sort === 'name' ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : (t.sort === 'size' ? a.size - b.size : a.modified - b.modified);
    return comparison * t.direction;
  });
  return [{ name: '..', path: t.parent, directory: true, parent: true }, ...result];
}
function selected(t = current()) { const items = files(t); return t.selected.size ? t.files.filter(f => t.selected.has(f.path)) : items[t.cursor] && !items[t.cursor].parent ? [items[t.cursor]] : []; }
function icon(f) { if (f.parent) return ['folder', '↰']; if (f.directory) return ['folder', '▱']; if (f.link) return ['', '↗']; if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(f.extension)) return ['image', '▧']; if (['js', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'py', 'rs', 'go', 'sh', 'ps1'].includes(f.extension)) return ['code', '‹›']; if (['zip', 'rar', '7z', 'gz', 'tar'].includes(f.extension)) return ['', '▤']; return ['', '≡']; }
function panelMarkup(p, i) {
  const t = current(p);
  return `<section class="panel ${state.active === i ? 'active' : ''}" data-panel="${i}" tabindex="0" aria-label="${i ? 'Right' : 'Left'} file panel">
  <div class="panel-label"><strong>${i ? 'RIGHT' : 'LEFT'} PANEL</strong><span class="active-mark">${state.active === i ? '● ACTIVE' : '○ INACTIVE'}</span></div>
  <div class="tabs">${p.tabs.map((t, n) => `<button class="tab ${p.tab === n ? 'current' : ''}" data-tab="${n}"><span>▱ &nbsp;${escape(base(t.path))}</span>${p.tabs.length > 1 ? '<span class="tab-close" title="Close tab">×</span>' : ''}</button>`).join('')}<button class="tab-add" title="New tab (Ctrl+T)">＋</button></div>
  <form class="pathbar"><button type="button" class="icon-button back-button" title="Back (Alt+Left)">‹</button><button type="button" class="icon-button up-button" title="Parent folder (Backspace)">↑</button><select class="drive" aria-label="Drive">${state.config.roots.map(r => `<option value="${escape(r)}" ${t.path.toLowerCase().startsWith(r.toLowerCase()) ? 'selected' : ''}>${escape(r.replace(/\\$/, ''))}</option>`).join('')}</select><input class="path-input" aria-label="Folder path" value="${escape(t.path)}" spellcheck="false"><button type="button" class="path-star ${state.favorites.includes(t.path) ? 'saved' : ''}" title="Toggle favorite">${state.favorites.includes(t.path) ? '★' : '☆'}</button></form>
  <div class="filterbar"><span>⌕</span><input class="filter-input" aria-label="Filter files" placeholder="Filter files in this folder…" value="${escape(t.filter)}"><span class="filter-count"></span></div>
  <div class="table-head"><button data-sort="name">NAME ${t.sort === 'name' ? (t.direction === 1 ? '↑' : '↓') : ''}</button><button data-sort="size">SIZE ${t.sort === 'size' ? (t.direction === 1 ? '↑' : '↓') : ''}</button><button data-sort="modified">MODIFIED ${t.sort === 'modified' ? (t.direction === 1 ? '↑' : '↓') : ''}</button></div><div class="file-list" role="listbox" aria-label="Files" aria-multiselectable="true"></div><div class="panel-footer"></div><div class="diskbar"><div style="width:${t.disk ? Math.max(0, Math.min(100, 100 * (1 - t.disk.free / t.disk.total))) : 0}%"></div></div></section>`;
}
function render() {
  $('#panels').innerHTML = state.panels.map((p, i) => state.detailsMode && i !== state.active ? detailsMarkup(i) : panelMarkup(p, i)).join('');
  state.panels.forEach((p, i) => { if (!state.detailsMode || i === state.active) { wirePanel(p, i); renderFiles(i); } });
  $('#close-information')?.addEventListener('click', toggleDetails);
  $('#details-toggle').setAttribute('aria-pressed', String(state.detailsMode));
  updateDetails();
}
function renderFiles(i) {
  if (state.detailsMode && i !== state.active) return;
  const p = state.panels[i], t = current(p), root = $(`[data-panel="${i}"]`), list = $('.file-list', root), all = files(t);
  t.cursor = Math.max(0, Math.min(t.cursor, all.length - 1));
  const scroll = list.scrollTop;
  list.innerHTML = all.map((f, n) => {
    const [type, symbol] = icon(f);
    return `<div class="file-row ${n === t.cursor ? 'cursor' : ''} ${t.selected.has(f.path) ? 'selected' : ''}" data-index="${n}" role="option" aria-selected="${t.selected.has(f.path)}" title="${escape(f.path)}"><div class="file-name"><span class="file-icon ${type}">${symbol}</span><span class="name-text">${escape(f.name)}</span>${t.selected.has(f.path) ? '<span class="selection-check">✓</span>' : ''}</div><span class="file-size ${f.directory ? 'directory' : ''}">${f.parent ? '' : f.directory ? '&lt;DIR&gt;' : fmt(f.size)}</span><span class="file-date">${f.parent ? '' : new Date(f.modified).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })}</span></div>`;
  }).join('') + (all.length === 1 ? `<div class="empty-state"><strong>${t.filter ? 'No matching files' : 'A little room to create.'}</strong>${t.filter ? 'Try another filter or press Escape to clear it.' : 'This folder is empty. Create a folder with F7 or add a new file.'}</div>` : '');
  list.scrollTop = scroll;
  $('.filter-count', root).textContent = `${all.length - 1} items`;
  const total = t.files.filter(f => !f.directory).reduce((s, f) => s + f.size, 0), chosen = t.files.filter(f => t.selected.has(f.path));
  $('.panel-footer', root).innerHTML = `<span>${t.files.filter(f => f.directory).length} folders, ${t.files.filter(f => !f.directory).length} files <span class="selection-total">${chosen.length ? ` · ${chosen.length} selected (${fmt(chosen.filter(f => !f.directory).reduce((s, f) => s + f.size, 0))})` : ` · ${fmt(total)}`}</span></span><span class="free-space">${t.disk ? fmt(t.disk.free) + ' free' : ''}</span>`;
  $$('.file-row', list).forEach(row => {
    row.onclick = e => {
      activate(i); const n = Number(row.dataset.index);
      if (e.shiftKey) { for (let j = Math.min(n, t.cursor); j <= Math.max(n, t.cursor); j++) if (!all[j].parent) t.selected.add(all[j].path); }
      else if (e.ctrlKey || e.metaKey) toggle(t, all[n]);
      else t.selected.clear();
      t.cursor = n; renderFiles(i); root.focus({ preventScroll: true });
    };
    row.ondblclick = () => { t.cursor = Number(row.dataset.index); activate(i); openCurrent(); };
    row.oncontextmenu = e => { e.preventDefault(); activate(i); t.cursor = Number(row.dataset.index); renderFiles(i); properties(); };
  });
  if (i === state.active) updateDetails();
}
function activate(i) {
  if (state.detailsMode) { if (state.active !== i) { state.active = i; render(); } return; }
  state.active = i;
  $$('.panel').forEach((root, n) => { root.classList.toggle('active', n === i); $('.active-mark', root).textContent = n === i ? '● ACTIVE' : '○ INACTIVE'; });
}
function focusPanel() { $(`[data-panel="${state.active}"]`)?.focus({ preventScroll: true }); }
function wirePanel(p, i) {
  const root = $(`[data-panel="${i}"]`);
  root.addEventListener('pointerdown', () => activate(i)); root.addEventListener('focusin', () => activate(i));
  $('.pathbar', root).onsubmit = e => { e.preventDefault(); navigate(i, $('.path-input', root).value); };
  $('.up-button', root).onclick = () => navigate(i, current(p).parent);
  $('.back-button', root).onclick = () => history(i, -1);
  $('.drive', root).onchange = e => navigate(i, e.target.value);
  $('.path-star', root).onclick = () => { const path = current(p).path; state.favorites = state.favorites.includes(path) ? state.favorites.filter(f => f !== path) : [...state.favorites, path]; localStorage.setItem('commander.favorites', JSON.stringify(state.favorites)); render(); };
  $('.filter-input', root).oninput = e => { const t = current(p); t.filter = e.target.value; t.cursor = 0; renderFiles(i); };
  $$('.tab', root).forEach(b => b.onclick = e => {
    const n = Number(b.dataset.tab);
    if (e.target.closest('.tab-close')) { p.tabs.splice(n, 1); p.tab = Math.min(p.tab, p.tabs.length - 1); }
    else p.tab = n;
    activate(i); render(); saveSession(); focusPanel();
  });
  $('.tab-add', root).onclick = () => newTab(i);
  $$('[data-sort]', root).forEach(b => b.onclick = () => { const t = current(p); t.direction = t.sort === b.dataset.sort ? -t.direction : 1; t.sort = b.dataset.sort; render(); });
}
async function navigate(i, path, addHistory = true) {
  const p = state.panels[i], t = current(p), revision = ++t.revision;
  status('Reading folder…');
  try {
    const data = await api('list', { path }); if (revision !== t.revision) return false;
    Object.assign(t, data); t.cursor = 0; t.selected.clear(); t.filter = '';
    if (addHistory && t.history[t.historyIndex] !== data.path) { t.history = t.history.slice(0, t.historyIndex + 1); t.history.push(data.path); t.historyIndex++; }
    render(); saveSession(); status('Ready'); return true;
  } catch (e) { toast(e.message, true); status('Unable to read folder'); return false; }
}
async function refresh() {
  await Promise.all(state.panels.map(async (p, i) => {
    const t = current(p), cursorPath = files(t)[t.cursor]?.path, revision = ++t.revision;
    try { const data = await api('list', { path: t.path }); if (revision !== t.revision) return; Object.assign(t, data); t.selected = new Set([...t.selected].filter(path => t.files.some(f => f.path === path))); t.cursor = Math.max(0, files(t).findIndex(f => f.path === cursorPath)); }
    catch (e) { toast(e.message, true); }
  })); render(); status('Ready');
}
async function history(i, delta) { const t = current(state.panels[i]), n = t.historyIndex + delta; if (n < 0 || n >= t.history.length) return; if (await navigate(i, t.history[n], false)) t.historyIndex = n; focusPanel(); }
async function newTab(i = state.active) { const p = state.panels[i]; p.tabs.push(tab(current(p).path)); p.tab = p.tabs.length - 1; render(); await navigate(i, current(p).path); focusPanel(); }
function toggle(t, file) { if (!file || file.parent) return; t.selected.has(file.path) ? t.selected.delete(file.path) : t.selected.add(file.path); }
async function openCurrent() { const t = current(), f = files(t)[t.cursor]; if (!f) return; if (f.directory) { await navigate(state.active, f.path); focusPanel(); } else { try { await api('open', { path: f.path }); toast('Opened ' + f.name); } catch(e) { toast(e.message, true); } } }
const dialog = $('#dialog'); let onDialogClose = null;
dialog.addEventListener('close', () => { const fn = onDialogClose; onDialogClose = null; fn?.(); focusPanel(); });
function closeDialog() { dialog.close(); }
function showDialog(title, content, buttons = [], wide = false) {
  dialog.className = wide ? 'editor-dialog' : '';
  $('#dialog-content').innerHTML = `<div class="dialog-head"><h2>${escape(title)}</h2><button class="dialog-close" aria-label="Close">×</button></div><div class="dialog-body">${content}</div><div class="dialog-actions"><button class="button cancel">Close</button>${buttons.map((b, i) => `<button class="button ${b.danger ? 'danger ' : ''}${b.primary ? 'primary' : ''}" data-dialog-button="${i}">${escape(b.label)}</button>`).join('')}</div>`;
  $('.dialog-close', dialog).onclick = closeDialog; $('.cancel', dialog).onclick = closeDialog;
  buttons.forEach((b, i) => $(`[data-dialog-button="${i}"]`, dialog).onclick = b.action);
  if (!dialog.open) dialog.showModal();
  setTimeout(() => $('input, textarea, .primary', dialog)?.focus(), 0);
}
function showOperationError(e) {
  toast(e.message, true);
  if (!dialog.open) return;
  let error = $('#operation-error', dialog);
  if (!error) { error = document.createElement('p'); error.id = 'operation-error'; error.setAttribute('role', 'alert'); $('.dialog-body', dialog).append(error); }
  error.textContent = e.message;
  $('#permission-help', dialog)?.remove();
  if (!['EPERM', 'EACCES'].includes(e.code) || !e.path) return;
  const access = document.createElement('button'); access.id = 'permission-help'; access.className = 'button';
  access.textContent = 'Grant access in system permissions…'; $('.dialog-body', dialog).append(access);
  access.onclick = async () => {
    access.disabled = true;
    try { const help = await api('permissions', { path: e.path }); error.textContent = help.message; }
    catch (failure) { error.textContent = failure.message; }
    finally { access.disabled = false; }
  };
}
async function operation(label, fn) {
  if (state.busy) return; state.busy = true; status(label + '…'); document.body.classList.add('busy');
  const began = Date.now(); recordActivity(label, 'Running');
  try { await fn(); recordActivity(label, 'Completed', '', Date.now() - began); closeDialog(); await refresh(); toast(label + ' complete'); }
  catch (e) {
    recordActivity(label, 'Failed', e.message, Date.now() - began);
    showOperationError(e);
    await refresh();
  }
  finally { state.busy = false; document.body.classList.remove('busy'); status('Ready'); }
}
function nameDialog(kind) {
  const t = current(), item = selected()[0]; if (kind === 'rename' && !item) return toast('Choose a file or folder first.');
  const title = kind === 'mkdir' ? 'New folder' : kind === 'create' ? 'New file' : 'Rename ' + item.name;
  showDialog(title, `<p>${escape(t.path)}</p><label class="field">${kind === 'rename' ? 'New name' : 'Name'}<input id="name-input" value="${kind === 'rename' ? escape(item.name) : ''}" placeholder="${kind === 'mkdir' ? 'Folder name' : 'File name'}"></label>`, [{ label: kind === 'rename' ? 'Rename' : 'Create', primary: true, action: () => operation(title, () => api(kind, { path: kind === 'rename' ? item.path : t.path, name: $('#name-input').value })) }]);
  $('#name-input').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('[data-dialog-button="0"]', dialog).click(); } }; $('#name-input').select();
}
function transferDialog(move = false, clipboard = false) {
  const sources = clipboard ? state.clipboard?.sources : selected().map(f => f.path); if (!sources?.length) return toast('Choose one or more items first.');
  const dest = clipboard ? current().path : current(state.panels[1 - state.active]).path;
  showDialog(`${move ? 'Move' : 'Copy'} ${sources.length} item${sources.length > 1 ? 's' : ''}`, `<div class="selection-list">${sources.map(p => escape(base(p))).join('<br>')}</div><label class="field">Destination folder<input id="destination-input" value="${escape(dest)}"></label><p>Existing files are preserved. If a name is already in use, choose another destination or rename the item.</p>`, [{ label: move ? 'Move items' : 'Copy items', primary: true, action: () => operation(move ? 'Move' : 'Copy', async () => { await api(move ? 'move' : 'copy', { sources, destination: $('#destination-input').value }); if (clipboard && move) state.clipboard = null; }) }]);
}
function deleteDialog() {
  const items = selected(); if (!items.length) return toast('Choose one or more items first.');
  showDialog(`Delete ${items.length} item${items.length > 1 ? 's' : ''}?`, `<p>These items will move to Panevrix’s recovery folder. You can restore them using Trash in the sidebar.</p><div class="selection-list">${items.map(f => escape(f.name)).join('<br>')}</div>`, [{ label: 'Move to Trash', primary: true, danger: true, action: () => operation('Delete', () => api('delete', { sources: items.map(f => f.path) })) }]);
}
async function hexViewer(item = selected()[0]) {
  if (!item || item.directory) return toast('Choose a file first.');
  let initial;
  try { initial = await api('hex', { path: item.path, offset: 0, length: 1024 }); }
  catch (e) { return toast(e.message, true); }
  let offset = 0, target = null, match = null, patternLength = 0, nextMatch = 0, searching = false, alive = true, pageRevision = 0, searchRevision = 0;
  const size = initial.size, modified = initial.modified, pageSize = 1024;
  let viewMode = 'hex', loadedPage = initial;
  const hex = n => n.toString(16).toUpperCase().padStart(Math.max(8, size.toString(16).length), '0');
  showDialog('Hex view · ' + item.name, `<p>${escape(item.path)} · ${fmt(size)} · ${size.toLocaleString()} bytes · Read only</p>
    <div class="byte-view-switch" role="group" aria-label="Byte display mode"><button class="button primary" id="byte-mode-hex" aria-pressed="true">Hex</button><button class="button" id="byte-mode-ascii" aria-pressed="false">ASCII text</button><span>ASCII text preserves line breaks and tabs; other nonprintable bytes appear as dots.</span></div>
    <div class="hex-controls"><button class="button" id="hex-first">First</button><button class="button" id="hex-prev">← Previous</button><button class="button" id="hex-next">Next →</button><button class="button" id="hex-last">Last</button><form id="hex-jump-form"><input id="hex-offset" aria-label="Byte offset" placeholder="Offset: 4096 or 0x1000"><button class="button" type="submit">Jump</button></form></div>
    <form id="hex-search-form" class="hex-search"><input id="hex-pattern" aria-label="Hex byte pattern" placeholder="Hex bytes, e.g. DE AD BE EF" maxlength="768"><button class="button primary" id="hex-find" type="submit">Find next</button><button class="button" id="hex-stop" type="button" hidden>Stop</button><span id="hex-search-status" role="status"></span></form>
    <div class="hex-heading"><span>BYTE OFFSET</span><span>HEX · 16 BYTES PER ROW</span><span>ASCII</span></div><div id="hex-data" class="hex-data" tabindex="0" aria-label="Hexadecimal file contents"></div><div id="hex-range" class="hex-range"></div>`, [], true);
  dialog.classList.add('hex-dialog');
  const dataRoot = $('#hex-data'), range = $('#hex-range'), searchStatus = $('#hex-search-status');
  onDialogClose = () => { alive = false; pageRevision++; searchRevision++; };
  function draw(data) {
    loadedPage = data;
    const bytes = data.bytes;
    const highlighted = pos => (match !== null && pos >= match && pos < match + patternLength) || pos === target;
    dataRoot.classList.toggle('ascii-text-view', viewMode === 'ascii');
    dataRoot.setAttribute('aria-label', viewMode === 'ascii' ? 'ASCII file contents' : 'Hexadecimal file contents');
    const heading = $('.hex-heading', dialog);
    heading.classList.toggle('ascii-heading', viewMode === 'ascii');
    heading.innerHTML = viewMode === 'ascii' ? '<span>ASCII TEXT · CURRENT BYTE RANGE</span>' : '<span>BYTE OFFSET</span><span>HEX · 16 BYTES PER ROW</span><span>ASCII</span>';
    dataRoot.innerHTML = !bytes.length ? '<div class="empty-state">This file is empty.</div>' : viewMode === 'ascii' ? bytes.map((b, n) => {
      const text = b === 13 ? (bytes[n + 1] === 10 ? '' : '\n') : b === 10 ? '\n' : b === 9 ? '\t' : b >= 32 && b <= 126 ? String.fromCharCode(b) : '.';
      return `<span class="ascii-character ${highlighted(offset + n) ? 'hex-match' : ''}" title="Byte 0x${hex(offset + n)} · ${b.toString(16).padStart(2, '0').toUpperCase()}">${escape(text)}</span>`;
    }).join('') : Array.from({ length: Math.ceil(bytes.length / 16) }, (_, row) => {
      const start = offset + row * 16, slice = bytes.slice(row * 16, row * 16 + 16);
      const column = ascii => Array.from({ length: 16 }, (_, n) => {
        if (n >= slice.length) return `<span class="hex-byte">${ascii ? ' ' : '  '}</span>`;
        const b = slice[n], text = ascii ? escape(b >= 32 && b <= 126 ? String.fromCharCode(b) : '.') : b.toString(16).padStart(2, '0').toUpperCase();
        return `<span class="hex-byte ${highlighted(start + n) ? 'hex-match' : ''}">${text}</span>`;
      }).join('');
      return `<div class="hex-row"><span class="hex-address">${hex(start)}</span><span class="hex-values">${column(false)}</span><span class="hex-ascii">${column(true)}</span></div>`;
    }).join('');
    range.textContent = bytes.length ? `0x${hex(offset)} – 0x${hex(offset + bytes.length - 1)} · ${bytes.length.toLocaleString()} bytes loaded of ${size.toLocaleString()}` : '0 bytes';
    $('#hex-first').disabled = $('#hex-prev').disabled = offset === 0;
    $('#hex-next').disabled = $('#hex-last').disabled = offset + pageSize >= size;
    dataRoot.scrollTop = 0;
    $('.hex-match', dataRoot)?.scrollIntoView({ block: 'nearest' });
  }
  function switchView(mode) {
    viewMode = mode;
    for (const type of ['hex', 'ascii']) { const button = $('#byte-mode-' + type); button.classList.toggle('primary', type === mode); button.setAttribute('aria-pressed', String(type === mode)); }
    draw(loadedPage); dataRoot.focus();
  }
  $('#byte-mode-hex').onclick = () => switchView('hex');
  $('#byte-mode-ascii').onclick = () => switchView('ascii');
  async function load(value, highlightedOffset = null) {
    const revision = ++pageRevision;
    const requested = Math.floor(Math.max(0, Math.min(value, Math.max(0, size - 1))) / 16) * 16;
    range.textContent = 'Loading bytes…';
    try {
      const data = await api('hex', { path: item.path, offset: requested, length: pageSize, modified, size });
      if (!alive || revision !== pageRevision) return;
      offset = requested; target = highlightedOffset; draw(data);
    } catch (e) { if (alive && revision === pageRevision) { range.textContent = e.message; toast(e.message, true); } }
  }
  $('#hex-first').onclick = () => load(0); $('#hex-prev').onclick = () => load(offset - pageSize);
  $('#hex-next').onclick = () => load(offset + pageSize); $('#hex-last').onclick = () => load(Math.floor(Math.max(0, size - 1) / pageSize) * pageSize);
  $('#hex-jump-form').onsubmit = e => {
    e.preventDefault(); const raw = $('#hex-offset').value.trim();
    if (!/^(?:\d+|0x[0-9a-f]+)$/i.test(raw)) return toast('Enter a decimal offset or hexadecimal offset beginning with 0x.', true);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0 || value >= size) return toast(size ? `Offset must be between 0 and ${size - 1}.` : 'This file is empty.', true);
    load(value, value);
  };
  function stopSearch() { searchRevision++; searching = false; $('#hex-stop').hidden = true; $('#hex-find').disabled = false; }
  $('#hex-stop').onclick = () => { stopSearch(); searchStatus.textContent = 'Search stopped.'; };
  let lastPattern = '';
  $('#hex-pattern').oninput = () => { stopSearch(); lastPattern = ''; nextMatch = offset; match = null; searchStatus.textContent = ''; };
  $('#hex-search-form').onsubmit = async e => {
    e.preventDefault(); if (searching) return;
    const pattern = $('#hex-pattern').value.replace(/\s/g, '').toUpperCase();
    if (!/^(?:[0-9A-F]{2}){1,256}$/.test(pattern)) return toast('Enter 1–256 complete hex bytes, e.g. DE AD BE EF.', true);
    if (pattern !== lastPattern) { nextMatch = offset; match = null; lastPattern = pattern; }
    const revision = ++searchRevision; searching = true; $('#hex-find').disabled = true; $('#hex-stop').hidden = false;
    const searchStart = nextMatch; let position = searchStart;
    try {
      while (alive && revision === searchRevision) {
        searchStatus.textContent = `Searching · ${size ? Math.min(100, position / size * 100).toFixed(1) : 100}% · Stop to cancel`;
        const result = await api('hex-search', { path: item.path, offset: position, pattern, modified, size });
        if (!alive || revision !== searchRevision) return;
        nextMatch = result.nextOffset;
        if (result.found !== null) {
          match = result.found; patternLength = pattern.length / 2;
          await load(Math.floor(match / 16) * 16, match);
          searchStatus.textContent = `Found at 0x${hex(match)} (${match.toLocaleString()})`; break;
        }
        if (result.done) { nextMatch = 0; searchStatus.textContent = `No ${searchStart ? 'more ' : ''}matches. Find next searches again from the beginning.`; break; }
        position = result.nextOffset;
      }
    } catch (e) { if (alive && revision === searchRevision) searchStatus.textContent = e.message; }
    finally { if (alive && revision === searchRevision) { searching = false; $('#hex-find').disabled = false; $('#hex-stop').hidden = true; } }
  };
  dataRoot.onkeydown = e => {
    if (['PageDown', 'PageUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault(); load(e.key === 'Home' ? 0 : e.key === 'End' ? Math.floor(Math.max(0, size - 1) / pageSize) * pageSize : offset + (e.key === 'PageDown' ? pageSize : -pageSize));
    } else if ((e.ctrlKey || e.metaKey) && ['f', 'g'].includes(e.key.toLowerCase())) { e.preventDefault(); $(e.key.toLowerCase() === 'f' ? '#hex-pattern' : '#hex-offset').focus(); }
  };
  draw(initial); dataRoot.focus();
}
async function editor(edit = false) {
  const item = selected()[0]; if (!item || item.directory) return toast('Choose a text file first.');
  try {
    const data = await api('read', { path: item.path });
    showDialog((edit ? 'Edit · ' : 'View · ') + item.name, `<p>${escape(item.path)} · UTF-8</p><textarea class="editor" id="editor" spellcheck="false" ${edit ? '' : 'readonly'} aria-label="File contents">${escape(data.text)}</textarea>`, edit ? [{ label: 'Save · Ctrl+S', primary: true, action: async () => {
      try { const result = await api('write', { path: item.path, text: $('#editor').value, modified: data.modified }); data.modified = result.modified; data.text = $('#editor').value; $('#operation-error', dialog)?.remove(); $('#permission-help', dialog)?.remove(); toast('File saved'); await refresh(); }
      catch (e) { showOperationError(e); }
    } }] : [], true);
    const text = $('#editor');
    text.onkeydown = e => { if (e.ctrlKey && e.key.toLowerCase() === 's' && edit) { e.preventDefault(); $('[data-dialog-button="0"]', dialog).click(); } if (e.key === 'Tab' && edit) { e.preventDefault(); text.setRangeText('  ', text.selectionStart, text.selectionEnd, 'end'); } };
    const attemptClose = () => { if (edit && text.value !== data.text && !confirm('Discard unsaved changes?')) return; closeDialog(); };
    $('.dialog-close', dialog).onclick = attemptClose; $('.cancel', dialog).onclick = attemptClose;
    dialog.oncancel = e => { if (edit && text.value !== data.text) { e.preventDefault(); attemptClose(); } };
    onDialogClose = () => { dialog.oncancel = null; };
  } catch(e) { if (!edit && e.code === 'HEX_REQUIRED') return hexViewer(item); if (['EPERM', 'EACCES'].includes(e.code)) { showDialog('File access required', `<p>${escape(item.path)}</p>`); showOperationError(e); } else toast(e.message, true); }
}
function properties() {
  const item = selected()[0]; if (!item) return;
  showDialog('Properties', [['Name', item.name], ['Location', item.path], ['Type', item.directory ? 'Folder' : item.link ? 'Symbolic link' : (item.extension || 'Unknown') + ' file'], ['Size', fmt(item.size) + ' (' + item.size.toLocaleString() + ' bytes)'], ['Modified', new Date(item.modified).toLocaleString()], ['Hidden', item.hidden ? 'Yes' : 'No']].map(([label, value]) => `<div class="info-row"><span>${escape(label)}</span><span>${escape(value)}</span></div>`).join(''), [{ label: 'Open', primary: true, action: () => { closeDialog(); openCurrent(); } }]);
}
function help() {
  const shortcuts = [['Tab', 'Switch the active panel'], ['↑ / ↓ · Home / End', 'Move through files'], ['Page Up / Page Down', 'Move one page'], ['Enter', 'Open folder or default application'], ['Backspace', 'Go to parent folder'], ['Space / Insert', 'Toggle selection and move down'], ['Shift + ↑ / ↓', 'Extend selection'], ['Ctrl + A', 'Select all visible items'], ['Ctrl + C / X / V', 'Copy / cut / paste files'], ['Ctrl + T / W', 'Create / close folder tab'], ['Ctrl + L / F', 'Focus path / filter'], ['Ctrl + R', 'Refresh both panels'], ['Alt + ← / →', 'Back / forward in folder history'], ['Shift + F3', 'Hex / ASCII viewer'], ['Shift + F7', 'Search folder recursively'], ['Shift + Enter', 'File properties'], ['Escape', 'Clear selection and filter'], ['F1 … F10', 'Actions shown in the bottom bar']];
  shortcuts.splice(12, 0, ['Ctrl + I', 'Toggle live information in the inactive panel']);
  showDialog('At your fingertips', `<p>A familiar two-panel workflow. Select items in the active panel; copy and move target the other panel. Right-click an item to view its properties.</p><div class="shortcut-grid">${shortcuts.map(([key, value]) => `<kbd>${escape(key)}</kbd><span>${escape(value)}</span>`).join('')}</div>`);
}
function systemSettings() {
  showDialog('System & display settings', `<label class="field">System monitor refresh<select id="setting-system-refresh"><option value="0">Manual only</option><option value="5000">Every 5 seconds</option><option value="10000">Every 10 seconds</option><option value="30000">Every 30 seconds</option></select></label><label class="settings-row">Compact file rows<input type="checkbox" id="setting-compact" ${state.settings.compact ? 'checked' : ''}></label><p>Activity history keeps the last 100 events in this browser.</p>`, [{ label: 'Save settings', primary: true, action: () => {
    state.settings.systemRefresh = Number($('#setting-system-refresh').value); state.settings.compact = $('#setting-compact').checked;
    document.body.classList.toggle('compact', state.settings.compact); localStorage.setItem('commander.settings', JSON.stringify(state.settings)); closeDialog();
  } }]);
  $('#setting-system-refresh').value = String(state.settings.systemRefresh);
}
async function systemMonitor() {
  let snapshot = null, section = 'overview', filter = '', sort = 'memory', descending = true, selectedPid = null, live = true, alive = true, pending = false;
  const history = [];
  showDialog('System monitor', `<div class="monitor-nav"><button class="button primary" data-monitor-tab="overview">Overview</button><button class="button" data-monitor-tab="processes">Processes</button><button class="button" data-monitor-tab="activity">Activity</button><span class="monitor-spacer"></span><label><input type="checkbox" id="monitor-live" checked> Live</label><button class="button" id="monitor-refresh">Refresh</button></div><div id="monitor-status" role="status">Reading your system…</div><div id="monitor-content"></div>`, [{ label: 'Monitor settings', action: () => { closeDialog(); systemSettings(); } }], true);
  dialog.classList.add('monitor-dialog');
  const root = $('#monitor-content'), statusNode = $('#monitor-status');
  function percent(value) { return value === null ? 'Sampling…' : value.toFixed(1) + '%'; }
  function duration(seconds) { const hours = Math.floor(seconds / 3600), days = Math.floor(hours / 24); return `${days ? days + 'd ' : ''}${hours % 24}h ${Math.floor(seconds / 60) % 60}m`; }
  function chart(values, title) { return `<div class="monitor-chart" aria-label="${title}">${values.map(value => `<span style="height:${Math.max(2, value || 0)}%" title="${percent(value)}"></span>`).join('')}</div>`; }
  function draw() {
    $$('[data-monitor-tab]', dialog).forEach(button => { button.classList.toggle('primary', button.dataset.monitorTab === section); button.setAttribute('aria-pressed', String(button.dataset.monitorTab === section)); });
    if (section === 'activity') {
      root.innerHTML = `<div class="activity-summary">${state.busy ? '<span class="local-badge">● An operation is running</span>' : 'No application operation is running.'}<button class="button" id="activity-clear">Clear history</button></div>${state.activity.length ? state.activity.map(event => `<div class="activity-item"><span class="activity-phase ${event.phase.toLowerCase()}">${escape(event.phase)}</span><div><strong>${escape(event.label)}</strong>${event.detail ? `<p>${escape(event.detail)}</p>` : ''}<small>${new Date(event.at).toLocaleString()}${event.duration ? ' · ' + (event.duration / 1000).toFixed(1) + 's' : ''}</small></div></div>`).join('') : '<div class="empty-state">File operations and commands will appear here.</div>'}`;
      $('#activity-clear').onclick = () => { state.activity = []; localStorage.removeItem('panevrix.activity'); draw(); }; return;
    }
    if (!snapshot) return;
    const s = snapshot;
    if (section === 'overview') {
      const details = [['Operating system', s.version], ['Kernel / release', s.release], ['Architecture', s.architecture], ['Hostname', s.hostname], ['Processor', s.cpu.model], ['Logical cores', s.cpu.cores], ['System uptime', duration(s.uptime)], ['Node.js runtime', s.runtime.node], ['Panevrix server PID', s.runtime.pid], ['Server memory', fmt(s.runtime.memory)], ['Load averages (1 / 5 / 15 min)', s.load ? s.load.map(n => n.toFixed(2)).join(' / ') : 'Not provided by Windows']];
      root.innerHTML = `<div class="monitor-cards"><div class="monitor-card"><span>CPU USAGE</span><strong>${percent(s.cpu.usage)}</strong><small>${s.cpu.cores} logical cores</small>${chart(history.map(h => h.cpu), 'CPU usage history')}</div><div class="monitor-card"><span>MEMORY USED</span><strong>${percent(s.memory.percent)}</strong><small>${fmt(s.memory.used)} of ${fmt(s.memory.total)}</small>${chart(history.map(h => h.memory), 'Memory usage history')}</div><div class="monitor-card"><span>PROCESSES</span><strong>${s.processError ? 'Unavailable' : s.processes.length}</strong><small>${s.processError ? escape(s.processError) : 'Running on this computer'}</small><div class="memory-meter"><div style="width:${s.memory.percent}%"></div></div><small>${fmt(s.memory.free)} memory available</small></div></div><div class="system-detail-grid"><section><h3>System details</h3>${details.map(([key, value]) => `<div class="info-row"><span>${escape(key)}</span><span>${escape(value)}</span></div>`).join('')}</section><section><h3>Network interfaces</h3>${s.network.length ? s.network.map(n => `<div class="info-row"><span>${escape(n.name)} · ${escape(n.family)}</span><span>${escape(n.address)}</span></div>`).join('') : '<p>No external network interfaces reported.</p>'}<h3>Snapshot</h3><p>Updated ${new Date(s.sampledAt).toLocaleTimeString()}. CPU usage is measured between snapshots. Memory figures reflect the operating system’s available-memory accounting.</p></section></div>`;
      return;
    }
    const rows = s.processes.filter(p => `${p.name} ${p.pid} ${p.window}`.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => {
      const result = sort === 'name' ? a.name.localeCompare(b.name) : (a[sort] ?? -1) - (b[sort] ?? -1); return descending ? -result : result;
    });
    root.innerHTML = `<div class="process-tools"><input id="process-filter" aria-label="Filter processes" placeholder="Filter by process name, PID, or window title…" value="${escape(filter)}"><span>${rows.length} of ${s.processes.length} processes</span></div>${s.processError ? `<p class="monitor-error">${escape(s.processError)}</p>` : ''}<div class="process-table"><div class="process-row process-head">${[['pid', 'PID'], ['name', 'PROCESS'], ['cpu', 'CPU %'], ['memory', 'MEMORY']].map(([key, name]) => `<button data-process-sort="${key}">${name}${sort === key ? descending ? ' ↓' : ' ↑' : ''}</button>`).join('')}</div><div class="process-list">${rows.map(p => `<button class="process-row ${selectedPid === p.pid ? 'selected' : ''}" data-process-pid="${p.pid}"><span>${p.pid}</span><span>${escape(p.name)}</span><span>${p.cpu === null ? '—' : p.cpu.toFixed(1) + '%'}</span><span>${fmt(p.memory)}</span></button>`).join('')}</div></div><p class="process-note">${escape(s.cpuMethod)} Select a process for details. Some protected process fields may be unavailable.</p><div id="process-detail"></div>`;
    const input = $('#process-filter'); input.oninput = () => { filter = input.value; const cursor = input.selectionStart; draw(); $('#process-filter').focus(); $('#process-filter').setSelectionRange(cursor, cursor); };
    $$('[data-process-sort]', root).forEach(button => button.onclick = () => { if (sort === button.dataset.processSort) descending = !descending; else { sort = button.dataset.processSort; descending = sort !== 'name'; } draw(); });
    $$('[data-process-pid]', root).forEach(button => button.onclick = () => { selectedPid = Number(button.dataset.processPid); draw(); });
    const process = s.processes.find(p => p.pid === selectedPid);
    if (process) $('#process-detail').innerHTML = `<h3>${escape(process.name)} · PID ${process.pid}</h3><div class="process-detail-grid">${[['Parent PID', process.parent ?? 'Unavailable'], ['State', process.state || 'Unavailable'], ['Threads', process.threads ?? 'Unavailable'], ['Handles', process.handles ?? 'Unavailable'], ['Window title', process.window || 'No title reported'], ['Memory', fmt(process.memory)]].map(([key, value]) => `<div class="info-row"><span>${key}</span><span>${escape(value)}</span></div>`).join('')}</div>`;
  }
  async function update() {
    if (!alive || pending) return; pending = true; $('#monitor-refresh').disabled = true;
    try {
      const data = await api('system'); if (!alive) return;
      snapshot = data; history.push({ cpu: data.cpu.usage, memory: data.memory.percent }); if (history.length > 40) history.shift();
      const editing = document.activeElement?.id === 'process-filter';
      statusNode.textContent = `Updated ${new Date(data.sampledAt).toLocaleTimeString()} · ${data.platform === 'win32' ? 'Windows' : data.platform === 'darwin' ? 'macOS' : data.os}`;
      if (!editing) draw();
    } catch (e) { if (alive) statusNode.textContent = e.message; }
    finally { pending = false; if (alive) $('#monitor-refresh').disabled = false; }
  }
  $$('[data-monitor-tab]', dialog).forEach(button => button.onclick = () => { section = button.dataset.monitorTab; draw(); });
  $('#monitor-live').checked = state.settings.systemRefresh > 0; live = $('#monitor-live').checked;
  $('#monitor-live').onchange = e => { live = e.target.checked; };
  $('#monitor-refresh').onclick = update;
  const timer = setInterval(() => { if (live && !document.hidden) update(); }, Math.max(5000, state.settings.systemRefresh || 5000));
  onDialogClose = () => { alive = false; clearInterval(timer); };
  await update();
}
function settings() {
  showDialog('Workspace settings', `<label class="settings-row">Show hidden files<input type="checkbox" id="setting-hidden" ${state.settings.hidden ? 'checked' : ''}></label><label class="settings-row">Show folders before files<input type="checkbox" id="setting-folders" ${state.settings.directoriesFirst ? 'checked' : ''}></label><p>Tabs, favorites, and preferences are saved in this browser. Deleted items are stored in Panevrix’s recovery folder under the system temporary directory.</p>`, [{ label: 'Apply settings', primary: true, action: () => { state.settings.hidden = $('#setting-hidden').checked; state.settings.directoriesFirst = $('#setting-folders').checked; localStorage.setItem('commander.settings', JSON.stringify(state.settings)); closeDialog(); render(); } }]);
}
function favorites() {
  showDialog('Favorite places', `<p>Click the star beside a panel path to save that folder.</p><div id="favorite-list">${state.favorites.length ? state.favorites.map((p, i) => `<button class="list-choice" data-favorite="${i}"><span>☆</span><span>${escape(base(p))}<small>${escape(p)}</small></span></button>`).join('') : '<div class="empty-state">No favorites yet.</div>'}</div>`);
  $$('[data-favorite]', dialog).forEach(b => b.onclick = () => { const p = state.favorites[Number(b.dataset.favorite)]; closeDialog(); navigate(state.active, p); });
}
async function trash() {
  try {
    const result = await api('trash');
    showDialog('Recover deleted files', `<p>Select an item to restore it to its original location. Recovery files are kept in the system temporary directory; system cleanup can remove them.</p>${result.files.length ? result.files.map((f, i) => `<button class="list-choice" data-restore="${i}"><span>↶</span><span>${escape(f.name)}<small>${escape(f.original)}</small></span><span class="remove">Restore</span></button>`).join('') : '<div class="empty-state">Trash is empty.</div>'}`);
    $$('[data-restore]', dialog).forEach(b => b.onclick = () => operation('Restore', () => api('restore', { id: result.files[Number(b.dataset.restore)].id })));
  } catch(e) { toast(e.message, true); }
}
function searchDialog() {
  const path = current().path;
  showDialog('Find files', `<p>Search names in ${escape(path)} and its subfolders.</p><label class="field">File or folder name<input id="search-query" placeholder="e.g. report, .png, package"></label><div id="search-results"></div>`, [{ label: 'Search', primary: true, action: async () => {
    const button = $('[data-dialog-button="0"]', dialog), results = $('#search-results'); button.disabled = true; results.textContent = 'Searching…';
    try {
      const data = await api('search', { path, query: $('#search-query').value });
      if (!dialog.open || !results.isConnected) return;
      results.innerHTML = `<p>${data.files.length} results${data.limited ? ' · Search limit reached (500 results, 20,000 items or 15 levels).' : ''}</p>` + data.files.map((f, i) => `<button class="list-choice" data-result="${i}"><span>${f.directory ? '▱' : '≡'}</span><span>${escape(f.name)}<small>${escape(f.path)}</small></span></button>`).join('');
      $$('[data-result]', results).forEach(b => b.onclick = async () => { const f = data.files[Number(b.dataset.result)]; closeDialog(); const folder = f.directory ? f.path : f.path.slice(0, Math.max(f.path.lastIndexOf('/'), f.path.lastIndexOf('\\')) + 1); await navigate(state.active, folder); if (!f.directory) { current().cursor = files(current()).findIndex(item => item.path === f.path); renderFiles(state.active); } focusPanel(); });
    } catch(e) { results.textContent = e.message; } finally { button.disabled = false; }
  } }]);
  $('#search-query').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('[data-dialog-button="0"]', dialog).click(); } };
}
function terminal() { $('#terminal').hidden = !$('#terminal').hidden; if (!$('#terminal').hidden) $('#command-input').focus(); else focusPanel(); }
const actions = { help, rename: () => nameDialog('rename'), view: () => editor(), hex: () => hexViewer(), edit: () => editor(true), copy: () => transferDialog(), move: () => transferDialog(true), mkdir: () => nameDialog('mkdir'), create: () => nameDialog('create'), delete: deleteDialog, settings, terminal, search: searchDialog, refresh, favorites, trash };
const buttons = { 'help-button': 'help', 'help-top': 'help', 'new-folder': 'mkdir', 'new-file': 'create', copy: 'copy', move: 'move', rename: 'rename', delete: 'delete', refresh: 'refresh', search: 'search', 'settings-button': 'settings', 'favorites-button': 'favorites', 'trash-button': 'trash', 'terminal-toggle': 'terminal', 'close-terminal': 'terminal' };
Object.entries(buttons).forEach(([id, action]) => $('#' + id).onclick = () => { if (!state.busy && state.config) actions[action](); });
$('#hex-view').onclick = () => { if (!state.busy && state.config) actions.hex(); };
$('#system-monitor').onclick = () => { if (state.config) systemMonitor(); };
$('#details-toggle').onclick = () => { if (state.config) toggleDetails(); };
$$('[data-action]').forEach(b => b.onclick = () => { if (!state.busy && state.config) actions[b.dataset.action](); });
$('#sync').onclick = () => navigate(1 - state.active, current().path);
$('#clear-output').onclick = () => $('#command-output').textContent = '';
$('#command-form').onsubmit = async e => {
  e.preventDefault(); if (state.busy) return; const input = $('#command-input'), command = input.value; if (!command.trim()) return;
  const path = current().path; state.commandHistory.push(command); state.commandIndex = state.commandHistory.length; input.value = ''; state.busy = true;
  const output = $('#command-output'); output.textContent += '\n' + path + ' ❯ ' + command + '\n'; status('Running command…');
  const began = Date.now(); recordActivity('Shell command', 'Running', command);
  try { const result = await api('command', { path, command }); output.textContent += result.output || '(no output)'; recordActivity('Shell command', result.success === false ? 'Failed' : 'Completed', command, Date.now() - began); }
  catch(e) { output.textContent += e.message; recordActivity('Shell command', 'Failed', e.message, Date.now() - began); }
  finally { state.busy = false; output.scrollTop = output.scrollHeight; await refresh(); input.focus(); }
};
$('#command-input').onkeydown = e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); state.commandIndex = Math.max(0, Math.min(state.commandHistory.length, state.commandIndex + (e.key === 'ArrowUp' ? -1 : 1))); e.target.value = state.commandHistory[state.commandIndex] || ''; } };
document.addEventListener('keydown', e => {
  if (!state.config || state.busy || dialog.open) return;
  const editable = e.target.matches('input,textarea,select'), key = e.key.toLowerCase();
  if (editable && !(e.ctrlKey && ['l', 'f'].includes(key)) && e.key !== 'Escape') return;
  const t = current(), all = files(t), i = state.active;
  let handled = true;
  if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'F3') hexViewer();
  else if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'F7') searchDialog();
  else if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'Enter') properties();
  else if (e.altKey && e.key === 'ArrowLeft') history(i, -1);
  else if (e.altKey && e.key === 'ArrowRight') history(i, 1);
  else if (e.ctrlKey || e.metaKey) {
    if (key === 'a') { all.filter(f => !f.parent).forEach(f => t.selected.add(f.path)); renderFiles(i); }
    else if (key === 'c' || key === 'x') { const sources = selected().map(f => f.path); if (sources.length) { state.clipboard = { sources, move: key === 'x' }; toast(`${sources.length} item(s) ready to ${key === 'x' ? 'move' : 'copy'}`); } }
    else if (key === 'v') { if (state.clipboard) transferDialog(state.clipboard.move, true); else toast('Copy or cut items first.'); }
    else if (key === 't') newTab();
    else if (key === 'w') { const p = state.panels[i]; if (p.tabs.length > 1) { p.tabs.splice(p.tab, 1); p.tab = Math.min(p.tab, p.tabs.length - 1); render(); saveSession(); focusPanel(); } }
    else if (key === 'l') { const input = $('.path-input', $(`[data-panel="${i}"]`)); input.focus(); input.select(); }
    else if (key === 'f') $('.filter-input', $(`[data-panel="${i}"]`)).focus();
    else if (key === 'r') refresh();
    else if (key === 'i') toggleDetails();
    else handled = false;
  } else if (/^F([1-9]|10)$/.test(e.key)) actions[['help', 'rename', 'view', 'edit', 'copy', 'move', 'mkdir', 'delete', 'settings', 'terminal'][Number(e.key.slice(1)) - 1]]();
  else if (e.key === 'Tab') { activate(1 - i); focusPanel(); }
  else if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
    const old = t.cursor, page = Math.max(1, Math.floor($('.file-list', $(`[data-panel="${i}"]`)).clientHeight / 34) - 1);
    t.cursor = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : Math.max(0, Math.min(all.length - 1, old + ({ ArrowUp: -1, ArrowDown: 1, PageUp: -page, PageDown: page }[e.key])));
    if (e.shiftKey) for (let n = Math.min(old, t.cursor); n <= Math.max(old, t.cursor); n++) if (!all[n].parent) t.selected.add(all[n].path);
    renderFiles(i); $('.file-row.cursor', $(`[data-panel="${i}"]`))?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === ' ' || e.key === 'Insert') { toggle(t, all[t.cursor]); t.cursor = Math.min(t.cursor + 1, all.length - 1); renderFiles(i); $('.file-row.cursor', $(`[data-panel="${i}"]`))?.scrollIntoView({ block: 'nearest' }); }
  else if (e.key === 'Enter') openCurrent();
  else if (e.key === 'Backspace') navigate(i, t.parent).then(focusPanel);
  else if (e.key === 'Delete') deleteDialog();
  else if (e.key === 'Escape') { t.selected.clear(); t.filter = ''; render(); focusPanel(); }
  else if (e.key.length === 1 && !e.altKey) { t.filter += e.key; t.cursor = Math.min(1, files(t).length - 1); render(); }
  else handled = false;
  if (handled) e.preventDefault();
});
async function init() {
  try {
    state.config = await api('config');
    const session = stored('commander.session', []);
    state.panels = [state.config.cwd, state.config.rightPath || state.config.home].map((path, i) => { const saved = state.config.explicitPaths?.[i] ? null : session[i]; const tabs = saved?.paths?.length ? saved.paths.filter(p => typeof p === 'string').map(tab) : [tab(path)]; return { tabs: tabs.length ? tabs : [tab(path)], tab: Math.min(Math.max(saved?.tab || 0, 0), Math.max(tabs.length - 1, 0)) }; });
    render();
    await Promise.all(state.panels.map(async (p, i) => { if (!await navigate(i, current(p).path, false)) await navigate(i, state.config.cwd); })); focusPanel();
  } catch(e) { status('Connection failed'); toast(e.message, true); }
}
setInterval(() => $('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 1000);
init();
