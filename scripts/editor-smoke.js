'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
async function main() {
  const executable = process.argv[2]; if (!executable || !path.isAbsolute(executable)) throw Error('Provide the absolute path to Code.exe, Cursor.exe, or an equivalent editor executable.'); await fs.access(executable);
  const base = path.resolve(os.tmpdir()), root = await fs.mkdtemp(path.join(base, 'panevrix-editor-smoke-')), report = path.join(root, 'report.json');
  try {
    const workspace = path.join(root, 'workspace'); await fs.mkdir(workspace); await fs.writeFile(path.join(workspace, 'hello.txt'), 'Panevrix smoke test');
    const env = { ...process.env, PANEVRIX_SMOKE_REPORT: report }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable, ['--user-data-dir=' + path.join(root, 'profile'), '--extensions-dir=' + path.join(root, 'extensions'), '--extensionDevelopmentPath=' + path.resolve(__dirname, '../extensions/vscode'), '--extensionTestsPath=' + path.resolve(__dirname, 'editor-smoke-suite.cjs'), '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-updates', '--disable-gpu', workspace], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output = (output + data).slice(-12000); });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(Error('Editor smoke test timed out.\n' + output)); }, 90000);
      child.once('error', e => { clearTimeout(timer); reject(e); });
      child.once('exit', code => { clearTimeout(timer); if (code === 0) resolve(); else reject(Error(`Editor smoke test failed (${code}).\n${output}`)); });
    });
    console.log(await fs.readFile(report, 'utf8'));
  } finally {
    if (path.dirname(path.resolve(root)) !== base || !path.basename(root).startsWith('panevrix-editor-smoke-')) throw Error('Unexpected fixture path.');
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
