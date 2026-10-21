import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fakePi, fakeCtx, realExec, boot, assistant, judged, episodes, turn, REASONED } from "./fake-pi.js";
import { THINKING_LABEL } from "../extensions/tutor/thinking.js";
import { HOLD_TEXT, REWRITE_TEXT, fallbackReply } from "../extensions/tutor/turns.js";
import extension from "../extensions/tutor/index.js";
import { mkdtempSync as mkd, mkdirSync as mkdir, writeFileSync as wfile, existsSync, readFileSync } from "node:fs";
import { PY_EXAM } from "./exam-fixtures.js";
import { tmpdir as tmp } from "node:os";
import { join as pjoin } from "node:path";

describe("extension wiring", () => {
  it("registers lifecycle handlers and commands", () => {
    const { pi, events, commands } = fakePi();
    extension(pi as never);
    expect(Object.keys(events)).toEqual(expect.arrayContaining(["session_start", "session_shutdown", "before_agent_start", "turn_end", "context", "tool_call"]));
    expect(Object.keys(commands)).toEqual(expect.arrayContaining(["tutor-level", "tutor-status"]));
  });

  it("is inert outside tutor mode: no handlers, no commands without PI_TUTOR=1", () => {
    const saved = process.env.PI_TUTOR; delete process.env.PI_TUTOR;
    try {
      const { pi, events, commands } = fakePi();
      extension(pi as never);
      expect(Object.keys(events)).toEqual([]);
      expect(Object.keys(commands)).toEqual([]);
    } finally { process.env.PI_TUTOR = saved; }
  });

  it("starts detached at the default level", async () => {
    const { widgets, statuses } = await boot();
    expect(widgets["tutor"]?.[1]).toBe("outside nvim · idle");
    expect(statuses["tutor"]).toBe("tutor lvl 50 · intermediate");
  });

  it("/tutor-level validates and persists a tutor_level entry", async () => {
    const { commands, ctx, widgets, notes, entries } = await boot();
    await commands["tutor-level"].handler("abc", ctx);
    expect(notes.at(-1)).toMatch(/0-100/);
    await commands["tutor-level"].handler("20", ctx);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 20");
    expect(entries).toContainEqual({ type: "tutor_level", data: { level: 20 } });
  });

  it("restores the latest tutor_level entry from the session branch on start", async () => {
    const { widgets } = await boot({ branch: [
      { type: "custom", customType: "tutor_level", data: { level: 10 } },
      { type: "custom", customType: "tutor_signal", data: {} },
      { type: "custom", customType: "tutor_level", data: { level: 80 } },
    ] });
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 80");
  });

  it("before_agent_start sets the band section; detached turns carry the episode but no editor snapshot", async () => {
    const { events, commands, ctx } = await boot();
    const opts = { sections: {} as Record<string, string> };
    const r1 = (await events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: "hi", systemPromptOptions: opts }, ctx)) as { message: { customType: string; content: string; display: boolean } };
    expect(opts.sections["tutor"]).toContain("# Tutor band: intermediate\n");
    expect(opts.sections["tutor"]).toContain("## Teaching style");
    expect(opts.sections["tutor"]).toContain("```tutor-judgment");
    expect(r1.message.customType).toBe("tutor_editor");
    expect(r1.message.display).toBe(false);
    expect(r1.message.content).toMatch(/^\[episode\] stuck on: learner question\nfailed attempts on this spot: 0/);
    expect(r1.message.content).not.toContain("[editor]");
    await commands["tutor-level"].handler("5", ctx);
    await events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: "hi", systemPromptOptions: opts }, ctx);
    expect(opts.sections["tutor"]).toContain("# Tutor band: beginner\n");
  });

  it("turn_end parses the judgment into the widget and a tutor_judgment entry", async () => {
    const { events, ctx, entries } = await boot();
    await turn(events, ctx, REASONED, assistant('ok\n```tutor-judgment\n{"judgment":"correct","concept_tags":["x"]}\n```'));
    expect(entries.filter((e) => e.type === "tutor_judgment").at(-1)).toEqual({ type: "tutor_judgment", data: { judgment: "correct", concept_tags: ["x"], task_done_ids: [], episode_closed: false, step_done: false } });
    const n = entries.length;
    await turn(events, ctx, "hi", assistant("no block here"));
    expect(entries.slice(n).map((e) => e.type)).toEqual(["tutor_check"]); // a missing block is recorded as a rule break, not as a judgment
  });

  it("turn_end ignores turns that end in tool calls and never throws on malformed blocks", async () => {
    const { events, ctx, entries } = await boot();
    const before = entries.length;
    await events["turn_end"]({ type: "turn_end", message: { role: "assistant", content: [{ type: "toolCall", id: "1", name: "read", arguments: {} }], stopReason: "toolUse" } }, ctx);
    expect(entries.length).toBe(before);
    await expect(events["turn_end"]({ type: "turn_end", message: assistant("```tutor-judgment\n{nope\n```") }, ctx)).resolves.toBeUndefined();
  });
});

describe("M2 review fixes", () => {
  it("/tutor-level rejects empty, exponent and hex forms and shows the current level on empty (I2)", async () => {
    const { commands, ctx, notes, entries } = await boot();
    const before = entries.length;
    await commands["tutor-level"].handler("", ctx);
    expect(notes.at(-1)).toMatch(/current level 50/);
    for (const bad of ["1e1", "0x10", "-0", "101", " 5 5"]) {
      await commands["tutor-level"].handler(bad, ctx);
      expect(notes.at(-1)).toMatch(/0-100/);
    }
    expect(entries.length).toBe(before);
    await commands["tutor-level"].handler("007", ctx);
    expect(entries.at(-1)).toEqual({ type: "tutor_level", data: { level: 7 } });
  });

  it("context handler keeps only the newest tutor_editor message (I3)", async () => {
    const { events } = await boot();
    const custom = (n: number) => ({ role: "custom", customType: "tutor_editor", content: `snap${n}`, display: false, timestamp: n });
    const messages = [
      { role: "user", content: "a", timestamp: 1 },
      custom(2),
      { role: "assistant", content: [{ type: "text", text: "b" }], timestamp: 3 },
      { role: "custom", customType: "tutor_other", content: "keep", display: false, timestamp: 4 },
      custom(5),
      { role: "user", content: "c", timestamp: 6 },
    ];
    const r = (await events["context"]({ type: "context", messages }, {})) as { messages: typeof messages };
    expect(r.messages.map((m) => (m as { content: unknown }).content)).toEqual(["a", [{ type: "text", text: "b" }], "keep", "snap5", "c"]);
  });
});

describe("M3 episodes, ladder and guard", () => {
  const bas = (prompt: string) => ({ type: "before_agent_start", messageType: "user", prompt, systemPromptOptions: { sections: {} } });

  it("a chat message opens an episode; judgments never move help (spec 2026-10-21 §5); episode_closed closes", async () => {
    const { events, ctx, entries, widgets } = await boot();
    await events["before_agent_start"](bas(REASONED), ctx);
    expect(episodes(entries).at(-1)).toMatchObject({ trigger: { kind: "chat" }, attempts: 0, turns: 0 });
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 50"); // line 2 says "detached" in these boots
    await events["turn_end"]({ type: "turn_end", message: judged("correct") }, ctx);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 50");
    await events["before_agent_start"](bas(REASONED), ctx);
    await events["turn_end"]({ type: "turn_end", message: judged("wrong") }, ctx);
    await events["before_agent_start"](bas(REASONED), ctx);
    await events["turn_end"]({ type: "turn_end", message: judged("correct", true) }, ctx);
    expect(episodes(entries).at(-1)).toMatchObject({ attempts: 0, turns: 3, closeReason: "judged" });
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 50");
  });

  it("[tutor] nudges never open a chat episode, and a second chat message joins the open one", async () => {
    const { events, ctx, entries } = await boot();
    await events["before_agent_start"](bas("[tutor] stuck signal: idle at a.py:1"), ctx);
    expect(episodes(entries)).toHaveLength(0);
    await events["before_agent_start"](bas("first"), ctx);
    await events["before_agent_start"](bas("second"), ctx);
    expect(episodes(entries)).toHaveLength(1);
  });

  it("aborted, errored and truncated replies leave the episode and the widget alone", async () => {
    const { events, ctx, entries, widgets } = await boot();
    await events["before_agent_start"](bas("q"), ctx);
    const n = entries.length;
    for (const stop of ["aborted", "error", "length"]) {
      await events["turn_end"]({ type: "turn_end", message: judged("correct", true, stop) }, ctx);
    }
    expect(entries.length).toBe(n);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 50");
  });

  it("restores an open episode on resume and ignores a closed one; one saved with a rung loads at 0 tries", async () => {
    const ep = { id: "ep-1", trigger: { kind: "chat" }, band: "intermediate", attempts: 2, opened: 1, turns: 3, concept_tags: [] };
    const entry = (data: unknown) => ({ type: "custom", customType: "tutor_episode", data });
    const open = await boot({ branch: [entry(ep)] });
    expect(open.widgets["tutor"]?.[0]).toBe("tutor  try 2 · lvl 50");
    const old = await boot({ branch: [entry({ id: "ep-0", trigger: { kind: "chat" }, band: "intermediate", rung: 4, opened: 1, turns: 3, concept_tags: [] })] });
    expect(old.widgets["tutor"]?.[0]).toBe("tutor  lvl 50");
    const closed = await boot({ branch: [entry(ep), entry({ ...ep, closed: 5, closeReason: "judged" })] });
    expect(closed.widgets["tutor"]?.[0]).toBe("tutor  lvl 50");
  });

  it("/tutor-level into pro moves an open episode's band and persists it", async () => {
    const { events, commands, ctx, entries, widgets } = await boot();
    for (let i = 0; i < 3; i++) await turn(events, ctx, REASONED, judged("correct"));
    await commands["tutor-level"].handler("90", ctx);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 90");
    expect(episodes(entries).at(-1)).toMatchObject({ band: "pro", attempts: 0 });
  });

  it("tool_call blocks bash and paths outside ctx.cwd, allows reads inside", async () => {
    const { events, ctx } = await boot();
    const call = (toolName: string, input: unknown) => events["tool_call"]({ type: "tool_call", toolCallId: "1", toolName, input }, ctx);
    expect(await call("read", { path: "/etc/passwd" })).toMatchObject({ block: true });
    expect(await call("bash", { command: "ls" })).toMatchObject({ block: true });
    expect(await call("read", { path: "a.py" })).toBeUndefined();
  });
});

describe("M4 profile and /tutor-start", () => {
  it("registers /tutor-start", async () => {
    const { commands } = await boot();
    expect(Object.keys(commands)).toContain("tutor-start");
  });

  it("/tutor-start without a model says so and does nothing", async () => {
    const b = await boot();
    (b.ctx as { model?: unknown }).model = undefined;
    await b.commands["tutor-start"].handler("python", b.ctx);
    expect(b.notes.at(-1)).toMatch(/no model/i);
  });

  it("a scaffolded project's language and level come from the profile; /tutor-level writes back; closed episodes are recorded", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { Profile } = await import("../extensions/tutor/profile.js");
    const dir = mkdtempSync(join(tmpdir(), "pitutor-proj-"));
    const file = join(dir, "profile.sqlite");
    const seed = Profile.open(file);
    seed.saveLanguage("rust", 20, {}, 1);
    seed.addProject("rust", dir, "Todo CLI", 1);
    seed.close();
    const saved = process.env.PI_TUTOR_PROFILE;
    process.env.PI_TUTOR_PROFILE = file;
    try {
      const b = await boot({ cwd: dir });
      expect(b.widgets["tutor"]?.[0]).toBe("tutor  rust · lvl 20");
      await turn(b.events, b.ctx, REASONED, assistant('ok\n```tutor-judgment\n{"judgment":"correct","concept_tags":["traits"],"episode_closed":true}\n```'));
      await b.commands["tutor-level"].handler("70", b.ctx);
      await b.events["session_shutdown"]({ type: "session_shutdown" }, b.ctx);
      const check = Profile.open(file);
      expect(check.language("rust")?.level).toBe(70);
      // spec 2026-10-21 §11a: no failed attempt → rungs_used (attempts + 1) is 1 and the ease sample is 1
      expect(check.episodes("rust")).toEqual([expect.objectContaining({ project: dir, concept_tags: ["traits"], turns: 1, rungs_used: 1 })]);
      expect(check.concepts("rust")).toEqual([{ language: "rust", tag: "traits", ease: 1, episodes: 1 }]);
      check.close();
    } finally { if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved; }
  });

  it("keeps working without a profile when the profile file is from a newer pi-tutor", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { DatabaseSync } = await import("node:sqlite");
    const { Profile, SCHEMA_VERSION } = await import("../extensions/tutor/profile.js");
    const file = join(mkdtempSync(join(tmpdir(), "pitutor-newer-")), "p.sqlite");
    Profile.open(file).close();
    const db = new DatabaseSync(file); db.prepare("UPDATE schema_version SET v = ?").run(SCHEMA_VERSION + 1); db.close();
    const saved = process.env.PI_TUTOR_PROFILE;
    process.env.PI_TUTOR_PROFILE = file;
    try {
      const b = await boot();
      expect(b.notes.some((n) => /newer/.test(n))).toBe(true);
      expect(b.widgets["tutor"]?.[0]).toBe("tutor  lvl 50");
      await b.commands["tutor-start"].handler("python", b.ctx);
      expect(b.notes.at(-1)).toMatch(/profile/i);
    } finally { if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved; }
  });
});

describe("M4 review fixes", () => {
  it("a locked or failing profile never throws out of an episode close or /tutor-level (final review I4)", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { DatabaseSync } = await import("node:sqlite");
    const { Profile } = await import("../extensions/tutor/profile.js");
    const dir = mkdtempSync(join(tmpdir(), "pitutor-locked-"));
    const file = join(dir, "profile.sqlite");
    const seed = Profile.open(file);
    seed.saveLanguage("rust", 50, {}, 1);
    seed.addProject("rust", dir, "Todo", 1);
    seed.close();
    const saved = process.env.PI_TUTOR_PROFILE;
    process.env.PI_TUTOR_PROFILE = file;
    const other = new DatabaseSync(file);
    try {
      const b = await boot({ cwd: dir });
      other.exec("BEGIN EXCLUSIVE"); // another tutor holds the write lock past the busy timeout
      await b.events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: REASONED, systemPromptOptions: { sections: {} } }, b.ctx);
      await expect(b.events["turn_end"]({ type: "turn_end", message: judged("correct", true) }, b.ctx)).resolves.toBeUndefined();
      expect(b.widgets["tutor"]?.[1]).toMatch(/outside nvim|episode closed/); // the episode still closed
      await expect(b.commands["tutor-level"].handler("70", b.ctx)).resolves.toBeUndefined();
      expect(b.notes.some((n) => /profile write failed/.test(n))).toBe(true);
    } finally {
      other.exec("ROLLBACK"); other.close();
      if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved;
    }
  }, 15000);
});

describe("M5 skill reads", () => {
  it("tool_call lets the model read a skill Pi loaded, outside the project", async () => {
    const b = await boot();
    b.skills.push({ path: "/home/u/.pi/agent/skills/tutor-rust-style/SKILL.md" });
    const call = (path: string) => b.events["tool_call"]({ type: "tool_call", toolCallId: "1", toolName: "read", input: { path } }, b.ctx);
    expect(await call("/home/u/.pi/agent/skills/tutor-rust-style/SKILL.md")).toBeUndefined();
    expect(await call("/home/u/.pi/agent/skills/tutor-rust-style/references/1-naming.md")).toBeUndefined();
    expect(await call("/home/u/.pi/agent/auth.json")).toMatchObject({ block: true });
  });
});

