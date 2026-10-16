# Exam Test Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exam tests are written by the model. Every run of them (the hidden check before the exam is shown, `:TutorExam check` and `:TutorSubmit`) happens inside a bubblewrap sandbox. In the sandbox:
- the filesystem is read-only, apart from the exam folder;
- the home folder, `/tmp` and the user's sockets (`/run/user`, which holds Neovim's `$NVIM` control socket) are hidden;
- there is no network;
- the environment is empty apart from `PATH`, `HOME` and `LANG`.

The sandbox is on by default and can be switched off with `/tutor-exam sandbox off`.

**Architecture:**
- A new pure module, `extensions/tutor/exam/sandbox.ts`, builds the `bwrap` argument list. It also works out which toolchain folders under the hidden home must stay visible (read-only), for example `~/.cargo/bin` and `~/.rustup`.
- `runExamTests` (`exam/layout.ts`) is the single place that runs exam tests. It gains an options object `{ limitSec, sandbox }` and, when `sandbox` is set, wraps every command it runs (version check, `timeout --version`, the test command) in `bwrap … --`.
- When bubblewrap cannot start, the run returns `missing`. This uses the final-review I1 path: the exam stays open, there is no retry, and the message names the fix.
- `index.ts` holds the on/off setting in the profile (`exam_sandbox`) and passes a `SandboxHost` or `null` to all three callers.

**Tech Stack:** TypeScript (Node 26), vitest, bubblewrap 0.13 (`/usr/bin/bwrap`, verified 2026-10-16), Pi 1.1.0 `pi.exec` (already in `PI_SURFACE.md`), Lua for the completion list.

**Spec:** `docs/superpowers/specs/2026-10-13-tutor-roles-packs-exams-design.md` §6 (exams), and M8 plan D1/D5 (`docs/superpowers/plans/2026-10-15-m8-exams.md`). This plan adds what those left open: model-written test code ran with the learner's full rights.

## What was verified on this machine before planning (2026-10-16)

| Check | Result |
|---|---|
| unprivileged user namespaces | `bwrap --ro-bind / / --unshare-all true` → exit 0 |
| python / cargo / go / node / lua tests inside the sandbox | all five run. A failing test exits 1 (101 for cargo), so exit codes pass through |
| Rust with only `~/.cargo/bin` + `~/.rustup` visible | builds and tests; `~/.cargo/credentials.toml` stays hidden |
| `timeout -k 5 5` inside the sandbox on a looping cargo test | exit 124 after 5 s, no test process left |
| network | `urlopen` fails: no name resolution, no interfaces |
| write outside the exam folder | `Read-only file system` |
| `--clearenv` | only `PATH`, `HOME`, `LANG` (and `PWD`, `SHLVL`, `_` from the shell) seen |
| `/run/user` hidden | `ls /run/user` empty |
| Go build cache | needs a writable `GOCACHE`: the first run took 7.4 s, a warm run 0.2 s, and the cache is 66 MB |

## Decisions this plan makes (confirm at review)

