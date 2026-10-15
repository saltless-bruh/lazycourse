import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseVersion, detectVersion, toolchain, toolchainCache, languageOfFiletype, LANGS, type Exec } from "../extensions/tutor/knowledge/versions.js";
import { LANGUAGES } from "../extensions/tutor/start.js";

describe("parseVersion", () => {
  it("reads the version from each toolchain's real output format", () => {
    expect(parseVersion("Python 3.14.8")).toBe("3.14.8");
    expect(parseVersion("rustc 1.90.0 (1159e78c4 2025-09-14)")).toBe("1.90.0");
    expect(parseVersion("go version go1.27.2-X:nodwarf5 linux/amd64")).toBe("1.27.2");
    expect(parseVersion("Lua 5.5.1  Copyright (C) 1994-2026 Lua.org, PUC-Rio")).toBe("5.5.1");
    expect(parseVersion("Version 5.9.3")).toBe("5.9.3");
    expect(parseVersion("v26.11")).toBe("26.11");
    expect(parseVersion("command not found")).toBeNull();
  });
});

describe("detectVersion", () => {
  const exec = (out: Partial<{ stdout: string; stderr: string; code: number }> | Error): { exec: Exec; calls: string[][] } => {
    const calls: string[][] = [];
    return { calls, exec: async (c, a) => { calls.push([c, ...a]); if (out instanceof Error) throw out; return { stdout: "", stderr: "", code: 0, ...out }; } };
  };
  it("runs the language's version command and parses stdout", async () => {
    const e = exec({ stdout: "Python 3.14.8\n" });
    expect(await detectVersion("python", e.exec)).toBe("3.14.8");
    expect(e.calls).toEqual([["python3", "--version"]]);
  });
  it("falls back to stderr (some versions print there)", async () => {
    expect(await detectVersion("lua", exec({ stderr: "Lua 5.4.6  Copyright" }).exec)).toBe("5.4.6");
  });
  it("returns null for a missing toolchain, a non-zero exit, a throw, or an unknown language", async () => {
    expect(await detectVersion("typescript", exec({ stderr: "tsc: not found", code: 127 }).exec)).toBeNull();
    expect(await detectVersion("go", exec(new Error("ENOENT")).exec)).toBeNull();
    expect(await detectVersion("cobol", exec({ stdout: "1.0" }).exec)).toBeNull();
  });
  it("covers every /tutor-start language with a DevDocs type", () => {
    expect(Object.keys(LANGS).sort()).toEqual([...LANGUAGES].sort());
    expect(LANGS.typescript).toEqual({ devdocsType: "typescript", command: "tsc", args: ["--version"], runtime: { command: "node", args: ["--version"], name: "node" }, local: "node_modules/.bin/tsc" });
  });
});