describe("M5 /tutor-learn", () => {
  const closedEp = { id: "ep-1", trigger: { kind: "error", path: "/p/main.rs", line: 4, msg: "borrow of moved value" }, band: "beginner", attempts: 3, opened: 1, turns: 2, concept_tags: ["ownership"], closed: 5, closeReason: "judged" };
  const branch = [
    { type: "custom", customType: "tutor_episode", data: closedEp },
    { type: "message", message: { role: "user", content: "why is s moved?" } },
  ];
  const draft = JSON.stringify({ slug: "moved-string", description: "Moving a String into a call. Use when the learner sees borrow of moved value.", body: "## Fix\nBorrow with &s." });

  it("drafts from the last closed episode, shows the editor, saves the accepted text, reloads Pi", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const b = await boot({ branch });
    b.replies.push(draft);
    await b.commands["tutor-learn"].handler("", b.ctx);
    expect(b.editorSeen[0]).toContain("name: tutor-general-learned-moved-string");
    const file = join(process.env.PI_CODING_AGENT_DIR!, "skills", "tutor-general-learned-moved-string", "SKILL.md");
    expect(readFileSync(file, "utf8")).toBe(b.editorSeen[0]);
    expect(b.reloads.n).toBe(1);
    expect(b.notes.at(-1)).toMatch(/saved .*tutor-general-learned-moved-string/);
  });

  it("Esc in the editor discards: nothing written, no reload", async () => {
    const b = await boot({ branch });
    b.replies.push(JSON.stringify({ slug: "discarded-one", description: "x.", body: "y" }));
    b.edits.push(undefined);
    await b.commands["tutor-learn"].handler("", b.ctx);
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    expect(existsSync(join(process.env.PI_CODING_AGENT_DIR!, "skills", "tutor-general-learned-discarded-one"))).toBe(false);
    expect(b.reloads.n).toBe(0);
    expect(b.notes.at(-1)).toMatch(/discarded/);
  });

  it("an edit that breaks the frontmatter is refused with the reason", async () => {
    const b = await boot({ branch });
    b.replies.push(draft);
    b.edits.push("---\nname: Not Valid\ndescription: x\n---\n");
    await b.commands["tutor-learn"].handler("", b.ctx);
    expect(b.notes.at(-1)).toMatch(/not saved: .*name/);
    expect(b.reloads.n).toBe(0);
  });

  it("says so when there is no finished episode yet", async () => {
    const b = await boot();
    await b.commands["tutor-learn"].handler("", b.ctx);
    expect(b.notes.at(-1)).toMatch(/no finished stuck episode/);
  });
});

describe("M5 ease: well-known concepts get help one attempt later (spec 2026-10-21 §11a)", () => {
  it("a first judgment on concepts with ease ≥ 0.7 sets the episode's delay", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { Profile } = await import("../extensions/tutor/profile.js");
    const dir = mkdtempSync(join(tmpdir(), "pitutor-ease-"));
    const file = join(dir, "p.sqlite");
    const seed = Profile.open(file);
    seed.saveLanguage("rust", 20, {}, 1);
    seed.addProject("rust", dir, "T", 1);
    seed.recordEpisode({ language: "rust", project: dir, concept_tags: ["traits"], rungs_used: 1, turns: 1, opened: 1, closed: 2 }, 0.9);
    seed.close();
    const saved = process.env.PI_TUTOR_PROFILE;
    process.env.PI_TUTOR_PROFILE = file;
    try {
      const b = await boot({ cwd: dir });
      await b.events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: "q", systemPromptOptions: { sections: {} } }, b.ctx);
      expect(episodes(b.entries).at(-1)?.delay).toBeUndefined();
      await b.events["turn_end"]({ type: "turn_end", message: assistant('hm\n```tutor-judgment\n{"judgment":"wrong","concept_tags":["traits"]}\n```') }, b.ctx);
      expect(episodes(b.entries).at(-1)).toMatchObject({ delay: 1, attempts: 0 });
    } finally { if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved; }
  });
});

describe("M5-finish /tutor-docs and /tutor-start (DevDocs)", () => {
  async function mirror() {
    const { createServer } = await import("node:http");
    const catalog = [{ name: "Python", slug: "python~3.14", type: "python", version: "3.14", release: "3.14.8", mtime: 7, db_size: 1, attribution: "&copy; PSF" }];
    const server = createServer((req, res) => {
      const u = (req.url ?? "").split("?")[0];
      if (u === "/docs.json") return res.end(JSON.stringify(catalog));
      if (u === "/python~3.14/index.json") return res.end(JSON.stringify({ entries: [{ name: "len", path: "library/functions#len", type: "Built-in" }], types: [{ name: "Built-in", count: 1, slug: "b" }] }));
      if (u === "/python~3.14/db.json") return res.end(JSON.stringify({ "library/functions": '<h1>Built-in</h1><p id="len">len(s)</p>' }));
      res.statusCode = 404; res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    return { server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
  }

  /** The conversation to the point where the project folder is made (spec 2026-10-19 §5), answers scripted. */
  async function toProject(b: Awaited<ReturnType<typeof boot>>, lang: string, folder: string) {
    const run = async (text: string) => { await turn(b.events, b.ctx, "[tutor] onboarding", assistant(text)); await b.events["agent_end"]({ type: "agent_end", messages: [] }, b.ctx); await new Promise((r) => setTimeout(r, 20)); };
    await b.commands["tutor-start"].handler(lang, b.ctx);
    await run("hi");
    b.script.push("none yet", "", "3", "");          // fallback: experience, known, self-score, idea
    await run("hello");
    b.replies.push(JSON.stringify({ projects: [{ title: "P1", summary: "s.", size: "small", concepts: [] }] }));
    await run("my read");                             // read confirmed → one project
    b.script.push("Start this project", folder);
    await run("how about P1?");
  }

  it("/tutor-docs detects the installed version, writes tutor-python-ref, reloads Pi", async () => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { server, base } = await mirror();
    const saved = process.env.PI_TUTOR_DEVDOCS;
    process.env.PI_TUTOR_DEVDOCS = base;
    try {
      const b = await boot();
      b.execOut["python3"] = { stdout: "Python 3.14.8\n", stderr: "", code: 0 };
      await b.commands["tutor-docs"].handler("python", b.ctx);
      expect(existsSync(join(process.env.PI_CODING_AGENT_DIR!, "skills", "tutor-python-ref", "INDEX.md"))).toBe(true);
      expect(b.notes.at(-1)).toMatch(/python docs: tutor-python-ref \(3\.14\.8, 1 entries\)/);
      expect(b.reloads.n).toBe(1);
    } finally { process.env.PI_TUTOR_DEVDOCS = saved; server.close(); }
  });

  it("/tutor-start offline with docs on disk says it could not check, not 'already current' (M6c M4)", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { server, base } = await mirror();
    const saved = process.env.PI_TUTOR_DEVDOCS;
    process.env.PI_TUTOR_DEVDOCS = base;
    try {
      const root = mkdtempSync(join(tmpdir(), "pitutor-offdocs-"));
      const b = await boot({ cwd: root });
      b.execOut["python3"] = { stdout: "Python 3.14.8\n", stderr: "", code: 0 };
      await b.commands["tutor-docs"].handler("python", b.ctx); // docs on disk
      process.env.PI_TUTOR_DEVDOCS = "http://127.0.0.1:9"; // refused: offline
      await toProject(b, "python", join(root, "p1"));
      const docs = b.notes.filter((n) => /^python docs/.test(n));
      expect(docs.at(-1)).toMatch(/offline.*docs on disk/);
      expect(b.notes.some((n) => /already current/.test(n))).toBe(false);
    } finally { process.env.PI_TUTOR_DEVDOCS = saved; server.close(); }
  });
  it("/tutor-docs for a language without DevDocs support says the tutor relies on model knowledge", async () => {
    const b = await boot();
    await b.commands["tutor-docs"].handler("cobol", b.ctx);
    expect(b.notes.at(-1)).toMatch(/no cached docs for cobol/);
    expect(b.reloads.n).toBe(0);
  });

  it("/tutor-start fetches docs before switching; an unreachable DevDocs only warns", async () => {
    const { mkdtempSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "pitutor-startdocs-"));
    const b = await boot({ cwd: root });
    await toProject(b, "go", join(root, "p1"));
    expect(existsSync(join(root, "p1", "README.md"))).toBe(true);
    expect(b.notes.some((n) => /go docs fetch failed/.test(n))).toBe(true);
    expect(b.notes.at(-1)).toContain(`cd ${join(root, "p1")} && pi`);
  });

  it("a Lua project gets a .luarc.json naming the installed Lua (author 2026-10-21)", async () => {
    const { mkdtempSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "pitutor-luarc-"));
    const b = await boot({ cwd: root });
    b.execOut["lua"] = { stdout: "Lua 5.5.1  Copyright (C) 1994-2025 Lua.org, PUC-Rio\n", stderr: "", code: 0 };
    await toProject(b, "lua", join(root, "p1"));
    expect(JSON.parse(readFileSync(join(root, "p1", ".luarc.json"), "utf8"))["runtime.version"]).toBe("Lua 5.5");
  });
});