| # | Decision | Why |
|---|---|---|
| S1 | Sandbox **on by default for every level**. The setting is `exam_sandbox` in the profile, `/tutor-exam sandbox [on\|off]`, and it is kept per session when there is no profile | it is a safety rule, not a teaching choice, so the band-aware-default rule does not apply |
| S2 | bubblewrap missing or user namespaces blocked → **refuse**, not fall back. The message is: "exam tests run in a sandbox and bubblewrap (bwrap) cannot start here: install it (Arch: pacman -S bubblewrap) or run /tutor-exam sandbox off" | a silent fallback would bring the risk back without the learner knowing |
| S3 | Hidden: `/home`, `$HOME` (when it is outside `/home`), `/tmp`, `/var/tmp`, `/run/user`. Everything else is read-only. The exam folder (realpath) is the only writable bind | reading `/usr`, `/etc` and the project is harmless; home holds keys and tokens; `/run/user` holds the Neovim control socket and agent sockets |
| S4 | Toolchains under a hidden folder are found the way the shell finds them: walk `PATH`, take the first executable, then its realpath. What is exposed again, read-only, depends on the tool: <ul><li>rustup proxy (`…/rustup`): its bin folder plus `RUSTUP_HOME` (default `~/.rustup`);</li><li>a bin folder directly in `~` or `~/.local`: only that bin folder;</li><li>any other tool: the folder above its `bin` (e.g. `~/.nvm/versions/node/v22`, `~/.pyenv`);</li><li>the found bin folder itself when the found path differs from the realpath.</li></ul> | it keeps `~/.cargo/credentials.toml` and `~/.local/share` (keyrings) hidden, and covers rustup, nvm and pyenv. A toolchain this misses gives "could not run X inside the exam sandbox", not a wrong grade |
| S5 | Go only: one shared writable cache, `${XDG_CACHE_HOME:-~/.cache}/lazycourse/go-build`, plus `GOTOOLCHAIN=local` and `GOPATH=/tmp/go` | a fresh cache per run costs 7 s per check. The shared cache holds only exam builds, never the learner's own Go cache |
| S6 | Environment: `--clearenv`, then `PATH`, `HOME`, `LANG` (default `C.UTF-8`), and `RUSTUP_HOME` / `CARGO_HOME` / `RUSTUP_TOOLCHAIN` when set | Pi's environment holds the provider API key and `$NVIM` |
| S7 | `:TutorRun` (the learner's own `run:`/`test:`) is **not** sandboxed | the learner chose those commands; this plan is about model-written code |

## Global Constraints

- Nothing in the extension writes to stdout or stderr.
- No new Pi API: `pi.exec` is already recorded. `bwrap` is an external program, run through `pi.exec` like `cargo`.
- The model stays read-only and `bash` stays off. Only the extension runs commands.
- Learner-facing text never says "rung".
- Work happens on worktree branch `exam-sandbox`. TDD throughout, one commit per task. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commands:
  - TS: `cd pi-tutor && npm test && npm run typecheck`. The only known failure is the unhandled 'write after end' from `test/nvim.test.ts`.
  - Lua: `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`.
- Real-sandbox tests use `it.skipIf(!bwrapReady)`, where `bwrapReady = spawnSync("bwrap", ["--ro-bind","/","/","--unshare-all","true"]).status === 0`.

## Review Focus

1. **Escape attempts by a test file:**
   - writing outside the exam folder;
   - reading `$HOME`;
   - reading an environment secret;
   - a TCP connection to a listening `127.0.0.1` port;
   - a Unix socket outside the exam folder.

   Every one must fail, and the host must stay unchanged (Task 2 escape test).
2. **A looping solution inside the sandbox:** it is still killed at the limit, with no process left (Task 2).
3. **bwrap missing or blocked:** the exam is never graded as failing tests; it stays open with the S2 message (Task 2 unit, Task 3 command test).
4. **Toolchain under home** (rustup, nvm, pyenv, `~/.local/bin`): the right folders are visible, and nothing else in home is (Task 1 unit tests with a fake home).
5. **Exam folder reached through a symlink:** the bind and `--chdir` use the realpath (Task 2: `sandboxArgv` receives `realpathSync(dir)`).

---

### Task 1: `exam/sandbox.ts`: toolchain binds and the bwrap argument list

**Files:**
- Create: `pi-tutor/extensions/tutor/exam/sandbox.ts`
- Test: `pi-tutor/test/exam-sandbox.test.ts`

**Interfaces:**
- Produces:
  - `interface SandboxHost { env: NodeJS.ProcessEnv; home: string; cacheDir: string }`
  - `findOnPath(cmd: string, path: string): string | null`
  - `toolBinds(cmds: string[], host: SandboxHost): string[]`
  - `sandboxArgv(dir: string, language: string, binds: string[], host: SandboxHost): string[]`. It returns the arguments up to and including `--`, and creates the Go cache folder when `language === "go"`.
  - `BWRAP_PROBE: [string, string[]]`
  - `SANDBOX_MISSING: string`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findOnPath, toolBinds, sandboxArgv } from "../extensions/tutor/exam/sandbox.js";

function exe(path: string) { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, "#!/bin/sh\n"); chmodSync(path, 0o755); }
function fakeHome() {
  const root = mkdtempSync(join(tmpdir(), "sbx-home-"));
  const home = join(root, "me");
  exe(join(home, ".cargo/bin/rustup")); symlinkSync("rustup", join(home, ".cargo/bin/cargo"));
  mkdirSync(join(home, ".rustup"), { recursive: true });
  exe(join(home, ".nvm/versions/node/v22/bin/node"));
  exe(join(home, ".local/bin/lua"));
  return { home, host: (path: string) => ({ env: { PATH: path }, home, cacheDir: join(root, "cache") }) };
}

