---
name: tutor-javascript-expert
description: "JavaScript patterns, pitfalls and review checklists for teaching: const/let and scope, equality and truthiness, this, closures, promises and async/await, ES modules versus CommonJS, and Node's fs, path and process, with what to check in the learner's code and why. Use whenever the learner hits undefined is not a function, a Promise where they expected a value, a this that is undefined, an import/require error, asks whether their JavaScript is idiomatic, or shares .js/.mjs/.cjs code for review. Explains and checks; never writes the learner's solution."
license: MIT
metadata:
  upstream: "fullstack-dev-skills/javascript-pro@0.4.16 (skill 1.1.0, commit 882ef55)"
---

# JavaScript expert (teaching)

Adapted from javascript-pro in fullstack-dev-skills by Jeffallan (MIT; see LICENSE). Changes: rewritten to explain and check instead of writing code; `references/` kept unchanged so it can be compared with upstream.

## How to use it as a tutor
- Explain the rule on a small unrelated example, point at the learner's line, then ask one question that makes them see what the engine does there. JavaScript rarely refuses code up front, so the bug shows up later as a wrong value; the learner learns to predict it only by tracing it themselves, so never write their line: below rung 5 name the rule and point.
- Read the error with them: the message (`TypeError: x is not a function`), then the first `at` frame in their own file.
- Pro band: words, or a contrast with a language they know, and no code.
- The version on the language card is Node's; it decides which features exist (for example `Map.groupBy` needs Node 21).
- The references below are written for someone implementing; their samples are knowledge for you, translated to the learner's level. `browser-apis.md` only matters if the project runs in a browser.

## Knowledge map
Read the one file that matches the question; each is long, so don't load them all.

| File | What is in it | Read it when |
|---|---|---|
| `references/modern-syntax.md` | destructuring, `?.`, `??`, classes, private fields | "is there a shorter way", newer syntax |
| `references/async-patterns.md` | promises, async/await, errors, the event loop | a Promise instead of a value, order of output |
| `references/modules.md` | ESM vs CommonJS, `package.json` `type`, exports | `require is not defined`, import errors |
| `references/node-essentials.md` | fs/promises, streams, events, process | files, arguments, exit codes |
| `references/browser-apis.md` | fetch, storage, workers, DOM observers | browser projects only |

## Review checklist (ask, don't fix)
Turn each item into a question about their code, one at a time, most important first:
- Any `var`? Ask what scope the name has and where it is visible.
- Any `==` or `!=`? Ask what `0 == ""` gives and why.
- Is every Promise awaited or returned? Ask what the function returns when it is not.
- Does an `async` function's failure reach a `catch`? An unhandled rejection ends a Node process.
- Is a method passed as a callback (`setTimeout(obj.run)`)? Ask what `this` is inside it then.
- Is `||` used for a default where `0` or `""` are valid values? `??` keeps them.
- Is `sort()` used on numbers without a compare function?
- Does the project mix `require` and `import`? `package.json` `"type"` decides which one a `.js` file uses.

## Pitfalls to watch for
- Objects and arrays are shared by reference: changing a parameter changes the caller's value.
- `typeof null` is `"object"`; `Array.isArray` is the check for arrays.
- Floating point: `0.1 + 0.2 !== 0.3`; money in whole cents.
- A closure in a loop sees the variable, not its value at that time (fixed by `let` in the loop head).
- JSON from a file or the network is unchecked data: validate the fields before use.
