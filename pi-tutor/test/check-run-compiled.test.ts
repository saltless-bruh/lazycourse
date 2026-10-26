import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCompiledChecks, functionSpan, calledName } from "../extensions/tutor/check-run-compiled.js";
import { sandboxFor, TOO_LONG } from "../extensions/tutor/check-run.js";
import { isSyntaxError } from "../extensions/tutor/stuck.js";
import type { SandboxHost } from "../extensions/tutor/exam/sandbox.js";
import type { Check } from "../extensions/tutor/checks.js";
import { realExec } from "./fake-pi.js";

const has = (cmd: string, args: string[]) => spawnSync(cmd, args).status === 0;
const bwrapReady = spawnSync("bwrap", ["--ro-bind", "/", "/", "--unshare-all", "true"]).status === 0;
const host = (): SandboxHost => ({ env: process.env, home: homedir(), cacheDir: join(homedir(), ".cache", "lazycourse") });
const value = (expr: string, expected: string): Check => ({ task: "P1.T1", kind: "value", expr, expected, milestone: 1, status: "trusted" });
const CARGO = '[package]\nname = "p"\nversion = "0.1.0"\nedition = "2021"\n\n[workspace]\n';
function project(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "chk-comp-"));
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); }
  return root;
}
async function run(language: "rust" | "go", root: string, checks: Check[], limitSec = 20) {
  const sb = await sandboxFor(realExec, root, language, [language === "rust" ? "cargo" : "go"], host());
  if ("missing" in sb) throw new Error(sb.missing);
  return runCompiledChecks(sb, { language, root, entry: language === "rust" ? "src/main.rs" : "src/main.go", checks, limitSec });
}
const rs = (body: string) => project({ "Cargo.toml": CARGO, "src/main.rs": `${body}\nfn main() {}\n` });
const go = (body: string) => project({ "go.mod": "module p\n\ngo 1.22\n", "src/main.go": `package main\n\n${body}\n\nfunc main() {}\n` });

describe("functionSpan / calledName", () => {
  it("finds a function's lines through nested braces, ignoring braces in strings and comments", () => {
    const src = 'fn a() {}\nfn split_amount(t: f64) -> f64 {\n    let s = "}";\n    // }\n    if t > 0.0 { t } else { 0.0 }\n}\nfn b() {}\n';
    expect(functionSpan(src, "split_amount", "rust")).toEqual([2, 6]);
    expect(functionSpan("package main\n\nfunc (b Bill) Total() float64 {\n\treturn 1\n}\n", "Total", "go")).toEqual([3, 5]);
    expect(functionSpan(src, "nope", "rust")).toBeNull();
  });
  it("names the function an expression calls", () => {
    expect(calledName("split_amount(50.0, 3)")).toBe("split_amount");
    expect(calledName("bill::split(1.0)")).toBe("split");
    expect(calledName("pkg.SplitAmount(1, 2)")).toBe("SplitAmount");
  });
});