describe("one judgment per run", () => {
  it("a tool-call judgment followed by a fenced one is applied once", async () => {
    const b = await boot();
    const call = { role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall", id: "1", name: "tutor-judgment", arguments: { judgment: "correct", concept_tags: ["loops"] } }] };
    await turn(b.events, b.ctx, REASONED, call, judged("correct"));
    const eps = episodes(b.entries);
    expect(eps.at(-1)?.turns).toBe(1);
    expect(b.entries.filter((e) => e.type === "tutor_judgment")).toHaveLength(1);
  });
  it("a turn_end without a before_agent_start still applies (Pi always sends one; defensive)", async () => {
    const b = await boot();
    await b.events["turn_end"]({ type: "turn_end", message: judged("none") }, b.ctx);
    expect(b.entries.some((e) => e.type === "tutor_judgment")).toBe(true);
  });
});

describe("compliance in the turn loop", () => {
  it("a correct judgment on a bare question is read as none and moves nothing", async () => {
    const b = await boot();
    await turn(b.events, b.ctx, "what does KeyError mean?", judged("correct"));
    expect(episodes(b.entries).at(-1)?.attempts).toBe(0);
    expect(b.entries.filter((e) => e.type === "tutor_judgment").at(-1)?.data).toMatchObject({ judgment: "none" });
  });
  it("records rule breaks and quotes them to the model on the next turn", async () => {
    const b = await boot();
    await turn(b.events, b.ctx, "hi", assistant("Some prose.\n```\n" + "x".repeat(60) + "\n```"));
    const check = b.entries.filter((e) => e.type === "tutor_check").at(-1)?.data as { issues: string[] };
    expect(check.issues).toEqual(expect.arrayContaining(["missing-judgment", "wide-diagram"]));
    const next = await turn(b.events, b.ctx, "ok", judged("none"));
    expect(next.message?.content).toContain("[tutor-check]");
    const after = await turn(b.events, b.ctx, "ok", judged("none"));
    expect(after.message?.content).not.toContain("[tutor-check]"); // a clean reply clears it
  });
});

describe("style guards: internals reworded, diagrams checked at the real pane width", () => {
  const reply = "At rung 1, see `skills/tutor-python-ref/INDEX.md:12`.\n```tutor-judgment\n{\"judgment\":\"none\"}\n```";
  it("message_end rewrites the tutor's machinery in the reply that is saved, judged and checked", async () => {
    const b = await boot();
    const m = assistant(reply);
    await turn(b.events, b.ctx, "what is a dict?", m);
    expect((m.content[0] as { text: string }).text).toBe("See the language reference.\n```tutor-judgment\n{\"judgment\":\"none\"}\n```");
    expect(b.entries.filter((e) => e.type === "tutor_judgment").at(-1)?.data).toMatchObject({ judgment: "none" }); // the fence survives
    expect(b.entries.some((e) => e.type === "tutor_check")).toBe(false);
  });
  it("message_end leaves clean replies, tool calls and other roles alone", async () => {
    const b = await boot();
    const end = (message: unknown) => b.events["message_end"]({ type: "message_end", message }, b.ctx);
    expect(await end(assistant("The index of a list starts at 0."))).toBeUndefined();
    expect(await end({ role: "user", content: "At rung 1 INDEX.md" })).toBeUndefined();
    const call = { role: "assistant", stopReason: "toolUse", content: [{ type: "text", text: "Reading INDEX.md now." }, { type: "toolCall", id: "1", name: "read", arguments: { path: "INDEX.md" } }] };
    const r = (await end(call)) as { message: typeof call };
    expect(r.message.content).toEqual([{ type: "text", text: "Reading the language reference now." }, call.content[1]]);
    expect(r.message.role).toBe("assistant");
  });
  it("the screen shows the reworded reply while it streams; learner text is untouched", async () => {
    const b = await boot();
    const [t] = b.transformers;
    expect(t("At rung 2, read INDEX.md", { messageType: "assistant", isStreaming: true, availableWidth: 68 })).toBe("Read the language reference");
    expect(t("rung 2 INDEX.md", { messageType: "user", isStreaming: false, availableWidth: 68 })).toBe("rung 2 INDEX.md");
  });
  it("a diagram that fits the rendered pane is not a break; the note names the pane width", async () => {
    const b = await boot();
    const [t] = b.transformers;
    const diagram = (n: number) => judged("none").content[0].text + "\n```\n" + "x".repeat(n) + "\n```";
    t("hi", { messageType: "assistant", isStreaming: false, availableWidth: 68 });
    await turn(b.events, b.ctx, "hi", assistant(diagram(60)));
    expect(b.entries.some((e) => e.type === "tutor_check")).toBe(false);
    await turn(b.events, b.ctx, "hi", assistant(diagram(67)));
    expect(b.entries.filter((e) => e.type === "tutor_check").at(-1)?.data).toEqual({ issues: ["wide-diagram"] });
    const next = await turn(b.events, b.ctx, "ok", judged("none"));
    expect(next.message?.content).toContain("(66 characters)");
  });
});

describe("roles in the turn loop", () => {
  it("/tutor-architect switches the prompt, records tutor_role, and off switches back", async () => {
    const b = await boot();
    await b.commands["tutor-architect"].handler("", b.ctx);
    expect(b.entries.at(-1)).toEqual({ type: "tutor_role", data: { role: "architect" } });
    const opts = await turn(b.events, b.ctx, "how should I split modules?", judged("none"));
    expect(opts.sections["tutor"]).toContain("# Role: architecture professor");
    expect(opts.sections["tutor"]).not.toContain("## Hint ladder");
    expect(b.widgets["tutor"]?.[0]).toContain("architect");
    await b.commands["tutor-architect"].handler("off", b.ctx);
    const back = await turn(b.events, b.ctx, "hi", judged("none"));
    expect(back.sections["tutor"]).toContain("# Role: coding tutor");
    expect(back.sections["tutor"]).toContain("## Hint ladder");
  });
  it("with a question, the TUI sends it as the learner's message; without a UI it only switches", async () => {
    const b = await boot();
    await b.commands["tutor-architect"].handler("how do layers talk?", b.ctx);
    expect(b.sent.at(-1)?.text).toBe("how do layers talk?");
    const n = b.sent.length;
    await b.commands["tutor-architect"].handler("another?", { ...b.ctx, hasUI: false });
    expect(b.sent.length).toBe(n);
  });
  it("architect turns leave the episode alone and never open one", async () => {
    const b = await boot();
    await turn(b.events, b.ctx, REASONED, judged("none")); // opens a chat episode
    const before = episodes(b.entries).length;
    await b.commands["tutor-architect"].handler("", b.ctx);
    const opts = await turn(b.events, b.ctx, REASONED, judged("correct", true));
    expect(episodes(b.entries).length).toBe(before);
    expect(opts.message?.content ?? "").not.toContain("[episode]");
  });
  it("architect replies may not hold code blocks", async () => {
    const b = await boot();
    await b.commands["tutor-architect"].handler("", b.ctx);
    await turn(b.events, b.ctx, "how do I split it?", assistant("```python\nimport x\n```\n```tutor-judgment\n{\"judgment\":\"none\"}\n```"));
    expect(b.entries.filter((e) => e.type === "tutor_check").at(-1)?.data).toEqual({ issues: ["code-above-rung"] });
  });
  it("restores the role from the branch", async () => {
    const b = await boot({ branch: [{ type: "custom", customType: "tutor_role", data: { role: "architect" } }] });
    const opts = await turn(b.events, b.ctx, "hi", judged("none"));
    expect(opts.sections["tutor"]).toContain("# Role: architecture professor");
  });
});

describe("/tutor-plan", () => {
  const project = () => {
    const dir = mkd(pjoin(tmp(), "plan-"));
    mkdir(pjoin(dir, "spec"));
    wfile(pjoin(dir, "spec", "tasks.md"), "- [ ] P1.T1 Parse argv into a Command\n");
    return dir;
  };
  it("starts the workflow, shows plan 1/6, kicks off with a [tutor] message, and carries [workflow] context", async () => {
    const b = await boot({ cwd: project() });
    await b.commands["tutor-plan"].handler("P1.T1", b.ctx);
    expect(b.entries.find((e) => e.type === "tutor_workflow")?.data).toMatchObject({ task: "P1.T1", step: 1 });
    expect(b.widgets["tutor"]?.[0]).toContain("plan 1/6");
    expect(b.sent.at(-1)?.text).toMatch(/^\[tutor\] design recipe started for P1\.T1: Parse argv into a Command\. Begin step 1 \(Find\)\.$/);
    const opts = await turn(b.events, b.ctx, "[tutor] design recipe started for P1.T1", judged("none"));
    expect(opts.message?.content).toMatch(/\[workflow\] design recipe for P1\.T1: step 1\/6 Find/);
  });
  it("without a UI it starts the workflow but sends no turn", async () => {
    const b = await boot({ cwd: project() });
    await b.commands["tutor-plan"].handler("P1.T1", { ...b.ctx, hasUI: false });
    expect(b.entries.some((e) => e.type === "tutor_workflow")).toBe(true);
    expect(b.sent).toHaveLength(0);
  });
  it("step_done from the learner advances; from a [tutor] nudge it does not", async () => {
    const b = await boot({ cwd: project() });
    await b.commands["tutor-plan"].handler("P1.T1", b.ctx);
    const done = assistant('ok\n```tutor-judgment\n{"judgment":"none","step_done":true}\n```');
    await turn(b.events, b.ctx, "[tutor] design recipe started for P1.T1", done);
    expect(b.widgets["tutor"]?.[0]).toContain("plan 1/6");
    await turn(b.events, b.ctx, "the task is P1.T1 and it feeds main", done);
    expect(b.widgets["tutor"]?.[0]).toContain("plan 2/6");
    expect(b.entries.filter((e) => e.type === "tutor_workflow").at(-1)?.data).toMatchObject({ step: 2 });
  });
  it("finishing Build ends the workflow and clears the widget label", async () => {
    const b = await boot({ cwd: project(), branch: [{ type: "custom", customType: "tutor_workflow", data: { task: "P1.T1", step: 6, started: 1 } }] });
    await turn(b.events, b.ctx, "it runs and matches all three examples", assistant('ok\n```tutor-judgment\n{"judgment":"none","step_done":true}\n```'));
    expect(b.entries.filter((e) => e.type === "tutor_workflow").at(-1)?.data).toMatchObject({ step: 6, done: expect.any(Number) });
    expect(b.widgets["tutor"]?.[0]).not.toContain("plan");
    expect(b.notes.join("\n")).toMatch(/design recipe for P1\.T1 finished/);
  });
  it("warns and does nothing for a bad id, an unknown id, or no spec/tasks.md", async () => {
    const b = await boot({ cwd: project() });
    await b.commands["tutor-plan"].handler("", b.ctx);
    await b.commands["tutor-plan"].handler("P1.T9", b.ctx);
    const empty = await boot({ cwd: mkd(pjoin(tmp(), "plan-")) });
    await empty.commands["tutor-plan"].handler("P1.T1", empty.ctx);
    expect(b.entries.some((e) => e.type === "tutor_workflow")).toBe(false);
    expect(empty.entries.some((e) => e.type === "tutor_workflow")).toBe(false);
    expect(b.sent).toHaveLength(0);
    expect(b.notes.join("\n")).toMatch(/usage: \/tutor-plan/);
    expect(b.notes.join("\n")).toMatch(/P1\.T9 is not in spec\/tasks\.md/);
    expect(empty.notes.join("\n")).toMatch(/no spec\/tasks\.md/);
  });
  it("switches back from the architect, and restores an unfinished workflow on resume", async () => {
    const b = await boot({ cwd: project() });
    await b.commands["tutor-architect"].handler("", b.ctx);
    await b.commands["tutor-plan"].handler("P1.T1", b.ctx);
    expect(b.entries.filter((e) => e.type === "tutor_role").at(-1)?.data).toEqual({ role: "coding-tutor" });
    const r = await boot({ branch: [{ type: "custom", customType: "tutor_workflow", data: { task: "P1.T1", step: 4, started: 1 } }] });
    expect(r.widgets["tutor"]?.[0]).toContain("plan 4/6");
  });
});

describe("per-turn reply reminder (golden round 1: 3 of 5 replies dropped the judgment)", () => {
  it("every turn's hidden context ends with the reminder, even with nothing else to say", async () => {
    const { replyReminder } = await import("../extensions/tutor/compliance.js");
    const b = await boot();
    await b.commands["tutor-architect"].handler("", b.ctx); // no episode context for the architect
    const opts = await turn(b.events, b.ctx, "how should I split modules?", judged("none"));
    expect(opts.message?.content).toBe(replyReminder(null));
    await b.commands["tutor-architect"].handler("off", b.ctx);
    const tutor = await turn(b.events, b.ctx, "hi", judged("none"));
    expect(tutor.message?.content.startsWith("[episode]")).toBe(true);
    expect(tutor.message?.content.endsWith(replyReminder("teach"))).toBe(true);
  });
});

describe("/tutor-plan next (live check: the model called step 4 complete but never set step_done)", () => {
  const project = () => {
    const dir = mkd(pjoin(tmp(), "plan-"));
    mkdir(pjoin(dir, "spec"));
    wfile(pjoin(dir, "spec", "tasks.md"), "- [ ] P1.T1 Parse argv into a Command\n");
    return dir;
  };
  it("the learner moves the workflow on one step and the tutor is told which step is next", async () => {
    const b = await boot({ cwd: project(), branch: [{ type: "custom", customType: "tutor_workflow", data: { task: "P1.T1", step: 4, started: 1 } }] });
    await b.commands["tutor-plan"].handler("next", b.ctx);
    expect(b.widgets["tutor"]?.[0]).toContain("plan 5/6");
    expect(b.entries.filter((e) => e.type === "tutor_workflow").at(-1)?.data).toMatchObject({ step: 5 });
    expect(b.sent.at(-1)?.text).toBe("[tutor] the learner moved on to step 5 (Map) of the design recipe for P1.T1.");
  });
  it("next after Build finishes the workflow; without a workflow it says so", async () => {
    const b = await boot({ cwd: project(), branch: [{ type: "custom", customType: "tutor_workflow", data: { task: "P1.T1", step: 6, started: 1 } }] });
    await b.commands["tutor-plan"].handler("next", b.ctx);
    expect(b.widgets["tutor"]?.[0]).not.toContain("plan");
    expect(b.notes.join("\n")).toMatch(/design recipe for P1\.T1 finished/);
    await b.commands["tutor-plan"].handler("next", b.ctx);
    expect(b.notes.at(-1)).toMatch(/no design recipe in progress/);
  });
});

describe("judgment written before a tool call (live check: block in a tool-use turn, none in the final reply)", () => {
  it("is taken from the tool-use turn's text, once per run", async () => {
    const b = await boot();
    const mid = { role: "assistant", stopReason: "toolUse", content: [
      { type: "text", text: "Let me look.\n```tutor-judgment\n{\"judgment\":\"partial\",\"concept_tags\":[\"argv\"]}\n```" },
      { type: "toolCall", id: "1", name: "read", arguments: { path: "todo.py" } },
    ] };
    await turn(b.events, b.ctx, REASONED, mid, assistant("**In short**: look at line 9."));
    const js = b.entries.filter((e) => e.type === "tutor_judgment");
    expect(js).toHaveLength(1);
    expect(js[0].data).toMatchObject({ judgment: "partial", concept_tags: ["argv"] });
    const issues = (b.entries.filter((e) => e.type === "tutor_check").at(-1)?.data as { issues: string[] } | undefined)?.issues ?? [];
    expect(issues).not.toContain("missing-judgment");
  });
});

describe("final review fixes (workflow)", () => {
  const project = () => {
    const dir = mkd(pjoin(tmp(), "plan-"));
    mkdir(pjoin(dir, "spec"));
    wfile(pjoin(dir, "spec", "tasks.md"), "- [ ] P1.T1 Parse argv into a Command\n");
    return dir;
  };
  const stepDone = (judgment: string) => assistant('ok\n```tutor-judgment\n{"judgment":"' + judgment + '","step_done":true}\n```');
  it("I2: correct step answers move the recipe on and never move help (only graded tries do)", async () => {
    const b = await boot({ cwd: project() });
    await b.commands["tutor-plan"].handler("P1.T1", b.ctx);
    for (let i = 0; i < 3; i++) await turn(b.events, b.ctx, REASONED, stepDone("correct"));
    expect(b.widgets["tutor"]?.[0]).toContain("plan 4/6");
    expect(b.widgets["tutor"]?.[0]).not.toContain("try");
    expect(episodes(b.entries).at(-1)).toMatchObject({ attempts: 0 });
  });
  it("I4: /tutor-plan off ends the recipe; the context and widget label go away and stay away on resume", async () => {
    const b = await boot({ cwd: project() });
    await b.commands["tutor-plan"].handler("P1.T1", b.ctx);
    const n = b.sent.length;
    await b.commands["tutor-plan"].handler("off", b.ctx);
    expect(b.widgets["tutor"]?.[0]).not.toContain("plan");
    expect(b.sent.length).toBe(n);
    const last = b.entries.filter((e) => e.type === "tutor_workflow").at(-1);
    expect(last?.data).toMatchObject({ task: "P1.T1", done: expect.any(Number) });
    const opts = await turn(b.events, b.ctx, "hi", judged("none"));
    expect(opts.message?.content).not.toContain("[workflow]");
    const r = await boot({ branch: [{ type: "custom", customType: "tutor_workflow", data: last?.data }] });
    expect(r.widgets["tutor"]?.[0]).not.toContain("plan");
    await r.commands["tutor-plan"].handler("off", r.ctx);
    expect(r.notes.at(-1)).toMatch(/no design recipe in progress/);
  });
});

describe("tutor memory in the extension (spec 2026-10-13 §7.1)", () => {
  it("registers both tools; a saved memory shows in the next session's frozen tutor_memory section", async () => {
    const file = pjoin(mkd(pjoin(tmp(), "pitutor-mem-")), "profile.sqlite");
    const saved = process.env.PI_TUTOR_PROFILE;
    process.env.PI_TUTOR_PROFILE = file;
    try {
      const a = await boot();
      expect(Object.keys(a.tools).sort()).toEqual(["tutor_recall", "tutor_remember"]);
      await a.tools["tutor_remember"].execute("1", { type: "learner", text: "learns best from Rust comparisons" });
      const same = await turn(a.events, a.ctx, "hi", judged("none"));
      expect(same.sections["tutor_memory"]).toBeUndefined(); // frozen: this session started empty
      await a.events["session_shutdown"]({ type: "session_shutdown" }, a.ctx);
      const b = await boot();
      const next = await turn(b.events, b.ctx, "hi", judged("none"));
      expect(next.sections["tutor_memory"]).toContain("- [learner] learns best from Rust comparisons");
      await b.events["session_shutdown"]({ type: "session_shutdown" }, b.ctx);
    } finally {
      if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved;
    }
  });
  it("/tutor-memory lists memories and forgets the one the learner picks", async () => {
    const b = await boot();
    await b.tools["tutor_remember"].execute("1", { type: "learner", text: "likes diagrams" });
    await b.tools["tutor_remember"].execute("2", { type: "project", text: "uses pytest" });
    b.script.push("#1 [learner] likes diagrams", "Forget it");
    await b.commands["tutor-memory"].handler("", b.ctx);
    expect(b.notes.at(-1)).toBe("forgot memory #1");
    b.script.push(undefined);
    await b.commands["tutor-memory"].handler("", b.ctx);
    const left = await b.tools["tutor_recall"].execute("3", { query: "diagrams pytest" }) as { content: { text: string }[] };
    expect(left.content[0].text).toBe("#2 [project] uses pytest");
  });
});

describe("/tutor-feedback in the extension", () => {
  it("logs to the profile in a project, slows help for too-much-help, and notes the style next turn", async () => {
    const dir = mkd(pjoin(tmp(), "pitutor-fb-"));
    const file = pjoin(dir, "profile.sqlite");
    const { Profile } = await import("../extensions/tutor/profile.js");
    const seed = Profile.open(file); seed.saveLanguage("python", 50, {}, 1); seed.addProject("python", dir, "p", 1); seed.close();
    const saved = process.env.PI_TUTOR_PROFILE; process.env.PI_TUTOR_PROFILE = file;
    try {
      const b = await boot({ cwd: dir });
      await turn(b.events, b.ctx, REASONED, judged("correct")); // chat episode
      await b.commands["tutor-feedback"].handler("too-much-help", b.ctx);
      expect(episodes(b.entries).at(-1)).toMatchObject({ delay: 1, attempts: 0 });
      await b.commands["tutor-feedback"].handler("too-long", b.ctx);
      const next = await turn(b.events, b.ctx, "hi", judged("none"));
      expect(next.message?.content).toMatch(/\[tutor-feedback\][\s\S]*too long/);
      await b.events["session_shutdown"]({ type: "session_shutdown" }, b.ctx);
      const check = Profile.open(file);
      // the profile's rung column holds the attempt count now (spec 2026-10-21 §11a)
      expect(check.feedback("python").map((f) => [f.kind, f.rung])).toEqual([["too-much-help", 0], ["too-long", 0]]);
      check.close();
      const again = await boot({ cwd: dir }); // a new session in the same project keeps the note
      const t = await turn(again.events, again.ctx, "hi", judged("none"));
      expect(t.message?.content).toMatch(/too long/);
      await again.commands["tutor-feedback"].handler("good", again.ctx);
      const cleared = await turn(again.events, again.ctx, "hi", judged("none"));
      expect(cleared.message?.content ?? "").not.toContain("[tutor-feedback]");
      await again.events["session_shutdown"]({ type: "session_shutdown" }, again.ctx);
    } finally {
      if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved;
    }
  });
  it("/tutor-feedback edge cases: bad kind warns; no episode or architect role logs without changing help", async () => {
    const b = await boot();
    await b.commands["tutor-feedback"].handler("meh", b.ctx);
    expect(b.notes.at(-1)).toMatch(/usage: \/tutor-feedback too-long\|too-vague\|too-much-help\|good/);
    await b.commands["tutor-feedback"].handler("too-vague", b.ctx); // no episode open
    expect(b.entries.filter((e) => e.type === "tutor_feedback").at(-1)?.data).toMatchObject({ kind: "too-vague" });
    await turn(b.events, b.ctx, REASONED, judged("none"));
    const before = episodes(b.entries).length;
    await b.commands["tutor-architect"].handler("", b.ctx);
    await b.commands["tutor-feedback"].handler("too-much-help", b.ctx);
    expect(episodes(b.entries).length).toBe(before);
  });
});

describe("M6a minors in the turn loop", () => {
  it("turns that stop for any reason other than stop or toolUse carry no judgment", async () => {
    const b = await boot();
    for (const stop of ["pending", "deferred"]) await turn(b.events, b.ctx, REASONED, judged("correct", false, stop));
    expect(b.entries.some((e) => e.type === "tutor_judgment")).toBe(false);
  });
  it("the architect role suspends an active recipe: no [workflow] context, no step_done, no recipe hold", async () => {
    const dir = mkd(pjoin(tmp(), "plan-")); mkdir(pjoin(dir, "spec"));
    wfile(pjoin(dir, "spec", "tasks.md"), "- [ ] P1.T1 Parse argv\n");
    const b = await boot({ cwd: dir });
    await b.commands["tutor-plan"].handler("P1.T1", b.ctx);
    await b.commands["tutor-architect"].handler("", b.ctx);
    const opts = await turn(b.events, b.ctx, REASONED, assistant('ok\n```tutor-judgment\n{"judgment":"none","step_done":true}\n```'));
    expect(opts.message?.content ?? "").not.toContain("[workflow]");
    expect(opts.message?.content ?? "").not.toContain("During the design recipe");
    expect(b.entries.filter((e) => e.type === "tutor_workflow").at(-1)?.data).toMatchObject({ step: 1 });
    await b.commands["tutor-architect"].handler("off", b.ctx);
    const back = await turn(b.events, b.ctx, "hi", judged("none"));
    expect(back.message?.content).toContain("[workflow]");
  });
});

describe("final review I3: forgetting takes effect at once", () => {
  it("after /tutor-memory forgets a memory, the next turn's tutor_memory section no longer has it", async () => {
    const file = pjoin(mkd(pjoin(tmp(), "pitutor-forget-")), "profile.sqlite");
    const saved = process.env.PI_TUTOR_PROFILE;
    process.env.PI_TUTOR_PROFILE = file;
    try {
      const a = await boot();
      await a.tools["tutor_remember"].execute("1", { type: "learner", text: "knows Go well" });
      await a.tools["tutor_remember"].execute("2", { type: "learner", text: "likes diagrams" });
      await a.events["session_shutdown"]({ type: "session_shutdown" }, a.ctx);
      const b = await boot();
      expect((await turn(b.events, b.ctx, "hi", judged("none"))).sections["tutor_memory"]).toContain("knows Go well");
      b.script.push("#1 [learner] knows Go well", "Forget it");
      await b.commands["tutor-memory"].handler("", b.ctx);
      const next = await turn(b.events, b.ctx, "hi", judged("none"));
      expect(next.sections["tutor_memory"]).not.toContain("knows Go well");
      expect(next.sections["tutor_memory"]).toContain("likes diagrams");
      await b.events["session_shutdown"]({ type: "session_shutdown" }, b.ctx);
    } finally {
      if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved;
    }
  });
});

describe("M6c: turn and episode bookkeeping", () => {
  it("restoreLevel ignores levels outside 0..100 or not integers (M2 #13)", async () => {
    const lv = (level: unknown) => ({ type: "custom", customType: "tutor_level", data: { level } });
    const b = await boot({ branch: [lv(30), lv(-5), lv(250), lv(42.5), lv(Number.NaN)] });
    expect(b.widgets["tutor"]?.[0]).toContain("lvl 30");
  });
  it("a new session without a project keeps the current level (M2 #14)", async () => {
    const b = await boot();
    await b.commands["tutor-level"].handler("80", b.ctx);
    await b.events["session_start"]({ type: "session_start", reason: "new" }, { ...b.ctx, sessionManager: { getBranch: () => [] } });
    expect(b.widgets["tutor"]?.[0]).toContain("lvl 80");
  });
  it("a steered message resets the run: judged against the new text, and judgeable (M6a #56)", async () => {
    const b = await boot();
    const opts = { sections: {} as Record<string, string> };
    // Pi's real order (agent-loop.js:114-118, 180-186): input fires while reply 1 streams, reply 1's
    // turn_end comes next, and only then is the steered text delivered as a user message_start.
    const user = (text: string) => ({ type: "message_start", message: { role: "user", content: [{ type: "text", text }], timestamp: 1 } });
    await b.events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: "what does this do?", systemPromptOptions: opts }, b.ctx);
    await b.events["message_start"](user("what does this do?"), b.ctx);
    await b.events["input"]({ type: "input", text: REASONED, source: "interactive", streamingBehavior: "steer" }, b.ctx);
    await b.events["turn_end"]({ type: "turn_end", message: judged("correct") }, b.ctx); // reply 1: guarded against the first prompt
    await b.events["message_start"](user(REASONED), b.ctx);
    await b.events["turn_end"]({ type: "turn_end", message: judged("correct") }, b.ctx); // reply 2: the steered message's own reply
    expect(b.entries.filter((e) => e.type === "tutor_judgment").map((e) => (e.data as { judgment: string }).judgment)).toEqual(["none", "correct"]);
  });
  it("a followUp resets the run only when delivered, with the delivered (expanded) text", async () => {
    const b = await boot();
    const user = (text: string) => ({ type: "message_start", message: { role: "user", content: [{ type: "text", text }], timestamp: 1 } });
    await b.events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: REASONED, systemPromptOptions: { sections: {} } }, b.ctx);
    await b.events["message_start"](user(REASONED), b.ctx);
    await b.events["input"]({ type: "input", text: "/skill:x", source: "interactive", streamingBehavior: "followUp" }, b.ctx);
    await b.events["turn_end"]({ type: "turn_end", message: judged("correct") }, b.ctx);
    await b.events["message_start"](user("explain closures?"), b.ctx);
    await b.events["turn_end"]({ type: "turn_end", message: judged("correct") }, b.ctx);
    expect(b.entries.filter((e) => e.type === "tutor_judgment").map((e) => (e.data as { judgment: string }).judgment)).toEqual(["correct", "none"]);
  });
  it("an idle input does not touch the run (before_agent_start follows)", async () => {
    const b = await boot();
    expect(await b.events["input"]({ type: "input", text: "hi", source: "interactive" }, b.ctx)).toBeUndefined();
  });
  it("/tutor-memory shows each memory's language (M6b #62)", async () => {
    const { memoryLine } = await import("../extensions/tutor/memory.js");
    expect(memoryLine({ id: 3, type: "learner", text: "knows Go", language: "python", project: null, created: 1, updated: 1 })).toBe("#3 [learner] knows Go (python)");
  });
});

