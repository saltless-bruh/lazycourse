import { describe, it, expect } from "vitest";
import { STEPS, TASK_ID, startWorkflow, advance, workflowLabel, formatWorkflowContext, findTask } from "../extensions/tutor/workflow.js";

describe("design-recipe workflow (spec 2026-10-13 §4)", () => {
  it("has the six steps in order", () => {
    expect(STEPS).toEqual(["Find", "Shape", "Examples", "Steps", "Map", "Build"]);
  });
  it("advances one step per step_done and finishes after Build", () => {
    let w = startWorkflow("P1.T1", 1);
    expect(workflowLabel(w)).toBe("plan 1/6");
    w = advance(w, false, 2);
    expect(w.step).toBe(1);
    for (let i = 0; i < 5; i++) w = advance(w, true, 3);
    expect(workflowLabel(w)).toBe("plan 6/6");
    w = advance(w, true, 9);
    expect(w.done).toBe(9);
    expect(workflowLabel({ ...w, done: undefined })).toBe("plan 6/6"); // a finished workflow is dropped, never labelled
    expect(advance(w, true, 10)).toBe(w);
  });
  it("tells the model the step, its artifact and the band's mode", () => {
    const w = { task: "P1.T1", step: 3, started: 1 };
    const b = formatWorkflowContext(w, "beginner");
    expect(b).toMatch(/^\[workflow\] design recipe for P1\.T1: step 3\/6 Examples/);
    expect(b).toMatch(/half-fill/i);
    expect(formatWorkflowContext(w, "intermediate")).toMatch(/one question/i);
    expect(formatWorkflowContext(w, "pro")).toMatch(/name the step only/i);
    expect(b).toContain("step_done");
    expect(b).toContain("tutor-design-recipe");
  });
  it("accepts task ids like P1.T1 and P2.T3.S1, rejects others", () => {
    for (const id of ["P1", "P1.T1", "P12.T3.S4"]) expect(TASK_ID.test(id)).toBe(true);
    for (const id of ["", "T1", "P1.", "p1.t1", "P1.T1; rm"]) expect(TASK_ID.test(id)).toBe(false);
  });
  it("finds the task's line in spec/tasks.md as a whole token", () => {
    const md = "# Tasks\n- [ ] P1.T10 Something else\n- [ ] P1.T1 Parse argv into a Command\n";
    expect(findTask(md, "P1.T1")).toBe("- [ ] P1.T1 Parse argv into a Command");
    expect(findTask(md, "P1.T10")).toBe("- [ ] P1.T10 Something else");
    expect(findTask(md, "P1.T2")).toBeNull();
  });
});
