# Rust and Go Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rust and Go projects build as scaffolded, get function checks (Way A) and trusted print checks (Way B), and `:TutorDone` blocks a wrong answer there exactly as it does in Python.

**Architecture:** The scaffold writes a manifest, an empty `main` and `entry:` in the README. A new `check-run-compiled.ts` builds one hidden test harness per run inside the existing bwrap sandbox (appended `#[cfg(test)] mod tutor_check` for Rust, `zz_tutor_check_test.go` for Go), runs each check under its own time limit, and sorts compiler errors into the five outcomes of spec §4. `runChecks` dispatches to it for Rust/Go value checks; the checks job runs the reference in a temp folder with the project's manifest.

**Tech Stack:** TypeScript (vitest), bubblewrap, cargo 1.90, go 1.27, existing `exam/sandbox.ts` (`sandboxArgv`, `toolBinds`, `cappedArgv`).

**Spec:** `docs/superpowers/specs/2026-10-22-rust-go-checks-design.md` (approved 2026-10-22). Background: `docs/superpowers/specs/2026-10-21-teaching-turns-design.md` §5, §7.

## Global Constraints

- Branch `rust-go-checks` from `main`; Native execution, then merge to main and push.
- Nothing writes to stdout/stderr inside Pi. No new Pi API (only `pi.exec`, already in `PI_SURFACE.md`).
- Every check run is inside bwrap with the project as a throwaway overlay, `--offline` for cargo, output capped with `cappedArgv` or `head -c`, a `timeout` per check (`CHECK_LIMIT_SEC = 20`).
- The learner's real files are never changed; the reference never enters the project.
- Tests use the real toolchains and skip with `it.skipIf(!has("cargo"))` / `!has("go")` / `!bwrapReady`, as `test/check-run.test.ts` and `test/exam-layout.test.ts` do.
- Python/Lua behaviour and every phase 2 ruling stay unchanged; the full suite stays green (877 TS, 41 Lua at start).
- Spec §4 outcomes, verbatim messages:
  - not written yet: "`<name>` is not written yet" → a try
  - does not fit: "this check calls `<expr>`, which your `<name>` does not accept: <first compiler line>" → no try, blocks the tick
  - inside the checked function: the first compiler line → a try
  - elsewhere: "your project does not compile (<file>:<line>: <message>), so <id> could not be checked" → no try, blocks the tick
  - parse error anywhere: typo (existing `isSyntaxError`) → no try

## Review Focus

1. A learner function whose return value the check cannot print (a Rust struct without `Debug`, a Go `(value, error)` pair) → "does not fit", no try, the other checks still run. (Task 3 test.)
2. One model-written check that does not compile even against the reference → that check unverified, the rest trusted. (Task 4 test.)
3. An endless loop in one Rust check → that check "took too long (an endless loop?)", the next check still runs, `:TutorDone` returns. (Task 3 test.)
4. A half-written other function with a Go unused variable while checking P1.T1 → "your project does not compile …", no try. (Task 3 and Task 5 tests.)
5. An older project with no `entry:` line and no `Cargo.toml` → the default entry and a minimal manifest in the throwaway copy only; the real folder unchanged. (Task 4 test.)

---

### Task 1: The project builds as scaffolded

**Files:**
- Create: `pi-tutor/extensions/tutor/manifest.ts`
- Modify: `pi-tutor/extensions/tutor/scaffold.ts` (`readme`, `writeScaffold`), `pi-tutor/extensions/tutor/check-run.ts` (`projectRun`), `pi-tutor/extensions/tutor/index.ts` (go version probe beside `luaRuntimeFor`), `pi-tutor/prompts/system/scaffold.md`
- Test: `pi-tutor/test/manifest.test.ts`, `pi-tutor/test/scaffold.test.ts`, `pi-tutor/test/check-run.test.ts`

**Interfaces:**
- Produces:
  - `manifestFor(language: string, name: string, goVersion?: string | null): { rel: string; text: string } | null` — Rust `Cargo.toml` (`[package]` name, `version = "0.1.0"`, `edition = "2021"`, empty `[workspace]`), Go `go.mod` (`module <name>`, `go <goVersion ?? "1.22">`), else null. `name` is `slugify(title)` with `-` kept for Rust and Go.
  - `goVersionOf(versionOutput: string): string | null` — `"go version go1.27.3 linux/amd64"` → `"1.27"`.
  - `starterFor(language: string): string` — Rust `"fn main() {}\n"`, Go `"package main\n\nfunc main() {}\n"`, else `""`.
  - `writeScaffold(dir, s, meta, opts: { existing?: boolean; luaRuntime?: string | null; goVersion?: string | null })` writes the manifest (`wx`, kept if present) and the entry as comment + starter.
  - `readme()` front matter gains `entry: <entry_file>` after `run:`.
  - `projectRun(root, language)` → `entry` from `entry:`; else the file in `run:`; else `src/main.rs` (rust) / `src/main.go` (go) when that file exists.

