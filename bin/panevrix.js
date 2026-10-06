#!/usr/bin/env node
'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { start } = require('../server');
const { version } = require('../package.json');

const help = `Panevrix ${version} — Two panels. Total control.

Usage: panevrix [left-folder] [right-folder] [options]

Starts a local file manager and opens your browser.
Folders can be relative or absolute; quote paths containing spaces.

Options:
  -p, --port <number>  Local port (default: PORT or 3847; 0 = automatic)
      --no-open        Print the URL without opening a browser
  -h, --help           Show this help
  -v, --version        Show the installed version

Examples:
  panevrix
  panevrix . ../projects
  panevrix --port 4000 --no-open

The server binds to 127.0.0.1 only. Keep this terminal open.
Press Ctrl+C to stop.
`;
function parseArgs(args, env = process.env) {
  const result = { paths: [], port: env.PORT ?? '3847', open: true };
  let positional = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!positional && arg === '--') { positional = true; continue; }
    if (!positional && ['--help', '-h'].includes(arg)) result.help = true;
    else if (!positional && ['--version', '-v'].includes(arg)) result.version = true;
    else if (!positional && arg === '--no-open') result.open = false;
    else if (!positional && (arg === '--port' || arg === '-p')) { if (args[i + 1] === undefined) throw Error('--port needs a number.'); result.port = args[++i]; }
    else if (!positional && arg.startsWith('--port=')) result.port = arg.slice(7);
    else if (!positional && arg.startsWith('-')) throw Error(`Unknown option: ${arg}. Use --help.`);
    else result.paths.push(arg);
  }
  if (result.help || result.version) return result;
  if (!/^\d+$/.test(String(result.port)) || Number(result.port) > 65535) throw Error('Port must be an integer between 0 and 65535.');
  result.port = Number(result.port);
  if (result.paths.length > 2) throw Error('Provide at most two folder paths.');
  return result;
}
function openBrowser(url) {
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.once('error', () => console.error(`Could not open your browser. Open ${url} manually.`));
  child.once('exit', code => { if (code) console.error(`Browser launcher exited with code ${code}. Open ${url} manually.`); });
  child.unref();
}
async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) { console.log(help); return; }
  if (options.version) { console.log(version); return; }
  const folders = options.paths.map(p => path.resolve(p));
  for (const folder of folders) { if (!(await fs.stat(folder)).isDirectory()) throw Error(`Not a folder: ${folder}`); }
  const server = start(options.port, { cwd: folders[0] || process.cwd(), rightPath: folders[1], explicitPaths: [Boolean(folders[0]), Boolean(folders[1])] });
  server.once('error', e => {
    console.error(e.code === 'EADDRINUSE' ? `Port ${options.port} is in use. Run panevrix --port 0 to choose a free port.` : `Could not start Panevrix: ${e.message}`);
    process.exitCode = 1;
  });
  server.once('listening', () => {
    const url = `http://127.0.0.1:${server.address().port}`;
    console.log('Press Ctrl+C to stop.');
    if (options.open) openBrowser(url);
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return; stopping = true;
    server.close(() => process.exit(0));
    const timer = setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 3000); timer.unref();
  };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  return server;
}
if (require.main === module) main().catch(e => { console.error(`Panevrix: ${e.message}`); process.exitCode = 1; });
module.exports = { parseArgs, main };
