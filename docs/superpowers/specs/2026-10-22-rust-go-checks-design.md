# Rust and Go checks: function tests, trusted print tests, and a project that builds

Date: 2026-10-22. Builds on `docs/superpowers/specs/2026-10-21-teaching-turns-design.md` §7 (checks), merged
to main as a7c9bb3. Language scope: Rust and Go (the author's next languages).

## 1. Intent

`:TutorDone <task>` ticks a task only when its checks pass (teaching turns §7). In Python and Lua that works.
In Rust and Go it does not, for three reasons, so a wrong answer can be ticked there:

```
today, Rust/Go project
  scaffold ──▶ src/main.rs only (no Cargo.toml / go.mod) ──▶ `cargo run` / `go run ./src` fail
  checks job ──▶ function checks rejected (value form is Python/Lua only)
             ──▶ print checks written, but the hidden reference never runs
                 (README `run:` names no file) ──▶ every check "unverified" ──▶ never blocks a tick
```

Most early tasks are functions ("P1.T1 write `split_amount(total, people)`"): the plan prompt lists functions
to build, the beginner design recipe builds one function at a time, and in the spike most model-written
checks were function checks. So without function checks most early Rust/Go tasks stay unproven.

Author's decisions (2026-10-22): build both function checks and trusted print checks; the tutor creates the
manifest for new projects.

## 2. Goals

1. A new Rust or Go project builds and runs as scaffolded: the tutor writes a minimal `Cargo.toml` /
   `go.mod` and an empty `main` (author, 2026-10-22).
Names used below: **Way A** = function checks (the tutor calls the learner's function); **Way B** = print
checks (the tutor runs the whole program with typed input and reads what it prints).

2. Way A, function checks (`check P1.T1: split_amount(50.0, 3) == 16.67`) for Rust and Go, written by the checks
   job, shown in `spec/checks.md`, run by `:TutorDone`.
3. The hidden reference runs for Rust and Go projects, so both function and print checks can become
   trusted, and a failing trusted check stops the tick and counts as a try, exactly as in Python.
4. Plain messages, as in Python/Lua: a function not written yet says so; a file that does not parse is a
   typo (no try); other compile errors in the learner's code are a try.

## 3. Non-goals and anti-goals

- Non-goals: JavaScript/TypeScript function checks (they stay print-only); checks for projects with
  external crates or Go modules beyond what builds offline; checking code outside the entry file's reach.
- Anti-goals (a failure even if it "works"):
  - the learner's real files are changed, or a check or the reference leaves anything in the project;
  - one broken model-written check line blocks every other check (Rust and Go stop the whole build on one
    bad line, verified 2026-10-22);
  - a check the reference cannot pass blocks the learner;
  - a printing or endless loop hangs `:TutorDone` or floods Pi (the output cap from 11b40dd/010351f
    applies).

## 4. What the learner sees

Unchanged from Python except slower (`:TutorDone` in Rust compiles; speed is not a goal for learners):
`spec/checks.md` lists `check` and `run` lines with trusted/unverified marks; `:TutorDone P1.T1` says
"P1.T1 not yet: split_amount(50.0, 3) gave 150.0, expected 16.67" (a try, help climbs) or "ticked P1.T1
(2 check(s) passed)". The author confirmed (2026-10-22) these two calls:
- a type mistake inside the learner's function (returns `u32` where the task wants `f64`) is a try, not a
  typo;
- JavaScript/TypeScript stay as they are.

Author's answers after the builder check (2026-10-22):
- **Empty starter.** The scaffold writes `fn main() {}` (Rust) or `package main` + `func main() {}` (Go)
  under the "Start here" comment: boilerplate, not task code, so the project builds from the first minute.
- **Exact signatures; a call that does not fit is not a try.** In Rust and Go, every task that asks for a
  function names its exact signature in the task line (`fn split_amount(total: f64, people: u32) -> f64`,
  `func splitAmount(total float64, people int) float64`), and checks call it that way. When a check still
  cannot call the learner's function as written (other parameter types, a return value the check cannot
  print, a Go `(value, error)` pair the check did not expect), the result says "this check calls
  `split_amount(50.0, 3)`, which your `split_amount` does not accept: <first compiler line>". It is **not a
  try**, and it still **blocks the tick** until the function fits (or `:TutorDone <id> anyway`).
- **Only errors in the checked function are a try.** A compile error inside the function a check calls is
  a try (a real mistake on this task). A compile error anywhere else ("your project does not compile
  (src/main.rs:14: …), so P1.T1 could not be checked") is not a try, like a typo.

```
:TutorDone P1.T1 ──▶ build fails ──▶ where does the first error point?
  ├─ a parse error anywhere ─────────────────────────────▶ typo: no try
  ├─ hidden test, function missing ──────────────────────▶ "`split_amount` is not written yet" (a try, as Python)
  ├─ hidden test, call does not fit the learner's function ▶ "does not accept …": no try, blocks the tick
  ├─ inside the checked function ────────────────────────▶ a try, first error line shown
  └─ anywhere else in the learner's code ────────────────▶ "your project does not compile …": no try
```

## 5. How it works (designer's calls, after a toolchain probe on cargo 1.90 and go 1.27)

### 5.1 The project
- The entry file's starter: the "Start here" comment followed by an empty `main` (§4).
- `writeScaffold` adds, for Rust, `Cargo.toml` (`[package] name = <slug>, version = "0.1.0",
  edition = "2021"` and an empty `[workspace]`, as the exam layout does) and, for Go, `go.mod`
  (`module <slug>` and `go <installed major.minor>`). Kept if present (`wx`), like `.luarc.json`.
- The README front matter gains `entry: <entry_file>`. `projectRun` reads it; when it is absent (older
  projects) it uses the file named in `run:`, else the language default (`src/main.rs`, `src/main.go`).
- The scaffold prompt's `run_cmd` for Go must run the entry's package (`go run ./src`); the language card
  already says Rust uses `cargo run`. For Rust and Go the scaffold prompt also asks for the exact signature
  of every function a task asks for, in that task's line (§4), and the checks prompt calls functions with
  exactly those signatures.

### 5.2 Function checks
- `VALUE_LANGUAGES` gains rust and go; the checks prompt describes the forms in the project's language
  (Rust: `split_amount(50.0, 3) == 16.67`; Go: `splitAmount(50, 3) == 16.67`).
- In the sandbox's throwaway copy only:
  - Rust: append `#[cfg(test)] mod tutor_check { use super::*; … }` to the entry file, one `#[test] fn cN`
    per check, each printing a marker line with `{:?}` of the expression and of the expected value.
    Build once (`cargo test --offline --no-run`), then run the test binary once per check by exact name,
    under the per-check time limit and output cap.
  - Go: write `zz_tutor_check_test.go` (package of the entry, `TestTutorCN` per check, `%v` of both values)
    beside the entry; `go test <pkg> -run '^TestTutorCN$'` per check (Go's build cache makes reruns cheap;
    `GOCACHE` is the lazycourse cache the exam sandbox already binds), or build once with `go test -c` and
    run the binary per check.
- Comparison happens in the extension: both sides parse as numbers → the existing tolerance; otherwise the
  printed text must match exactly.
- One bad check must not sink the rest: when the build fails and the compiler points at a line of the
  hidden test code, that check fails with "the check does not compile: <first error line>" and the build
  is retried without it. The cross-check then marks it unverified (the reference cannot pass it either).
- Sorting compiler errors at `:TutorDone` follows the diagram in §4. "Inside the checked function" means
  the error's file:line falls within the source span of the function the check's expression calls (found
  in the entry file or the module it names); an error in the hidden test lines that is not "function
  missing" is "does not fit". At the reference run (§5.3) any error in a check's hidden lines makes that
  check unverified, never blocking.
- "Does not fit" is a third result besides pass and fail: `failedCheck` shows it without recording a try,
  and `/tutor-done` does not tick while a trusted check does not fit.

### 5.3 The reference (for both Way A and Way B checks)
- `writeMilestoneChecks` no longer skips when `run:` names no file: it uses the entry from §5.1. The
  temporary folder gets the learner project's `Cargo.toml` / `go.mod` (or the minimal one from §5.1) and
  the reference at the entry path, then runs the checks there as today (`crossCheck`).
- The reference prompt already asks for the whole entry file; for Rust/Go it also says the file must
  build as the crate root / `package main` of that manifest.

### 5.4 Settled after the builder check (designer's calls)
- No migration of stored checks: the author's profile holds no projects yet (checked 2026-10-22), so no
  Rust/Go project has old print-only, unverified records to redo.
- Each sandbox run gets a fresh throwaway overlay, so "build once, run each check" happens inside one
  sandboxed run (one `sh` script that builds and then runs each check under its own `timeout` with its own
  marker), or with a writable target directory outside the project; the builder picks, keeping one check's
  endless loop from hiding the others.

## 6. Constraints

- Everything runs inside the existing bwrap sandbox: `/` read-only, the project as a throwaway overlay,
  no network (hence `--offline`), output capped (`cappedArgv`), `timeout` per run. Rust needs `cargo` and
  the rustup toolchain bound as `toolBinds` already does for exams.
- No stdout/stderr in Pi; no new Pi API without `PI_SURFACE.md`; writes only through `writeInRoot`;
  TDD with real toolchains (tests skip when `cargo`/`go`/`bwrap` are missing, as the exam tests do).
- Existing Python/Lua behaviour and all phase 2 rulings stand.

## 7. Left to the builder

- Where the Rust/Go harness code lives (likely beside the Python/Lua harnesses in `check-run.ts`, or a
  `check-run-compiled.ts`), and whether Go runs `go test -run` per check or one compiled binary.
- The exact marker format and how compiler error locations are mapped back to a check.
- Whether existing Rust/Go projects get a missing manifest offered (not required: the throwaway copy and
  the reference folder get a minimal one when missing).
- Rust build caching across `:TutorDone` runs (a shared `CARGO_TARGET_DIR` like the Go cache) only if a
  run is slow enough to matter; correctness first.