describe.skipIf(!bwrapReady || !has("cargo", ["--version"]))("Rust checks in the sandbox (spec 2026-10-22 §5.2)", () => {
  it("a right value passes; a wrong one fails with what it gave", async () => {
    const root = rs("fn split_amount(total: f64, people: u32) -> f64 { total * people as f64 }");
    expect((await run("rust", root, [value("split_amount(48.0, 3)", "16.0")]))[0]).toMatchObject({ pass: false, got: "144.0" });
    writeFileSync(join(root, "src/main.rs"), "fn split_amount(total: f64, people: u32) -> f64 { total / people as f64 }\nfn main() {}\n");
    expect((await run("rust", root, [value("split_amount(50.0, 3)", "16.666666666666668")]))[0].pass).toBe(true);
  }, 120_000);
  it("a function not written yet says so", async () => {
    expect((await run("rust", rs(""), [value("tip_rate(true)", "0.2")]))[0]).toMatchObject({ pass: false, error: "`tip_rate` is not written yet" });
  }, 120_000);
  it("Review Focus #1: a value the check cannot print does not fit; the other check still runs", async () => {
    const root = rs("struct Bill { each: f64 }\nfn split(t: f64) -> Bill { Bill { each: t } }\nfn half(t: f64) -> f64 { t / 2.0 }");
    const r = await run("rust", root, [value("split(1.0)", "1.0"), value("half(3.0)", "1.5")]);
    expect(r[0]).toMatchObject({ pass: false, outcome: "unfit" });
    expect(r[0].error).toMatch(/doesn't implement `Debug`/);
    expect(r[1].pass).toBe(true);
  }, 120_000);
  it("a type mistake inside the checked function is a try (no outcome), with the compiler's line", async () => {
    const r = await run("rust", rs("fn split_amount(total: f64, people: u32) -> f64 { people }"), [value("split_amount(50.0, 3)", "16.67")]);
    expect(r[0].pass).toBe(false);
    expect(r[0].outcome).toBeUndefined();
    expect(r[0].error).toMatch(/^src\/main\.rs:1: mismatched types/);
  }, 120_000);
  it("Review Focus #3: an endless loop in one check is cut off; the next still runs", async () => {
    const r = await run("rust", rs("fn spin() -> u32 { loop {} }\nfn two() -> u32 { 2 }"), [value("spin()", "1"), value("two()", "2")], 3);
    expect(r[0].error).toBe(TOO_LONG);
    expect(r[1].pass).toBe(true);
  }, 120_000);
  it("a parse error is a typo for every check", async () => {
    const r = await run("rust", rs("fn split_amount(total: f64 {"), [value("split_amount(1.0)", "1.0")]);
    expect(isSyntaxError(r[0].error!.replace(/^your file stopped while loading: /, ""))).toBe(true);
  }, 120_000);
  it("final review I1: a coded compile error inside the function is a try, not a typo", async () => {
    const r = await run("rust", rs("fn area(r: f64) -> f64 { 3.0(r * r) }"), [value("area(1.0)", "3.0")]);
    expect(r[0].outcome).toBeUndefined();
    expect(r[0].error).toMatch(/^src\/main\.rs:1: expected function/);
    expect(isSyntaxError(r[0].error!.replace(/^your file stopped while loading: /, ""))).toBe(false);
  }, 120_000);
  it("final review M3: a function that prints without a newline still reports its value", async () => {
    expect((await run("rust", rs('fn two() -> u32 { print!("Amount: "); 2 }'), [value("two()", "2")]))[0].pass).toBe(true);
  }, 120_000);
  it("the real folder is unchanged", async () => {
    const root = project({ "src/main.rs": "fn two() -> u32 { 2 }\nfn main() {}\n" });
    const before = readFileSync(join(root, "src/main.rs"), "utf8");
    expect((await run("rust", root, [value("two()", "2")]))[0].pass).toBe(true);
    expect(readdirSync(root)).toEqual(["src"]);
    expect(readFileSync(join(root, "src/main.rs"), "utf8")).toBe(before);
  }, 120_000);
});

describe.skipIf(!bwrapReady || !has("go", ["version"]))("Go checks in the sandbox (spec 2026-10-22 §5.2)", () => {
  it("right and wrong values; a missing function", async () => {
    const root = go("func splitAmount(total float64, people int) float64 { return total * float64(people) }");
    const r = await run("go", root, [value("splitAmount(48, 3)", "16.0"), value("tipRate(true)", "0.2")]);
    expect(r[0]).toMatchObject({ pass: false, got: "144" });
    expect(r[1]).toMatchObject({ pass: false, error: "`tipRate` is not written yet" });
  }, 120_000);
  it("each check gets its own result", async () => {
    const r = await run("go", go("func two() int { return 2 }\nfunc three() int { return 3 }"), [value("two()", "2"), value("three()", "4")]);
    expect(r.map((x) => [x.pass, x.got])).toEqual([[true, "2"], [false, "3"]]);
  }, 120_000);
  it("final review I2: strings are compared quoted, so tabs survive and text never equals a number", async () => {
    const r = await run("go", go('func pair() string { return "a\\tb" }\nfunc label() string { return "16" }'), [value("pair()", '"a\\tb"'), value("label()", "16")]);
    expect(r.map((x) => x.pass)).toEqual([true, false]);
  }, 120_000);
  it("reports the value's type, so a whole float is still a float (spec 2026-10-26 §5.3)", async () => {
    const r = await run("go", go("func half(x float64) float64 { return x / 2 }\nfunc count() int { return 2 }"), [value("half(4)", "2"), value("count()", "2")]);
    expect(r.map((x) => [x.pass, x.valueType])).toEqual([[true, "float"], [true, "int"]]);
  }, 120_000);
  it("Review Focus #1: a (value, error) pair does not fit", async () => {
    const r = await run("go", go('func parse(s string) (int, error) { return 3, nil }\nfunc two() int { return 2 }'), [value('parse("3")', "3"), value("two()", "2")]);
    expect(r[0]).toMatchObject({ pass: false, outcome: "unfit" });
    expect(r[1].pass).toBe(true);
  }, 120_000);
  it("Review Focus #4: an error elsewhere is not the checked function's", async () => {
    const r = await run("go", go("func splitAmount(total float64, people int) float64 { return total / float64(people) }\nfunc later() { x := 1 }"), [value("splitAmount(50, 3)", "16.666666666666668")]);
    expect(r[0]).toMatchObject({ pass: false, outcome: "elsewhere" });
    expect(r[0].error).toMatch(/^your project does not compile \(src\/main\.go:\d+: declared and not used/);
  }, 120_000);
});