describe("toolchain (spec §5.1)", () => {
  const ok = (out: string) => async () => ({ stdout: out, stderr: "", code: 0 });
  it("runs the version commands in the project root, where pyenv/rustup/nvm pick the version (final review)", async () => {
    const seen: (string | undefined)[] = [];
    const exec = async (cmd: string, _a: string[], o?: { cwd?: string }) => { seen.push(o?.cwd); return cmd === "node" ? { stdout: "v26.1.0", stderr: "", code: 0 } : Promise.reject(new Error("ENOENT")); };
    await toolchain("typescript", "/home/u/proj", exec);
    expect(seen).toEqual(["/home/u/proj", "/home/u/proj"]);
  });
  it("typescript falls back to the node runtime when tsc is missing", async () => {
    const exec = async (cmd: string) => cmd === "node" ? { stdout: "v26.11.1\n", stderr: "", code: 0 } : Promise.reject(new Error("ENOENT"));
    expect(await toolchain("typescript", "/nonexistent", exec)).toEqual({ installed: null, runtime: "node 26.11.1", constraint: null });
  });
  it("a language with no runtime entry reports only its own version", async () => {
    expect(await toolchain("python", "/nonexistent", ok("Python 3.14.8"))).toEqual({ installed: "3.14.8", runtime: null, constraint: null });
  });
  it("a version command that never answers gives up after 6 s instead of holding the turn", async () => {
    vi.useFakeTimers();
    try {
      const p = toolchain("python", "/nonexistent", () => new Promise(() => {}));
      await vi.advanceTimersByTimeAsync(6000);
      expect(await p).toEqual({ installed: null, runtime: null, constraint: null });
    } finally { vi.useRealTimers(); }
  });
  it("typescript asks tsc and node at once, so a missing tsc costs 6 s, not 12 (M7 minor)", async () => {
    vi.useFakeTimers();
    try {
      const p = toolchain("typescript", "/nonexistent", (cmd) => cmd === "node" ? new Promise((r) => setTimeout(() => r({ stdout: "v26.1.0", stderr: "", code: 0 }), 5000)) : new Promise(() => {}));
      let done = false;
      void p.then(() => { done = true; });
      await vi.advanceTimersByTimeAsync(6000);
      expect(done).toBe(true);
      expect(await p).toEqual({ installed: null, runtime: "node 26.1.0", constraint: null });
    } finally { vi.useRealTimers(); }
  });
  it("a project-local tsc (node_modules/.bin) wins over the PATH one (M7 minor)", async () => {
    const root = mkdtempSync(join(tmpdir(), "tc-local-"));
    mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(root, "node_modules", ".bin", "tsc"), "");
    const seen: string[] = [];
    const exec: Exec = async (cmd) => { seen.push(cmd); return cmd.endsWith("/tsc") ? { stdout: "Version 5.9.3", stderr: "", code: 0 } : { stdout: "", stderr: "", code: 127 }; };
    expect((await toolchain("typescript", root, exec)).installed).toBe("5.9.3");
    expect(seen).toContain(join(root, "node_modules", ".bin", "tsc"));
    expect(seen).not.toContain("tsc");
  });
  it("an unknown language is all null and runs nothing", async () => {
    const exec = vi.fn(ok(""));
    expect(await toolchain("cobol", "/nonexistent", exec)).toEqual({ installed: null, runtime: null, constraint: null });
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("Node floor (M6c M7)", () => {
  it("pi-tutor's engines.node agrees with Pi's own floor and the README", async () => {
    const { readFileSync } = await import("node:fs");
    const json = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8")) as { engines: { node: string } };
    const floor = (s: string) => /(\d+)\.(\d+)/.exec(s)!.slice(1).map(Number);
    const ours = floor(json("../package.json").engines.node);
    expect(ours).toEqual(floor(json("../node_modules/@earendil-works/pi-coding-agent/package.json").engines.node));
    expect(ours).toEqual(floor(/Node ≥ ([\d.]+)/.exec(readFileSync(new URL("../../README.md", import.meta.url), "utf8"))![1]));
  });
});

describe("toolchainCache (M7 minor: the cache never refreshed)", () => {
  const setup = (answer: () => string | null) => {
    let t = 0, runs = 0;
    const exec: Exec = async () => { runs++; const v = answer(); return v ? { stdout: `Python ${v}`, stderr: "", code: 0 } : { stdout: "", stderr: "", code: 127 }; };
    const get = toolchainCache(exec, () => t);
    return { get, runs: () => runs, at: (ms: number) => { t = ms; } };
  };
  it("re-runs the version command after 5 minutes, not on every turn", async () => {
    let v = "3.13.1";
    const c = setup(() => v);
    expect((await c.get("python", "/nonexistent")).installed).toBe("3.13.1");
    v = "3.14.8";
    c.at(4 * 60_000);
    expect((await c.get("python", "/nonexistent")).installed).toBe("3.13.1");
    expect(c.runs()).toBe(1);
    c.at(5 * 60_000 + 1);
    expect((await c.get("python", "/nonexistent")).installed).toBe("3.14.8");
    expect(c.runs()).toBe(2);
  });
  it("a toolchain not found is asked again after a minute (a slow first run, a fresh install)", async () => {
    let v: string | null = null;
    const c = setup(() => v);
    expect((await c.get("python", "/nonexistent")).installed).toBeNull();
    v = "3.14.8";
    c.at(60_001);
    expect((await c.get("python", "/nonexistent")).installed).toBe("3.14.8");
  });
  it("re-reads the project's constraint file on every call", async () => {
    const root = mkdtempSync(join(tmpdir(), "tc-cons-"));
    const c = setup(() => "3.14.8");
    expect((await c.get("python", root)).constraint).toBeNull();
    writeFileSync(join(root, "pyproject.toml"), 'requires-python = ">=3.12"\n');
    expect((await c.get("python", root)).constraint).toBe("requires-python >=3.12 (pyproject.toml)");
    expect(c.runs()).toBe(1);
  });
  it("keeps languages and roots apart", async () => {
    const c = setup(() => "3.14.8");
    await c.get("python", "/a"); await c.get("python", "/b"); await c.get("python", "/a");
    expect(c.runs()).toBe(2);
  });
});

describe("languageOfFiletype (M7 minor: .tsx got no card)", () => {
  it("maps Neovim filetypes to pack languages; .tsx is TypeScript, .js and .jsx are JavaScript", () => {
    expect(languageOfFiletype("python")).toBe("python");
    expect(languageOfFiletype("typescriptreact")).toBe("typescript");
    expect(languageOfFiletype("javascript")).toBe("javascript");
    expect(languageOfFiletype("javascriptreact")).toBe("javascript");
    expect(languageOfFiletype("markdown")).toBeNull();
    expect(languageOfFiletype(undefined)).toBeNull();
  });
});