describe("thinking visibility (/tutor-thinking)", () => {
  // A file-backed profile shared by every boot in this block, so a second boot is "Pi restarted".
  let saved: string | undefined;
  beforeEach(() => { saved = process.env.PI_TUTOR_PROFILE; process.env.PI_TUTOR_PROFILE = pjoin(mkd(pjoin(tmp(), "think-")), "p.sqlite"); });
  afterEach(() => { if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved; });
  const think = (t: (md: string, c: { messageType: string; isStreaming: boolean; availableWidth: number }) => string) =>
    t("The user asks about rung 2 and INDEX.md", { messageType: "assistant-thinking", isStreaming: true, availableWidth: 68 });
  it("auto: shown below pro, a one-line label at pro", async () => {
    const b = await boot();
    const [t] = b.transformers;
    expect(think(t)).toBe("The user asks about rung 2 and INDEX.md");
    await b.commands["tutor-level"].handler("90", b.ctx);
    expect(think(t)).toBe(THINKING_LABEL);
  });
  it("hide and show override the band, persist in the profile, and bad input only warns", async () => {
    const b = await boot();
    const [t] = b.transformers;
    await b.commands["tutor-thinking"].handler("hide", b.ctx);
    expect(think(t)).toBe(THINKING_LABEL);
    await b.commands["tutor-thinking"].handler("bogus", b.ctx);
    expect(b.notes.at(-1)).toMatch(/usage: \/tutor-thinking auto\|show\|hide/);
    expect(think(t)).toBe(THINKING_LABEL);
    const again = await boot(); // a new Pi: the profile keeps the choice
    expect(think(again.transformers[0])).toBe(THINKING_LABEL);
    await again.commands["tutor-thinking"].handler("show", again.ctx);
    await again.commands["tutor-level"].handler("90", again.ctx);
    expect(think(again.transformers[0])).toBe("The user asks about rung 2 and INDEX.md");
  });
  it("without a profile the choice is said to last this session only (M7 minor)", async () => {
    process.env.PI_TUTOR_PROFILE = mkd(pjoin(tmp(), "think-dir-")); // a directory: the profile cannot open
    const b = await boot();
    expect(b.notes.join("\n")).toMatch(/tutor profile unavailable/);
    await b.commands["tutor-thinking"].handler("hide", b.ctx);
    expect(b.notes.at(-1)).toMatch(/^thinking: hide .*this session only/);
    expect(think(b.transformers[0])).toBe(THINKING_LABEL);
  });
  it("with no argument it reports the current mode", async () => {
    const b = await boot();
    await b.commands["tutor-thinking"].handler("", b.ctx);
    expect(b.notes.at(-1)).toMatch(/thinking: auto \(shown/);
  });
});

/** A recorded project of `lang` in the profile PI_TUTOR_PROFILE names (set per describe below). */
async function projectDir(lang: string): Promise<string> {
  const { realpathSync } = await import("node:fs");
  const { Profile } = await import("../extensions/tutor/profile.js");
  const d = realpathSync(mkd(pjoin(tmp(), "proj-")));
  const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
  p.saveLanguage(lang, 50, {}, 1); p.addProject(lang, d, "t", 1); p.close();
  return d;
}

describe("language card in the system prompt (spec §5.4)", () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env.PI_TUTOR_PROFILE; process.env.PI_TUTOR_PROFILE = pjoin(mkd(pjoin(tmp(), "card-")), "p.sqlite"); });
  afterEach(() => { if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved; });
  it("a project's language gets its card with the detected version; the editor card always", async () => {
    const b = await boot({ cwd: await projectDir("python") });
    b.execOut["python3"] = { stdout: "Python 3.14.8\n", stderr: "", code: 0 };
    const t = await turn(b.events, b.ctx, "hi", judged("none"));
    expect(t.sections["tutor_lang"]).toMatch(/^\[language card: python\]\nInstalled: Python 3\.14\.8/);
    expect(t.sections["tutor_lang"]).toContain("[editor card: LazyVim]");
    // Option 2 (skill-eval iteration 3): the index is not always-on; a plain turn carries none.
    expect(t.sections["tutor_lang"]).not.toContain("[index:");
    expect(t.message?.content).not.toContain("[index:");
  });
  it("a how-do-I question gets the index in that turn's hidden context, not the system prompt", async () => {
    const b = await boot({ cwd: await projectDir("python") });
    const t = await turn(b.events, b.ctx, "How do I count words in Python?", judged("none"));
    expect(t.sections["tutor_lang"]).not.toContain("[index:");
    expect(t.message?.content).toMatch(/\[index: python\][\s\S]*count-items `Counter\(xs\)`[\s\S]*tutor-python-expert\/SKILL\.md/);
    const next = await turn(b.events, b.ctx, "ok, I tried it", judged("none"));
    expect(next.message?.content).not.toContain("[index:");
  });
  it("the design recipe's Map step gets the index on every turn of that step", async () => {
    const b = await boot({ cwd: await projectDir("python"), branch: [{ type: "custom", customType: "tutor_workflow", data: { task: "P1.T1", step: 5, started: 1 } }] });
    const t = await turn(b.events, b.ctx, "done", judged("none"));
    expect(t.message?.content).toContain("[index: python]");
  });
  it("no language known: only the editor card; a language with no pack: only the editor card", async () => {
    const b = await boot();
    const t = await turn(b.events, b.ctx, "hi", judged("none"));
    expect(t.sections["tutor_lang"]).toMatch(/^\[editor card: LazyVim\]/);
    const c = await boot({ cwd: await projectDir("c") });
    expect((await turn(c.events, c.ctx, "hi", judged("none"))).sections["tutor_lang"]).toMatch(/^\[editor card: LazyVim\]/);
  });
  it("the version command runs once per language and root, even across turns", async () => {
    const b = await boot({ cwd: await projectDir("python") });
    let n = 0;
    const exec = b.pi.exec;
    b.pi.exec = async (cmd: string) => { if (cmd === "python3") n++; return exec(cmd); };
    await turn(b.events, b.ctx, "a", judged("none"));
    await turn(b.events, b.ctx, "b", judged("none"));
    expect(n).toBe(1);
  });
});

describe("concept tags use the pack vocabulary (spec §5.4, gap #5)", () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env.PI_TUTOR_PROFILE; process.env.PI_TUTOR_PROFILE = pjoin(mkd(pjoin(tmp(), "tags-")), "p.sqlite"); });
  afterEach(() => { if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved; });
  const tagged = (tags: string[]) => assistant("ok\n```tutor-judgment\n" + JSON.stringify({ judgment: "partial", concept_tags: tags }) + "\n```");
  const lastJudgment = (b: { entries: { type: string; data: unknown }[] }) => b.entries.filter((e) => e.type === "tutor_judgment").at(-1)?.data;
  it("aliases map, unknown tags drop, editor tags are allowed", async () => {
    const b = await boot({ cwd: await projectDir("python") });
    await turn(b.events, b.ctx, REASONED, tagged(["KeyError", "monads", "motions"]));
    expect(lastJudgment(b)).toMatchObject({ concept_tags: ["dicts", "motions"] });
  });
  it("ease saved under an old free-form tag counts for its vocabulary tag (M7 minor)", async () => {
    const cwd = await projectDir("python");
    const { Profile } = await import("../extensions/tutor/profile.js");
    const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
    p.recordEpisode({ language: "python", project: null, concept_tags: ["keyerror"], rungs_used: 1, turns: 1, opened: 1, closed: 2 }, 1);
    p.close();
    const b = await boot({ cwd });
    await turn(b.events, b.ctx, REASONED, assistant("ok\n```tutor-judgment\n" + JSON.stringify({ judgment: "none", concept_tags: ["dicts"] }) + "\n```"));
    const ep = b.entries.filter((e) => e.type === "tutor_episode").at(-1)?.data as { delay?: number };
    expect(ep.delay).toBe(1); // ease 1.0 saved under "keyerror" counts for dicts: help comes one attempt later
  });
  it("tags follow the language the question was asked in, even if the session moved mid-reply (M7 minor)", async () => {
    const b = await boot({ cwd: await projectDir("python") });
    const opts = { sections: {} as Record<string, string> };
    await b.events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: REASONED, systemPromptOptions: opts }, b.ctx);
    const rust = fakeCtx([], await projectDir("rust")); // e.g. /resume into a rust project before turn_end
    await b.events["session_start"]({ type: "session_start", reason: "resume" }, rust.ctx);
    await b.events["turn_end"]({ type: "turn_end", message: tagged(["KeyError"]) }, rust.ctx);
    expect(lastJudgment(b)).toMatchObject({ concept_tags: ["dicts"] });
  });
  it("a language with no pack keeps normalized tags", async () => {
    const b = await boot({ cwd: await projectDir("c") });
    await turn(b.events, b.ctx, REASONED, tagged(["Pointer Arithmetic"]));
    expect(lastJudgment(b)).toMatchObject({ concept_tags: ["pointer-arithmetic"] });
  });
});

