---
name: tutor-go-expert
description: "Go patterns, pitfalls and review checklists for teaching: error values and wrapping, interfaces, goroutines and channels, context, generics, table-driven tests and module layout, with what to check in the learner's code and why. Use whenever the learner asks whether their Go is idiomatic, how goroutines or interfaces work, why their program deadlocks or races, how to lay out a module, or shares Go for review, even if they don't ask for a review. Explains and checks; never writes the learner's solution."
license: MIT
metadata:
  upstream: "fullstack-dev-skills/golang-pro@0.4.16 (skill 1.1.0, commit 882ef55)"
---

# Go expert (teaching)

Adapted from golang-pro in fullstack-dev-skills by Jeffallan (MIT; see LICENSE). Changes: rewritten to explain and check instead of writing code; `references/` kept unchanged so it can be compared with upstream.

## How to use it as a tutor
- Explain the pattern on a small unrelated example, point at the learner's line, then ask one question that makes them see the gap. Go favours plain, explicit code, and the learner gets that habit by writing it, so never write their line: until this turn's instruction allows the fix, name the pattern and point.
- Pro band: words, or a contrast with a language they know, and no code.
- The references below are written for someone implementing; their samples are knowledge for you, translated to the learner's level.

## Knowledge map
Read the one file that matches the question; each is long, so don't load them all.

| File | What is in it | Read it when |
|---|---|---|
| `references/concurrency.md` | goroutines, channels, select, sync, context | concurrency, a deadlock, a data race, cancellation |
| `references/interfaces.md` | interface design, io.Reader/Writer, composition | shared behaviour, "accept interfaces, return structs" |
| `references/generics.md` | type parameters, constraints | the same code repeated for several types |
| `references/testing.md` | table-driven tests, subtests, benchmarks, fuzzing | they write or fix tests |
| `references/project-structure.md` | module layout, internal/, go.mod | layout, imports, or a "package not found" error |

## Review checklist (ask, don't fix)
Turn each item into a question about their code, one at a time, most important first:
- Is any error ignored (`_ =` or an unchecked return)? Ask what happens to the program when that call fails.
- When an error is passed up, does it say what was being done (`fmt.Errorf("reading %s: %w", path, err)`)?
- Is `panic` used for something a caller could reasonably handle?
- For every goroutine: what makes it stop? Ask who closes the channel or cancels the context.
- Do blocking calls take a `context.Context` so they can be cancelled?
- Is an interface declared before there are two implementations or a test that needs it?
- Are the tests table-driven, and do they run clean with `go test -race ./...`?
- Is configuration hard-coded where it should come from flags or the environment?

## Pitfalls to watch for
- Writing to a nil map panics; `make` it first.
- `append` can share the backing array with the original slice.
- `:=` in an inner scope creates a new `err` and hides the outer one.
- An interface holding a typed nil pointer is not `== nil`.
- Unbuffered channel sends with no reader block forever (a goroutine leak or deadlock).