describe("exam sandbox: which toolchain folders stay visible (plan S4)", () => {
  it("finds the first executable on PATH", () => {
    const { home } = fakeHome();
    expect(findOnPath("node", `/nonexistent:${home}/.nvm/versions/node/v22/bin`)).toBe(`${home}/.nvm/versions/node/v22/bin/node`);
    expect(findOnPath("nope", "/usr/bin")).toBeNull();
  });
  it("rustup: its bin folder and RUSTUP_HOME, never the rest of ~/.cargo", () => {
    const { home, host } = fakeHome();
    expect(toolBinds(["cargo"], host(`${home}/.cargo/bin`)).sort()).toEqual([`${home}/.cargo/bin`, `${home}/.rustup`]);
  });
  it("nvm-style installs: the version folder", () => {
    const { home, host } = fakeHome();
    expect(toolBinds(["node"], host(`${home}/.nvm/versions/node/v22/bin`))).toEqual([`${home}/.nvm/versions/node/v22`]);
  });
  it("~/.local/bin: only the bin folder, not ~/.local/share", () => {
    const { home, host } = fakeHome();
    expect(toolBinds(["lua"], host(`${home}/.local/bin`))).toEqual([`${home}/.local/bin`]);
  });
  it("system tools need no bind", () => {
    const { host } = fakeHome();
    expect(toolBinds(["sh"], host("/usr/bin:/bin"))).toEqual([]);
  });
});

