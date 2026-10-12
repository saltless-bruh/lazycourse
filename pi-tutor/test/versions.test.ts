import { describe, it, expect } from "vitest";
import { parseVersion, detectVersion, LANGS, type Exec } from "../extensions/tutor/knowledge/versions.js";
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
    expect(LANGS.typescript).toEqual({ devdocsType: "typescript", command: "tsc", args: ["--version"] });
  });
});