- [ ] **Step 1: Write the failing tests**
  - `manifest.test.ts`: `manifestFor("rust", "split-bill")` text contains `name = "split-bill"`, `edition = "2021"`, `[workspace]`; `manifestFor("go", "split-bill", "1.27")` is `{ rel: "go.mod", text: "module split-bill\n\ngo 1.27\n" }`; `manifestFor("python", "x")` is null; `goVersionOf("go version go1.27.3 linux/amd64") === "1.27"`, `goVersionOf("nope") === null`.
  - `scaffold.test.ts` "a Rust project builds as scaffolded" (skipIf no cargo): `writeScaffold` with `entry_file: "src/main.rs"`, `run_cmd: "cargo run"` → `Cargo.toml` exists, `src/main.rs` ends with `fn main() {}\n`, README has `entry: src/main.rs`; `cargo build --offline` in the folder exits 0. Same for Go (`src/main.go`, `go run ./src`, `go vet ./src` exits 0). A second test: an existing `Cargo.toml` with `existing: true` is kept byte for byte.
  - `check-run.test.ts` `projectRun`: `entry: src/lib/app.go` wins; `run: cargo run` with `src/main.rs` present → `entry: "src/main.rs"`; with no file → `entry: null`.

- [ ] **Step 2: Run to see them fail**
  Run: `cd pi-tutor && npx vitest run test/manifest.test.ts test/scaffold.test.ts test/check-run.test.ts`
  Expected: FAIL (module `manifest.js` missing; no `Cargo.toml`; `entry` null).

- [ ] **Step 3: Implement** `manifest.ts`, the scaffold and `projectRun` changes. In `index.ts` add `goVersionFor(language)` (like `luaRuntimeFor`: `pi.exec("go", ["version"])` → `goVersionOf`) and pass `goVersion` where `writeScaffold` is called (`index.ts:1410`). In `prompts/system/scaffold.md` add one line: "Rust and Go: `run_cmd` runs the entry's package (`cargo run`, `go run ./src`), and every task that asks for a function names its exact signature in the task line (`fn split_amount(total: f64, people: u32) -> f64`, `func splitAmount(total float64, people int) float64`)."

- [ ] **Step 4: Run the tests** — same command. Expected: PASS. Then `npm test` and `npm run typecheck`. Expected: all pass.

- [ ] **Step 5: Commit** — `feat: Rust and Go projects build as scaffolded: a manifest, an empty main, entry: in the README`

### Task 2: Function checks are written for Rust and Go

