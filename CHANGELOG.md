# Changelog

## [1.1.1](https://github.com/ebarahona/loopback-connector-mongodb/compare/loopback-connector-mongodb-v1.1.0...loopback-connector-mongodb-v1.1.1) (2026-05-15)


### ⚠ BREAKING CHANGES

* connector public API no longer accepts trailing callbacks on async methods. Use the returned promise. The juggler-callback contract required by `loopback-datasource-juggler@6.x` is preserved internally via a constructor-installed bridge and is invisible to TypeScript consumers.

### Features

* initial release of loopback-connector-mongodb ([2c163d1](https://github.com/ebarahona/loopback-connector-mongodb/commit/2c163d1ecd62864643ed64d174a5ca461dce98a1))
* pre-publish review polish — typed errors, change-stream lifecycle, hardening ([f6c2e33](https://github.com/ebarahona/loopback-connector-mongodb/commit/f6c2e33216a29da38e13bf8ca7e69cfa1b32263c))
* rebuild on driver 7 with shared-manager architecture and promise-only API ([5d84206](https://github.com/ebarahona/loopback-connector-mongodb/commit/5d8420641e403dddb1551b09fb0ecdc5193eb9cf))
* **transport:** add [@change](https://github.com/change)Stream decorator and MongoChangeStreamServer ([f837164](https://github.com/ebarahona/loopback-connector-mongodb/commit/f83716455352627960e22754bbdc65cc84c80201))


### Bug Fixes

* address all review findings before publish ([be00d61](https://github.com/ebarahona/loopback-connector-mongodb/commit/be00d614d7500851ba4ae2a3766bd9051f2a28a2))
* **ci:** raise change-stream timeouts, add macOS to test matrix ([53a5a09](https://github.com/ebarahona/loopback-connector-mongodb/commit/53a5a0917e3f392e981413305e053bd1c45c276a))
* **ci:** regenerate lockfile with optional deps, fix broken README links ([86eca88](https://github.com/ebarahona/loopback-connector-mongodb/commit/86eca88e215a8e833caf87a2157267065ad8f398))
* **ci:** typo and cross-platform lockfile install for mongo CI ([5487fac](https://github.com/ebarahona/loopback-connector-mongodb/commit/5487facb6706c06d3cbedc44e6f1b1c7507ba733))
* **ci:** unblock first push — typos allowlist, stale URLs, lockfile sync ([44578ae](https://github.com/ebarahona/loopback-connector-mongodb/commit/44578aeda5412eb393227cea4802d05d6ea318e8))
* juggler callback compatibility and repository CRUD tests ([869d6fc](https://github.com/ebarahona/loopback-connector-mongodb/commit/869d6fc71163a3a6ce0b6e1ebc18384ec117afd3))
* post-v1.1.0 polish (changelog, typos, lychee, docs, jsdoc) and manifest catch-up ([fea728a](https://github.com/ebarahona/loopback-connector-mongodb/commit/fea728ae0e62b06d68352e4e61b688a2a49ac729))
* resolve enterprise review lifecycle and ownership findings ([1007241](https://github.com/ebarahona/loopback-connector-mongodb/commit/10072411e275971b3dd5c506162e829836dfb075))
* **test:** widen change-stream subscribe window for slow CI runners ([3b31ded](https://github.com/ebarahona/loopback-connector-mongodb/commit/3b31ded09fd614dd5ab966e5e9ddbcb8193d169f))


### Documentation

* add style guide, AGENTS.md, community files, and Claude Code skills ([538fded](https://github.com/ebarahona/loopback-connector-mongodb/commit/538fded5c62405867bd703d93dd113033b86547a))
* add Why section comparing to official connector ([e0dd15e](https://github.com/ebarahona/loopback-connector-mongodb/commit/e0dd15ed073af4ccb8c9a991601ab40dfe9516ea))

## 1.0.0 (2026-05-14)

### ⚠ BREAKING CHANGES

- connector public API no longer accepts trailing callbacks on async methods. Use the returned promise. The juggler-callback contract required by `loopback-datasource-juggler@6.x` is preserved internally via a constructor-installed bridge and is invisible to TypeScript consumers.

### Features

- initial release of loopback-connector-mongodb ([2c163d1](https://github.com/ebarahona/loopback-connector-mongodb/commit/2c163d1ecd62864643ed64d174a5ca461dce98a1))
- pre-publish review polish — typed errors, change-stream lifecycle, hardening ([f6c2e33](https://github.com/ebarahona/loopback-connector-mongodb/commit/f6c2e33216a29da38e13bf8ca7e69cfa1b32263c))
- rebuild on driver 7 with shared-manager architecture and promise-only API ([5d84206](https://github.com/ebarahona/loopback-connector-mongodb/commit/5d8420641e403dddb1551b09fb0ecdc5193eb9cf))

### Bug Fixes

- address all review findings before publish ([be00d61](https://github.com/ebarahona/loopback-connector-mongodb/commit/be00d614d7500851ba4ae2a3766bd9051f2a28a2))
- **ci:** raise change-stream timeouts, add macOS to test matrix ([53a5a09](https://github.com/ebarahona/loopback-connector-mongodb/commit/53a5a0917e3f392e981413305e053bd1c45c276a))
- **ci:** regenerate lockfile with optional deps, fix broken README links ([86eca88](https://github.com/ebarahona/loopback-connector-mongodb/commit/86eca88e215a8e833caf87a2157267065ad8f398))
- **ci:** unblock first push — typos allowlist, stale URLs, lockfile sync ([44578ae](https://github.com/ebarahona/loopback-connector-mongodb/commit/44578aeda5412eb393227cea4802d05d6ea318e8))
- juggler callback compatibility and repository CRUD tests ([869d6fc](https://github.com/ebarahona/loopback-connector-mongodb/commit/869d6fc71163a3a6ce0b6e1ebc18384ec117afd3))
- resolve enterprise review lifecycle and ownership findings ([1007241](https://github.com/ebarahona/loopback-connector-mongodb/commit/10072411e275971b3dd5c506162e829836dfb075))

### Documentation

- add style guide, AGENTS.md, community files, and Claude Code skills ([538fded](https://github.com/ebarahona/loopback-connector-mongodb/commit/538fded5c62405867bd703d93dd113033b86547a))
- add Why section comparing to official connector ([e0dd15e](https://github.com/ebarahona/loopback-connector-mongodb/commit/e0dd15ed073af4ccb8c9a991601ab40dfe9516ea))

## Changelog

All notable changes from the first published release onward are documented here. Pre-release work happened on the `0.0.0` development branch and is not retroactively listed.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Entries are generated by [release-please](https://github.com/googleapis/release-please) from [Conventional Commits](https://www.conventionalcommits.org/).