describe("/tutor-exam (spec 2026-10-13 §6)", () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env.PI_TUTOR_PROFILE; process.env.PI_TUTOR_PROFILE = pjoin(mkd(pjoin(tmp(), "exam-")), "p.sqlite"); });
  afterEach(() => { if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved; });
  it("small: one model call, files in exam/<id>/, a tutor_exam entry", async () => {
    const cwd = await projectDir("python");
    const b = await boot({ cwd });
    b.pi.exec = realExec as never;
    b.replies.push(JSON.stringify(PY_EXAM));
    await b.commands["tutor-exam"].handler("small", b.ctx);
    expect(existsSync(pjoin(cwd, "exam", "01-word-frequency", "brief.md"))).toBe(true);
    const e = b.entries.filter((x) => x.type === "tutor_exam").at(-1)?.data;
    expect(e).toMatchObject({ id: "01-word-frequency", dir: "exam/01-word-frequency", language: "python", size: "small", limit: 20, concepts: ["dicts", "strings"] });
    expect(b.notes.at(-1)).toMatch(/exam 01-word-frequency: 20 minutes/);
    expect(b.widgets["tutor"]?.[0]).toMatch(/^tutor {2}exam 01 (20:00|19:5\d) left/); // Task 6
  }, 30_000);
  it("refuses outside a recorded project, for a language with no exams, and while one runs", async () => {
    const out = await boot();
    await out.commands["tutor-exam"].handler("", out.ctx);
    expect(out.notes.at(-1)).toMatch(/exams run inside a project/);
    const c = await boot({ cwd: await projectDir("c") });
    await c.commands["tutor-exam"].handler("", c.ctx);
    expect(c.notes.at(-1)).toMatch(/no exams for c yet/);
    const b = await boot({ cwd: await projectDir("python"), branch: [{ type: "custom", customType: "tutor_exam", data: { id: "01-x", dir: "exam/01-x", language: "python", topic: null, size: "small", started: Date.now(), limit: 20, concepts: [] } }] });
    await b.commands["tutor-exam"].handler("", b.ctx);
    expect(b.notes.at(-1)).toMatch(/exam 01-x is running/);
  });
  const running = (over: object = {}) => [{ type: "custom", customType: "tutor_exam", data: { id: "01-word-frequency", dir: "exam/01-word-frequency", language: "python", topic: null, size: "small", started: Date.now(), limit: 20, concepts: ["dicts"], ...over } }];
  it("during an exam, every turn carries the [exam] line and holds back the fix; judgments never move help", async () => {
    const b = await boot({ cwd: await projectDir("python"), branch: running() });
    await b.commands["tutor-level"].handler("10", b.ctx);
    const t = await turn(b.events, b.ctx, "how do I start?", judged("none"));
    expect(t.message?.content).toMatch(/\[exam\] timed exam 01-word-frequency/);
    expect(t.message?.content).toMatch(/do not state the fix/i);
    await turn(b.events, b.ctx, REASONED, judged("correct"));
    expect(episodes(b.entries).at(-1)?.attempts).toBe(0);
  });
  it("a resumed exam keeps its real start: one that began an hour ago is late (Review Focus #3)", async () => {
    const b = await boot({ cwd: await projectDir("python"), branch: running({ started: Date.now() - 3_600_000 }) });
    expect(b.widgets["tutor"]?.[0]).toMatch(/exam 01 \+40:0\d late/);
  });
  it("exam tests are sandboxed by default; /tutor-exam sandbox off is saved and turns it off (plan 2026-10-16)", async () => {
    const cwd = await projectDir("python");
    const b = await boot({ cwd });
    const calls: [string, string[]][] = [];
    b.pi.exec = (async (c: string, a: string[], o: { cwd: string; timeout: number }) => { calls.push([c, a]); return realExec(c, a, o); }) as never;
    // The exam's test run, wrapped or not (the language card's version checks also use pi.exec).
    const testRuns = () => calls.filter(([c, a]) => c === "timeout" || a.includes("unittest"));
    b.replies.push(JSON.stringify(PY_EXAM));
    await b.commands["tutor-exam"].handler("small", b.ctx);
    expect(b.notes.at(-1)).toMatch(/exam 01-word-frequency/);
    expect(testRuns().length).toBeGreaterThan(0);
    expect(testRuns().every(([c]) => c === "bwrap")).toBe(true); // the hidden check ran sandboxed
    await b.commands["tutor-exam"].handler("sandbox off", b.ctx);
    expect(b.notes.at(-1)).toMatch(/exam sandbox: off.*run as you/);
    calls.length = 0;
    await b.commands["tutor-exam"].handler("check", b.ctx);
    expect(testRuns().length).toBeGreaterThan(0);
    expect(calls.map(([c]) => c)).not.toContain("bwrap");
    expect(b.notes.at(-1)).toMatch(/examples fail/);
    const again = await boot({ cwd }); // a new session reads the saved choice
    await again.commands["tutor-exam"].handler("sandbox", again.ctx);
    expect(again.notes.at(-1)).toMatch(/^exam sandbox: off/);
  }, 60_000);
  it("/tutor-exam sandbox reports whether bubblewrap can start; a bad word gets the usage", async () => {
    const b = await boot({ cwd: await projectDir("python") });
    b.execOut["bwrap"] = { stdout: "", stderr: "bwrap: setting up uid map: Permission denied", code: 1 };
    await b.commands["tutor-exam"].handler("sandbox", b.ctx);
    expect(b.notes.at(-1)).toMatch(/exam sandbox: on.*bubblewrap cannot start/);
    b.execOut["bwrap"] = { stdout: "", stderr: "", code: 0 };
    await b.commands["tutor-exam"].handler("sandbox", b.ctx);
    expect(b.notes.at(-1)).toMatch(/exam sandbox: on \(bubblewrap ready\)/);
    await b.commands["tutor-exam"].handler("sandbox maybe", b.ctx);
    expect(b.notes.at(-1)).toMatch(/usage: \/tutor-exam .*sandbox \[on\|off\]/);
  });
  it("off abandons the exam; check runs the examples without a model call", async () => {
    const cwd = await projectDir("python");
    const b = await boot({ cwd });
    b.pi.exec = realExec as never;
    b.replies.push(JSON.stringify(PY_EXAM));
    await b.commands["tutor-exam"].handler("small", b.ctx);
    await b.commands["tutor-exam"].handler("check", b.ctx);
    expect(b.notes.at(-1)).toMatch(/examples fail \(exit 1\)/);
    await b.commands["tutor-exam"].handler("off", b.ctx);
    expect(b.entries.filter((x) => x.type === "tutor_exam").at(-1)?.data).toMatchObject({ abandoned: expect.any(Number) });
    expect(b.widgets["tutor"]?.[0]).not.toMatch(/exam/);
  }, 30_000);
  it("/tutor-submit runs the tests, grades with one call, writes grade.md, records the exam, posts the summary", async () => {
    const cwd = await projectDir("python");
    const b = await boot({ cwd });
    b.pi.exec = realExec as never;
    b.replies.push(JSON.stringify(PY_EXAM));
    await b.commands["tutor-exam"].handler("small", b.ctx);
    const dir = pjoin(cwd, "exam", "01-word-frequency");
    wfile(pjoin(dir, "solution.py"), "def count_words(text):\n    out = {}\n    for w in text.split():\n        out[w] = out.get(w, 0) + 1\n    return out\n");
    b.replies.push(JSON.stringify({
      requirements: [{ id: "R1", met: true, evidence: "solution.py:4 — counts each word" }, { id: "R2", met: false, evidence: "solution.py:3 — words are not lowercased" }],
      idioms: [{ ok: true, note: "dict.get counting", evidence: "solution.py:4" }],
      next_fixes: ["lowercase each word before counting", "name the dict counts", "add a docstring"], in_short: "Counting works; case does not.",
    }));
    await b.commands["tutor-submit"].handler("", b.ctx);
    const md = readFileSync(pjoin(dir, "grade.md"), "utf8");
    expect(md).toMatch(/\*\*60\/100\*\*/);
    expect(md).toContain("The example tests failed (exit 1).");
    expect(md).toMatch(/test_r2_lowercase/); // real unittest output is the test evidence
    expect(b.entries.filter((x) => x.type === "tutor_exam").at(-1)?.data).toMatchObject({ submitted: expect.any(Number), score: 60 });
    expect(b.messages.at(-1)).toMatchObject({ message: { customType: "tutor_grade", display: true }, options: { triggerTurn: false } });
    const { Profile } = await import("../extensions/tutor/profile.js");
    const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
    expect(p.exams("python")).toMatchObject([{ exam: "01-word-frequency", score: 60, late: false, concepts: ["dicts", "strings"] }]);
    p.close();
    expect(b.widgets["tutor"]?.[0]).not.toMatch(/exam/);
  }, 30_000);
  it("a grade the model gets wrong twice writes nothing and keeps the exam open (Review Focus #4)", async () => {
    const cwd = await projectDir("python");
    const b = await boot({ cwd });
    b.pi.exec = realExec as never;
    b.replies.push(JSON.stringify(PY_EXAM));
    await b.commands["tutor-exam"].handler("small", b.ctx);
    const bad = JSON.stringify({ requirements: [{ id: "R1", met: true, evidence: "nowhere.py:1 — x" }], idioms: [], next_fixes: ["a", "b", "c"], in_short: "x" });
    b.replies.push(bad, bad);
    await b.commands["tutor-submit"].handler("", b.ctx);
    expect(existsSync(pjoin(cwd, "exam", "01-word-frequency", "grade.md"))).toBe(false);
    expect(b.notes.at(-1)).toMatch(/grading failed: .*rejected twice/);
    expect(b.widgets["tutor"]?.[0]).toMatch(/exam 01/);
  }, 30_000);
  it("a submission whose tests hang is graded as timed out, and Pi is not stuck (Review Focus #2)", async () => {
    const cwd = await projectDir("python");
    const b = await boot({ cwd, branch: running() });
    mkdir(pjoin(cwd, "exam", "01-word-frequency"), { recursive: true });
    wfile(pjoin(cwd, "exam", "01-word-frequency", "solution.py"), "def count_words(t):\n    while True: pass\n");
    wfile(pjoin(cwd, "exam", "01-word-frequency", "brief.md"), "# Exam\n\n## Requirements\n\n- **R1** a\n- **R2** b\n");
    b.pi.exec = (async (c: string, a: string[]) => (a.includes("--version") || (c === "bwrap" && a.at(-1) === "true") ? { stdout: "1", stderr: "", code: 0, killed: false } : { stdout: "", stderr: "", code: 143, killed: true })) as never;
    b.replies.push(JSON.stringify({ requirements: [{ id: "R1", met: false, evidence: "solution.py:2 — loops forever" }, { id: "R2", met: false, evidence: "solution.py:2 — loops forever" }], idioms: [], next_fixes: ["a", "b", "c"], in_short: "It never returns." }));
    await b.commands["tutor-submit"].handler("", b.ctx);
    expect(readFileSync(pjoin(cwd, "exam", "01-word-frequency", "grade.md"), "utf8")).toContain("timed out after 120 s");
  });
  it("check and submit say when the toolchain cannot run, and the exam stays open (final review I1)", async () => {
    const cwd = await projectDir("python");
    const b = await boot({ cwd, branch: running() });
    mkdir(pjoin(cwd, "exam", "01-word-frequency"), { recursive: true });
    wfile(pjoin(cwd, "exam", "01-word-frequency", "brief.md"), "# Exam\n\n## Requirements\n\n- **R1** a\n- **R2** b\n");
    b.pi.exec = (async (c: string, a: string[]) => ({ stdout: "", stderr: "", code: c === "bwrap" && a.at(-1) === "true" ? 0 : 1, killed: false })) as never; // bubblewrap starts; python3 does not
    await b.commands["tutor-exam"].handler("check", b.ctx);
    expect(b.notes.at(-1)).toMatch(/could not run python3/);
    await b.commands["tutor-submit"].handler("", b.ctx);
    expect(b.notes.at(-1)).toMatch(/could not run python3/);
    expect(b.widgets["tutor"]?.[0]).toMatch(/exam 01/);
  });
  it("/new keeps the exam of this project; a closed exam does not come back from an old session (final review I3)", async () => {
    const cwd = await projectDir("python");
    const b = await boot({ cwd });
    b.pi.exec = realExec as never;
    b.replies.push(JSON.stringify(PY_EXAM));
    await b.commands["tutor-exam"].handler("small", b.ctx);
    const fresh = fakeCtx([], cwd);
    await b.events["session_start"]({ type: "session_start", reason: "new" }, fresh.ctx);
    expect(fresh.widgets["tutor"]?.[0]).toMatch(/exam 01/);
    const opened = b.entries.filter((x) => x.type === "tutor_exam").map((x) => ({ type: "custom", customType: "tutor_exam", data: x.data }));
    await b.commands["tutor-exam"].handler("off", fresh.ctx);
    const old = fakeCtx(opened, cwd); // /resume into the session that still says the exam is open
    await b.events["session_start"]({ type: "session_start", reason: "resume" }, old.ctx);
    expect(old.widgets["tutor"]?.[0]).not.toMatch(/exam/);
  }, 30_000);
  it("/tutor-feedback too-vague never lifts help (final review I4; spec 2026-10-21: only graded tries do)", async () => {
    const b = await boot({ cwd: await projectDir("python"), branch: running() });
    await turn(b.events, b.ctx, "how do I start?", judged("none"));
    const before = episodes(b.entries).at(-1);
    await b.commands["tutor-feedback"].handler("too-vague", b.ctx);
    expect(episodes(b.entries).at(-1)).toEqual(before);
  });
  it("a second /tutor-submit while one runs is refused; the exam is recorded once (final review M1, re-graded)", async () => {
    const cwd = await projectDir("python");
    const b = await boot({ cwd });
    b.pi.exec = realExec as never;
    b.replies.push(JSON.stringify(PY_EXAM));
    await b.commands["tutor-exam"].handler("small", b.ctx);
    const g = JSON.stringify({ requirements: [{ id: "R1", met: false, evidence: "solution.py:2 — not written" }, { id: "R2", met: false, evidence: "solution.py:2 — not written" }], idioms: [], next_fixes: ["a", "b", "c"], in_short: "Not started." });
    b.replies.push(g, g);
    await Promise.all([b.commands["tutor-submit"].handler("", b.ctx), b.commands["tutor-submit"].handler("", b.ctx)]);
    expect(b.notes.some((n) => /still running/.test(n))).toBe(true);
    const { Profile } = await import("../extensions/tutor/profile.js");
    const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
    expect(p.exams("python")).toHaveLength(1);
    p.close();
  }, 30_000);
  it("the design recipe and the architect wait until the exam is over", async () => {
    const b = await boot({ cwd: await projectDir("python"), branch: running() });
    await b.commands["tutor-plan"].handler("P1.T1", b.ctx);
    expect(b.notes.at(-1)).toMatch(/after the exam/);
    await b.commands["tutor-architect"].handler("", b.ctx);
    expect(b.notes.at(-1)).toMatch(/after the exam/);
  });
});

