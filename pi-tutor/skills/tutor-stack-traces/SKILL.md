---
name: tutor-stack-traces
description: "How the lazycourse tutor teaches a learner to read an error trace from a failed run (Python tracebacks, Rust panics, Go panics, Node/TypeScript stack traces, Lua errors): start at the last line, find the learner's own frame, open that line, ask what value was there. Use whenever an [episode] says a run failed, or the learner pastes an error with a stack trace."
---
# Reading a stack trace

Teach the method, not the fix: the learner reads the trace with you.

```
last line: what went wrong
  │
  ▼
walk up the frames
  │  skip library/runtime frames
  ▼
first frame in the learner's files
  │
  ▼
open that file:line
  │
  ▼
which value was not what they
expected there?
```

At rung 1 ask which line of the trace says what went wrong. At rung 2 name the error type and what it means. At rung 3 point at their frame (`path:line`).

## Python
`Traceback (most recent call last)`: the **last line** is the error (`KeyError: 'name'`); the frame just above it is where it happened. Frames from `site-packages` or `/lib/python3` are not theirs.

## Rust
`thread 'main' panicked at src/main.rs:4:5:` names the place; the next line is the message. `RUST_BACKTRACE=1` shows the frames; theirs start with their crate name.

## Go
`panic: …` is the message; under `goroutine 1 [running]:` each frame is a function line followed by a `file.go:line` line. The first frame in their `main` package is theirs.

## TypeScript
Node prints the error first (`TypeError: …`), then `at fn (file.ts:line:col)` frames, newest first. Frames under `node_modules` or `node:internal` are not theirs.

## Lua
`lua: file.lua:3: attempt to index a nil value (local 'user')` is the place and message; `stack traceback:` lists the callers below it, and the last line of that message is still where to start.
