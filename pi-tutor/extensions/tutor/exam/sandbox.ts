// Exam test sandbox (plan 2026-10-16 exam-sandbox): the model writes exam tests, so they run under
// bubblewrap with the filesystem read-only, home, temp folders and user sockets hidden, no network
// and an empty environment. Only the exam folder is writable.
import { createHash } from "node:crypto";
import { accessSync, constants, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, delimiter, dirname, join } from "node:path";

export interface SandboxHost { env: NodeJS.ProcessEnv; home: string; cacheDir: string }

/** Cheap check that bwrap exists and user namespaces are allowed. */
export const BWRAP_PROBE: [string, string[]] = ["bwrap", ["--ro-bind", "/", "/", "--unshare-all", "--die-with-parent", "true"]];
export const SANDBOX_MISSING = "exam tests run in a sandbox and bubblewrap (bwrap) cannot start here: install it (Arch: pacman -S bubblewrap) or run /tutor-exam sandbox off";

/**
 * `argv` with stdin closed and stdout/stderr cut at the caps, keeping the command's exit code (phase 2 final
 * review C1: pi.exec keeps a command's whole output in memory, and a loop that printed forever crashed Pi at
 * ~700 MB). A program that reaches a cap stops on its next write. The tools are sh, head, cat, mktemp and rm.
 */
export function cappedArgv(argv: string[], outCap: number, errCap: number): string[] {
  const script = `f=$(mktemp) || exit 125; { { { "$@" </dev/null; echo $? >&4; } | head -c ${outCap}; } 2>&1 >&3 | head -c ${errCap} >&2; } 3>&1 4>"$f"; c=$(cat "$f"); rm -f "$f"; exit \${c:-1}`;
  return ["sh", "-c", script, "sh", ...argv];
}
export const CAP_TOOLS = ["sh", "head", "cat", "mktemp", "rm"];
/** Whether a capped stream was cut. */
export const reachedCap = (text: string, cap: number) => Buffer.byteLength(text) >= cap;

// Final review C1: all of /run, not only /run/user (docker.sock, the system bus, varlink sockets).
const HIDDEN = ["/home", "/tmp", "/var/tmp", "/run"];
// Final review I3: mounted drives and served data, hidden when the folder exists (tmpfs needs a mount point).
const HIDDEN_IF_PRESENT = ["/mnt", "/media", "/srv"];
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

/** Home, a folder above it, or one level inside home or ~/.local: far more than a toolchain (keys, history). */
const broad = (p: string, home: string) =>
  under(home, p) || dirname(p) === home || dirname(p) === join(home, ".local");

/**
 * Read-only binds that make a toolchain installed under a hidden folder visible again (plan S4).
 * Final review I1/I2/M3: a broad folder is never bound; the tool's files are bound instead.
 */
export function toolBinds(cmds: string[], host: SandboxHost): string[] {
  const out = new Set<string>();
  const home = host.home;
  const dirOr = (dir: string, files: string[]) => { if (broad(dir, home)) for (const f of files) out.add(f); else out.add(dir); };
  for (const c of cmds) {
    const found = findOnPath(c, host.env.PATH ?? "");
    if (!found) continue;
    const real = realpathSync(found), at = dirname(found), bin = dirname(real);
    if (!hidden(found, home) && !hidden(real, home)) continue;
    // rustup proxies are symlinks or hard links to rustup in the same folder; ~/.cargo itself holds credentials.toml.
    if (basename(real) === "rustup" || exists(join(at, "rustup"))) {
      dirOr(basename(real) === "rustup" ? bin : at, [found, real]);
      const rh = host.env.RUSTUP_HOME ?? join(home, ".rustup");
      if (exists(rh)) out.add(rh);
      continue;
    }
    // pyenv: the shim execs <root>/libexec/pyenv and runs <root>/versions/*.
    if (basename(at) === "shims" && hidden(at, home) && dirname(at) !== home) { out.add(dirname(at)); continue; }
    if (found !== real && hidden(found, home)) out.add(found);
    if (!hidden(real, home)) continue;
    const root = dirname(bin);
    if (basename(bin) === "bin" && !broad(root, home)) out.add(root);
    else dirOr(bin, [real]);
  }
  return [...out];
}

