import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lastClosedEpisode, transcript, learnPrompt, checkLearned, renderLearned, parseSkillHeader, saveSkill } from "../extensions/tutor/learn.js";
import { openEpisode, closeEpisode } from "../extensions/tutor/ladder.js";

const ep = (closed: boolean) => {
  const e = { ...openEpisode({ kind: "error", path: "/p/src/main.rs", line: 4, msg: "borrow of moved value" }, "beginner", 1), attempts: 4, turns: 3, concept_tags: ["ownership", "move-semantics"] };
  return closed ? closeEpisode(e, "judged", 9) : e;
};
const entry = (data: unknown) => ({ type: "custom", customType: "tutor_episode", data });
const msg = (role: string, content: unknown) => ({ type: "message", message: { role, content } });

describe("lastClosedEpisode / transcript", () => {
  it("finds the newest closed episode on the branch", () => {
    expect(lastClosedEpisode([entry(ep(true)), entry(ep(false))])).toMatchObject({ closeReason: "judged" });
    expect(lastClosedEpisode([entry(ep(false))])).toBeNull();
    expect(lastClosedEpisode([])).toBeNull();
  });
  it("an episode closed before attempts existed (saved with a rung) reads as 0 failed attempts", () => {
    const old = { type: "custom", customType: "tutor_episode", data: { id: "ep-9", trigger: { kind: "chat" }, band: "beginner", rung: 4, opened: 1, turns: 2, concept_tags: [], closed: 3, closeReason: "judged" } };
    const ep = lastClosedEpisode([old])!;
    expect(ep.attempts).toBe(0);
    expect(learnPrompt("rust", ep, "")).toContain("after 0 failed attempt(s)");
  });
  it("keeps the newest user/assistant text within the budget and skips tool calls and custom messages", () => {
    const branch = [
      msg("user", "old question"),
      msg("assistant", [{ type: "text", text: "old answer" }, { type: "toolCall", name: "read" }]),
      { type: "message", message: { role: "custom", customType: "tutor_editor", content: "[editor] secret" } },
      msg("user", [{ type: "text", text: "why moved?" }]),
      msg("assistant", [{ type: "text", text: "because String is not Copy" }]),
    ];
    const t = transcript(branch, 10_000);
    expect(t).toBe("learner: old question\ntutor: old answer\nlearner: why moved?\ntutor: because String is not Copy");
    expect(transcript(branch, 60)).toBe("learner: why moved?\ntutor: because String is not Copy"); // 54 chars; the older answer does not fit
  });
});

describe("learnPrompt / checkLearned / renderLearned", () => {
  it("puts the episode facts and conversation into the prompt", () => {
    const p = learnPrompt("rust", ep(true), "learner: why?");
    for (const s of ["language: rust", 'error "borrow of moved value" at main.rs:4', "ownership, move-semantics", "after 4 failed attempt(s)", "3 turn(s)", "learner: why?"]) expect(p).toContain(s);
  });
  it("accepts a well-formed draft and rejects bad slugs, multi-line descriptions and empty bodies", () => {
    const good = { slug: "moved-string", description: "Moving a String into a function. Use when the learner sees 'borrow of moved value'.", body: "## Misconception\n..." };
    expect(checkLearned(good)).toEqual(good);
    expect(() => checkLearned({ ...good, slug: "Moved String" })).toThrow(/slug/);
    expect(() => checkLearned({ ...good, description: "a\nb" })).toThrow(/description/);
    expect(() => checkLearned({ ...good, body: " " })).toThrow(/body/);
  });
  it("renders a SKILL.md that parses back to its name and description", () => {
    const text = renderLearned("rust", { slug: "moved-string", description: "Moving a String: use clone or borrow.", body: "## Fix pattern\nBorrow with &." });
    expect(text.startsWith("---\nname: tutor-rust-learned-moved-string\n")).toBe(true);
    expect(parseSkillHeader(text)).toEqual({ name: "tutor-rust-learned-moved-string", description: "Moving a String: use clone or borrow." });
  });
});

