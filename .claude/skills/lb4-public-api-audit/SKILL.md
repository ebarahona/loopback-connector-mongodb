---
name: lb4-public-api-audit
description: Public API surface audit for a LoopBack 4 plugin. Use before a release or whenever exports are added to the package root — confirms every public symbol has TSDoc and a stability tag, no internal types leak, and surfaces the API diff from the last release.
---

# lb4-public-api-audit

Validate the public API surface declared by `src/index.ts`. Run before tagging a release, or whenever new exports are added.

## Read

```bash
git describe --tags --abbrev=0 2>/dev/null || echo "no previous tag"
```

Then:

- `src/index.ts` (current public surface)
- The declaration file of every exported symbol (follow each `export { Foo } from './...'`).
- The previous tag's `src/index.ts` if a tag exists: `git show $(git describe --tags --abbrev=0):src/index.ts`.

## Check

For every symbol exported from `src/index.ts`:

1. Has a JSDoc block at its declaration.
2. JSDoc contains exactly one of `@public`, `@experimental`, `@internal`.
3. Type-only exports use `export type { ... }` from the index.
4. No symbol re-exports something whose declaration is marked `@internal`.
5. New exports (not in the previous tag's index) default to `@experimental`. Promotion to `@public` is a semver commitment and must be intentional.
6. Removed exports since the previous tag — these are breaking changes; must align with a major version bump per Semantic Versioning.
7. Renamed exports — same as removed; flag.

For each `@public` symbol, additionally check:

- All parameter and return types are themselves exported or built-in. Internal types in a public signature are leaks.
- Methods returning `Promise<T>` document `@throws` for known error types.
- Generic type parameters have a `@template T` line in JSDoc.

## Output

Two sections.

### Surface table

```
| Symbol                       | Kind       | Stability     | Declared in                              | Notes |
|------------------------------|------------|---------------|------------------------------------------|-------|
| MongoComponent               | class      | @public       | src/mongo.component.ts                   |       |
| MongoBindings                | namespace  | @public       | src/keys.ts                              |       |
| MongoDataSourceFactory       | type       | @public       | src/datasource/mongo.datasource.factory  |       |
| ...                          | ...        | ...           | ...                                      | ...   |
```

`Notes` column flags any policy violation: `missing JSDoc`, `missing tag`, `internal type leak: <type>`, `re-exports internal: <symbol>`.

### Diff summary

```
Added since <previous-tag>:
- <symbol> (@experimental)

Removed since <previous-tag>:
- <symbol> — BREAKING

Renamed since <previous-tag>:
- <old> -> <new> — BREAKING

Promoted @experimental -> @public:
- <symbol>

Demoted @public -> @experimental:
- <symbol> — BREAKING
```

If there's no previous tag, omit the diff section and note: `No previous release tag — this is the first audit.`

End with a single line:

- `Public API is clean.` if no policy violations and no BREAKING entries (or BREAKING entries already accounted for by a pending major version bump in `package.json`).
- `Public API needs attention.` otherwise.

## Do not

- Do not modify code.
- Do not infer stability from naming — only the tag matters.
- Do not auto-promote `@experimental` to `@public` — flag candidates, let the maintainer decide.
