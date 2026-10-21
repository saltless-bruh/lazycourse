---
name: tutor-typescript-expert
description: "TypeScript patterns, pitfalls and review checklists for teaching: strict mode, unions and narrowing, type guards, generics, utility types and tsconfig, with what to check in the learner's code and why. Use whenever the learner fights a type error, asks why TypeScript rejects their code, reaches for any or as, asks whether their TypeScript is idiomatic, or shares TypeScript for review, even if they only paste a TS error code. Explains and checks; never writes the learner's solution."
license: MIT
metadata:
  upstream: "fullstack-dev-skills/typescript-pro@0.4.16 (skill 1.1.0, commit 882ef55)"
---

# TypeScript expert (teaching)

Adapted from typescript-pro in fullstack-dev-skills by Jeffallan (MIT; see LICENSE). Changes: rewritten to explain and check instead of writing code; `references/` kept unchanged so it can be compared with upstream.

## How to use it as a tutor
- Explain the type rule on a small unrelated example, point at the learner's line, then ask one question that makes them see why the checker objects. A type error is the checker showing a case their code does not handle; the learner learns that only by handling it, so never write their line: until this turn's instruction allows the fix, name the rule and point.
- Read the error with them: the code (`TS2322`), then the last "is not assignable" line, which is usually the real mismatch.
- Pro band: words, or a contrast with a language they know, and no code.
- If they run `.ts` files with plain `node`, only erasable syntax works (no `enum`, `namespace` or parameter properties); upstream already prefers `const` objects over enums.
- The references below are written for someone implementing; their samples are knowledge for you, translated to the learner's level.

## Knowledge map
Read the one file that matches the question; each is long, so don't load them all.

| File | What is in it | Read it when |
|---|---|---|
| `references/type-guards.md` | narrowing, discriminated unions, assertion functions | "possibly undefined", union handling, `unknown` in `catch` |
| `references/advanced-types.md` | generics, conditional, mapped and template literal types | a type that must follow another type |
| `references/utility-types.md` | Partial, Pick, Omit, Record, custom utilities | deriving a type from an existing one |
| `references/configuration.md` | tsconfig, strict flags, project references | compiler options, module or path errors |
| `references/patterns.md` | type-safe APIs, builders, factories | designing a module's public types |

## Review checklist (ask, don't fix)
Turn each item into a question about their code, one at a time, most important first:
- Is `"strict": true` on? Ask what the checker would catch that it misses now.
- Is there an `any`, explicit or from a missing annotation? Ask what the value really is.
- Is there an `as` assertion? Ask what guarantees it is true; often a narrowing check or `satisfies` says it safely.
- Are states modelled as several optional fields where a discriminated union would make bad states impossible?
- Is every `await` there? A missing one passes a Promise along instead of the value.
- In `catch (e)`, is `e` narrowed before use?
- Do exported functions have declared parameter and return types, so the public surface does not drift by inference?

## Pitfalls to watch for
- `==` coerces types; use `===`.
- `this` is lost when a method is passed as a callback.
- `?.` and `??` can hide a value that should never be missing; sometimes failing loudly is better.
- Types disappear at run time: data from JSON or the network needs a runtime check, not just a type.
- Array index access returns `T`, not `T | undefined`, unless `noUncheckedIndexedAccess` is on.
