# JavaScript card

- **Format:** `prettier` or `biome format`; lint with `eslint` or `biome lint`.
- **Names:** `camelCase` values and functions, `PascalCase` classes, `UPPER_CASE` only for true constants; files `kebab-case.js`.
- **Errors:** `throw new Error(...)` (never a string); `catch (e)` gets any value, so check `e instanceof Error`; `new Error(msg, { cause: e })` keeps the original. Stack traces read top-down.
- **Layout:** `package.json` with `"type": "module"` (ES modules: `import`/`export`); `.mjs` is always ES, `.cjs` always CommonJS; code in `src/`, tests beside it or in `test/`.
- **Test:** `node --test`, or the project's `npm test` (vitest, jest).
- **Run:** `node file.js`; the version on this card is Node's, which decides the language features available.
- **Pitfalls:** `const`/`let`, never `var` (function-scoped, hoisted); `==` coerces, use `===`; a missing `await` gives a Promise instead of the value; `this` is lost when a method is passed as a callback; `0`, `""` and `NaN` are falsy, so `x || d` replaces them (use `??`); `sort()` without a compare sorts numbers as text.

## Concept tags
- `variables`: const, let, scope (aliases: var, let-const, hoisting, scope)
- `types`: typeof, coercion, truthiness (aliases: coercion, truthy, falsy, equality)
- `strings`: template literals, methods (aliases: string, template-literals)
- `numbers`: Number, NaN, parsing (aliases: number, nan, parseint)
- `arrays`: arrays, map/filter/reduce (aliases: array, array-methods, map-filter, reduce)
- `objects`: objects, spread, destructuring (aliases: object, destructuring, spread)
- `maps-sets`: Map, Set (aliases: map, set)
- `functions`: functions, arrows, closures (aliases: arrow-functions, callbacks, closures)
- `this`: this, bind (aliases: this-binding, bind)
- `classes`: classes, prototypes (aliases: class, prototype, prototypes)
- `async`: async/await, event loop (aliases: await, async-await, event-loop)
- `promises`: Promise, then (aliases: promise)
- `modules`: import/export, ESM, CommonJS (aliases: imports, esm, exports, require, commonjs)
- `null-undefined`: null, undefined, `?.`, `??` (aliases: undefined, null, optional-chaining, nullish)
- `errors`: throw, try/catch (aliases: error-handling, exceptions)
- `iterators`: for…of, generators (aliases: generators, for-of)
- `node-apis`: fs, path, process (aliases: fs, node, process, files-io)
- `testing`: tests (aliases: node-test, vitest, jest)