describe("/tutor-progress (gap #8)", () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env.PI_TUTOR_PROFILE; process.env.PI_TUTOR_PROFILE = pjoin(mkd(pjoin(tmp(), "prog-")), "p.sqlite"); });
  afterEach(() => { if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved; });
  it("posts the report as a display-only message without starting a turn; only the newest stays in context", async () => {
    const b = await boot({ cwd: await projectDir("python") });
    await b.commands["tutor-progress"].handler("", b.ctx);
    expect(b.messages.at(-1)).toMatchObject({ message: { customType: "tutor_progress", display: true, content: expect.stringContaining("**python**") }, options: { triggerTurn: false } });
    const msg = (t: string) => ({ role: "custom", customType: "tutor_progress", content: t, display: true, timestamp: 1 });
    const r = b.events["context"]({ type: "context", messages: [msg("old"), { role: "user", content: "hi", timestamp: 2 }, msg("new")] }) as { messages: { content: string }[] };
    expect(r.messages.map((m) => m.content)).toEqual(["hi", "new"]);
  });
  it("with no argument and no project, one section per profile language; unknown words are refused", async () => {
    const b = await boot();
    await b.commands["tutor-progress"].handler("", b.ctx);
    expect(b.messages.at(-1)?.message).toMatchObject({ content: expect.stringMatching(/no progress yet/) });
    await b.commands["tutor-progress"].handler("../../x", b.ctx);
    expect(b.notes.at(-1)).toMatch(/usage: \/tutor-progress \[language\]/);
  });
});

describe("Pi 1.2+: before_agent_start also fires for custom-message runs (messageType)", () => {
  it("a run started by another extension's custom message gets the tutor prompt but opens no episode and does not throw", async () => {
    const b = await boot();
    await b.commands["tutor-level"].handler("10", b.ctx); // beginner: a learner message would open a chat episode
    const before = episodes(b.entries).length;
    const opts = { sections: {} as Record<string, string> };
    const message = { role: "custom", customType: "other_ext", content: "a reminder from another extension", display: true, timestamp: Date.now() };
    await b.events["before_agent_start"]({ type: "before_agent_start", messageType: "custom", message, systemPromptOptions: opts }, b.ctx);
    expect(opts.sections["tutor"]).toBeTruthy();
    expect(episodes(b.entries)).toHaveLength(before);
    // The learner's next real message still opens its episode as before.
    await turn(b.events, b.ctx, "how do I start?", judged("none"));
    expect(episodes(b.entries).at(-1)).toMatchObject({ trigger: { kind: "chat" } });
  });
});


