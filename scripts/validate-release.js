'use strict';
const pkg = require('../package.json');
const tag = process.env.RELEASE_TAG;
if (!/^v\d+\.\d+\.\d+$/.test(tag || '') || tag !== `v${pkg.version}`) {
  throw Error(`Stable release tag must match package.json: v${pkg.version}; received ${tag || '(missing)'}`);
}
if (pkg.name !== 'panevrix' || pkg.private) throw Error('Expected the public panevrix package.');
if (pkg.repository?.url !== 'git+https://github.com/coddicat/panevrix.git') throw Error('Repository metadata must match the trusted publisher.');
console.log(`Validated ${pkg.name}@${pkg.version} (${tag})`);
