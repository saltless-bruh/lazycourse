# TypeScript card

- **Format:** `prettier` or `biome format`; lint with `eslint` or `biome lint`.
- **Names:** `camelCase` values and functions, `PascalCase` types and classes, `UPPER_CASE` only for true constants.
- **Errors:** `throw new Error(...)`; in `catch (e)` the value is `unknown`, so narrow it (`e instanceof Error`) before use; a union like `{ ok: true; value } | { ok: false; error }` for failures the caller should expect. A stack trace reads top-down from the message.
- **Layout:** `package.json` with `"type": "module"`, `tsconfig.json` with `"strict": true`, code in `src/`, tests beside it or in `test/`.
- **Test:** `node --test`, or the project's `npm test` (vitest, jest).
- **Run:** Node 22.18+ runs `node file.ts` by stripping types, so only erasable syntax works there: no `enum`, `namespace` or constructor parameter properties; use a `const` object plus a union type instead.
- **Pitfalls:** `any` switches checking off; `==` coerces, use `===`; a missing `await` gives a Promise instead of the value; `this` is lost when a method is passed as a callback; `as` asserts without checking; `?.` can hide a bug that should fail loudly.

## Concept tags
- `types`: annotations, inference (aliases: type-annotations, inference)
- `unions`: unions, literals (aliases: union, literal-types, discriminated-unions)
- `narrowing`: typeof, in, checks (aliases: type-narrowing)
- `interfaces`: interfaces, object types (aliases: interface, object-types)
- `generics`: type parameters (aliases: generic)
- `functions`: functions, arrows (aliases: arrow-functions, callbacks)
- `async`: async/await (aliases: await, async-await)
- `promises`: Promise, then (aliases: promise)
- `modules`: import/export (aliases: imports, esm, exports)
- `classes`: classes, this (aliases: class, this)
- `arrays`: arrays, map/filter (aliases: array, map-filter)
- `objects`: objects, Map, spread (aliases: object, map, spread)
- `null-undefined`: null, undefined, `?.` (aliases: undefined, null, optional-chaining)
- `errors`: throw, try/catch (aliases: error-handling, exceptions)
- `testing`: tests (aliases: node-test, vitest, jest)
- `type-guards`: guard functions (aliases: type-guard)
- `utility-types`: Partial, Pick, Record (aliases: partial, pick, record)
