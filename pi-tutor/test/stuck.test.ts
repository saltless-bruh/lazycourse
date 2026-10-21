import { describe, it, expect } from "vitest";
import { StuckDetector, traceOf, spotOf, TRACE_LINES, TRACE_CHARS } from "../extensions/tutor/stuck.js";
import type { TutorPayload } from "../extensions/tutor/nvim.js";

const diag = (path: string, errors: number, msg = "boom", line = 1): TutorPayload =>
  ({ kind: "diagnostics", buf: 1, path, errors, warnings: 0, ...(errors ? { first: { line, msg } } : {}) });
const idle = (since_ms: number): TutorPayload => ({ kind: "idle", buf: 1, path: "/p/a.py", line: 4, since_ms });
const churn = (l1: number): TutorPayload => ({ kind: "churn", buf: 1, path: "/p/a.py", region: [l1, l1 + 19], edits: 10 });
const det = (errorMs: number, idleMs = 300_000) => new StuckDetector(() => ({ errorMs, idleMs }));
const openMsgs = (evs: ReturnType<StuckDetector["tick"]>) =>
  evs.map((e) => (e.type === "open" && e.trigger.kind === "error" ? e.trigger.msg : e.type));

describe("StuckDetector errors", () => {
  it("opens immediately when the error threshold is 0 (beginner)", () => {
    expect(det(0).observe(diag("/p/a.py", 1), 0)).toEqual([{ type: "open", trigger: { kind: "error", path: "/p/a.py", line: 1, msg: "boom" } }]);
  });
  it("opens only after the same error persists past the threshold", () => {
    const d = det(60_000);
    expect(d.observe(diag("/p/a.py", 1), 0)).toEqual([]);
    expect(d.tick(59_999)).toEqual([]);
    expect(d.observe(diag("/p/a.py", 1, "boom", 2), 30_000)).toEqual([]); // line moved, same message: same error
    expect(d.tick(60_000)).toEqual([{ type: "open", trigger: { kind: "error", path: "/p/a.py", line: 2, msg: "boom" } }]);
  });
  it("fires once per error, even while it persists after an episode closed", () => {
    const d = det(0);
    expect(d.observe(diag("/p/a.py", 1), 0)).toHaveLength(1);
    expect(d.tick(1_000_000)).toEqual([]);
    expect(d.observe(diag("/p/a.py", 1), 2_000_000)).toEqual([]);
  });
  it("a different first error clears the old one and restarts the clock", () => {
    const d = det(60_000);
    d.observe(diag("/p/a.py", 1, "boom"), 0);
    expect(d.observe(diag("/p/a.py", 1, "bang"), 50_000)).toEqual([{ type: "cleared", path: "/p/a.py", msg: "boom" }]);
    expect(d.tick(100_000)).toEqual([]);
    expect(openMsgs(d.tick(110_000))).toEqual(["bang"]);
  });
  it("reports cleared when the file has no errors, and nothing for untracked files", () => {
    const d = det(60_000);
    d.observe(diag("/p/a.py", 1), 0);
    expect(d.observe(diag("/p/a.py", 0), 10)).toEqual([{ type: "cleared", path: "/p/a.py", msg: "boom" }]);
    expect(d.observe(diag("/p/b.py", 0), 20)).toEqual([]);
    expect(d.tick(1_000_000)).toEqual([]);
  });
  it("tracks errors per file", () => {
    const d = det(60_000);
    d.observe(diag("/p/a.py", 1, "a"), 0);
    d.observe(diag("/p/b.py", 1, "b"), 30_000);
    expect(openMsgs(d.tick(60_000))).toEqual(["a"]);
    expect(openMsgs(d.tick(90_000))).toEqual(["b"]);
  });
});

