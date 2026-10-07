const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const script = path.join(__dirname, '../scripts/validate-release.js');
test('release validation allows only matching stable version tags', () => {
  const run = tag => spawnSync(process.execPath, [script], { env: { ...process.env, RELEASE_TAG: tag }, encoding: 'utf8' });
  assert.equal(run('v1.0.0').status, 0);
  for (const tag of ['', 'v1.0.1', 'v1.0.0-beta.1', 'main', '1.0.0']) assert.notEqual(run(tag).status, 0, tag);
});
