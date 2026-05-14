# AGENTS.md

This file is read by AI coding agents (Claude Code, Codex CLI, Gemini CLI,
Cursor, Cline, Continue, Aider, etc.) per the https://agents.md/
convention. It applies to every agent regardless of which tool the
contributor is using.

## Project at a glance

`@ebarahona/loopback-connector-mongodb` is a LoopBack 4 MongoDB connector
plus injectable `MongoService` and shared `MongoDataSource` factory, built
on the native MongoDB Node driver 7.x in TypeScript. Runtime: Node
`>= 20.19.0`. License: MIT. Repository:
https://github.com/ebarahona/loopback-service-mongodb.

## Required reading

Read these in full before suggesting any change.

- [./STYLE_GUIDE.md](./STYLE_GUIDE.md) — file naming, folder layout,
  binding keys, provider/component/lifecycle patterns, shared-resource
  ownership, stability tags, peer-dependency policy, test layout, JSDoc
  rules, error handling, config validation, type-system rules, commit
  format, release engineering.
- [./CONTRIBUTING.md](./CONTRIBUTING.md) — local setup, the
  `lint && build && test` gate, git hook paths (lefthook vs `.githooks`),
  PR expectations, release-please flow, bug-report requirements.
- [./README.md](./README.md) — package surface: component path vs
  standalone juggler path, `MongoService` API, supported topologies,
  peer-dependency ranges.

## Workflow expectations

1. Every commit uses Conventional Commits. Allowed types: `feat`, `fix`,
   `docs`, `chore`, `ci`, `build`, `deps`, `perf`, `refactor`, `revert`,
   `style`, `test`. release-please derives `CHANGELOG.md` and the version
   bump from these — incorrect types silently break the release.
2. Every commit carries a DCO sign-off (`git commit -s`). PRs without
   `Signed-off-by:` fail CI.
3. `npm run lint && npm run build && npm test` must pass locally before
   you propose a commit. Do not propose a commit you have not verified.
4. Pre-commit hooks (lefthook by default, `.githooks` as the
   zero-dependency fallback) run the same checks. Never skip them with
   `--no-verify`. If a hook reformats files, re-stage the changes and
   propose the commit again — do not amend silently.
5. The MongoDB driver boundary is never mocked. Integration tests use
   `mongodb-memory-server` and live in `src/__tests__/integration/`. Any
   new behavior that touches the driver ships with an integration test.
6. New public exports default to `@experimental` JSDoc until at least one
   real consumer has exercised the surface; promote to `@public` in a
   separate PR.

## Architecture rules

- Plugin-injection first: a new capability is a `Provider`, lifecycle
  observer, or service bound under a typed `BindingKey`; the connector
  core is not modified.
- Shared resources track ownership through a `readonly owns<Resource>`
  boolean set once in the constructor; `stop()` / `disconnect()` /
  `close()` is the only call site that consults it.
- Every binding flows through `MongoBindings.*` namespace constants
  declared in `src/keys.ts` with `BindingKey.create<T>(...)`; raw string
  binding keys are forbidden.
- I/O start/stop runs inside a `@lifeCycleObserver('mongodb')` class;
  both `start()` and `stop()` are idempotent and safe to call after a
  failed `start()`.
- Config is validated by a pure synchronous helper at the framework
  boundary; errors are typed `MongoConfigError` instances with
  credentials redacted at the message-construction site.
- TypeScript is strict and `any` is banned; an `as unknown as { ... }`
  cast into juggler or driver internals must carry a `// Why:` comment
  and a regression test that fails when the internal field is renamed.

## Claude Code users

Skills live at `.claude/skills/`. Invoke each as a slash command.

- `/lb4-plugin-review` — comprehensive PR review: architecture, public
  API, tests.
- `/lb4-style-check` — mechanical compliance scan against STYLE_GUIDE.md.
- `/mongodb-driver-review` — MongoDB Node driver 7.x usage pitfalls.
- `/lb4-public-api-audit` — public API surface diff and stability-tag
  check.
- `/new-mongo-feature` — scaffold a new `MongoService` capability with
  binding, provider, and integration test.
- `/pre-pr-check` — full readiness gate before opening a PR.
- `/conventional-commit` — author a Conventional Commits message from
  the staged diff.

## Other tool users (Codex, Gemini, Cursor, Cline, Continue, Aider)

The skill files at `.claude/skills/<name>/SKILL.md` are plain Markdown.
Open the one matching your task and follow the instructions inside; the
workflow is identical regardless of how you invoke it.

If your tool has its own per-project config (Cursor's `.cursor/rules/`,
Cline's `.clinerules`, Continue's `.continuerules`, Aider's
`.aider.conf.yml`), point it at this file and [./STYLE_GUIDE.md](./STYLE_GUIDE.md)
so the conventions apply automatically on every turn.

## What NOT to do

- Don't add `any` or `@ts-ignore` to silence a type error — fix the
  underlying type.
- Don't modify global git config (`--global`); scope any required
  override to this repo with `--local`.
- Don't bypass pre-commit hooks with `--no-verify`.
- Don't hand-write `CHANGELOG.md` entries; release-please owns the file.
- Don't bump `package.json` `version` manually; release-please owns it.
- Don't introduce driver mocks in tests; use `mongodb-memory-server` and
  test against real driver behavior.
- Don't add a default export anywhere in the package.
- Don't add files outside the folder structure documented in
  [./STYLE_GUIDE.md](./STYLE_GUIDE.md) § Folder structure.

## Communicating with the maintainer

- Bug reports:
  https://github.com/ebarahona/loopback-service-mongodb/issues
  (template: `.github/ISSUE_TEMPLATE/bug_report.yml`).
- Feature requests: same URL
  (template: `.github/ISSUE_TEMPLATE/feature_request.yml`).
- Security issues:
  https://github.com/ebarahona/loopback-service-mongodb/security/advisories/new.
  See [./SECURITY.md](./SECURITY.md).
- Code of conduct: [./CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
  (Contributor Covenant 2.1).