describe("/tutor-start as a conversation (spec 2026-10-19 §5, §6)", () => {
  let savedProfile: string | undefined, savedHome: string | undefined, home: string;
  beforeEach(() => {
    savedProfile = process.env.PI_TUTOR_PROFILE; savedHome = process.env.HOME;
    home = mkd(pjoin(tmp(), "onb-home-"));
    process.env.PI_TUTOR_PROFILE = pjoin(home, "p.sqlite"); process.env.HOME = home;
  });
  afterEach(() => {
    if (savedProfile === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = savedProfile;
    if (savedHome === undefined) delete process.env.HOME; else process.env.HOME = savedHome;
  });
  const note = (o: object, words = "Nice to meet you. What would you like to build?") => assistant(`${words}\n\n\`\`\`tutor-intake\n${JSON.stringify(o)}\n\`\`\`\n`);
  /** One onboarding exchange: the run (prompt, reply) and its end, where the code takes its next step. */
  async function exchange(b: Awaited<ReturnType<typeof boot>>, reply: unknown) {
    const t = await turn(b.events, b.ctx, "[tutor] onboarding", reply);
    await b.events["agent_end"]({ type: "agent_end", messages: [] }, b.ctx);
    await new Promise((r) => setTimeout(r, 20)); // a kick is sent once Pi is idle
    return t;
  }
  async function saved() {
    const { Profile } = await import("../extensions/tutor/profile.js");
    const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
    const raw = p.setting("onboarding"); p.close();
    return raw ? JSON.parse(raw) : null;
  }
  const ONE = JSON.stringify({ projects: [{ title: "Tip Calculator", summary: "Split a bill.", size: "small", concepts: ["numbers"] }] });

  it("starts a conversation: a kickoff turn, the onboarding rules instead of the ladder, and no hint episode", async () => {
    const b = await boot({ cwd: home });
    await b.commands["tutor-start"].handler("", b.ctx);
    expect(b.sent.at(-1)).toMatchObject({ text: expect.stringMatching(/^\[tutor\]/), opts: { deliverAs: "followUp" } });
    const t = await exchange(b, note({ experience: "none yet", known: [] }));
    expect(t.sections["tutor"]).toMatch(/first meeting/i);
    expect(t.sections["tutor"]).not.toMatch(/tutor-judgment/);
    expect(t.sections["tutor_onboard"]).toMatch(/\[onboarding\]/);
    expect((await saved()).fields).toMatchObject({ experience: "none yet", known: [], target: "python" });
    expect(episodes(b.entries)).toEqual([]);
  });
  it("the learner never sees the note", async () => {
    const b = await boot({ cwd: home });
    await b.commands["tutor-start"].handler("", b.ctx);
    const reply = note({ experience: "none yet" });
    await exchange(b, reply);
    const text = (reply as { content: { text: string }[] }).content[0].text;
    expect(text).not.toMatch(/tutor-intake|"experience"/);
    expect(text).toMatch(/Nice to meet you/);
  });
  it("refuses a language that is not one of the six (the pytutor-architect case)", async () => {
    const b = await boot({ cwd: home });
    await b.commands["tutor-start"].handler("pytutor-architect", b.ctx);
    expect(b.notes.at(-1)).toBe("pick one of: python, rust, go, typescript, lua, javascript");
    expect(await saved()).toBeNull();
    expect(b.sent).toEqual([]);
  });
  it("after two replies without a note the code asks the missing items itself, then moves on (Review Focus #1)", async () => {
    const b = await boot({ cwd: home });
    await b.commands["tutor-start"].handler("", b.ctx);
    await exchange(b, assistant("Hi! Tell me about yourself."));
    b.script.push("none yet", "", "");
    await exchange(b, assistant("What do you want to build?"));
    const s = await saved();
    expect(s.fields).toMatchObject({ experience: "none yet", known: [], target: "python", idea: null });
    expect(s.stage).toBe("read");
    expect(typeof s.level).toBe("number");
    expect(b.sent.length).toBe(2); // the kickoff, then the turn where the tutor gives its read
  });
  it("a named language and a self-score of 7: a level task in the editor, run by /tutor-start check (Q7, Q20)", async () => {
    const { existsSync } = await import("node:fs");
    const b = await boot({ cwd: home });
    b.pi.exec = realExec as never;
    await b.commands["tutor-start"].handler("python", b.ctx);
    await exchange(b, note({ experience: "1-3 years", known: ["python"], selfScore: 7, idea: null }));
    const task = pjoin(home, "lazycourse", ".checks", "python", "2-raindrops");
    expect(existsSync(pjoin(task, "solution.py"))).toBe(true);
    expect(existsSync(pjoin(task, ".exemplar"))).toBe(false);
    expect((await saved()).stage).toBe("check");
    await b.commands["tutor-start"].handler("check", b.ctx);
    const s = await saved();
    expect(s.levelCheck).toEqual({ task: "2-raindrops", passed: false });
    expect(s.stage).toBe("read");
    expect(b.notes.some((n) => /level \d+/.test(n))).toBe(true);
  }, 60_000);
  it("a self-score of 3: no task; the tutor asks a couple of technical questions first (Q7)", async () => {
    const { existsSync } = await import("node:fs");
    const b = await boot({ cwd: home });
    await b.commands["tutor-start"].handler("rust", b.ctx);
    await exchange(b, note({ experience: "under a year", known: ["rust"], selfScore: 3, idea: null }));
    expect(existsSync(pjoin(home, "lazycourse", ".checks"))).toBe(false);
    expect((await saved()).stage).toBe("talk");
    const t = await exchange(b, note({}));
    expect(t.sections["tutor_onboard"]).toMatch(/technical questions/i);
  });
  it("/tutor-start off pauses it for good: a restart stays normal tutoring until /tutor-start (final review I4)", async () => {
    const a = await boot({ cwd: home });
    await a.commands["tutor-start"].handler("", a.ctx);
    await exchange(a, note({ experience: "under a year", known: ["lua"] }));
    await a.commands["tutor-start"].handler("off", a.ctx);
    const b = await boot({ cwd: home });
    const t = await turn(b.events, b.ctx, "hello", judged("none"));
    expect(t.sections["tutor_onboard"]).toBeUndefined();
    await b.commands["tutor-start"].handler("", b.ctx);
    expect(b.notes.at(-1)).toMatch(/picking up where we left off/i);
    expect((await saved()).paused).toBeFalsy();
  });
  it("picks up where it left off after Pi restarts (Review Focus #2)", async () => {
    const a = await boot({ cwd: home });
    await a.commands["tutor-start"].handler("", a.ctx);
    await exchange(a, note({ experience: "under a year", known: ["lua"] }));
    const b = await boot({ cwd: home });
    await b.commands["tutor-start"].handler("", b.ctx);
    expect(b.notes.at(-1)).toMatch(/picking up where we left off/i);
    expect((await saved()).fields).toMatchObject({ experience: "under a year", known: ["lua"] });
  });
  it("read → one project → folder → the project is created and the tutor moves there (Q4, Q23)", async () => {
    const { existsSync } = await import("node:fs");
    const b = await boot({ cwd: home });
    await b.commands["tutor-start"].handler("", b.ctx);
    b.script.push("none yet", "", "");
    await exchange(b, assistant("hi"));
    await exchange(b, assistant("hello")); // fallback fills the checklist → stage read, its turn starts
    b.replies.push(ONE);
    await exchange(b, assistant("Here is my read: you are just starting.")); // read confirmed (empty script = yes) → one project
    expect((await saved()).project).toMatchObject({ title: "Tip Calculator" });
    b.script.push("Start this project", "");
    await exchange(b, assistant("How about a tip calculator?"));
    const dir = pjoin(home, "lazycourse", "python-tip-calculator");
    expect(existsSync(pjoin(dir, "README.md"))).toBe(true);
    const s = await saved();
    expect(s.stage).toBe("choose");
    expect(b.notes.some((n) => n.includes(`cd ${dir} && pi`))).toBe(true);
  });
  it("'show me something else' asks for another project, never one already shown", async () => {
    const b = await boot({ cwd: home });
    const seen: string[] = [];
    (b.ctx as { modelRegistry: { complete: unknown } }).modelRegistry.complete = async (_m: unknown, c: { messages: { content: { text: string }[] }[] }) => {
      seen.push(c.messages.map((m) => m.content.map((x) => x.text).join("")).join("\n"));
      return { role: "assistant", stopReason: "stop", content: [{ type: "text", text: seen.length === 1 ? ONE : JSON.stringify({ projects: [{ title: "Word Count", summary: "Count words.", size: "small", concepts: [] }] }) }] };
    };
    await b.commands["tutor-start"].handler("", b.ctx);
    b.script.push("none yet", "", "");
    await exchange(b, assistant("hi"));
    await exchange(b, assistant("hello"));
    await exchange(b, assistant("my read"));
    b.script.push("Show me something else");
    await exchange(b, assistant("tip calculator?"));
    expect(seen[1]).toMatch(/do not suggest: Tip Calculator/);
    expect((await saved()).project).toMatchObject({ title: "Word Count" });
  });
  it("a second /tutor-start for a language with a project is a check-in (Q9)", async () => {
    const { Profile } = await import("../extensions/tutor/profile.js");
    const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
    p.saveLanguage("python", 30, {}, 1); p.addProject("python", pjoin(home, "old"), "Monthly Expense Logger", 1); p.close();
    const b = await boot({ cwd: home });
    await b.commands["tutor-start"].handler("", b.ctx);
    const t = await exchange(b, note({}));
    expect(t.sections["tutor_onboard"]).toMatch(/check-in/i);
    expect(t.sections["tutor_onboard"]).toContain("Monthly Expense Logger");
  });
  it("a run Pi continues from our kick (no before_agent_start) still counts and is never judged (live check 2026-10-19)", async () => {
    const b = await boot({ cwd: home });
    await b.commands["tutor-start"].handler("", b.ctx);
    b.script.push("none yet", "", "");
    await exchange(b, assistant("hi"));
    await exchange(b, assistant("hello")); // fallback fills the checklist → stage read, the kick queues a follow-up
    expect(b.sent.at(-1)?.text).toMatch(/level \d+\/100/); // the kick itself carries the stage's instruction
    // Pi runs the queued follow-up in the same loop: no before_agent_start, then message_end, turn_end, agent_end.
    const reply = assistant("Here is my read of you.");
    await b.events["message_end"]({ type: "message_end", message: reply }, b.ctx);
    await b.events["turn_end"]({ type: "turn_end", message: reply }, b.ctx);
    b.replies.push(ONE);
    await b.events["agent_end"]({ type: "agent_end", messages: [] }, b.ctx);
    expect(b.widgets["tutor"]?.[1]).not.toMatch(/judged/);
    expect((await saved()).stage).toBe("project");
  });
  it("a kick waits until Pi is idle, so it starts a fresh run with the tutor's sections (live check 2026-10-19)", async () => {
    const b = await boot({ cwd: home });
    await b.commands["tutor-start"].handler("", b.ctx);
    b.script.push("none yet", "", "");
    await exchange(b, assistant("hi"));
    const sentBefore = b.sent.length;
    b.busy.value = true; // Pi is still finishing the run while agent_end handlers run
    await turn(b.events, b.ctx, "[tutor] onboarding", assistant("hello"));
    await b.events["agent_end"]({ type: "agent_end", messages: [] }, b.ctx);
    await new Promise((r) => setTimeout(r, 30));
    expect(b.sent.length).toBe(sentBefore); // not queued into the ending run
    b.busy.value = false;
    await new Promise((r) => setTimeout(r, 120));
    expect(b.sent.length).toBe(sentBefore + 1);
    expect(b.sent.at(-1)?.text).toMatch(/level \d+\/100/);
  });
  it("the project suggestion shows Pi's cancellable loader and passes its signal (final review I1)", async () => {
    const { initTheme, BorderedLoader } = await import("@earendil-works/pi-coding-agent");
    initTheme(undefined, false);
    const b = await boot({ cwd: home });
    const shown: unknown[] = [], signals: unknown[] = [];
    const ctx = b.ctx as unknown as { ui: Record<string, unknown>; modelRegistry: Record<string, unknown> };
    ctx.ui.custom = (factory: (t: unknown, th: unknown, kb: unknown, done: (r: unknown) => void) => unknown) =>
      new Promise((resolve) => { shown.push(factory({ requestRender() {} }, { fg: (_c: string, s: string) => s }, {}, resolve)); });
    ctx.modelRegistry.complete = async (_m: unknown, _c: unknown, opts: { signal?: AbortSignal }) => {
      signals.push(opts?.signal);
      return { role: "assistant", stopReason: "stop", content: [{ type: "text", text: ONE }] };
    };
    await b.commands["tutor-start"].handler("", b.ctx);
    b.script.push("none yet", "", "");
    await exchange(b, assistant("hi"));
    await exchange(b, assistant("hello"));
    await exchange(b, assistant("my read"));
    expect(shown.length).toBeGreaterThan(0);
    for (const c of shown) expect(c).toBeInstanceOf(BorderedLoader);
    expect(signals.every((s) => s instanceof AbortSignal)).toBe(true);
    for (const c of shown) (c as { dispose(): void }).dispose();
  });
});

describe("build or learn first (spec 2026-10-19 Q10, Q14–Q17, Q22)", () => {
  let savedProfile: string | undefined, savedHome: string | undefined, home: string, dir: string, file: string;
  const SPEC = (milestones: string[]) => JSON.stringify({
    design_md: "# D\n", requirements_md: "## P1.T1\n## P1.T2\n", entry_file: "src/main.py", run_cmd: "python3 src/main.py",
    tasks_md: `${milestones.map((m, i) => `## Milestone ${i + 1}: ${m}\n- [ ] P1.T${i + 1} do ${m}\n`).join("")}${milestones.length ? "" : "- [ ] P1.T1 do it\n- [ ] P1.T2 more\n"}`,
  });
  beforeEach(async () => {
    savedProfile = process.env.PI_TUTOR_PROFILE; savedHome = process.env.HOME;
    home = mkd(pjoin(tmp(), "bl-home-"));
    process.env.HOME = home;
    file = pjoin(home, "p.sqlite");
    process.env.PI_TUTOR_PROFILE = file;
    const { realpathSync } = await import("node:fs");
    dir = realpathSync(mkd(pjoin(home, "tip-")));
    wfile(pjoin(dir, "README.md"), "---\nlanguage: python\n---\n# Tip Calculator\n");
    wfile(pjoin(dir, "AGENTS.md"), "x");
    const { Profile } = await import("../extensions/tutor/profile.js");
    const { newOnboarding } = await import("../extensions/tutor/onboard.js");
    const p = Profile.open(file);
    p.saveLanguage("python", 10, {}, 1); p.addProject("python", dir, "Tip Calculator", 1);
    p.setSetting("onboarding", JSON.stringify({ ...newOnboarding(null), targetByCode: true, level: 10, stage: "choose", dir,
      fields: { experience: "none yet", known: [], target: "python", idea: null },
      project: { title: "Tip Calculator", summary: "Split a bill.", concepts: ["numbers", "functions", "conditionals"] } }));
    p.close();
  });
  afterEach(() => {
    if (savedProfile === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = savedProfile;
    if (savedHome === undefined) delete process.env.HOME; else process.env.HOME = savedHome;
  });
  const note = (o: object) => assistant(`Build now or learn first?\n\n\`\`\`tutor-intake\n${JSON.stringify(o)}\n\`\`\`\n`);
  async function exchange(b: Awaited<ReturnType<typeof boot>>, reply: unknown) {
    const t = await turn(b.events, b.ctx, "[tutor] onboarding", reply);
    await b.events["agent_end"]({ type: "agent_end", messages: [] }, b.ctx);
    await new Promise((r) => setTimeout(r, 20)); // a kick is sent once Pi is idle
    return t;
  }
  async function setting(key: string) {
    const { Profile } = await import("../extensions/tutor/profile.js");
    const p = Profile.open(file); const v = p.setting(key); p.close();
    return v ? JSON.parse(v) : null;
  }
  const waitFor = async (ok: () => boolean) => { for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10)); expect(ok()).toBe(true); };

  it("the new project session asks build-or-learn at once", async () => {
    const b = await boot({ cwd: dir });
    expect(b.sent.at(-1)).toMatchObject({ text: expect.stringMatching(/^\[tutor\] onboarding/), opts: { deliverAs: "followUp" } });
  });
  it("learn first: lesson rounds start (a beginner gets what its concepts build on: conditionals needs bools) and the spec is written in milestones in the background", async () => {
    const b = await boot({ cwd: dir });
    b.replies.push(SPEC(["basics, functions, bools", "numbers, conditionals, comparisons"]));
    await exchange(b, note({ path: "learn" }));
    const lesson = await setting(`lesson:${dir}`);
    expect(lesson.rounds).toEqual([["basics", "functions", "bools"], ["numbers", "conditionals", "comparisons"]]);
    expect(lesson.concept).toBe("basics");
    expect(await setting("onboarding")).toBeNull();
    await waitFor(() => existsSync(pjoin(dir, "spec", "tasks.md")));
    expect(readFileSync(pjoin(dir, "spec", "tasks.md"), "utf8")).toMatch(/## Milestone 1:/);
    expect(readFileSync(pjoin(dir, "README.md"), "utf8")).toMatch(/run: python3 src\/main\.py/);
    expect(b.sent.at(-1)?.text).toMatch(/^\[tutor\] lesson/);
  });
  it("build now: only the spec, no lessons", async () => {
    const b = await boot({ cwd: dir });
    b.replies.push(SPEC([]));
    await exchange(b, note({ path: "build" }));
    expect(await setting(`lesson:${dir}`)).toBeNull();
    await waitFor(() => existsSync(pjoin(dir, "spec", "tasks.md")));
  });
  describe("checks job (spec 2026-10-21 §7)", () => {
    const CHECKS = 'check P1.T1: tip(40) == 8.0\nrun P1.T2: stdin "40\\n" -> stdout contains "8.00"';
    const REF = "```python\ndef tip(x):\n    return x * 0.2\n```";
    const files = (d: string): string[] => {
      const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
      return readdirSync(d).flatMap((n) => { const f = pjoin(d, n); return statSync(f).isDirectory() ? files(f) : [f]; });
    };
    it("build now: milestone 1's checks follow the plan, live in the profile, show in spec/checks.md; the reference never enters the project", async () => {
      const b = await boot({ cwd: dir });
      b.replies.push(SPEC([]), CHECKS, REF);
      await exchange(b, note({ path: "build" }));
      await waitFor(() => existsSync(pjoin(dir, "spec", "checks.md")));
      const state = await setting(`checks:${dir}`);
      expect(state.milestones["1"].checks.map((c: { task: string; status: string }) => [c.task, c.status])).toEqual([["P1.T1", "unverified"], ["P1.T2", "unverified"]]);
      expect(state.milestones["1"].reference).toContain("return x * 0.2");
      const md = readFileSync(pjoin(dir, "spec", "checks.md"), "utf8");
      expect(md).toContain("- tip(40) == 8.0 (unverified)");
      expect(md).toMatch(/could not be tried/);
      for (const f of files(dir)) expect(readFileSync(f, "utf8"), f).not.toContain("x * 0.2");
      expect(b.notes.some((n) => /checks for milestone 1: spec\/checks\.md/.test(n))).toBe(true);
    });
    it("learn first: no checks until the round reaches its milestone", async () => {
      const b = await boot({ cwd: dir });
      b.replies.push(SPEC(["basics, functions, bools", "numbers, conditionals, comparisons"]));
      await exchange(b, note({ path: "learn" }));
      await waitFor(() => existsSync(pjoin(dir, "spec", "tasks.md")));
      await new Promise((r) => setTimeout(r, 100));
      expect(await setting(`checks:${dir}`)).toBeNull();
      b.replies.push(CHECKS.split("\n")[0], REF);
      for (let i = 0; i < 3; i++) await b.commands["tutor-lesson"].handler("skip", b.ctx);
      await waitFor(() => existsSync(pjoin(dir, "spec", "checks.md")));
      expect(Object.keys((await setting(`checks:${dir}`)).milestones)).toEqual(["1"]);
    });
    it("/tutor-done with no sandbox ticks as self-checked; a task with no checks too; a deleted spec/checks.md is rewritten (Review Focus #4)", async () => {
      mkdir(pjoin(dir, "spec"));
      wfile(pjoin(dir, "spec", "tasks.md"), "- [ ] P1.T1 tip\n- [ ] P1.T2 print\n");
      wfile(pjoin(dir, "README.md"), "---\nrun: python3 src/main.py\nlanguage: python\n---\n# Tip\n");
      const { Profile } = await import("../extensions/tutor/profile.js");
      const p = Profile.open(file);
      p.setSetting("onboarding", "");
      p.setSetting(`checks:${dir}`, JSON.stringify({ milestones: { 1: { ran: false, reference: "", checks: [{ task: "P1.T1", kind: "value", expr: "tip(40)", expected: "8.0", milestone: 1, status: "unverified" }] } } }));
      p.close();
      const b = await boot({ cwd: dir });
      await b.commands["tutor-done"].handler("P1.T1", b.ctx);
      expect(b.notes.at(-1)).toMatch(/ticked P1\.T1 \(self-checked: .*bubblewrap/);
      const { rmSync } = await import("node:fs");
      rmSync(pjoin(dir, "spec", "checks.md"));
      await b.commands["tutor-done"].handler("", b.ctx);
      expect(b.notes.at(-1)).toMatch(/ticked P1\.T2 \(self-checked: it has no checks\)/);
      expect(readFileSync(pjoin(dir, "spec", "tasks.md"), "utf8")).toBe("- [x] P1.T1 tip\n- [x] P1.T2 print\n");
      expect(readFileSync(pjoin(dir, "spec", "checks.md"), "utf8")).toContain("## P1.T1 (done, self-checked)");
      expect(b.entries.filter((e) => e.type === "tutor_tick").map((e) => e.data)).toEqual([{ ids: ["P1.T1"], how: "self" }, { ids: ["P1.T2"], how: "self" }]);
      await b.commands["tutor-done"].handler("", b.ctx);
      expect(b.notes.at(-1)).toMatch(/every task in spec\/tasks\.md is ticked/);
    });
    it("an older project with a plan and no checks gets them at session start", async () => {
      mkdir(pjoin(dir, "spec"));
      wfile(pjoin(dir, "spec", "tasks.md"), "- [ ] P1.T1 tip\n- [x] P1.T2 print\n");
      wfile(pjoin(dir, "README.md"), "---\nrun: python3 src/main.py\nlanguage: python\n---\n# Tip\n");
      const { Profile } = await import("../extensions/tutor/profile.js");
      const p = Profile.open(file); p.setSetting("onboarding", ""); p.close();
      const f = fakePi();
      extension(f.pi as never);
      const c = fakeCtx([], dir);
      c.replies.push(CHECKS, REF);
      const saved = process.env.NVIM; delete process.env.NVIM;
      await f.events["session_start"]({ type: "session_start", reason: "startup" }, c.ctx);
      if (saved) process.env.NVIM = saved;
      await waitFor(() => existsSync(pjoin(dir, "spec", "checks.md")));
      expect(readFileSync(pjoin(dir, "spec", "checks.md"), "utf8")).toContain("## P1.T2 (done)");
    });
  });
  it("no answer in the note: the code asks with a dialog", async () => {
    const b = await boot({ cwd: dir });
    b.replies.push(SPEC([]));
    b.script.push("Build it now");
    await exchange(b, assistant("What would you like to do?"));
    await waitFor(() => existsSync(pjoin(dir, "spec", "tasks.md")));
  });
  it("a spec job that fails says so in the widget; lessons still work; /tutor-start spec retries (Review Focus #4)", async () => {
    const b = await boot({ cwd: dir });
    b.replies.push("not json", "still not json");
    await exchange(b, note({ path: "learn" }));
    await waitFor(() => /spec error/.test(b.widgets["tutor"]?.[1] ?? ""));
    expect(b.widgets["tutor"]?.[1]).toMatch(/spec error: \/tutor-start spec/);
    expect(b.notes.some((n) => /could not be written.*\/tutor-start spec retries/.test(n))).toBe(true);
    await b.commands["tutor-lesson"].handler("next", b.ctx);
    expect(existsSync(pjoin(dir, "learn", "basics", "1-guidos-gorgeous-lasagna", "solution.py"))).toBe(true);
    b.replies.push(SPEC(["basics, functions, bools", "numbers, conditionals, comparisons"]));
    await b.commands["tutor-start"].handler("spec", b.ctx);
    await waitFor(() => existsSync(pjoin(dir, "spec", "tasks.md")));
  });
  it("lesson exercises: never the exemplar; two fails step back; a pass rates the concept and moves on; skip marks it known", async () => {
    const b = await boot({ cwd: dir });
    b.pi.exec = realExec as never;
    b.replies.push(SPEC(["basics, functions, bools", "numbers, conditionals, comparisons"]));
    await exchange(b, note({ path: "learn" }));
    await b.commands["tutor-lesson"].handler("next", b.ctx);
    const ex = pjoin(dir, "learn", "basics", "1-guidos-gorgeous-lasagna");
    expect(existsSync(pjoin(ex, "lasagna.py")) || existsSync(pjoin(ex, "solution.py"))).toBe(true);
    expect(existsSync(pjoin(ex, ".exemplar"))).toBe(false);
    expect(b.widgets["tutor"]?.[0]).toMatch(/lesson: basics 1\/1/);
    await b.commands["tutor-lesson"].handler("check", b.ctx);
    await b.commands["tutor-lesson"].handler("check", b.ctx);
    expect((await setting(`lesson:${dir}`)).stepBack).toBe(true);
    const t = await turn(b.events, b.ctx, "I'm lost", judged("none"));
    expect(t.sections["tutor_lesson"]).toMatch(/smaller step/i);
    expect(t.sections["tutor_lesson"]).toMatch(/ask the learner a question before explaining/i);
    const { loadLessons } = await import("../extensions/tutor/lessons.js");
    wfile(pjoin(ex, "solution.py"), loadLessons("python").find((l) => l.concept === "basics")!.exercises[0].exemplar);
    await b.commands["tutor-lesson"].handler("check", b.ctx);
    expect((await setting(`lesson:${dir}`))).toMatchObject({ concept: "functions", stepBack: false, fails: 0 });
    expect(b.notes.at(-1)).toMatch(/all pass! next: functions/); // live check: it said "exercise 1"
    await b.commands["tutor-lesson"].handler("skip", b.ctx);
    expect((await setting(`lesson:${dir}`)).concept).toBe("bools");
    const { Profile } = await import("../extensions/tutor/profile.js");
    const p = Profile.open(file);
    expect(p.knownConcepts("python", Date.now() + 1000)).toEqual(expect.arrayContaining(["variables", "functions"]));
    p.close();
  }, 60_000);
  it("a pending choice stays with its project: another project's Pi is untouched and its README kept (final review C1)", async () => {
    const { Profile } = await import("../extensions/tutor/profile.js");
    const { realpathSync } = await import("node:fs");
    const other = realpathSync(mkd(pjoin(home, "older-")));
    wfile(pjoin(other, "README.md"), "my own readme");
    const p = Profile.open(file); p.addProject("python", other, "Older", 2); p.close();
    const b = await boot({ cwd: other });
    expect(b.sent).toEqual([]);
    expect(b.notes.some((n) => n.includes(dir))).toBe(true); // where to go to continue
    b.replies.push(SPEC([]));
    const t = await exchange(b, note({ path: "build" }));
    expect(t.sections["tutor_onboard"]).toBeUndefined();
    expect(readFileSync(pjoin(other, "README.md"), "utf8")).toBe("my own readme");
    expect((await setting("onboarding")).stage).toBe("choose");
  });
  it("build now: the tutor talks through the project while the plan is written (final review I5, Q10)", async () => {
    const b = await boot({ cwd: dir });
    b.replies.push(SPEC([]));
    await exchange(b, note({ path: "build" }));
    expect(b.sent.at(-1)?.text).toMatch(/^\[tutor\] project: .*Tip Calculator/);
  });
  it("a review returns the learner to where they were (final review I1)", async () => {
    const { Profile } = await import("../extensions/tutor/profile.js");
    const p = Profile.open(file); p.rateConcept("python", "loops", 0.1, Date.now() - 40 * 86_400_000); p.close();
    const b = await boot({ cwd: dir });
    b.pi.exec = realExec as never;
    b.replies.push(SPEC(["basics, functions, bools", "numbers, conditionals, comparisons"]));
    await exchange(b, note({ path: "learn" }));
    await b.commands["tutor-lesson"].handler("review", b.ctx);
    expect((await setting(`lesson:${dir}`)).concept).toBe("loops");
    await b.commands["tutor-lesson"].handler("review", b.ctx);
    expect(b.notes.at(-1)).toMatch(/already reviewing/);
    await b.commands["tutor-lesson"].handler("next", b.ctx);
    const { loadLessons } = await import("../extensions/tutor/lessons.js");
    const loops = loadLessons("python").find((l) => l.concept === "loops")!;
    wfile(pjoin(dir, "learn", "loops", loops.exercises[0].id, "solution.py"), loops.exercises[0].exemplar);
    await b.commands["tutor-lesson"].handler("check", b.ctx);
    expect(await setting(`lesson:${dir}`)).toMatchObject({ concept: "basics", round: 0, building: false, resume: null });
  }, 60_000);
  it("a plan job left over from a quit is reported at startup (final review I2, Review Focus #4)", async () => {
    const { Profile } = await import("../extensions/tutor/profile.js");
    const p = Profile.open(file);
    p.setSetting(`specjob:${dir}`, JSON.stringify({ rounds: [], about: {}, level: 10, project: { title: "Tip Calculator", summary: "s.", concepts: [] } }));
    p.setSetting("onboarding", "");
    p.close();
    const b = await boot({ cwd: dir });
    expect(b.widgets["tutor"]?.[1]).toMatch(/spec error: \/tutor-start spec/);
  });
  it("the plan job keeps the model it started with, even if this session's ctx goes stale (final review I2)", async () => {
    const b = await boot({ cwd: dir });
    const ctx = b.ctx as unknown as { model?: unknown; modelRegistry: { complete: unknown } };
    const replies = ["not json", SPEC([])];
    ctx.modelRegistry.complete = async () => { ctx.model = undefined; return { role: "assistant", stopReason: "stop", content: [{ type: "text", text: replies.shift() }] }; };
    await exchange(b, note({ path: "build" }));
    await waitFor(() => existsSync(pjoin(dir, "spec", "tasks.md")));
  });
  it("a checks job still running at /new or /reload stays silent afterwards (pane check #2)", async () => {
    const b = await boot({ cwd: dir });
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    (b.ctx as unknown as { modelRegistry: { complete: unknown } }).modelRegistry.complete = async (_m: unknown, c: { systemPrompt: string }) => {
      if (c.systemPrompt.startsWith("You write the specification")) return { role: "assistant", stopReason: "stop", content: [{ type: "text", text: SPEC([]) }] };
      await held;
      throw new Error("This extension ctx is stale after session replacement or reload.");
    };
    await exchange(b, note({ path: "build" }));
    await waitFor(() => existsSync(pjoin(dir, "spec", "tasks.md")));
    await new Promise((r) => setTimeout(r, 50));
    await b.events["session_shutdown"]({ type: "session_shutdown" }, b.ctx);
    release();
    await new Promise((r) => setTimeout(r, 200));
    expect(b.notes.filter((n) => /checks could not be written/.test(n))).toEqual([]);
  });
  async function failingPlan(errorMessage: string) {
    const { PROVIDER_RETRY } = await import("../extensions/tutor/progress.js");
    const base = PROVIDER_RETRY.baseDelayMs;
    PROVIDER_RETRY.baseDelayMs = 1;
    try {
      const b = await boot({ cwd: dir });
      let calls = 0;
      // Only the plan job's calls: once the plan is written, the checks job asks the model too.
      (b.ctx as unknown as { modelRegistry: { complete: unknown } }).modelRegistry.complete = async (_m: unknown, c: { systemPrompt: string }) => {
        if (!c.systemPrompt.startsWith("You write the specification")) return { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "" }] };
        return ++calls === 1
          ? { role: "assistant", stopReason: "error", errorMessage, content: [] }
          : { role: "assistant", stopReason: "stop", content: [{ type: "text", text: SPEC([]) }] };
      };
      await exchange(b, note({ path: "build" }));
      await waitFor(() => existsSync(pjoin(dir, "spec", "tasks.md")) || b.notes.some((n) => /could not be written/.test(n)));
      return { calls, written: existsSync(pjoin(dir, "spec", "tasks.md")) };
    } finally { PROVIDER_RETRY.baseDelayMs = base; }
  }
  it("a provider hiccup in the plan job is retried, as Pi retries its own turns (live check 2026-10-20)", async () => {
    expect(await failingPlan("Request timed out.")).toEqual({ calls: 2, written: true });
  });
  it("a quota error in the plan job is not retried", async () => {
    expect(await failingPlan("insufficient_quota")).toEqual({ calls: 1, written: false });
  });
  it("the last concept of a round turns to building that milestone; next starts the following round", async () => {
    const b = await boot({ cwd: dir });
    b.replies.push(SPEC(["basics, functions, bools", "numbers, conditionals, comparisons"]));
    await exchange(b, note({ path: "learn" }));
    for (let i = 0; i < 3; i++) await b.commands["tutor-lesson"].handler("skip", b.ctx);
    expect((await setting(`lesson:${dir}`)).building).toBe(true);
    expect(b.widgets["tutor"]?.[0]).toMatch(/build: milestone 1/);
    await b.commands["tutor-lesson"].handler("next", b.ctx);
    expect((await setting(`lesson:${dir}`))).toMatchObject({ round: 1, concept: "numbers", building: false });
  });
});