describe("StuckDetector idle and churn", () => {
  it("opens once per idle stretch when idle passes the threshold", () => {
    const d = det(0, 60_000);
    expect(d.observe(idle(30_000), 0)).toEqual([]);
    expect(d.observe(idle(60_000), 0)).toEqual([{ type: "open", trigger: { kind: "idle", path: "/p/a.py", line: 4 } }]);
    expect(d.observe(idle(90_000), 0)).toEqual([]);
    expect(d.observe(idle(30_000), 0)).toEqual([]); // learner typed: a new stretch
    expect(d.observe(idle(60_000), 0)).toHaveLength(1);
  });
  it("ignores churn in a file without an error: typing is not being stuck (pane review I1)", () => {
    const d = det(0, 60_000);
    for (let t = 0; t < 10; t++) expect(d.observe(churn(1), t * 1_000)).toEqual([]);
  });
  it("opens when the same region of a file with an error churns twice within the idle threshold", () => {
    const d = det(1e9, 60_000); // the error itself never fires here
    d.observe(diag("/p/a.py", 1), 0);
    expect(d.observe(churn(1), 0)).toEqual([]);
    expect(d.observe(churn(21), 1_000)).toEqual([]);
    expect(d.observe(churn(1), 50_000)).toEqual([{ type: "open", trigger: { kind: "churn", path: "/p/a.py", region: [1, 20] } }]);
    expect(d.observe(churn(21), 200_000)).toEqual([]); // first churn too long ago: restarts
    expect(d.observe(churn(21), 210_000)).toHaveLength(1);
  });
});

describe("StuckDetector with a busy caller (final review I1)", () => {
  it("does not consume an error trigger the caller refuses; a later tick fires it", () => {
    let free = false;
    const d = new StuckDetector(() => ({ errorMs: 0, idleMs: 60_000 }), () => free);
    expect(d.observe(diag("/p/a.py", 1), 0)).toEqual([]);
    expect(d.tick(1)).toEqual([]);
    free = true;
    expect(openMsgs(d.tick(5_000))).toEqual(["boom"]);
    expect(d.tick(10_000)).toEqual([]);
  });
  it("does not consume idle or churn triggers the caller refuses", () => {
    let free = false;
    const d = new StuckDetector(() => ({ errorMs: 0, idleMs: 60_000 }), () => free);
    expect(d.observe(idle(60_000), 0)).toEqual([]);
    d.observe(diag("/p/a.py", 1), 0); // refused too, so it stays unfired
    expect(d.observe(churn(1), 0)).toEqual([]);
    expect(d.observe(churn(1), 1_000)).toEqual([]);
    free = true;
    expect(d.observe(idle(90_000), 0)).toHaveLength(1);
    expect(d.observe(churn(1), 2_000)).toHaveLength(1);
  });
  it("opens at most one error per tick so a second error is not lost to the open episode", () => {
    const d = det(60_000);
    d.observe(diag("/p/a.py", 1, "a"), 0);
    d.observe(diag("/p/b.py", 1, "b"), 0);
    expect(openMsgs(d.tick(60_000))).toEqual(["a"]);
    expect(openMsgs(d.tick(65_000))).toEqual(["b"]);
  });
  it("adopt() tracks a restored error so its fix is reported as cleared, without re-firing it", () => {
    const d = det(0);
    d.adopt({ kind: "error", path: "/p/a.py", line: 3, msg: "boom" }, 0);
    expect(d.observe(diag("/p/a.py", 1, "boom", 3), 1)).toEqual([]);
    expect(d.observe(diag("/p/a.py", 0), 2)).toEqual([{ type: "cleared", path: "/p/a.py", msg: "boom" }]);
  });
});

describe("StuckDetector runs", () => {
  it("reports run_passed on exit 0 only", () => {
    const d = det(0);
    expect(d.observe({ kind: "run_output", cmd: ["x"], code: 1, stdout: "", stderr: "" }, 0)).toMatchObject([{ type: "open", trigger: { kind: "run", code: 1 } }]); // spec 2026-10-13 §7 #4
    expect(d.observe({ kind: "run_output", cmd: ["x"], code: 0, stdout: "", stderr: "" }, 0)).toEqual([{ type: "run_passed" }]);
  });
});

