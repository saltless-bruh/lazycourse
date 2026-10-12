import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStart, LANGUAGES, type StartDeps } from "../extensions/tutor/start.js";
import { Profile } from "../extensions/tutor/profile.js";

const SUGGEST = JSON.stringify({ projects: [
  { title: "Todo CLI", summary: "Track tasks.", size: "small", concepts: ["structs"] },
  { title: "Word Count", summary: "Count words.", size: "small", concepts: ["iterators"] },
  { title: "Pinger", summary: "Ping URLs.", size: "medium", concepts: ["async"] },
] });
const SCAFFOLD = JSON.stringify({
  design_md: "# D\n", tasks_md: "- [ ] P1.T1 Parse args\n", requirements_md: "## P1.T1\n", entry_file: "src/main.rs", run_cmd: "cargo run",
});

let profile: Profile | undefined;
afterEach(() => { profile?.close(); profile = undefined; });

function deps(answers: (string | undefined)[], replies: string[] = [SUGGEST, SCAFFOLD]) {
  const home = mkdtempSync(join(tmpdir(), "pitutor-home-"));
  profile = Profile.open(":memory:");
  const notes: string[] = [];
  const working: (string | undefined)[] = [];
  const prompts: string[] = [];
  const next = async (title: string) => { prompts.push(title); return answers.shift(); };
  const d: StartDeps = {
    ui: { select: (t) => next(t), input: (t) => next(t), notify: (m) => { notes.push(m); }, working: (m) => { working.push(m); } },
    profile, home, now: () => 1000,
    complete: async () => { const r = replies.shift(); if (r === undefined) throw new Error("no more replies"); return r; },
  };
  return { d, home, notes, working, prompts, profile };
}
const interview = ["1-3 years", "python", "tried it a little", "a CLI", "small (1-2 h)"];

describe("runStart", () => {
  it("new language: interview, suggest, pick, scaffold into the default folder, record profile", async () => {
    const t = deps(["rust", ...interview, "1. Todo CLI (small) — Track tasks.", ""]);
    const r = await runStart("", t.d);
    const dir = join(t.home, "lazycourse", "rust-todo-cli");
    expect(r).toEqual({ dir, language: "rust", level: 50, title: "Todo CLI", files: expect.arrayContaining(["spec/tasks.md", "AGENTS.md", "src/main.rs"]) });
    expect(existsSync(join(dir, "spec", "requirements.md"))).toBe(true);
    expect(t.profile.language("rust")).toMatchObject({ level: 50, interview: { goal: "a CLI" } });
    expect(t.profile.projectAt(dir)).toMatchObject({ title: "Todo CLI", language: "rust" });
    expect(t.working.at(-1)).toBeUndefined();
  });

  it("known language skips the interview and uses the stored level; the argument picks the language", async () => {
    const t = deps(["2. Word Count (small) — Count words.", "~/code/wc"]);
    t.profile.saveLanguage("rust", 80, {}, 1);
    const r = await runStart("Rust", t.d);
    expect(r).toMatchObject({ language: "rust", level: 80, title: "Word Count", dir: join(t.home, "code", "wc") });
    expect(t.prompts).toHaveLength(2);
  });

  it("offers the built-in languages plus profile languages and an 'other' entry", async () => {
    const t = deps([undefined]);
    t.profile.saveLanguage("zig", 30, {}, 1);
    let options: string[] = [];
    t.d.ui.select = async (_title, opts) => { options = opts; return undefined; };
    expect(await runStart("", t.d)).toBeNull();
    expect(options).toEqual([...LANGUAGES, "zig", "other…"]);
  });

  it("aborts cleanly at every cancel point: no files, no project row, no half interview", async () => {
    for (let stop = 0; stop <= 7; stop++) {
      const all = ["rust", ...interview, "1. Todo CLI (small) — Track tasks."];
      const t = deps([...all.slice(0, stop), undefined]);
      expect(await runStart("", t.d)).toBeNull();
      expect(t.profile.projects("rust")).toEqual([]);
      if (stop <= 5) expect(t.profile.language("rust")).toBeUndefined();
      expect(existsSync(join(t.home, "lazycourse"))).toBe(false);
      expect(t.working.at(-1)).toBeUndefined();
    }
  });

  it("refuses a non-empty folder before asking the model for the spec", async () => {
    const t = deps(["1. Todo CLI (small) — Track tasks.", "~/busy"], [SUGGEST, SCAFFOLD]);
    t.profile.saveLanguage("rust", 40, {}, 1);
    const busy = join(t.home, "busy");
    mkdirSync(busy);
    writeFileSync(join(busy, "mine.txt"), "x");
    expect(await runStart("rust", t.d)).toBeNull();
    expect(t.notes.at(-1)).toMatch(/not empty/);
    expect(readdirSync(busy)).toEqual(["mine.txt"]);
  });

  it("reports a model failure, writes nothing, and clears the working message", async () => {
    const t = deps(["1. Todo CLI (small) — Track tasks.", ""], [SUGGEST, "garbage", "still garbage"]);
    t.profile.saveLanguage("rust", 40, {}, 1);
    expect(await runStart("rust", t.d)).toBeNull();
    expect(t.notes.at(-1)).toMatch(/rejected twice/);
    expect(existsSync(join(t.home, "lazycourse"))).toBe(false);
    expect(t.working.at(-1)).toBeUndefined();
  });

  it("Esc during a model call cancels quietly: info notice, nothing written (final review I1)", async () => {
    const { Cancelled } = await import("../extensions/tutor/progress.js");
    const t = deps(["1. Todo CLI (small) — Track tasks.", ""]);
    t.profile.saveLanguage("rust", 40, {}, 1);
    const replies = [SUGGEST];
    t.d.complete = async () => { const r = replies.shift(); if (r) return r; throw new Cancelled(); };
    expect(await runStart("rust", t.d)).toBeNull();
    expect(t.notes.at(-1)).toBe("tutor-start cancelled");
    expect(existsSync(join(t.home, "lazycourse"))).toBe(false);
  });

  it("rejects an invalid language name", async () => {
    const t = deps([]);
    expect(await runStart("rm -rf /", t.d)).toBeNull();
    expect(t.notes.at(-1)).toMatch(/language/);
  });
});
