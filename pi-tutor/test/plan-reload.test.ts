import { describe, it, expect } from "vitest";
import { refreshPlanBuffers } from "../extensions/tutor/plan-reload.js";

// Wayfinding spec §9.4 (re-run topic 4): after the plan job rewrites README.md and spec/tasks.md, the editor shows them.
describe("refreshPlanBuffers", () => {
  const fakeLink = (modified: string[] = []) => {
    const reloaded: string[] = [], held: string[] = [];
    return { reloaded, held, link: { isModified: async (p: string) => modified.includes(p), reloadFile: async (p: string) => { reloaded.push(p); }, holdBuffer: async (p: string) => { held.push(p); } } };
  };
  it("after the plan job, open README and tasks buffers reload", async () => {
    const f = fakeLink(); const notes: string[] = [];
    await refreshPlanBuffers(f.link, "/r", (m) => notes.push(m));
    expect(f.reloaded).toEqual(["/r/README.md", "/r/spec/tasks.md"]);
    expect(notes).toEqual([]);
  });
  it("a modified README buffer is not reloaded; the learner is told (Review Focus 3)", async () => {
    const f = fakeLink(["/r/README.md"]); const notes: string[] = [];
    await refreshPlanBuffers(f.link, "/r", (m) => notes.push(m));
    expect(f.reloaded).toEqual(["/r/spec/tasks.md"]);
    expect(f.held).toEqual(["/r/README.md"]); // no W12 prompt later (final review I2)
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/README\.md.*:e!/);
  });
  it("an editor that fails one file still gets the other", async () => {
    const reloaded: string[] = [];
    const link = { isModified: async () => false, holdBuffer: async () => {}, reloadFile: async (p: string) => { if (p.endsWith("README.md")) throw new Error("busy"); reloaded.push(p); } };
    await refreshPlanBuffers(link, "/r", () => {});
    expect(reloaded).toEqual(["/r/spec/tasks.md"]);
  });
});