**Files:**
- Modify: `pi-tutor/extensions/tutor/checks.ts` (`VALUE_LANGUAGES`), `pi-tutor/extensions/tutor/check-job.ts` (`checksPrompt`, `referencePrompt`), `pi-tutor/prompts/system/checks.md`, `pi-tutor/prompts/system/reference.md`
- Test: `pi-tutor/test/checks.test.ts`, `pi-tutor/test/check-job.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `VALUE_LANGUAGES` = `{"python", "lua", "rust", "go"}`; `checksPrompt` for rust/go includes a one-line example in that language; `referencePrompt` for rust/go says the file must build as the crate root / `package main` of the project's manifest with the exact signatures the tasks name.

- [ ] **Step 1: Write the failing tests**
  - `checks.test.ts`: `parseChecks("check P1.T1: split_amount(50.0, 3) == 16.67", { language: "rust", … })` yields one value check; same for go `splitAmount(50, 3) == 16.67`; for `"typescript"` it is still rejected.
  - `check-job.test.ts`: `checksPrompt({ language: "rust", … })` contains `check <task id>: <expression> == <expected value>` and `split_amount(50.0, 3) == 16.67`; for go contains `splitAmount(50, 3) == 16.67`; `referencePrompt({ language: "go", … })` matches `/package main/`; for rust matches `/crate root/`.
- [ ] **Step 2: Run** `npx vitest run test/checks.test.ts test/check-job.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** In `checks.md`, the `check` bullet names Rust/Go value syntax (`3.0` for floats in Rust, exact parameter types from the task line).
- [ ] **Step 4: Run** the same tests, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: the checks job writes function checks for Rust and Go`

### Task 3: Compiled checks run in the sandbox

**Files:**
- Create: `pi-tutor/extensions/tutor/check-run-compiled.ts`
- Modify: `pi-tutor/extensions/tutor/check-run.ts` (`CheckResult`, export what the new file reuses)
- Test: `pi-tutor/test/check-run-compiled.test.ts`

**Interfaces:**
- Consumes: `Sandboxed` (export it from `check-run.ts` with `sandboxFor`), `Check`, `TOO_LONG`, `PRINTED_TOO_MUCH`, `cappedArgv`/`reachedCap`.
- Produces:
  - `CheckResult` gains `outcome?: "unfit" | "elsewhere"` (both: `pass: false`, never a try).
  - `functionSpan(source: string, name: string, language: "rust" | "go"): [number, number] | null` — 1-based first/last line of `fn name(`/`func name(` through its matching brace (skip braces in strings and comments).
  - `calledName(expr: string): string | null` — the function the expression calls (`split_amount(…)` → `split_amount`, `M::f(…)`/`pkg.F(…)` → last segment).
  - `runCompiledChecks(sb: Sandboxed, i: { language: "rust" | "go"; root: string; entry: string; checks: Check[]; limitSec: number }): Promise<CheckResult[]>`.
- Approach (one sandboxed `sh` run per attempt): write the harness into the overlay (Rust: append `#[cfg(test)] mod tutor_check { use super::*; #[test] fn c<N>() { println!("\x1eTUTOR\t<N>\t{:?}\t{:?}", <expr>, <expected>); } }` to the entry; Go: `zz_tutor_check_test.go` in the entry's directory with `package main`, `import ("fmt"; "testing")`, `func TestTutorC<N>(t *testing.T) { fmt.Printf("\x1eTUTOR\t<N>\t%v\t%v\n", <expr>, <expected>) }`), create a minimal manifest when none exists (`manifestFor`), build (`cargo test --offline --no-run --message-format=short`, or `go test -c -o /tmp/tutor.test ./<dir>`), then run each check with `timeout -k 5 <limit>` and `head -c 16384`, printing `\x1eEND\t<N>\t$?` after each. The compile step's stderr is parsed for `file:line` (`--> src/main.rs:14:5` for Rust, `src/main.go:14:5:` for Go). Sorting, in order: `isSyntaxError(line)` → `error` set to that line (Task 5 turns it into a typo); location in the harness lines of check N with `E0425 cannot find function` / `undefined: <name>` → that check `error: "<name> is not written yet"`; other harness location → that check `outcome: "unfit"`, then rebuild without it; location inside `functionSpan(entry, calledName(expr))` of a check → that check `error: <first line>` (a try); any other location → every remaining check `outcome: "elsewhere"`, `error: "your project does not compile (<file>:<line>: <message>)"`. Numbers compare with the existing tolerance, else exact text.

- [ ] **Step 1: Write the failing tests** (`check-run-compiled.test.ts`, real sandbox, skipIf no cargo/go/bwrap; each Rust and Go):
  - "right and wrong values": `split_amount(48.0, 3) == 16.0` passes with `/`, fails with `got: "144.0"` with `*`.
  - "a function not written yet": error `` `tip_rate` is not written yet ``.
  - "Review Focus #1: a return value the check cannot print does not fit": Rust `struct Bill { each: f64 }` without Debug returned from `split(…)`; Go `func parse(s string) (int, error)` checked as `parse("3") == 3` → `outcome: "unfit"`; a second, valid check in the same run passes.
  - "a type mistake inside the checked function is a try": Rust `fn split_amount(total: f64, people: u32) -> f64 { people }` → `pass: false`, no `outcome`, `error` matches `/mismatched types/`.
  - "Review Focus #4: an error elsewhere": Go `func later() { x := 1 }` plus a correct `splitAmount` → `outcome: "elsewhere"`, error matches `/^your project does not compile \(src\/main\.go:\d+: .*declared and not used/`.
  - "Review Focus #3: an endless loop in one check": check 1 loops, check 2 passes, `limitSec: 3` → `[TOO_LONG, pass]`.
  - "a parse error": Rust missing `}` → `error` for which `isSyntaxError` is true.
  - "the real folder is unchanged": after a run, the project's file list and entry text are unchanged and no `Cargo.toml` was added.
  - `functionSpan` and `calledName` unit cases: nested braces, a `}` inside a string, `M::f(1)` → `f`.
- [ ] **Step 2: Run** `npx vitest run test/check-run-compiled.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `check-run-compiled.ts` as described.
- [ ] **Step 4: Run** the same tests, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: Rust and Go function checks run in the sandbox, with compiler errors sorted as the spec says`

### Task 4: runChecks and the reference use the compiled path

**Files:**
- Modify: `pi-tutor/extensions/tutor/check-run.ts` (`runChecks`), `pi-tutor/extensions/tutor/check-job.ts` (`writeMilestoneChecks`)
- Test: `pi-tutor/test/check-run.test.ts`, `pi-tutor/test/check-job.test.ts`

**Interfaces:**
- Consumes: `runCompiledChecks`, `manifestFor`, `projectRun`'s default entry.
- Produces: `runChecks` sends rust/go value checks to `runCompiledChecks` (io checks as today, with a minimal manifest written into the overlay first when missing: the run's `sh` does `[ -f Cargo.toml ] || printf … > Cargo.toml`); results keep the input order. `writeMilestoneChecks` uses the entry it is given (now non-null for Rust/Go), copies the project's `Cargo.toml`/`go.mod` into the temp folder or writes `manifestFor`'s, and passes the same `runCmd`. Its input gains `root: string` (the project folder, to read the manifest).

- [ ] **Step 1: Write the failing tests**
  - `check-run.test.ts` "Review Focus #5": a Rust project with only `src/main.rs` (no manifest, no README `entry:`), `runCmd: "cargo run"`, one io check `stdin "52.8\n" → "17.60"` and one value check → both run and pass; the real folder still has no `Cargo.toml`.
  - `check-job.test.ts` "Review Focus #2: a Rust reference makes good checks trusted and a broken one unverified": scripted model replies (checks: `split_amount(50.0, 3) == 16.666666666666668`, `split_amount(50.0, 3, 1) == 1.0`; reference: a correct `src/main.rs`), real sandbox → `ran: true`, statuses `["trusted", "unverified"]`; the temp folder is gone afterwards. Same for Go with `go run ./src`.
- [ ] **Step 2: Run** `npx vitest run test/check-run.test.ts test/check-job.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**, and pass `root: proj.path` from `ensureChecks` in `index.ts`.
- [ ] **Step 4: Run** the same tests, then `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: Rust and Go checks run through runChecks, and the hidden reference builds with the project's manifest`

### Task 5: /tutor-done treats the new outcomes as the spec says

**Files:**
- Modify: `pi-tutor/extensions/tutor/index.ts` (`failedCheck`, the `/tutor-done` handler)
- Test: `pi-tutor/test/episode.test.ts` (a `doneProject`-style helper for Rust and Go, real Neovim + sandbox)

**Interfaces:**
- Consumes: `CheckResult.outcome`.
- Produces: `failedCheck` — `outcome: "unfit"` → notify "`<id>` not yet: this check calls `<expr>`, which your `<name>` does not accept: <line>", no episode, no try; `outcome: "elsewhere"` → notify "your project does not compile (…), so <id> could not be checked", no try; a syntax error → typo (as today). Neither outcome ticks.

- [ ] **Step 1: Write the failing tests** (`episode.test.ts`, skipIf no cargo/go/bwrap):
  - Rust `* people` → episode `attempts: 1`, spot `check:P2.T2:split_amount(48.0, 3)`; then `/` → ticked, `closeReason: "run_passed"`.
  - "does not fit is not a try and does not tick": Go `parse` returning `(int, error)` → `episodes(...)` empty, tasks.md unticked, last note matches `/does not accept/`.
  - "Review Focus #4: an error elsewhere is not a try": Go unused variable in another function → no episode, last note matches `/your project does not compile/`, not ticked.
  - "a Rust parse error is a typo": last note matches `/syntax error/`, no episode.
- [ ] **Step 2: Run** `npx vitest run test/episode.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, then `npm test`, `npm run typecheck`, and the Lua suite. Expected: all pass.
- [ ] **Step 5: Commit** — `feat: /tutor-done: a check that does not fit, or a compile error elsewhere, is not a try and does not tick`

### Task 6: Live check and docs

**Files:**
- Modify: `docs/superpowers/specs/2026-10-22-rust-go-checks-design.md` (a "Live result" section), `README.md` (Rust/Go checks line)

- [ ] **Step 1: Live, real LazyVim, nemotron then glm** (the phase 2 driver pattern: seed a learn-first Rust project one concept short of milestone 1, `:TutorLesson skip`, wait for `spec/checks.md`):
  Expected: the scaffolded project runs with `:TutorRun`; `spec/checks.md` has `check` lines, trusted; `* people` → "not yet … gave 150.0", try 1 in the widget; a missing `;` → typo note, no try; `/` → ticked; nothing of the reference in the project; `~/.pi/agent/settings.json` md5 `8dd33dde3b7fa10561c97ccfd40c1670` unchanged. Then one Go run with nemotron.
- [ ] **Step 2: Record** the results in the spec and update the README; commit `docs: Rust and Go checks live result`.
