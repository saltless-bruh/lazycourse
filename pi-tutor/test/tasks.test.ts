import { describe, it, expect } from "vitest";
import { tickTasks } from "../extensions/tutor/tasks.js";

const MD = "# Tasks\n\n- [ ] P1.T1 parse args\n  - [ ] P1.T1.S1 read argv\n- [ ] P1.T10 output\n- [x] P1.T2 done already\n";

describe("tickTasks (M8 D6)", () => {
  it("ticks exactly the named ids' checkboxes, whole-token", () => {
    const r = tickTasks(MD, ["P1.T1"]);
    expect(r.text).toContain("- [x] P1.T1 parse args");
    expect(r.text).toContain("  - [ ] P1.T1.S1 read argv");
    expect(r.text).toContain("- [ ] P1.T10 output");
    expect(r.ticked).toEqual(["P1.T1"]);
  });
  it("reports ids that are missing or already ticked, and leaves the text alone for them", () => {
    const r = tickTasks(MD, ["P9.T9", "P1.T2"]);
    expect(r.text).toBe(MD);
    expect(r.ticked).toEqual([]);
    expect(r.missing).toEqual(["P9.T9", "P1.T2"]);
  });
  it("keeps CRLF line endings", () => {
    expect(tickTasks("- [ ] P1.T1 x\r\n", ["P1.T1"]).text).toBe("- [x] P1.T1 x\r\n");
  });
});
