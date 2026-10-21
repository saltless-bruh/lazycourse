import { describe, it, expect } from "vitest";
import { renderWidget, renderStatus } from "../extensions/tutor/ui.js";
import { visibleWidth } from "@earendil-works/pi-tui";

describe("renderWidget", () => {
  const base = { language: "python", level: 30, state: "idle", connected: true };
  it("the widget shows tries, never a rung (spec 2026-10-21 §5)", () => {
    expect(renderWidget({ ...base, attempt: 2 }).join("\n")).toMatch(/try 2/);
    expect(renderWidget({ ...base }).join("\n")).not.toMatch(/rung|try/);
  });
  it("renders language, level, tries, task on line 1 and state on line 2", () => {
    const w = renderWidget({ language: "python", level: 30, attempt: 2, task: "P1.T2.S1", state: "idle", connected: true });
    expect(w).toEqual(["tutor  python · lvl 30 · try 2 · P1.T2.S1", "idle"]);
  });
  it("appends the last judgment to line 2", () => {
    const w = renderWidget({ level: 30, state: "clean", connected: true, last: "correct" });
    expect(w[1]).toBe("clean · judged correct");
  });
  it("off Neovim, line 2 still shows the state and judgment, worded by why (M2 #10, M3 #23, M1b #2)", () => {
    expect(renderWidget({ state: "idle", connected: false, last: "wrong" })[1]).toBe("outside nvim · idle · judged wrong");
    expect(renderWidget({ state: "stuck: learner question", connected: false, lost: true })[1]).toBe("nvim closed · stuck: learner question");
  });
  it("clips the state, never the judgment, so '· judged X' survives at 44 columns (M6c I2)", () => {
    for (const [lost, prefix] of [[true, "nvim closed · "], [false, "outside nvim · "]] as const) {
      const l = renderWidget({ state: "stuck: learner question", connected: false, lost, last: "partial" })[1];
      expect(l.startsWith(`${prefix}stuck:`)).toBe(true);
      expect(l.endsWith("… · judged partial")).toBe(true);
      expect(visibleWidth(l)).toBeLessThanOrEqual(44);
    }
    const wide = renderWidget({ state: "error: 変数が見つかりません 変数が見つかりません", connected: false, last: "wrong" })[1];
    expect(wide.endsWith("· judged wrong")).toBe(true);
    expect(visibleWidth(wide)).toBeLessThanOrEqual(44);
  });
  it("collapses newlines and clips by display width, not code points (M3 #22)", () => {
    const w = renderWidget({ state: "error: 変数が\n見つかりません 変数が見つかりません 変数が見つかりません", connected: true });
    expect(w[1]).not.toContain("\n");
    expect(visibleWidth(w[1])).toBeLessThanOrEqual(44);
    expect(w[1].endsWith("…")).toBe(true);
  });
  it("an exam label leads line 1, so clipping never hides the timer (M8)", () => {
    const [l1] = renderWidget({ exam: "exam 01 19:59 left", role: "architect", language: "typescript", level: 50, attempt: 2, state: "idle", connected: true });
    expect(l1.startsWith("tutor  exam 01 19:59 left · ")).toBe(true);
  });
  it("keeps both lines within 44 cells", () => {
    const w = renderWidget({ language: "typescript", level: 100, attempt: 5, task: "P12.T34.S56", state: "stuck: cannot borrow `x` as mutable more than once at a time", connected: true, last: "partial" });
    for (const l of w) expect(l.length).toBeLessThanOrEqual(44);
    expect(w[1].startsWith("stuck: cannot borrow")).toBe(true);
    expect(w[1].endsWith("… · judged partial")).toBe(true);
  });
  it("shows a non-default role first on line 1", () => {
    expect(renderWidget({ role: "architect", language: "python", level: 30, state: "idle", connected: true })[0]).toBe("tutor  architect · python · lvl 30");
  });
  it("omits missing fields", () => {
    expect(renderWidget({ state: "idle", connected: true })[0]).toBe("tutor");
  });
});

describe("renderStatus", () => {
  it("is the level with its band, or 'tutor' when unknown", () => {
    expect(renderStatus({ level: 30, state: "idle", connected: true })).toBe("tutor lvl 30 · beginner");
    expect(renderStatus({ level: 70, state: "idle", connected: true })).toBe("tutor lvl 70 · pro");
    expect(renderStatus({ state: "idle", connected: true })).toBe("tutor");
  });
});

describe("lesson label (spec 2026-10-19 Q15)", () => {
  it("comes first on line 1, after an exam timer, so clipping never hides it", () => {
    const [l1] = renderWidget({ lesson: "lesson: basics 1/2", language: "python", level: 10, attempt: 3, state: "idle", connected: true });
    expect(l1.startsWith("tutor  lesson: basics 1/2 · python")).toBe(true);
  });
  it("the spec status fits beside the outside-nvim prefix", () => {
    const [, l2] = renderWidget({ state: "spec error: /tutor-start spec", connected: false });
    expect(l2).toBe("outside nvim · spec error: /tutor-start spec");
  });
});
