import { describe, it, expect } from "vitest";
import { parseRole, roles, roleNamed, rolePrompt, DEFAULT_ROLE } from "../extensions/tutor/roles.js";
import { estimateTokens } from "../extensions/tutor/prompts.js";

describe("roles", () => {
  it("parses frontmatter name, command, ladder, skills and the body", () => {
    const r = parseRole("---\nname: x\ncommand: tutor-x\nladder: false\nskills: [a, b]\n---\n# Role: x\n\nbody\n");
    expect(r).toEqual({ name: "x", command: "tutor-x", ladder: false, skills: ["a", "b"], prompt: "# Role: x\n\nbody" });
  });
  it("defaults ladder to true and skills to []; rejects a file without name or command", () => {
    expect(parseRole("---\nname: y\ncommand: chat\n---\nbody")).toMatchObject({ ladder: true, skills: [] });
    expect(() => parseRole("---\nname: y\n---\nbody")).toThrow(/command/);
    expect(() => parseRole("no frontmatter")).toThrow(/name/);
  });
  it("ships the coding tutor (ladder) and the architect (no ladder, no code)", () => {
    expect([...roles().keys()].sort()).toEqual(["architect", "coding-tutor", "exam-maker", "examiner"]);
    expect(roleNamed(DEFAULT_ROLE).ladder).toBe(true);
    const a = roleNamed("architect");
    expect(a.ladder).toBe(false);
    expect(a.command).toBe("tutor-architect");
    expect(a.prompt).toMatch(/never write code/i);
  });
  it("the coding tutor points at the language card's skills (M7)", () => {
    expect(roleNamed("coding-tutor").prompt).toMatch(/language card/);
  });
  it("falls back to the coding tutor for an unknown name", () => {
    expect(roleNamed("nope").name).toBe(DEFAULT_ROLE);
  });
  it("names preferred skills and stays within the 600-token role budget (spec §7 #2)", () => {
    for (const r of roles().values()) {
      const p = rolePrompt(r);
      expect(estimateTokens(p)).toBeLessThanOrEqual(600);
      for (const s of r.skills) expect(p).toContain(`\`${s}\``);
    }
  });
});
