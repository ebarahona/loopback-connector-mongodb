---
name: new-mongo-feature
description: Scaffold a new MongoService feature end-to-end. Use when adding a capability such as a new aggregation helper, operation type, or admin command — generates the interface change, impl stub, optional binding key, and integration test, all marked @experimental.
---

# new-mongo-feature

Scaffold a new MongoService capability across the four files where it must land: interface, impl, binding key (if needed), and integration test.

## Ask

Collect three answers from the contributor before writing anything:

1. **Feature name** — `lowerCamelCase`, used as the method name on `MongoService`.
2. **One-sentence description** — for the JSDoc.
3. **Requires replica set or sharded cluster?** — `yes` / `no`. Used to pick the test harness.

If any answer is missing, ask. Don't guess.

## Read

- `src/services/mongo.service.ts` to know section structure
- `src/services/mongo.service.impl.ts` to know the impl style
- `src/keys.ts` if a new binding is needed
- `src/mongo.component.ts` if a new binding is needed
- One existing integration test under `src/__tests__/integration/` for shape reference

## Edit

### 1. `src/services/mongo.service.ts`

Add the method signature under the most relevant `// ---- Section ----` block. If none fits, add a new section comment. Use the description verbatim in the JSDoc and add `@experimental`.

```typescript
/**
 * <one-sentence description>.
 *
 * @experimental
 */
<methodName>(<params>): Promise<...>;
```

### 2. `src/services/mongo.service.impl.ts`

Add the implementation in the same section position. Stub the body to throw, with a `// TODO:` pointing to what needs to be implemented.

```typescript
async <methodName>(<params>): Promise<...> {
  // TODO: implement <methodName>
  throw new Error('not implemented');
}
```

### 3. `src/keys.ts` (only if the feature exposes a new injectable)

Add a `BindingKey` under `MongoBindings` with TSDoc and `@experimental`. Type-only import the target type.

### 4. `src/__tests__/integration/<feature-name>.spec.ts`

- If `requires replica set` is `yes`: use `MongoMemoryReplSet.create({replSet: {count: 1}})`.
- If `no`: use `MongoMemoryServer.create()`.

Test must:

- Boot a `MongoComponent` against the memory mongod
- Resolve `MongoBindings.SERVICE`
- Call the new method
- Assert one happy-path expectation
- Tear down the app and mongod in `afterAll`

Use `vitest`'s `describe`/`it`/`beforeAll`/`afterAll`. Match the layout of an existing spec file.

## Verify

After editing, run:

```bash
npm run lint
npm run build
```

The build must compile. If it doesn't, the scaffold is wrong — fix it before reporting.

Do NOT run `npm test` from this skill; the test is expected to fail (impl throws). The contributor will replace the stub.

## Report

Output:

- Files created / modified, one line each.
- The next steps for the contributor: replace the impl stub, verify the test passes, run `pre-pr-check` before opening a PR.
- A reminder that the feature is marked `@experimental` and should stay that way until the API has been validated against at least one real consumer.
