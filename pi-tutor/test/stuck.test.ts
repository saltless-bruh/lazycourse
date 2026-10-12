import { describe, it, expect } from "vitest";
import { StuckDetector } from "../extensions/tutor/stuck.js";
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
    expect(d.observe({ kind: "run_output", cmd: ["x"], code: 1, stdout: "", stderr: "" }, 0)).toEqual([]);
    expect(d.observe({ kind: "run_output", cmd: ["x"], code: 0, stdout: "", stderr: "" }, 0)).toEqual([{ type: "run_passed" }]);
  });
});
