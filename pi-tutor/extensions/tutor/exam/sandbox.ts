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
  a.push("--bind", dir, dir, "--chdir", dir, "--unshare-all", "--die-with-parent", "--new-session", "--");
  return a;
}
