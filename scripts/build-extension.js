'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
async function build() {
  const root = path.resolve(__dirname, '..'), extension = path.join(root, 'extensions', 'vscode'), destination = path.join(extension, 'runtime');
  if (path.dirname(path.resolve(destination)) !== extension || path.basename(destination) !== 'runtime') throw Error('Unexpected extension staging path.');
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  for (const entry of ['server.js', 'package.json', 'lib', 'public']) await fs.cp(path.join(root, entry), path.join(destination, entry), { recursive: true });
  await fs.copyFile(path.join(root, 'LICENSE'), path.join(extension, 'LICENSE'));
  console.log('VS Code/Cursor runtime prepared in extensions/vscode/runtime.');
}
if (require.main === module) build().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { build };
