import { describe, it, expect } from "vitest";
import { OfferBook, offerSpot, offerText } from "../extensions/tutor/offers.js";
import type { Trigger } from "../extensions/tutor/ladder.js";

// Ask-first spec 2026-11-09: editor signals only offer help; at most two offers per spot.
const pause: Trigger = { kind: "idle", path: "/r/src/main.py", line: 42 };
const run: Trigger = { kind: "run", cmd: ["/tutor-done", "P1.T2"], code: 1, trace: "AssertionError" };
const W = 120_000;
const book = () => new OfferBook(() => W);

describe("OfferBook", () => {
  it("the first signal on a spot offers; the same spot again does not", () => {
    const b = book(), s = offerSpot(pause);
    expect(b.signal(pause, s, 0)).toMatchObject({ kind: "pause", spot: s, count: 1, first: 0 });
    expect(b.signal(pause, s, 10)).toBeNull();
  });
  it("an ignored offer comes back once, after twice the wait, only while still current", () => {
    const b = book(), s = offerSpot(pause);
    b.signal(pause, s, 0);
    expect(b.due(2 * W - 1, () => true)).toBeNull();
    expect(b.due(2 * W, () => false)).toBeNull();
    expect(b.due(2 * W, () => true)).toMatchObject({ spot: s, count: 2 });
    expect(b.due(10 * W, () => true)).toBeNull();
    expect(b.signal(pause, s, 10 * W)).toBeNull();
  });
  it("reset makes the spot new again", () => {
    const b = book(), s = offerSpot(pause);
    b.signal(pause, s, 0);
    b.due(2 * W, () => true);
    b.reset(s);
    expect(b.signal(pause, s, 3 * W)).toMatchObject({ count: 1 });
  });
  it("every failed run offers, and a run offer never repeats", () => {
    const b = book(), s = offerSpot(run, "test:P1.T2:area");
    expect(b.signal(run, s, 0)).toMatchObject({ kind: "run", count: 1 });
    expect(b.signal(run, s, 5)).toMatchObject({ kind: "run", count: 1 });
    expect(b.due(10 * W, () => true)).toBeNull();
  });
  it("pending is the latest offer shown", () => {
    const b = book();
    expect(b.pending()).toBeNull();
    b.signal(pause, offerSpot(pause), 0);
    const r = b.signal(run, offerSpot(run), 1);
    expect(b.pending()).toBe(r);
  });
});

describe("offerSpot and offerText", () => {
  it("spots: pause by 20-line region, churn by region start, run by its key", () => {
    expect(offerSpot(pause)).toBe("pause:/r/src/main.py:2");
    expect(offerSpot({ kind: "idle", path: "/r/a.py", line: 20 })).toBe("pause:/r/a.py:0");
    expect(offerSpot({ kind: "churn", path: "/r/a.py", region: [21, 40] })).toBe("churn:/r/a.py:21");
    expect(offerSpot(run, "test:P1.T2:x")).toBe("run:test:P1.T2:x");
    expect(offerSpot(run)).toBe("run:/tutor-done P1.T2");
  });
  it("a pause offer names the file and line and <leader>ts, relative to the root", () => {
    const t = offerText(pause, "/r");
    expect(t).toContain("src/main.py");
    expect(t).toContain("42");
    expect(t).toContain("<leader>ts");
    expect(t).not.toContain("/r/");
  });
  it("a run offer names what failed and says to read the output", () => {
    const t = offerText(run, "/r");
    expect(t).toContain("P1.T2");
    expect(t).toMatch(/read the output/);
    expect(t).toContain("<leader>ts");
  });
  it("a timed-out run says it was stopped at its time limit", () => {
    const t = offerText({ kind: "run", cmd: ["pytest"], code: 143, trace: "", timedOut: true }, "/r");
    expect(t).toMatch(/pytest was stopped at its time limit.*<leader>ts/);
  });
  it("a churn offer names the lines", () => {
    const t = offerText({ kind: "churn", path: "/r/a.py", region: [21, 40] }, "/r");
    for (const w of ["a.py", "21", "<leader>ts"]) expect(t).toContain(w);
  });
});
