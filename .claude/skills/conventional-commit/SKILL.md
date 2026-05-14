---
name: conventional-commit
description: Author a Conventional Commits-formatted message with DCO sign-off. Use after staging changes — reads the staged diff and proposes a commit message ready to paste into `git commit -m`, without running git commit itself.
---

# conventional-commit

Generate a Conventional Commits message for the currently staged changes. The message is the output — never invoke `git commit` from this skill.

## Read

```bash
git diff --cached --stat
git diff --cached
git config user.name
git config user.email
```

If `git diff --cached` is empty, abort and tell the user to stage changes first.

## Decide

Pick a single Conventional Commits **type** from the staged diff:

- `feat` — new exports, new public methods, new BindingKeys, new lifecycle observers
- `fix` — changes to existing logic that resolve a bug
- `docs` — changes only under `*.md` files or JSDoc-only edits
- `refactor` — code restructure with no behavior change
- `perf` — measurable performance improvement
- `test` — changes only under `__tests__/`
- `ci` — changes only under `.github/workflows/`
- `build` — changes to `package.json` (scripts), `tsconfig.json`, build configs
- `deps` — dependency version bumps only (`package.json` deps blocks, lockfile)
- `chore` — anything else

Pick a single **scope** from the dominant changed path:

- `connector` for `src/connector/`
- `service` for `src/services/`
- `datasource` for `src/datasource/`
- `connection-manager` for `src/helpers/connection-manager.ts`
- `query-builder` for `src/connector/query-builder.ts`
- `component` for `src/mongo.component.ts`
- `keys` for `src/keys.ts`
- `validator` for `src/helpers/config-validator.ts`
- A short kebab-case name for any other consistent path

Scope is optional. Omit when the change spans many areas or is repo-wide.

## Write

Format:

```
<type>(<scope>): <subject>

<body>

Signed-off-by: <name> <email>
```

Rules:

- Subject line: under 72 chars, imperative mood, lowercase, no trailing period.
- Body: explain the _why_, not the _what_. Skip the body if the subject is fully self-explanatory.
- Reference an issue with `Refs #N` or `Fixes #N` in the body when applicable.
- Sign-off line uses the values from `git config user.name` and `git config user.email` verbatim.

## Output

Print the full message in a fenced code block, ready to paste into:

```bash
git commit -m "$(cat <<'EOF'
<message here>
EOF
)"
```

Then state the inferred type and scope on a single line so the contributor can sanity-check before pasting.

## Do not

- Do not run `git commit`. The user owns committing.
- Do not add `BREAKING CHANGE:` unless the diff actually breaks the public API in `src/index.ts` — that's a `feat!` / `fix!` decision the human should confirm.
- Do not invent issues, PR numbers, or co-authors.
