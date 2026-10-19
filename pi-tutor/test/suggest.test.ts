import { describe, it, expect } from "vitest";
import { suggestPrompt, checkSuggestions, suggestionLabel } from "../extensions/tutor/suggest.js";
import { systemText } from "../extensions/tutor/prompts.js";

const good = { projects: [
  { title: "Todo CLI", summary: "Track tasks in a file.", size: "small", concepts: ["structs", "file-io"] },
  { title: "Markdown linter", summary: "Flag common mistakes.", size: "medium", concepts: ["iterators"] },
  { title: "HTTP status checker", summary: "Ping URLs concurrently.", size: "large", concepts: ["async"] },
] };

describe("checkSuggestions", () => {
  it("accepts exactly the asked number of projects (one for onboarding, Q4)", () => {
    expect(checkSuggestions({ projects: good.projects.slice(0, 1) }, 1).map((s) => s.title)).toEqual(["Todo CLI"]);
    expect(() => checkSuggestions(good, 1)).toThrow(/exactly 1/);
  });
  it("accepts exactly three well-formed projects", () => {
    expect(checkSuggestions(good).map((s) => s.title)).toEqual(["Todo CLI", "Markdown linter", "HTTP status checker"]);
  });
  it("rejects the wrong count, a bad size, missing text, or non-string concepts", () => {
    expect(() => checkSuggestions({ projects: good.projects.slice(0, 2) })).toThrow(/exactly 3/);
    expect(() => checkSuggestions({ projects: [{ ...good.projects[0], size: "huge" }, ...good.projects.slice(1)] })).toThrow(/size/);
    expect(() => checkSuggestions({ projects: [{ ...good.projects[0], title: " " }, ...good.projects.slice(1)] })).toThrow(/title/);
    expect(() => checkSuggestions({ projects: [{ ...good.projects[0], concepts: [1] }, ...good.projects.slice(1)] })).toThrow(/concepts/);
    expect(() => checkSuggestions([])).toThrow(/projects/);
  });
});

describe("suggestPrompt", () => {
  it("carries language, level, band, what the conversation learned, weak concepts, finished projects, count and exclusions", () => {
    const p = suggestPrompt({
      language: "rust", level: 40, band: "intermediate", about: { experience: "1-3 years", known: "python", idea: "CLIs" },
      weakConcepts: ["borrow", "lifetimes"], done: ["Todo CLI"], count: 1, exclude: ["Pinger"],
    });
    for (const s of ["rust", "level 40 (intermediate)", "experience: 1-3 years", "known: python", "idea: CLIs", "borrow, lifetimes", "Todo CLI", "projects wanted: 1", "do not suggest: Pinger"]) expect(p).toContain(s);
  });
  it("says 'none yet' for empty lists", () => {
    const p = suggestPrompt({ language: "go", level: 80, band: "pro", about: {}, weakConcepts: [], done: [], count: 3, exclude: [] });
    expect(p).toContain("weak concepts: none yet");
    expect(p).toContain("finished projects: none yet");
    expect(p).not.toContain("do not suggest");
  });
});

describe("suggestionLabel / system prompt", () => {
  it("labels a suggestion for the select dialog", () => {
    expect(suggestionLabel(checkSuggestions(good)[1], 1)).toBe("2. Markdown linter (medium) — Flag common mistakes.");
  });
  it("ships a system prompt that demands the JSON shape", () => {
    expect(systemText("suggest")).toContain('"projects"');
  });
});