/**
 * Phase 8 D (sandbox minor): bwrap sets no resource limits, so a fork bomb or a file filling the in-memory overlay
 * reached the whole machine. A systemd user scope gives the run kernel limits (memory, overlay pages included, and
 * tasks: processes and threads; builds run many). Without one (no systemd user session) runs stay as they were.
 */
const SCOPE = ["--user", "--scope", "--quiet", "-p", "MemoryMax=4G", "-p", "TasksMax=1024", "--"];
type Exec = (c: string, a: string[], o: { cwd: string; timeout: number }) => Promise<{ code: number }>;
export async function bwrapLauncher(exec: Exec): Promise<(argv: string[]) => [string, string[]]> {
  let scoped = false;
  try { scoped = (await exec("systemd-run", [...SCOPE, "true"], { cwd: "/", timeout: 10_000 })).code === 0; } catch { scoped = false; }
  return (argv) => (scoped ? ["systemd-run", [...SCOPE, "bwrap", ...argv]] : ["bwrap", argv]);
}

const TARGET_KEEP = 8, TARGET_DAYS = 14;

/**
 * Side-agent note on B1: a Rust build folder can take hundreds of MB, and every exam is a new folder. Only these
 * cache folders are removed: the build of a project or exam folder that is gone, one unused for 14 days, and any
 * past the 8 used most recently.
 */
function pruneCargoTargets(root: string, current: string) {
  let names: string[];
  try { names = readdirSync(root); } catch { return; }
  const now = Date.now(), live: { dir: string; at: number }[] = [];
  for (const n of names) {
    const dir = join(root, n);
    if (dir === current) continue;
    let at = 0, src = "";
    try { at = statSync(join(dir, ".used")).mtimeMs; src = readFileSync(join(dir, ".used"), "utf8"); } catch { /* not ours to keep */ }
    if (!src || !exists(src) || now - at > TARGET_DAYS * 86400_000) rmSync(dir, { recursive: true, force: true });
    else live.push({ dir, at });
  }
  for (const old of live.sort((x, y) => y.at - x.at).slice(TARGET_KEEP - 1)) rmSync(old.dir, { recursive: true, force: true });
}

/** bwrap arguments up to and including `--`; `dir` must already be a realpath. */
export function sandboxArgv(dir: string, language: string, binds: string[], host: SandboxHost): string[] {
  const a = ["--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc"];
  for (const h of HIDDEN) a.push("--tmpfs", h);
  for (const h of HIDDEN_IF_PRESENT) if (exists(h)) a.push("--tmpfs", h);
  // Always an empty, writable home: tools that look at ~ find it, and nothing of the real one shows.
  a.push("--tmpfs", host.home);
  for (const b of binds) a.push("--ro-bind", b, b);
  a.push("--clearenv", "--setenv", "PATH", host.env.PATH ?? "/usr/bin:/bin", "--setenv", "HOME", host.home, "--setenv", "LANG", host.env.LANG ?? "C.UTF-8");
  for (const k of KEEP_ENV) { const v = host.env[k]; if (v) a.push("--setenv", k, v); }
  if (language === "go") {
    const cache = join(host.cacheDir, "go-build");
    mkdirSync(cache, { recursive: true });
    a.push("--bind", cache, cache, "--setenv", "GOCACHE", cache, "--setenv", "GOTOOLCHAIN", "local", "--setenv", "GOPATH", "/tmp/go");
  }
  // Phase 8 B1: a Rust build kept per project folder (never shared between folders, so one exam or project cannot
  // leave build output for another); in the throwaway overlay every check run rebuilt the crate from nothing.
  if (language === "rust") {
    const target = join(host.cacheDir, "cargo-target", createHash("sha256").update(dir).digest("hex").slice(0, 16));
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, ".used"), dir); // whose build it is, and (its time) when it was last used
    pruneCargoTargets(join(host.cacheDir, "cargo-target"), target);
    a.push("--bind", target, target, "--setenv", "CARGO_TARGET_DIR", target);
  }
  // Final review C2: the test writes into a throwaway overlay of the exam folder, so files and symlinks it
  // plants never reach the folder the extension later reads (brief.md), writes (grade.md) or cleans up.
  a.push("--overlay-src", dir, "--tmp-overlay", dir, "--chdir", dir, "--unshare-all", "--die-with-parent", "--new-session", "--");
  return a;
}
