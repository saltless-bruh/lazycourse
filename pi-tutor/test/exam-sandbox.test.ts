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
  it("home is always an empty folder, inside /home or not", () => {
    expect(pairs("--tmpfs")).toContain("/home/me");
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