describe("/tutor-fix (spec 2026-10-21 §5: at pro the fix comes only when asked)", () => {
  const ep = (band: string) => ({ type: "custom", customType: "tutor_episode", data: { id: "ep-1", trigger: { kind: "chat" }, band, attempts: 4, opened: 1, turns: 0, concept_tags: [] } });
  it("pro: marks the open episode, so the next turn is the fix", async () => {
    const b = await boot({ branch: [ep("pro")] });
    await b.commands["tutor-level"].handler("90", b.ctx);
    await b.commands["tutor-fix"].handler("", b.ctx);
    expect(episodes(b.entries).at(-1)).toMatchObject({ fixAsked: true });
    const t = await turn(b.events, b.ctx, "go on", judged("none"));
    expect(t.message?.content).toContain("this turn: Give the fix for only the stuck part");
  });
  it("other levels and no episode: a note, nothing changes", async () => {
    const b = await boot({ branch: [ep("beginner")] });
    await b.commands["tutor-level"].handler("10", b.ctx);
    const before = episodes(b.entries).length;
    await b.commands["tutor-fix"].handler("", b.ctx);
    expect(b.notes.at(-1)).toBe("the fix comes after a few tries on the same spot");
    expect(episodes(b.entries).length).toBe(before);
    const none = await boot();
    await none.commands["tutor-fix"].handler("", none.ctx);
    expect(none.notes.at(-1)).toMatch(/nothing to fix/);
  });
});

describe("held replies (spec 2026-10-21 §6)", () => {
  const project = () => {
    const dir = mkd(pjoin(tmp(), "pitutor-held-"));
    mkdir(pjoin(dir, "src")); mkdir(pjoin(dir, "spec"));
    wfile(pjoin(dir, "src", "main.py"), "def split_amount(total, people):\n    return total * people\n");
    wfile(pjoin(dir, "spec", "tasks.md"), "- [ ] P2.T2 add `split_amount(total, people)` = total / people\n");
    return dir;
  };
  const ep = (attempts: number) => ({ type: "custom", customType: "tutor_episode", data: { id: "ep-1", trigger: { kind: "run", cmd: ["python3", "src/main.py"], code: 1, trace: "ZeroDivisionError: x" }, band: "beginner", attempts, spot: "ZeroDivisionError: x", opened: 1, turns: 0, concept_tags: [] } });
  const reply = (text: string) => assistant(`${text}\n\`\`\`tutor-judgment\n{"judgment":"wrong"}\n\`\`\``);
  const textOf = (m: unknown) => ((m as { content: { type: string; text?: string }[] }).content.find((c) => c.type === "text")?.text ?? "");
  const judgments = (b: { entries: { type: string }[] }) => b.entries.filter((e) => e.type === "tutor_judgment").length;
  const level10 = async (b: Awaited<ReturnType<typeof boot>>) => b.commands["tutor-level"].handler("10", b.ctx);
  const settle = () => new Promise((r) => setTimeout(r, 120));
  /** A run Pi starts from a custom message (sendMessage with triggerTurn): before_agent_start with messageType "custom". */
  const customTurn = async (b: Awaited<ReturnType<typeof boot>>, message: object, ...replies: unknown[]) => {
    const opts = { sections: {} as Record<string, string> };
    const r = (await b.events["before_agent_start"]({ type: "before_agent_start", messageType: "custom", message, systemPromptOptions: opts }, b.ctx)) as { message?: { content: string } } | undefined;
    for (const m of replies) {
      const e = (await b.events["message_end"]({ type: "message_end", message: m }, b.ctx)) as { message?: object } | undefined;
      if (e?.message) { for (const k of Object.keys(m as object)) delete (m as Record<string, unknown>)[k]; Object.assign(m as object, e.message); }
      await b.events["turn_end"]({ type: "turn_end", message: m }, b.ctx);
    }
    return Object.assign(opts, { message: r?.message });
  };

  it("a hint showing a line of the hidden reference is held, though no task names it (spec 2026-10-21 §7)", async () => {
    const { realpathSync } = await import("node:fs");
    const dir = realpathSync(mkd(pjoin(tmp(), "pitutor-ref-")));
    mkdir(pjoin(dir, "spec")); mkdir(pjoin(dir, "src"));
    wfile(pjoin(dir, "spec", "tasks.md"), "- [ ] P1.T1 share the bill\n");
    wfile(pjoin(dir, "src", "main.py"), "print('hi')\n");
    const file = pjoin(mkd(pjoin(tmp(), "pitutor-refprof-")), "p.sqlite");
    const { Profile } = await import("../extensions/tutor/profile.js");
    const p = Profile.open(file);
    p.saveLanguage("python", 10, {}, 1); p.addProject("python", dir, "Split", 1);
    p.setSetting(`checks:${dir}`, JSON.stringify({ milestones: { 1: { ran: true, checks: [], reference: "def share(total, people):\n    return round(total / people, 2)\n" } } }));
    p.close();
    const saved = process.env.PI_TUTOR_PROFILE;
    process.env.PI_TUTOR_PROFILE = file;
    try {
      const b = await boot({ cwd: dir, branch: [ep(1)] });
      await level10(b);
      const leak = reply("Try `return round(total / people, 2)` there.");
      await turn(b.events, b.ctx, "help", leak);
      expect(textOf(leak)).toBe(REWRITE_TEXT);
      expect(b.entries.filter((e) => e.type === "tutor_check").at(-1)?.data).toMatchObject({ issues: ["own-code"] });
    } finally { if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved; }
  });
  it("a leaking hint is replaced, re-asked through a fresh run, and the second reply is checked too", async () => {
    const b = await boot({ cwd: project(), branch: [ep(1)] });
    await level10(b);
    const leak = reply("Change it to `return total / people`.");
    await turn(b.events, b.ctx, "help", leak);
    expect(textOf(leak)).toBe(REWRITE_TEXT);
    expect(judgments(b)).toBe(0);
    // Live audits need the rejected text (never shown): was it a real leak or a too-strict check?
    expect(b.entries.filter((e) => e.type === "tutor_check").at(-1)?.data).toMatchObject({ issues: ["own-code"], rejected: expect.stringContaining("return total / people") });
    const sentBefore = b.sent.length;
    await b.events["agent_end"]({ type: "agent_end", messages: [] }, b.ctx);
    await settle();
    expect(b.sent.length).toBe(sentBefore); // nothing typed into the learner's chat (live check 2026-10-21)
    const ask = b.messages.at(-1) as { message: { customType: string; display: boolean; content: string }; options: { triggerTurn?: boolean } };
    expect(ask.message).toMatchObject({ customType: "tutor_rewrite", display: false });
    expect(ask.options.triggerTurn).toBe(true);
    const good = reply("Look at the operator inside `split_amount`.");
    const t2 = await customTurn(b, ask.message, good);
    expect(t2.message?.content).toMatch(/\[tutor-check\]/);
    expect(textOf(good)).toContain("Look at the operator inside `split_amount`.");
    expect(judgments(b)).toBe(1);
  });
  it("Review Focus #2/#5: after two failed re-asks the learner sees the fallback, with no code, and no fourth ask", async () => {
    const b = await boot({ cwd: project(), branch: [ep(1)] });
    await level10(b);
    const shown: string[] = [];
    for (let i = 0; i < 3; i++) {
      const leak = reply("Write `return total / people`.");
      const rewrites = b.messages.filter((m) => (m as { message: { customType: string } }).message.customType === "tutor_rewrite");
      if (i === 0) await turn(b.events, b.ctx, "help", leak);
      else await customTurn(b, (rewrites.at(-1) as { message: object }).message, leak);
      shown.push(textOf(leak));
      await b.events["agent_end"]({ type: "agent_end", messages: [] }, b.ctx);
      await settle();
    }
    expect(shown.slice(0, 2)).toEqual([REWRITE_TEXT, REWRITE_TEXT]);
    expect(shown[2]).toBe(fallbackReply("hint", "ZeroDivisionError: x"));
    expect(shown[2]).not.toMatch(/`/);
    expect(b.messages.filter((m) => (m as { message: { customType: string } }).message.customType === "tutor_rewrite")).toHaveLength(2);
  });
  it("final review M2: a cut-off reply that fails its check shows the fallback, never nothing", async () => {
    const b = await boot({ cwd: project(), branch: [ep(1)] });
    await level10(b);
    const cut = assistant("Change it to `return total / people` and", "length");
    await turn(b.events, b.ctx, "help", cut);
    expect(textOf(cut)).toBe(fallbackReply("hint", "ZeroDivisionError: x"));
  });
  it("the transformer holds a streaming reply and hides the judgment block after it", async () => {
    const b = await boot({ cwd: project(), branch: [ep(1)] });
    await b.events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: "help", systemPromptOptions: { sections: {} } }, b.ctx);
    const t = b.transformers[0];
    expect(t("Change it to `return total / people`", { messageType: "assistant", isStreaming: true, availableWidth: 68 })).toBe(HOLD_TEXT);
    const after = t("Look here.\n```tutor-judgment\n{\"judgment\":\"wrong\"}\n```", { messageType: "assistant", isStreaming: false, availableWidth: 68 });
    expect(after).toContain("Look here.");
    expect(after).not.toMatch(/tutor-judgment|"judgment"/);
  });
  it("final review I2: only the reply to the failed run gets the fix; a chat question after it is at why", async () => {
    const b = await boot({ cwd: project(), branch: [ep(4)] });
    await level10(b);
    const nudge = await turn(b.events, b.ctx, "[tutor] stuck signal: run failed (exit 1): python3 src/main.py", reply("ok"));
    expect(nudge.message?.content).toContain("this turn: Give the fix for only the stuck part");
    const chat = await turn(b.events, b.ctx, "thanks, and what about the next task?", reply("ok"));
    expect(chat.message?.content).toContain("this turn: Say clearly why it is wrong");
  });
  it("thinking is hidden while the fix is not allowed, whatever the setting", async () => {
    const think = { messageType: "assistant-thinking", isStreaming: true, availableWidth: 68 };
    const hint = await boot({ cwd: project(), branch: [ep(1)] });
    await level10(hint);
    await hint.commands["tutor-thinking"].handler("show", hint.ctx);
    await hint.events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: "help", systemPromptOptions: { sections: {} } }, hint.ctx);
    expect(hint.transformers[0]("so it is total / people", think)).toBe(THINKING_LABEL);
    const fix = await boot({ cwd: project(), branch: [ep(4)] });
    await level10(fix);
    await fix.commands["tutor-thinking"].handler("show", fix.ctx);
    await fix.events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: "[tutor] stuck signal: run failed (exit 1): python3 src/main.py", systemPromptOptions: { sections: {} } }, fix.ctx);
    expect(fix.transformers[0]("so it is total / people", think)).toBe("so it is total / people");
  });
});