describe("parseSkillHeader agrees with Pi's YAML loader (M5 final review I1)", () => {
  const head = (desc: string) => `---\nname: ok-name\ndescription: ${desc}\n---\nbody\n`;
  it("refuses headers Pi's YAML parser would reject, so a saved skill always loads", () => {
    expect(() => parseSkillHeader(head('"Use when "x" happens"'))).toThrow(/YAML/);
    expect(() => parseSkillHeader(head("Use when: borrow fails"))).toThrow(/YAML/);
    expect(() => parseSkillHeader("---\nname: ok-name\ndescription: one\ndescription: two\n---\n")).toThrow(/YAML/);
  });
  it("reads the description exactly as Pi does (a # starts a comment)", () => {
    expect(parseSkillHeader(head("Use when #1 thing")).description).toBe("Use when");
    expect(parseSkillHeader(head('"Use when: borrow fails"')).description).toBe("Use when: borrow fails");
  });
});

describe("parseSkillHeader", () => {
  it("refuses a draft edited into invalid frontmatter, with a reason", () => {
    expect(() => parseSkillHeader("no frontmatter")).toThrow(/frontmatter/);
    expect(() => parseSkillHeader("---\ndescription: x\n---\nbody")).toThrow(/name/);
    expect(() => parseSkillHeader("---\nname: Bad Name\ndescription: x\n---\n")).toThrow(/name/);
    expect(() => parseSkillHeader("---\nname: a--b\ndescription: x\n---\n")).toThrow(/name/);
    expect(() => parseSkillHeader("---\nname: ok-name\n---\n")).toThrow(/description/);
    expect(parseSkillHeader('---\nname: ok-name\ndescription: "quoted: yes"\n---\n')).toEqual({ name: "ok-name", description: "quoted: yes" });
  });
});

describe("saveSkill", () => {
  it("writes SKILL.md in a new folder and never overwrites an existing skill", () => {
    const root = mkdtempSync(join(tmpdir(), "pitutor-learn-"));
    mkdirSync(join(root, "tutor-rust-learned-x"));
    writeFileSync(join(root, "tutor-rust-learned-x", "SKILL.md"), "mine");
    const a = saveSkill(root, "tutor-rust-learned-x", "---\nname: tutor-rust-learned-x\n---\nnew");
    expect(a).toBe(join(root, "tutor-rust-learned-x-2"));
    expect(readFileSync(join(root, "tutor-rust-learned-x", "SKILL.md"), "utf8")).toBe("mine");
    expect(readFileSync(join(a, "SKILL.md"), "utf8")).toContain("name: tutor-rust-learned-x-2");
    expect(saveSkill(root, "tutor-rust-learned-x", "---\nname: tutor-rust-learned-x\n---\n")).toBe(join(root, "tutor-rust-learned-x-3"));
    expect(readdirSync(root).sort()).toEqual(["tutor-rust-learned-x", "tutor-rust-learned-x-2", "tutor-rust-learned-x-3"]);
  });
});

describe("M6c: saveSkill rename (M5 #34)", () => {
  it("renames a duplicate skill whatever line `name:` is on", () => {
    const root = mkdtempSync(join(tmpdir(), "pitutor-learn-"));
    const text = "---\ndescription: \"x\"\nname: foo\n---\nbody\n";
    saveSkill(root, "foo", text);
    const dir = saveSkill(root, "foo", text);
    expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toMatch(/^name: foo-2$/m);
    expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toContain("body");
  });
  it("renames CRLF front matter, keeping its line endings (M6c M9)", () => {
    const root = mkdtempSync(join(tmpdir(), "pitutor-learn-"));
    const text = "---\r\nname: foo\r\ndescription: \"x\"\r\n---\r\nbody\r\n";
    saveSkill(root, "foo", text);
    const saved = readFileSync(join(saveSkill(root, "foo", text), "SKILL.md"), "utf8");
    expect(saved).toBe(text.replace("name: foo\r\n", "name: foo-2\r\n"));
    expect(parseSkillHeader(saved).name).toBe("foo-2");
  });
  it("adds a name line when the front matter has none, so the folder and the skill agree (M6c M9)", () => {
    const root = mkdtempSync(join(tmpdir(), "pitutor-learn-"));
    mkdirSync(join(root, "foo"));
    const saved = readFileSync(join(saveSkill(root, "foo", "---\ndescription: \"x\"\n---\nbody\n"), "SKILL.md"), "utf8");
    expect(saved).toBe("---\nname: foo-2\ndescription: \"x\"\n---\nbody\n");
  });
});