describe("exam sandbox: the bwrap arguments (plan S3, S5, S6)", () => {
  const host = { env: { PATH: "/usr/bin", LANG: "en_US.UTF-8", SECRET_KEY: "x", NVIM: "/run/user/1000/nvim.1" }, home: "/home/me", cacheDir: mkdtempSync(join(tmpdir(), "sbx-cache-")) };
  const argv = sandboxArgv("/work/exam/01", "python", ["/home/me/.rustup"], host);
  const pairs = (flag: string) => argv.flatMap((a, i) => (a === flag ? [argv[i + 1]] : []));
  it("read-only root, no namespaces shared, dies with Pi, empty environment", () => {
    expect(argv.slice(0, 3)).toEqual(["--ro-bind", "/", "/"]);
    for (const f of ["--unshare-all", "--die-with-parent", "--new-session", "--clearenv"]) expect(argv).toContain(f);
    expect(argv.at(-1)).toBe("--");
  });
  it("hides home, temp folders and user sockets", () => {
    expect(pairs("--tmpfs")).toEqual(expect.arrayContaining(["/home", "/tmp", "/var/tmp", "/run/user"]));
  });
  it("only the exam folder is writable, and it is the working directory", () => {
    expect(pairs("--bind")).toEqual(["/work/exam/01"]);
    expect(pairs("--chdir")).toEqual(["/work/exam/01"]);
    expect(pairs("--ro-bind")).toContain("/home/me/.rustup");
  });
  it("passes PATH, HOME and LANG only: no API keys, no $NVIM", () => {
    const set = pairs("--setenv");
    expect(set).toEqual(expect.arrayContaining(["PATH", "HOME", "LANG"]));
    expect(set).not.toContain("SECRET_KEY");
    expect(set).not.toContain("NVIM");
    expect(argv.join(" ")).not.toContain("/run/user/1000/nvim.1");
  });
  it("a home outside /home is hidden too", () => {
    expect(sandboxArgv("/w", "python", [], { ...host, home: "/srv/me" })).toEqual(expect.arrayContaining(["--tmpfs", "/srv/me"]));
  });
  it("go gets one shared writable build cache and no toolchain downloads", () => {
    const go = sandboxArgv("/w", "go", [], host);
    const cache = join(host.cacheDir, "go-build");
    expect(existsSync(cache)).toBe(true);
    expect(go.join(" ")).toContain(`--bind ${cache} ${cache}`);
    expect(go.join(" ")).toContain(`--setenv GOCACHE ${cache}`);
    expect(go.join(" ")).toContain("--setenv GOTOOLCHAIN local");
    expect(argv.join(" ")).not.toContain("GOCACHE");
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd pi-tutor && npx vitest run test/exam-sandbox.test.ts`
Expected: FAIL, because `../extensions/tutor/exam/sandbox.js` cannot be resolved.

- [ ] **Step 3: Implement**

```ts
// Exam test sandbox (plan 2026-10-16 exam-sandbox): the model writes exam tests, so they run under
// bubblewrap with the filesystem read-only, home, temp folders and user sockets hidden, no network
// and an empty environment. Only the exam folder is writable.
import { accessSync, constants, mkdirSync, realpathSync, statSync } from "node:fs";
import { basename, delimiter, dirname, join } from "node:path";

export interface SandboxHost { env: NodeJS.ProcessEnv; home: string; cacheDir: string }

/** Cheap check that bwrap exists and user namespaces are allowed. */
export const BWRAP_PROBE: [string, string[]] = ["bwrap", ["--ro-bind", "/", "/", "--unshare-all", "--die-with-parent", "true"]];
export const SANDBOX_MISSING = "exam tests run in a sandbox and bubblewrap (bwrap) cannot start here: install it (Arch: pacman -S bubblewrap) or run /tutor-exam sandbox off";

const HIDDEN = ["/home", "/tmp", "/var/tmp", "/run/user"];
const KEEP_ENV = ["RUSTUP_HOME", "CARGO_HOME", "RUSTUP_TOOLCHAIN"];

export function findOnPath(cmd: string, path: string): string | null {
  for (const d of path.split(delimiter)) {
    if (!d) continue;
    const p = join(d, cmd);
    try { accessSync(p, constants.X_OK); if (statSync(p).isFile()) return p; } catch { /* next */ }
  }
  return null;
}

const under = (p: string, dir: string) => p === dir || p.startsWith(`${dir}/`);
const hidden = (p: string, home: string) => under(p, home) || HIDDEN.some((h) => under(p, h));
const exists = (p: string) => { try { statSync(p); return true; } catch { return false; } };

/** Read-only binds that make a toolchain installed under a hidden folder visible again (plan S4). */
export function toolBinds(cmds: string[], host: SandboxHost): string[] {
  const out = new Set<string>();
  for (const c of cmds) {
    const found = findOnPath(c, host.env.PATH ?? "");
    if (!found) continue;
    const real = realpathSync(found), bin = dirname(real);
    if (hidden(dirname(found), host.home) && dirname(found) !== bin) out.add(dirname(found));
    if (!hidden(real, host.home)) continue;
    if (basename(real) === "rustup") {
      out.add(bin);
      const rh = host.env.RUSTUP_HOME ?? join(host.home, ".rustup");
      if (exists(rh)) out.add(rh);
      continue;
    }
    const root = dirname(bin);
    // ~ and ~/.local hold far more than the tool (keyrings, history): expose only the bin folder.
    out.add(basename(bin) === "bin" && root !== host.home && root !== join(host.home, ".local") ? root : bin);
  }
  return [...out];
}

/** bwrap arguments up to and including `--`; `dir` must already be a realpath. */
export function sandboxArgv(dir: string, language: string, binds: string[], host: SandboxHost): string[] {
  const a = ["--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc"];
  for (const h of HIDDEN) a.push("--tmpfs", h);
  if (!HIDDEN.some((h) => under(host.home, h))) a.push("--tmpfs", host.home);
  for (const b of binds) a.push("--ro-bind", b, b);
  a.push("--clearenv", "--setenv", "PATH", host.env.PATH ?? "/usr/bin:/bin", "--setenv", "HOME", host.home, "--setenv", "LANG", host.env.LANG ?? "C.UTF-8");
  for (const k of KEEP_ENV) { const v = host.env[k]; if (v) a.push("--setenv", k, v); }
  if (language === "go") {
    const cache = join(host.cacheDir, "go-build");
    mkdirSync(cache, { recursive: true });
    a.push("--bind", cache, cache, "--setenv", "GOCACHE", cache, "--setenv", "GOTOOLCHAIN", "local", "--setenv", "GOPATH", "/tmp/go");
  }
  a.push("--bind", dir, dir, "--chdir", dir, "--unshare-all", "--die-with-parent", "--new-session", "--");
  return a;
}
```

Note: the "only the exam folder is writable" test reads `--bind` pairs for python, so the Go cache bind is not counted there.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd pi-tutor && npx vitest run test/exam-sandbox.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/exam/sandbox.ts pi-tutor/test/exam-sandbox.test.ts
git commit -m "feat(pi-tutor): exam sandbox arguments and toolchain binds"
```

### Task 2: `runExamTests` runs inside the sandbox

**Files:**
- Modify: `pi-tutor/extensions/tutor/exam/layout.ts` (`runExamTests`)
- Modify: `pi-tutor/extensions/tutor/exam/make.ts` (`makeExam` passes `sandbox`)
- Modify: `pi-tutor/extensions/tutor/index.ts` (the two direct callers move to the options object, with `sandbox: null` until Task 3)
- Test: `pi-tutor/test/exam-layout.test.ts`, `pi-tutor/test/exam-make.test.ts`

**Interfaces:**
- Consumes: Task 1, all of it.
- Produces:
  - `runExamTests(exec, language, dir, opts?: { limitSec?: number; sandbox?: SandboxHost | null }): Promise<TestRun>`. The old positional `limitSec` becomes `opts.limitSec`.
  - `makeExam(d: { …existing; sandbox?: SandboxHost | null })`.

- [ ] **Step 1: Write the failing tests** (in `exam-layout.test.ts`)

```ts
const bwrapReady = spawnSync("bwrap", ["--ro-bind", "/", "/", "--unshare-all", "true"]).status === 0;
const realHost = (): SandboxHost => ({ env: process.env, home: homedir(), cacheDir: mkdtempSync(join(tmpdir(), "sbx-cache-")) });

describe("exam tests inside the sandbox (plan 2026-10-16)", () => {
  for (const [lang, c] of Object.entries(CASES)) {
    it.skipIf(!bwrapReady || !has(c.tool))(`${lang}: stub fails cleanly and a solution passes inside the sandbox`, async () => {
      const dir = mkdtempSync(join(tmpdir(), `sbx-${lang}-`));
      writeAll(dir, examFiles(lang, c.stub, c.tests));
      const stub = await runExamTests(realExec, lang, dir, { sandbox: realHost() });
      expect(stub.missing, stub.out).toBeUndefined();
      expect(stub.code).not.toBe(0);
      expect(stub.broken, stub.out).toBe(false);
      writeAll(dir, examFiles(lang, c.solved, c.tests));
      const solved = await runExamTests(realExec, lang, dir, { sandbox: realHost() });
      expect(solved.code, solved.out).toBe(0);
    }, 90_000);
  }

  it.skipIf(!bwrapReady || !has("python3"))("a test file cannot write outside, read home or secrets, or reach a port or socket (Review Focus #1)", async () => {
    const outside = mkdtempSync(join(tmpdir(), "sbx-outside-"));
    const home = mkdtempSync(join(tmpdir(), "sbx-fakehome-"));
    writeFileSync(join(home, "id_secret"), "k");
    process.env.LAZY_SANDBOX_SECRET = "s3cr3t-value";
    const server = createServer().listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;
    const sock = join(outside, "nvim.sock");
    const unix = createServer().listen(sock);
    await once(unix, "listening");
    const probe = [
      "import os, socket, unittest",
      "class T(unittest.TestCase):",
      "    def test_escape(self):",
      `        try: open(${JSON.stringify(join(outside, "escaped"))}, "w").write("x")`,
      "        except OSError: pass",
      "        print('HOME', sorted(os.listdir(os.path.expanduser('~'))))",
      "        print('ENV', os.environ.get('LAZY_SANDBOX_SECRET'))",
      "        for fam, addr, tag in ((socket.AF_INET, ('127.0.0.1', " + port + "), 'tcp'), (socket.AF_UNIX, " + JSON.stringify(sock) + ", 'unix')):",
      "            s = socket.socket(fam)",
      "            try: s.connect(addr); print(tag, 'reached')",
      "            except OSError: print(tag, 'blocked')",
      "        self.fail('done')",
    ].join("\n");
    const dir = mkdtempSync(join(tmpdir(), "sbx-escape-"));
    writeAll(dir, [["solution.py", "\n"], ["test_examples.py", probe]]);
    try {
      const r = await runExamTests(realExec, "python", dir, { sandbox: { env: process.env, home, cacheDir: outside } });
      expect(existsSync(join(outside, "escaped"))).toBe(false);
      expect(r.out).toContain("HOME []");
      expect(r.out).toContain("ENV None");
      expect(r.out).toContain("tcp blocked");
      expect(r.out).toContain("unix blocked");
    } finally {
      delete process.env.LAZY_SANDBOX_SECRET;
      server.close(); unix.close();
    }
  }, 60_000);

  it.skipIf(!bwrapReady || !has("go"))("a looping solution is still stopped with every process it started (Review Focus #2)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sbx-hang-"));
    writeAll(dir, examFiles("go", "package exam\n\nfunc CountWords(text string) map[string]int {\n\tfor {\n\t}\n}\n", CASES.go.tests));
    const r = await runExamTests(realExec, "go", dir, { limitSec: 3, sandbox: realHost() });
    expect(r.killed).toBe(true);
    await new Promise((res) => setTimeout(res, 500));
    expect(execFileSync("ps", ["-eo", "comm"], { encoding: "utf8" }).split("\n").filter((c) => c === "exam.test")).toEqual([]);
  }, 90_000);

  it("bwrap that cannot start is reported as missing with the fix, and nothing else runs (Review Focus #3)", async () => {
    const ran: string[] = [];
    const exec = async (c: string) => { ran.push(c); return { stdout: "", stderr: "", code: c === "bwrap" ? 1 : 0, killed: false }; };
    const dir = mkdtempSync(join(tmpdir(), "sbx-nobwrap-"));
    const r = await runExamTests(exec, "python", dir, { sandbox: realHost() });
    expect(r.missing).toBe(SANDBOX_MISSING);
    expect(r.broken).toBe(false);
    expect(ran).toEqual(["bwrap"]);
  });

  it("a toolchain the sandbox cannot see says so", async () => {
    const exec = async (c: string, a: string[]) => ({ stdout: "", stderr: "", code: c === "bwrap" && a.includes("--version") ? 1 : 0, killed: false });
    const dir = mkdtempSync(join(tmpdir(), "sbx-notool-"));
    const r = await runExamTests(exec, "rust", dir, { sandbox: realHost() });
    expect(r.missing).toMatch(/could not run cargo inside the exam sandbox/);
  });
});
```

The existing hang test changes from `runExamTests(realExec, "go", dir, 3)` to `runExamTests(realExec, "go", dir, { limitSec: 3 })`.

New imports: `homedir` (`node:os`); `createServer`, `AddressInfo` (`node:net`); `once` (`node:events`); `existsSync`, `writeFileSync` (`node:fs`); `SandboxHost`, `SANDBOX_MISSING` from `../extensions/tutor/exam/sandbox.js`.

In `exam-make.test.ts`, add one test: `makeExam({ …, sandbox: host })` hands `sandbox` to the probe. Use an exec that records its calls, then assert the first call is `bwrap` with the `BWRAP_PROBE` arguments.

- [ ] **Step 2: Run and watch them fail**

Run: `cd pi-tutor && npx vitest run test/exam-layout.test.ts test/exam-make.test.ts`
Expected: FAIL. The new tests fail because the options object is ignored: the run is not sandboxed, `missing` is undefined, and the escape test sees `tcp reached` / `HOME [...]`. The changed hang test may still pass, since `{limitSec: 3}` coerces to NaN. That's fine: it is a call-site change, not a new behaviour.

- [ ] **Step 3: Implement**

`layout.ts`:

```ts
export interface ExamRunOptions { limitSec?: number; sandbox?: SandboxHost | null }

export async function runExamTests(exec: RunExec, language: string, dir: string, opts: ExamRunOptions = {}): Promise<TestRun> {
  const l = LAYOUTS[language];
  if (!l) throw new Error(`no exams for ${language} yet`);
  const limitSec = opts.limitSec ?? EXAM_TIMEOUT_MS / 1000;
  const sb = opts.sandbox ?? null;
  if (sb && (await exec(BWRAP_PROBE[0], BWRAP_PROBE[1], { cwd: dir, timeout: 10_000 })).code !== 0) {
    return { code: 1, out: SANDBOX_MISSING, killed: false, broken: false, missing: SANDBOX_MISSING };
  }
  // Review Focus #5: bind and chdir the real folder, not a symlink to it.
  const prefix = sb ? sandboxArgv(realpathSync(dir), language, toolBinds([l.version[0], l.command[0], "timeout"], sb), sb) : null;
  const run = (c: string, a: string[], timeout: number) => (prefix ? exec("bwrap", [...prefix, c, ...a], { cwd: dir, timeout }) : exec(c, a, { cwd: dir, timeout }));
  const tool = await run(l.version[0], l.version[1], 10_000);
  if (tool.code !== 0) {
    const missing = sb
      ? `could not run ${l.version[0]} inside the exam sandbox: is it installed and on the PATH Pi was started with? (/tutor-exam sandbox off runs it without one)`
      : `could not run ${l.version[0]}: is it installed and on the PATH Pi was started with?`;
    return { code: tool.code, out: missing, killed: false, broken: false, missing };
  }
  const group = (await run("timeout", ["--version"], 10_000)).code === 0;
  const r = group
    ? await run("timeout", ["-k", "5", String(limitSec), l.command[0], ...l.command[1]], (limitSec + 15) * 1000)
    : await run(l.command[0], l.command[1], limitSec * 1000);
  const killed = r.killed || (group && (r.code === 124 || r.code === 137));
  const out = `${r.stdout}\n${r.stderr}`.trim();
  return { code: r.code, out, killed, broken: !killed && r.code !== 0 && l.broken(out) };
}
```

`make.ts`: add `sandbox?: SandboxHost | null` to `makeExam`'s parameter, then call `runExamTests(d.exec, d.language, join(d.root, dir), { sandbox: d.sandbox })`.

`index.ts`: the `check` and submit callers become `runExamTests(…, dir, { sandbox: null })` for now. Task 3 connects them.

- [ ] **Step 4: Run and watch them pass, then the whole suite**

Run: `cd pi-tutor && npx vitest run test/exam-layout.test.ts test/exam-make.test.ts && npm test && npm run typecheck`
Expected: PASS. The full suite shows only the known 'write after end'.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/exam/layout.ts pi-tutor/extensions/tutor/exam/make.ts pi-tutor/extensions/tutor/index.ts pi-tutor/test/exam-layout.test.ts pi-tutor/test/exam-make.test.ts
git commit -m "feat(pi-tutor): exam tests run inside bubblewrap when a sandbox is given"
```

### Task 3: The setting, `/tutor-exam sandbox`, and the three callers

**Files:**
- Modify: `pi-tutor/extensions/tutor/exam/make.ts` (`parseExamArgs`)
- Modify: `pi-tutor/extensions/tutor/index.ts`
- Modify: `nvim-tutor/lua/tutor/init.lua` (completion list)
- Test: `pi-tutor/test/exam-make.test.ts` (parser), `pi-tutor/test/smoke.test.ts` (command and wiring), `nvim-tutor/tests/` (completion, if an existing test covers the list; otherwise none)

**Interfaces:**
- Consumes: Task 2.
- Produces: `parseExamArgs` adds `{ kind: "sandbox"; mode: "on" | "off" | null }`. `"sandbox"` alone gives `mode: null`; any other word after `sandbox` gives `kind: "usage"`.

- [ ] **Step 1: Write the failing tests**

Parser (`exam-make.test.ts`):

```ts
it("parses the sandbox switch", () => {
  expect(parseExamArgs("sandbox")).toEqual({ kind: "sandbox", mode: null });
  expect(parseExamArgs("sandbox off")).toEqual({ kind: "sandbox", mode: "off" });
  expect(parseExamArgs(" sandbox  on ")).toEqual({ kind: "sandbox", mode: "on" });
  expect(parseExamArgs("sandbox maybe")).toEqual({ kind: "usage" });
});
```

Wiring (`smoke.test.ts`, in the `/tutor-exam` describe block; reuse its project/profile setup helper):

```ts
it("exam tests are sandboxed by default; /tutor-exam sandbox off is saved and turns it off", async () => {
  // Uses the block's fake Pi; execOut["bwrap"] answers the probe.
  await b.commands["tutor-exam"].handler("small", b.ctx);
  expect(b.execCalls[0].command).toBe("bwrap");          // the hidden check before the exam is shown ran sandboxed
  await b.commands["tutor-exam"].handler("sandbox off", b.ctx);
  expect(b.profileSetting("exam_sandbox")).toBe("off");
  expect(b.notices.at(-1)).toMatch(/exam sandbox: off.*run as you/);
  b.execCalls.length = 0;
  await b.commands["tutor-exam"].handler("check", b.ctx);
  expect(b.execCalls.map((c) => c.command)).not.toContain("bwrap");
});
it("/tutor-exam sandbox reports the setting and whether bubblewrap can start", async () => {
  b.execOut["bwrap"] = { stdout: "", stderr: "", code: 1 };
  await b.commands["tutor-exam"].handler("sandbox", b.ctx);
  expect(b.notices.at(-1)).toMatch(/exam sandbox: on.*bubblewrap cannot start/);
});
```

If the smoke harness does not record exec calls (`execCalls`), the profile setting (`profileSetting`) or notices, extend `test/fake-pi.ts` with them first. That is a test-utility change, and it is ledgered.

- [ ] **Step 2: Run and watch them fail**

Run: `cd pi-tutor && npx vitest run test/exam-make.test.ts test/smoke.test.ts`
Expected: FAIL. `sandbox off` currently parses as a start with topic "sandbox off", and no `bwrap` call is made.

- [ ] **Step 3: Implement**

- `parseExamArgs`: handle `sandbox` before the start branch, as the spec above says.
- `index.ts`:
  - Add `let examSandbox: "on" | "off" = "on";`, loaded with the other profile settings at session start (where `thinking` is restored): `profile.setting("exam_sandbox") === "off" ? "off" : "on"`.
  - Add `const sandboxHost = (): SandboxHost | null => examSandbox === "off" ? null : { env: process.env, home: homedir(), cacheDir: join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "lazycourse") };`.
  - Pass `sandbox: sandboxHost()` in the three callers (`makeExam`, `check`, `tutor-submit`).
  - Handle `sandbox`:
    - with no mode, run `BWRAP_PROBE` through `pi.exec` and notify `exam sandbox: on (bubblewrap ready)`, `… (bubblewrap cannot start: install bubblewrap or turn it off)`, or `exam sandbox: off`;
    - with a mode, set it and save `exam_sandbox` (session only without a profile, using the `/tutor-thinking` wording). Turning it off notifies `exam sandbox: off — exam tests now run as you, with your files and network`.
  - Handle `usage` with `usage: /tutor-exam [small|medium] [topic] | check | off | sandbox [on|off]`.
  - Update the command `description` to mention `sandbox on|off`.
- `init.lua`: the `TutorExam` completion returns `{ "small", "medium", "check", "off", "sandbox" }`.

- [ ] **Step 4: Run and watch them pass, then both suites**

Run: `cd pi-tutor && npm test && npm run typecheck`, then the Lua command from Global Constraints.
Expected: PASS (only the known 'write after end'); Lua 39/0 or more.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/exam/make.ts pi-tutor/extensions/tutor/index.ts pi-tutor/test nvim-tutor/lua/tutor/init.lua
git commit -m "feat(pi-tutor): exam sandbox on by default, /tutor-exam sandbox on|off"
```

### Task 4: Docs and the live check

**Files:**
- Modify: `README.md` (exam section: what the sandbox hides, how to install bubblewrap, `sandbox off`)
- Modify: `docs/superpowers/specs/2026-10-13-tutor-roles-packs-exams-design.md` (§6: one paragraph on the sandbox, and a revision line)

- [ ] **Step 1: Write the docs.** README: three lines under the exam commands, plus the S2 message.
- [ ] **Step 2: Live check with the real Pi** (tmux, nemotron-lightning, temporary profile, as in the M8 live check):
  1. Python project: `/tutor-exam small` → the exam is shown. A watcher loop running `pgrep -fa bwrap` during the hidden check shows a `bwrap … python3 -m unittest` line;
  2. `/tutor-exam check` → failing examples as before;
  3. `/tutor-exam sandbox` → "on (bubblewrap ready)";
  4. Go project: `/tutor-exam small` → exam shown; `~/.cache/lazycourse/go-build` now exists;
  5. `/tutor-exam sandbox off`, then `check` → still works; `sandbox on` restores.

  Expected: every step as described; `settings.json` unchanged; no stray `pi` or `bwrap`.
- [ ] **Step 3: Run `/tutor-live` (`.claude/skills/tutor-live`)**
  Expected: all lines pass.
- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-10-13-tutor-roles-packs-exams-design.md
git commit -m "docs: exam sandbox"
```

## Not in this plan

- `:TutorRun` (the learner's own `run:`/`test:`) stays unsandboxed (S7).
- Non-Linux systems: bubblewrap is Linux-only. On macOS the sandbox cannot start and S2 asks the learner to turn it off. A `sandbox-exec` profile is a later plan if needed.
- The learner editing the exam tests (M8 minor M3) is unchanged: the sandbox limits what the tests can do, not who wrote them.
