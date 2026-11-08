import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { suggestOne, createProject, defaultProjectDir, isLanguage, LANGUAGES, ideaTitle, tiedToIdea } from "../extensions/tutor/start.js";
import { Profile } from "../extensions/tutor/profile.js";

let profile: Profile | undefined;
afterEach(() => { profile?.close(); profile = undefined; });
const ONE = JSON.stringify({ projects: [{ title: "Tip Calculator", summary: "Split a bill.", size: "small", concepts: ["numbers", "functions"] }] });
const project = { title: "Tip Calculator", summary: "Split a bill.", size: "small" as const, concepts: ["numbers"] };

describe("start building blocks (spec 2026-10-19 §5, Q4, Q23)", () => {
  it("knows exactly the six languages, and nothing else (the pytutor-architect case)", () => {
    expect(LANGUAGES).toEqual(["python", "rust", "go", "typescript", "lua", "javascript"]);
    expect(isLanguage("python")).toBe(true);
    expect(isLanguage("pytutor-architect")).toBe(false);
  });
  it("suggests one project, telling the model what the conversation learned and what was already shown", async () => {
    profile = Profile.open(":memory:");
    const seen: string[] = [];
    const s = await suggestOne({ profile, complete: async (_sys, user) => { seen.push(user); return ONE; } },
      { language: "python", level: 10, about: { experience: "none yet", idea: "track my expenses" }, exclude: ["Expense Logger"] });
    expect(s.title).toBe("Tip Calculator");
    expect(seen[0]).toMatch(/projects wanted: 1/);
    expect(seen[0]).toMatch(/do not suggest: Expense Logger/);
    expect(seen[0]).toMatch(/idea: track my expenses/);
  });
  it("rejects a reply with the wrong number of projects", async () => {
    profile = Profile.open(":memory:");
    const three = JSON.stringify({ projects: [1, 2, 3].map((n) => ({ title: `P${n}`, summary: "s.", size: "small", concepts: [] })) });
    const replies = [three, three];
    await expect(suggestOne({ profile, complete: async () => replies.shift()! }, { language: "go", level: 50, about: {}, exclude: [] })).rejects.toThrow(/exactly 1/);
  });
  it("the default folder is ~/lazycourse/<language>-<slug>", () => {
    expect(defaultProjectDir("/home/u", "python", "Tip Calculator!")).toBe("/home/u/lazycourse/python-tip-calculator");
  });
  it("creates the project folder before any spec: README front matter, AGENTS.md, profile rows", () => {
    profile = Profile.open(":memory:");
    const dir = join(mkdtempSync(join(tmpdir(), "start-")), "python-tip");
    const r = createProject(profile, { language: "python", level: 10, project, dir, about: { experience: "none yet" }, now: 5 });
    expect(r.dir).toBe(realpathSync(dir));
    const readme = readFileSync(join(dir, "README.md"), "utf8");
    expect(readme).toMatch(/^---\n/);
    expect(readme).toMatch(/language: python/);
    expect(readme).toMatch(/test: python3 -m unittest/);
    expect(readme).toContain("# Tip Calculator");
    expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toMatch(/never write the solution/i);
    expect(profile.language("python")?.level).toBe(10);
    expect(profile.projectAt(r.dir)?.title).toBe("Tip Calculator");
  });
  it("a Lua project gets a .luarc.json naming the installed Lua; other languages do not (author 2026-10-21)", () => {
    profile = Profile.open(":memory:");
    const base = mkdtempSync(join(tmpdir(), "start-"));
    const lua = createProject(profile, { language: "lua", level: 10, project, dir: join(base, "lua-tip"), about: {}, now: 5, luaRuntime: "Lua 5.5" });
    expect(JSON.parse(readFileSync(join(lua.dir, ".luarc.json"), "utf8"))["runtime.version"]).toBe("Lua 5.5");
    const py = createProject(profile, { language: "python", level: 10, project, dir: join(base, "py-tip"), about: {}, now: 5, luaRuntime: "Lua 5.5" });
    expect(existsSync(join(py.dir, ".luarc.json"))).toBe(false);
    const none = createProject(profile, { language: "lua", level: 10, project, dir: join(base, "lua-none"), about: {}, now: 5, luaRuntime: null });
    expect(existsSync(join(none.dir, ".luarc.json"))).toBe(false);
  });
  it("keeps an existing language level row, and refuses a non-empty folder", () => {
    profile = Profile.open(":memory:");
    profile.saveLanguage("python", 70, {}, 1);
    const base = mkdtempSync(join(tmpdir(), "start-"));
    createProject(profile, { language: "python", level: 30, project, dir: join(base, "a"), about: {}, now: 5 });
    expect(profile.language("python")?.level).toBe(30);
    mkdirSync(join(base, "b")); writeFileSync(join(base, "b", "x"), "");
    expect(() => createProject(profile!, { language: "python", level: 30, project, dir: join(base, "b"), about: {}, now: 5 })).toThrow(/not empty/);
    expect(existsSync(join(base, "b", "README.md"))).toBe(false);
  });
  it("records the project at its real path under a symlinked parent (M4 #25)", () => {
    profile = Profile.open(":memory:");
    const real = mkdtempSync(join(tmpdir(), "pitutor-real-"));
    const home = mkdtempSync(join(tmpdir(), "pitutor-home-"));
    symlinkSync(real, join(home, "lazycourse"));
    const r = createProject(profile, { language: "rust", level: 50, project, dir: join(home, "lazycourse", "rust-tip"), about: {}, now: 5 });
    expect(r.dir).toBe(join(realpathSync(real), "rust-tip"));
    expect(profile.projectAt(r.dir)).toBeDefined();
  });
});

