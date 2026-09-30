// Package size budget. This is a Node-only library, so esbuild bundles for
// the Node platform: built-ins (node:path, node:crypto, ...) stay external.
/** @type {import('size-limit').SizeLimitConfig} */
module.exports = [
  {
    name: 'dist (CommonJS)',
    path: 'dist/index.js',
    limit: '100 KB',
    ignore: [
      '@ebarahona/loopback-transport-core',
      '@loopback/core',
      '@loopback/repository',
      'mongodb',
      'debug',
    ],
  },
].map(entry => ({
  ...entry,
  modifyEsbuildConfig: config => ({...config, platform: 'node'}),
}));