describe("failing runs (spec 2026-10-13 §7 #4)", () => {
  const det = () => new StuckDetector(() => ({ errorMs: 0, idleMs: 1000 }), () => false); // canOpen false: a run still opens
  it("a non-zero exit opens a run trigger carrying the trace; zero passes", () => {
    const d = det();
    expect(d.observe({ kind: "run_output", cmd: ["python", "a.py"], code: 1, stdout: "", stderr: "Traceback\n  File \"a.py\", line 3\nKeyError: 'x'" }, 1))
      .toEqual([{ type: "open", trigger: { kind: "run", cmd: ["python", "a.py"], code: 1, trace: "Traceback\n  File \"a.py\", line 3\nKeyError: 'x'" } }]);
    expect(d.observe({ kind: "run_output", cmd: ["x"], code: 0, stdout: "", stderr: "" }, 2)).toEqual([{ type: "run_passed" }]);
  });
  it("traceOf keeps the last lines of stderr (stdout when stderr is blank), capped", () => {
    const long = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
    const t = traceOf("", long);
    expect(t.split("\n")).toHaveLength(TRACE_LINES);
    expect(t.endsWith("line 99")).toBe(true);
    expect(traceOf("only stdout", "  \n")).toBe("only stdout");
    expect(traceOf("", "y".repeat(10_000)).length).toBeLessThanOrEqual(TRACE_CHARS);
  });
});

describe("final review I2: test runners print the failure on stdout", () => {
  it("carries the tail of both streams, labelled, when both have text", () => {
    const t = traceOf("running 1 test\nthread 'tests::adds' panicked at src/lib.rs:9:5:\nassertion `left == right` failed", "   Compiling app v0.1.0\nerror: test failed, to rerun pass `--lib`");
    expect(t).toContain("stdout:\n");
    expect(t).toContain("assertion `left == right` failed");
    expect(t).toContain("stderr:\n");
    expect(t).toContain("error: test failed");
    expect(t.length).toBeLessThanOrEqual(TRACE_CHARS + 20);
  });
});

describe("attempt spots (spec 2026-10-21 §5)", () => {
  it("spotOf keys a run by its error line", () => {
    expect(spotOf('Traceback…\n  File "src/main.py", line 12, in split_amount\nZeroDivisionError: division by zero\n')).toBe("ZeroDivisionError: division by zero");
    expect(spotOf("AssertionError: expected 16.0, got 144 at line 3")).toBe("AssertionError: expected #, got # at line #");
    // A wrong value that changes between tries (144, then 144.0, then -2.5) is still the same spot.
    expect(spotOf("AssertionError: split_amount(48, 3) gave 144.0, expected 16.0")).toBe(spotOf("AssertionError: split_amount(48, 3) gave 144, expected 16.0"));
    expect(spotOf("AssertionError: gave -2.5")).toBe(spotOf("AssertionError: gave 7"));
    expect(spotOf("all good\nbut nothing matched here")).toBe("but nothing matched here");
    expect(spotOf("x".repeat(300) + " error")).toHaveLength(120);
  });
  it("hasErrorsIn only counts errors inside the project (Review Focus #4)", () => {
    const d = new StuckDetector(() => ({ errorMs: 1, idleMs: 1 }));
    d.observe({ kind: "diagnostics", buf: 1, path: "/elsewhere/x.py", errors: 1, warnings: 0, first: { line: 1, msg: "e" } }, 0);
    expect(d.hasErrorsIn("/proj")).toBe(false);
    d.observe({ kind: "diagnostics", buf: 2, path: "/proj/src/main.py", errors: 1, warnings: 0, first: { line: 1, msg: "e" } }, 0);
    expect(d.hasErrorsIn("/proj")).toBe(true);
    d.observe({ kind: "diagnostics", buf: 2, path: "/proj/src/main.py", errors: 0, warnings: 0 }, 0);
    expect(d.hasErrorsIn("/proj")).toBe(false);
  });
});