// Wayfinding spec §9.2 (re-run topic 2): the author's idea "a number guessing game" came back as "Todo List CLI".
describe("the learner's idea is the project", () => {
  it.each([
    ["a number guessing game", "Number Guessing Game"],
    ["I want to make a número guessing game!", "Número Guessing Game"],
    ["build an expense tracker.", "Expense Tracker"],
    // Final review I4: more ways to say "I want to", and a cut at a clause boundary, not mid-clause.
    ["I'd like to write a bot", "Bot"],
    ["i wanna build a CLI: todo-list (with tags) / priorities?", "CLI"],
    ["I want to make a tool that tracks my running times, shows weekly charts, and more", "Tool That Tracks My Running Times"],
    // Second review M1, M2: a leading aside is no title, "/" joins words, a curly apostrophe is still "I'd".
    ["Hmm, I want to make a snake game", "Snake Game"],
    ["a client/server chat", "Client/server Chat"],
    ["I’d like to build a todo app", "Todo App"],
  ])("ideaTitle(%j) = %j", (idea, title) => expect(ideaTitle(idea)).toBe(title));
  it("a long idea becomes a title of at most 40 characters, cut at a word", () => {
    const t = ideaTitle("a command line program that keeps track of the books I read and the ones I want to read next year");
    expect(t.length).toBeLessThanOrEqual(40);
    expect("Command Line Program That Keeps Track Of The Books".startsWith(t)).toBe(true);
  });
  it("a title with non-ASCII letters still makes a valid folder (Review Focus 5)", () => {
    const dir = defaultProjectDir("/home/u", "python", ideaTitle("I want to make a número guessing game!"));
    expect(dir).toMatch(/^\/home\/u\/lazycourse\/python-[a-z0-9-]+$/);
  });
  it.each([
    // Final review I3: an idea without spaces between words (Japanese) is compared by pairs of letters.
    ["単語帳アプリ (text)", "日本語の単語帳アプリを作りたい", true],
    ["Todo List", "日本語の単語帳アプリを作りたい", false],
    ["Text Number Guessing", "a number guessing game", true],
    ["Todo List CLI", "a number guessing game", false],
    ["Tiny Text Adventure Engine", "a 3D game engine", true],
    ["GAME of life", "a 3D game engine", true],
  ])("tiedToIdea(%j, %j) = %s", (text, idea, tied) => expect(tiedToIdea(text, idea)).toBe(tied));

  const reply = (o: object) => JSON.stringify(o);
  const todo = { title: "Todo List CLI", summary: "Track todos.", size: "small", concepts: ["lists"] };
  it("an idea that fits is the title, even when the model names another project", async () => {
    profile = Profile.open(":memory:");
    const seen: string[] = [];
    const s = await suggestOne({ profile, complete: async (_s, u) => { seen.push(u); return reply({ projects: [todo], fits: true }); } },
      { language: "python", level: 5, about: {}, exclude: [], idea: "a number guessing game" });
    expect(s.title).toBe("Number Guessing Game");
    expect(s.tooBig).toBeUndefined();
    expect(seen[0]).toMatch(/the learner's idea \(keep it\): a number guessing game/);
  });
  it("an idea too big for the level comes back as a smaller version of it", async () => {
    profile = Profile.open(":memory:");
    const smaller = { title: "Text Game Engine", summary: "A loop that runs text rooms.", concepts: ["loops"] };
    const s = await suggestOne({ profile, complete: async () => reply({ projects: [todo], fits: false, smaller }) },
      { language: "python", level: 5, about: {}, exclude: [], idea: "a 3D game engine" });
    expect(s).toMatchObject({ title: "Text Game Engine", tooBig: true, size: "small" });
  });
  it("a smaller version that drops the idea is asked again once, then refused honestly", async () => {
    profile = Profile.open(":memory:");
    const off = { title: "Todo List", summary: "Track todos.", concepts: [] };
    const tied = { title: "Text Game Engine", summary: "Rooms in text.", concepts: [] };
    const replies = [reply({ projects: [todo], fits: false, smaller: off }), reply({ projects: [todo], fits: false, smaller: tied })];
    const s = await suggestOne({ profile, complete: async () => replies.shift()! }, { language: "python", level: 5, about: {}, exclude: [], idea: "a 3D game engine" });
    expect(s.title).toBe("Text Game Engine");
    const twice = [reply({ projects: [todo], fits: false, smaller: off }), reply({ projects: [todo], fits: false, smaller: off })];
    await expect(suggestOne({ profile, complete: async () => twice.shift()! }, { language: "python", level: 5, about: {}, exclude: [], idea: "a 3D game engine" }))
      .rejects.toThrow(/could not make a smaller version of your idea "a 3D game engine"/);
  });
  it("without an idea the model's project stands", async () => {
    profile = Profile.open(":memory:");
    const s = await suggestOne({ profile, complete: async () => ONE }, { language: "python", level: 5, about: {}, exclude: [], idea: null });
    expect(s.title).toBe("Tip Calculator");
  });
});

describe("project folders (final review I4)", () => {
  it.each([
    ["Ich Möchte Einen Vokabeltrainer", "python-ich-mochte-einen-vokabeltrainer"],
    ["Trò chơi đoán số", "python-tro-choi-doan-so"],
    ["Straße Łódź Ørsted Æsir", "python-strasse-lodz-orsted-aesir"],
  ])("defaultProjectDir(%j) folds accents", (title, slug) => expect(defaultProjectDir("/h", "python", title)).toBe(`/h/lazycourse/${slug}`));
  it("a title with no Latin letters uses the given fallback name for its folder", () => {
    expect(defaultProjectDir("/h", "python", "単語帳アプリ", "Vocabulary Cards")).toBe("/h/lazycourse/python-vocabulary-cards");
  });
  it("an idea in another script keeps its own words as the title and gets a folder from the model's title", async () => {
    profile = Profile.open(":memory:");
    const todo = { title: "Vocabulary Cards", summary: "Flash cards.", size: "small", concepts: [] };
    const s = await suggestOne({ profile, complete: async () => JSON.stringify({ projects: [todo], fits: true }) },
      { language: "python", level: 5, about: {}, exclude: [], idea: "単語帳アプリ" });
    expect(s.title).toBe("単語帳アプリ");
    expect(s.slug).toBe("Vocabulary Cards");
  });
});
