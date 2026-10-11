import { describe, it, expect } from "vitest";
import { renderWidget, renderStatus } from "../extensions/tutor/ui.js";

describe("renderWidget", () => {
  it("renders language, level, rung, task on line 1 and state on line 2", () => {
    const w = renderWidget({ language: "python", level: 30, rung: 2, task: "P1.T2.S1", state: "idle", connected: true });
    expect(w).toEqual(["tutor  python · lvl 30 · rung 2 · P1.T2.S1", "idle"]);
  });
  it("says detached when not connected to Neovim", () => {
    const w = renderWidget({ state: "idle", connected: false });
    expect(w[1]).toBe("detached: pi started outside Neovim");
  });
  it("keeps both lines within 44 cells", () => {
    const w = renderWidget({ language: "typescript", level: 100, rung: 5, task: "P12.T34.S56", state: "stuck: cannot borrow `x` as mutable more than once at a time", connected: true });
    for (const l of w) expect(l.length).toBeLessThanOrEqual(44);
    expect(w[1].endsWith("…")).toBe(true);
  });
  it("omits missing fields", () => {
    expect(renderWidget({ state: "idle", connected: true })[0]).toBe("tutor");
  });
});

describe("renderStatus", () => {
  it("is the level or 'tutor' when unknown", () => {
    expect(renderStatus({ level: 30, state: "idle", connected: true })).toBe("tutor lvl 30");
    expect(renderStatus({ state: "idle", connected: true })).toBe("tutor");
  });
});
