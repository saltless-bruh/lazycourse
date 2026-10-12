import { describe, it, expect } from "vitest";
import { bandPrompt } from "../extensions/tutor/prompts.js";

describe("bandPrompt", () => {
  it("starts with the band marker line", () => {
    expect(bandPrompt("beginner").startsWith("# Tutor band: beginner\n")).toBe(true);
    expect(bandPrompt("intermediate").startsWith("# Tutor band: intermediate\n")).toBe(true);
    expect(bandPrompt("pro").startsWith("# Tutor band: pro\n")).toBe(true);
  });
  it("appends the shared judgment protocol to every band", () => {
    for (const b of ["beginner", "intermediate", "pro"] as const) {
      expect(bandPrompt(b)).toContain("```tutor-judgment");
      expect(bandPrompt(b)).toContain('"episode_closed"');
    }
  });
  it("gives each band a distinct voice", () => {
    const set = new Set([bandPrompt("beginner"), bandPrompt("intermediate"), bandPrompt("pro")]);
    expect(set.size).toBe(3);
    expect(bandPrompt("pro")).toMatch(/never write code/i);
    expect(bandPrompt("beginner")).toMatch(/why each part exists/i);
  });
  it("puts the hint ladder between the band voice and the turn protocol", () => {
    for (const b of ["beginner", "intermediate", "pro"] as const) {
      const p = bandPrompt(b);
      expect(p).toContain("## Hint ladder");
      expect(p.indexOf(`# Tutor band: ${b}`)).toBeLessThan(p.indexOf("## Hint ladder"));
      expect(p.indexOf("## Hint ladder")).toBeLessThan(p.indexOf("## Turn protocol"));
      expect(p).toContain("[tutor]");
      expect(p).toContain("[episode]");
    }
  });
});
