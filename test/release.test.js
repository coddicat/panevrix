const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const version = require('../package.json').version;
const script = path.join(__dirname, '../scripts/validate-release.js');
test('release validation allows only matching stable version tags', () => {
  const run = tag => spawnSync(process.execPath, [script], { env: { ...process.env, RELEASE_TAG: tag }, encoding: 'utf8' });
  assert.equal(run(`v${version}`).status, 0);
  for (const tag of ['', 'v99.0.0', `v${version}-beta.1`, 'main', version]) assert.notEqual(run(tag).status, 0, tag);
});
