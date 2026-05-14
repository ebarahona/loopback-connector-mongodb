---
name: lb4-style-check
description: Mechanical LoopBack 4 plugin style-guide compliance check. Use as a fast first pass on changed files — flags deterministic rule violations from STYLE_GUIDE.md without judgment calls about design.
---

# lb4-style-check

Surface only mechanical, rule-based style violations on the changed surface. No taste, no design feedback — that belongs in `lb4-plugin-review`.

## Read

```bash
git diff main...HEAD --name-only -- 'src/**/*.ts'
```

Read `STYLE_GUIDE.md` once for the rule list. Then read every `.ts` file the diff touches.

## Check

For each modified `.ts` file under `src/`, flag any of:

- `export default` anywhere — STYLE_GUIDE says named exports only.
- `import { Foo } from '...'` where `Foo` is used only as a type — must be `import type`.
- Type assertion in angle-bracket form `<Foo>x` — must be `x as Foo`.
- `==` or `!=` — must be `===`/`!==`. Allowed exception: `x == null` to cover `undefined`.
- A `switch` without a `default:` case.
- `@ts-ignore` — must be `@ts-expect-error` with a `// reason: ...` description.
- Exported symbol from `src/index.ts` whose declaration lacks `@public` / `@experimental` / `@internal`.
- File name that doesn't match LB4 dot-kebab convention (`*.controller.ts`, `*.service.ts`, `*.repository.ts`, `*.model.ts`, `*.datasource.ts`, `*.component.ts`, `*.observer.ts`, `*.interceptor.ts`, `*.provider.ts`). Helper files under `src/helpers/` and `src/__tests__/**` are exempt.

## Output

A bulleted list, one violation per line:

```
- src/path/to/file.ts:42 — <rule violated> — <one-line fix>
```

No prose, no headers, no severity grouping. If everything passes:

```
No style-guide violations on the changed surface.
```

If any violations would be auto-fixed by ESLint (`consistent-type-imports`, `consistent-type-assertions`, `default-case`, `eqeqeq`, `import/no-default-export`), append a single line at the bottom:

```
Run `npm run lint -- --fix` to auto-fix N of M violations.
```

## Do not

- Do not edit code. This skill is read-only.
- Do not flag design or architecture concerns — that's `lb4-plugin-review`.
- Do not check MongoDB driver usage — that's `mongodb-driver-review`.
