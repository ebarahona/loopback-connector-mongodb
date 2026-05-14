# Contributing

Thanks for considering a contribution.

## Ground rules

- All commits must follow [Conventional Commits](https://www.conventionalcommits.org/).
- All commits must include a [DCO sign-off](https://developercertificate.org/) (`git commit -s`).
- All code must pass `npm run lint`, `npm run build`, and `npm test` before review.
- New code should follow [STYLE_GUIDE.md](./STYLE_GUIDE.md).

## AI coding agents

This repo carries cross-agent conventions in [`AGENTS.md`](./AGENTS.md). Claude Code, Codex CLI, Gemini CLI, Cursor, Cline, and Continue all read it. Whichever tool you use, point it at `AGENTS.md` and [`STYLE_GUIDE.md`](./STYLE_GUIDE.md) before writing code.

Claude Code users get seven invocable skills under `.claude/skills/` (slash commands `/lb4-plugin-review`, `/lb4-style-check`, `/mongodb-driver-review`, `/lb4-public-api-audit`, `/new-mongo-feature`, `/pre-pr-check`, `/conventional-commit`). Other tools can read those `SKILL.md` files as plain Markdown and follow the instructions inline.

Agents must follow the same expectations as human contributors: Conventional Commits, DCO sign-off, passing lint+build+test, and no `any`/`@ts-ignore` suppressions.

## Local setup

Requires **Node.js >= 20.19.0** (matches the `mongodb` 7.x driver requirement).

```bash
git clone https://github.com/ebarahona/loopback-service-mongodb.git
cd loopback-service-mongodb
npm ci
npm run build
npm test
```

`npm ci` runs the `prepare` script, which installs git hooks via lefthook (see [Git hooks](#git-hooks) below).

### Test scripts

| Script                     | Runs                                                   |
| -------------------------- | ------------------------------------------------------ |
| `npm test`                 | All tests (unit + integration), single-threaded        |
| `npm run test:unit`        | Unit tests only — fast, no I/O                         |
| `npm run test:integration` | Integration tests only — boots `mongodb-memory-server` |
| `npm run test:dev`         | Watch mode (vitest) for active development             |

Integration tests spin up a real `mongod` via `mongodb-memory-server`. First run downloads a MongoDB binary into a per-user cache; expect a one-time delay.

## Commit message format

```
<type>(<scope>): <subject>

<body>

Signed-off-by: Your Name <you@example.com>
```

Allowed types: `build`, `chore`, `ci`, `deps`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`.

Examples:

```
feat(datasource): add per-tenant MongoDataSourceFactory binding
fix(connection-manager): replace spin-wait with disconnectPromise
docs(readme): document shared-manager DataSource path
```

## Pull requests

1. Branch from `main`. Keep the diff focused on a single change.
2. Add tests. Unit tests for pure logic, integration tests for anything that touches the driver.
3. Run `npm run lint && npm run build && npm test` before pushing. Claude Code users can run `/pre-pr-check` to do this plus commit-message validation in one step.
4. Open a PR — the [pull request template](./.github/PULL_REQUEST_TEMPLATE.md) auto-populates the form. Fill in the summary and test plan.
5. CI runs lint/build/test on Node 20/22/24, validates commit format, and checks DCO sign-off.

Issues use forms in [`.github/ISSUE_TEMPLATE/`](./.github/ISSUE_TEMPLATE/) — bug reports and feature requests have their own structured templates.

## Git hooks

Two paths cover identical checks:

- **Lefthook (default)** — `npm install` runs `scripts/install-hooks.sh`, which calls `lefthook install`. If lefthook can install cleanly, hooks run in parallel against staged files (fast). If lefthook is blocked by an existing `core.hooksPath` (yours or your dotfiles), the script prints opt-in instructions and exits without changing your git config. CI still enforces lint/build/test on every PR, so you can defer wiring local hooks.
- **Zero-dependency fallback** — for contributors who can't install lefthook. Wire native git to the shared scripts:
  ```bash
  git config --local core.hooksPath .githooks
  ```
  Same checks, sequential, runs over the whole tree.

Both paths are kept in sync by `src/__tests__/unit/hook-parity.spec.ts`. CI fails on drift.

## Help wanted

Some pieces of the project (leak detection thresholds, benchmark
baselines) are seeded but not validated. See [HELP_WANTED.md](./HELP_WANTED.md)
for the open list and how to contribute. Performance work is especially
welcome.

## Releases

Releases are automated by [release-please](https://github.com/googleapis/release-please). Maintainers do not tag manually. Once a release PR is merged, the workflow tags, publishes to npm, and updates `CHANGELOG.md`.

## Reporting bugs

Open a GitHub issue with:

- A minimal reproduction (model + repository + DataSource config + the failing call).
- The MongoDB server version, driver version, and Node version.
- The full stack trace.

## Security issues

See [SECURITY.md](./SECURITY.md). Do not file security reports as public issues.
