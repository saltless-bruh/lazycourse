// Exam test sandbox (plan 2026-10-16 exam-sandbox): the model writes exam tests, so they run under
// bubblewrap with the filesystem read-only, home, temp folders and user sockets hidden, no network
// and an empty environment. Only the exam folder is writable.
import { accessSync, constants, mkdirSync, realpathSync, statSync } from "node:fs";
import { basename, delimiter, dirname, join } from "node:path";

export interface SandboxHost { env: NodeJS.ProcessEnv; home: string; cacheDir: string }

/** Cheap check that bwrap exists and user namespaces are allowed. */
export const BWRAP_PROBE: [string, string[]] = ["bwrap", ["--ro-bind", "/", "/", "--unshare-all", "--die-with-parent", "true"]];
export const SANDBOX_MISSING = "exam tests run in a sandbox and bubblewrap (bwrap) cannot start here: install it (Arch: pacman -S bubblewrap) or run /tutor-exam sandbox off";

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
  // Final review C2: the test writes into a throwaway overlay of the exam folder, so files and symlinks it
  // plants never reach the folder the extension later reads (brief.md), writes (grade.md) or cleans up.
  a.push("--overlay-src", dir, "--tmp-overlay", dir, "--chdir", dir, "--unshare-all", "--die-with-parent", "--new-session", "--");
  return a;
}
