import { describe, it, expect } from "vitest";
import { tutorPrompt, systemText, estimateTokens } from "../extensions/tutor/prompts.js";

const BANDS = ["beginner", "intermediate", "pro"] as const;

describe("tutorPrompt", () => {
  it("orders role, style, band, ladder, turn protocol", () => {
    for (const b of BANDS) {
      const p = tutorPrompt(b, { role: "# Role: test role", ladder: true });
      const at = ["# Role: test role", "## Teaching style", `# Tutor band: ${b}`, "## Hint ladder", "## Turn protocol"].map((s) => p.indexOf(s));
      expect(at.every((i) => i >= 0)).toBe(true);
      expect([...at].sort((x, y) => x - y)).toEqual(at);
    }
  });
  it("leaves the ladder out for roles that do not use it", () => {
    const p = tutorPrompt("intermediate", { role: "# Role: x", ladder: false });
    expect(p).not.toContain("## Hint ladder");
    expect(p).toContain("## Turn protocol");
  });
  it("defaults to no role text and the ladder on", () => {
    expect(tutorPrompt("pro").startsWith("## Teaching style")).toBe(true);
    expect(tutorPrompt("pro")).toContain("## Hint ladder");
  });
  it("gives each band a distinct voice", () => {
    expect(new Set(BANDS.map((b) => tutorPrompt(b))).size).toBe(3);
    expect(tutorPrompt("pro")).toMatch(/never write code/i);
    expect(tutorPrompt("beginner")).toMatch(/why each part exists/i);
  });
  it("tells the model to load and cite a tutor-<lang>-* skill when it points (spec §7)", () => {
    expect(tutorPrompt("beginner")).toMatch(/tutor-<lang>-\*/);
    expect(tutorPrompt("beginner")).toMatch(/cite the skill('s)? name/i);
  });
});

describe("teaching style (spec 2026-10-13 §2)", () => {
  const style = () => systemText("style");
  it("names the five parts in order", () => {
    const at = ["What's happening", "Why", "Example", "What to try", "In short"].map((s) => style().indexOf(`**${s}**`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
  });
  it("states the rules, the 40-column diagram limit and the no-internals rule", () => {
    for (const w of ["Complete", "Organized", "Plain", "No padding", "40"]) expect(style()).toContain(w);
    expect(style()).toMatch(/INDEX\.md/);
    expect(style()).toContain("tutor-teaching-style");
  });
});

describe("turn protocol (live findings 2026-10-13)", () => {
  const j = () => systemText("judgment");
  it("no longer asks for short replies", () => {
    expect(j()).not.toMatch(/keep replies short|6-12 short lines/i);
  });
  it("says the judgment is text, not a tool, and has step_done", () => {
    expect(j()).toMatch(/not a tool/i);
    expect(j()).toContain('"step_done"');
    expect(j()).toMatch(/`correct` only when/);
  });
  it("its example judgment is none, so a copied example never advances the rung", () => {
    expect(j()).toContain('{"judgment":"none"');
  });
  it("judgment tags come from the card's list (spec §5.4)", () => {
    expect(j()).toMatch(/`concept_tags`: .*Concept tags/);
  });
  it("the ladder forbids writing the corrected line until this turn's instruction allows the fix", () => {
    expect(systemText("ladder")).toMatch(/until this turn's instruction allows the fix, never write the corrected line/i);
  });
  it("final review I5: the Example part never asks for the learner's own code", async () => {
    expect(systemText("style")).not.toMatch(/the learner's own code \(`path:line`\)/);
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    expect(readFileSync(join(import.meta.dirname, "..", "skills", "tutor-teaching-style", "SKILL.md"), "utf8")).not.toMatch(/Example\*\*: concrete: the learner's own code/);
  });
  it("no system prompt or skill talks about rungs (spec 2026-10-21: attempts replace them)", async () => {
    for (const name of ["ladder", "style"]) expect(systemText(name)).not.toMatch(/\brung/i);
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(import.meta.dirname, "..", "skills");
    for (const d of readdirSync(root)) expect(readFileSync(join(root, d, "SKILL.md"), "utf8"), d).not.toMatch(/\brung/i);
  });
});

describe("prompt budget (spec §7 #2)", () => {
  it("estimates tokens as ceil(chars / 4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcde")).toBe(2);
  });
  it("keeps the style section within 600 tokens and the whole tutor section within 2400", () => {
    expect(estimateTokens(systemText("style"))).toBeLessThanOrEqual(600);
    const role = "x".repeat(600 * 4); // a role at its full budget
    for (const b of BANDS) expect(estimateTokens(tutorPrompt(b, { role, ladder: true }))).toBeLessThanOrEqual(2400);
  });
});
