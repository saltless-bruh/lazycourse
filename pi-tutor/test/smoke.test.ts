import { describe, it, expect } from "vitest";
import { fakePi, boot, assistant, judged, episodes } from "./fake-pi.js";
import extension from "../extensions/tutor/index.js";

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
    expect(widgets["tutor"]?.[1]).toBe("detached: pi started outside Neovim");
    expect(statuses["tutor"]).toBe("tutor lvl 50 · intermediate");
  });

  it("/tutor-level validates, persists a tutor_level entry, and sets the start rung", async () => {
    const { commands, ctx, widgets, notes, entries } = await boot();
    await commands["tutor-level"].handler("abc", ctx);
    expect(notes.at(-1)).toMatch(/0-100/);
    await commands["tutor-level"].handler("20", ctx);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 20 · rung 3");
    expect(entries).toContainEqual({ type: "tutor_level", data: { level: 20 } });
  });

  it("restores the latest tutor_level entry from the session branch on start", async () => {
    const { widgets } = await boot({ branch: [
      { type: "custom", customType: "tutor_level", data: { level: 10 } },
      { type: "custom", customType: "tutor_signal", data: {} },
      { type: "custom", customType: "tutor_level", data: { level: 80 } },
    ] });
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 80 · rung 1");
  });

  it("before_agent_start sets the band section; detached turns carry the episode but no editor snapshot", async () => {
    const { events, commands, ctx } = await boot();
    const opts = { sections: {} as Record<string, string> };
    const r1 = (await events["before_agent_start"]({ type: "before_agent_start", prompt: "hi", systemPromptOptions: opts }, ctx)) as { message: { customType: string; content: string; display: boolean } };
    expect(opts.sections["tutor"]).toContain("# Tutor band: intermediate\n");
    expect(opts.sections["tutor"]).toContain("## Teaching style");
    expect(opts.sections["tutor"]).toContain("```tutor-judgment");
    expect(r1.message.customType).toBe("tutor_editor");
    expect(r1.message.display).toBe(false);
    expect(r1.message.content).toMatch(/^\[episode\] stuck on: learner question\nhint rung 2\/5/);
    expect(r1.message.content).not.toContain("[editor]");
    await commands["tutor-level"].handler("5", ctx);
    await events["before_agent_start"]({ type: "before_agent_start", prompt: "hi", systemPromptOptions: opts }, ctx);
    expect(opts.sections["tutor"]).toContain("# Tutor band: beginner\n");
  });

  it("turn_end parses the judgment into the widget and a tutor_judgment entry", async () => {
    const { events, ctx, entries } = await boot();
    await events["turn_end"]({ type: "turn_end", message: assistant('ok\n```tutor-judgment\n{"judgment":"correct","concept_tags":["x"]}\n```') }, ctx);
    expect(entries.at(-1)).toEqual({ type: "tutor_judgment", data: { judgment: "correct", concept_tags: ["x"], task_done_ids: [], episode_closed: false } });
    const n = entries.length;
    await events["turn_end"]({ type: "turn_end", message: assistant("no block here") }, ctx);
    expect(entries.length).toBe(n); // a missing block is shown, not persisted
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
  const bas = (prompt: string) => ({ type: "before_agent_start", prompt, systemPromptOptions: { sections: {} } });

  it("a chat message opens an episode; correct advances, wrong holds, episode_closed closes", async () => {
    const { events, ctx, entries, widgets } = await boot();
    await events["before_agent_start"](bas("why does this fail?"), ctx);
    expect(episodes(entries).at(-1)).toMatchObject({ trigger: { kind: "chat" }, rung: 2, turns: 0 });
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 50 · rung 2"); // line 2 says "detached" in these boots
    await events["turn_end"]({ type: "turn_end", message: judged("correct") }, ctx);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 50 · rung 3");
    await events["turn_end"]({ type: "turn_end", message: judged("wrong") }, ctx);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 50 · rung 3");
    await events["turn_end"]({ type: "turn_end", message: judged("correct", true) }, ctx);
    expect(episodes(entries).at(-1)).toMatchObject({ rung: 4, turns: 3, closeReason: "judged" });
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 50 · rung 2");
  });

  it("[tutor] nudges never open a chat episode, and a second chat message joins the open one", async () => {
    const { events, ctx, entries } = await boot();
    await events["before_agent_start"](bas("[tutor] stuck signal: idle at a.py:1"), ctx);
    expect(episodes(entries)).toHaveLength(0);
    await events["before_agent_start"](bas("first"), ctx);
    await events["before_agent_start"](bas("second"), ctx);
    expect(episodes(entries)).toHaveLength(1);
  });

  it("aborted, errored and truncated replies leave the rung and the widget alone", async () => {
    const { events, ctx, entries, widgets } = await boot();
    await events["before_agent_start"](bas("q"), ctx);
    const n = entries.length;
    for (const stop of ["aborted", "error", "length"]) {
      await events["turn_end"]({ type: "turn_end", message: judged("correct", true, stop) }, ctx);
    }
    expect(entries.length).toBe(n);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 50 · rung 2");
  });

  it("restores an open episode on resume and ignores a closed one", async () => {
    const ep = { id: "ep-1", trigger: { kind: "chat" }, band: "intermediate", rung: 4, opened: 1, turns: 3, concept_tags: [] };
    const entry = (data: unknown) => ({ type: "custom", customType: "tutor_episode", data });
    const open = await boot({ branch: [entry(ep)] });
    expect(open.widgets["tutor"]?.[0]).toBe("tutor  lvl 50 · rung 4");
    const closed = await boot({ branch: [entry(ep), entry({ ...ep, closed: 5, closeReason: "judged" })] });
    expect(closed.widgets["tutor"]?.[0]).toBe("tutor  lvl 50 · rung 2");
  });

  it("/tutor-level into pro re-caps an open episode's rung and persists it", async () => {
    const { events, commands, ctx, entries, widgets } = await boot();
    await events["before_agent_start"](bas("q"), ctx);
    for (let i = 0; i < 3; i++) await events["turn_end"]({ type: "turn_end", message: judged("correct") }, ctx);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 50 · rung 5");
    await commands["tutor-level"].handler("90", ctx);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 90 · rung 4");
    expect(episodes(entries).at(-1)).toMatchObject({ band: "pro", rung: 4 });
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

  it("/tutor-start scaffolds through the real model call path and says how to continue when detached", async () => {
    const { mkdtempSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "pitutor-smoke-"));
    const b = await boot({ cwd: root });
    b.replies.push(
      JSON.stringify({ projects: [1, 2, 3].map((n) => ({ title: `P${n}`, summary: "s.", size: "small", concepts: [] })) }),
      JSON.stringify({ design_md: "# D", tasks_md: "- [ ] P1.T1 x", requirements_md: "## P1.T1", entry_file: "src/main.py", run_cmd: "python src/main.py" }),
    );
    b.script.push("none yet", "", "never used it", "", "small (1-2 h)", "1. P1 (small) — s.", join(root, "p1"));
    await b.commands["tutor-start"].handler("python", b.ctx);
    expect(existsSync(join(root, "p1", "spec", "tasks.md"))).toBe(true);
    expect(b.notes.at(-1)).toContain(`cd ${join(root, "p1")} && pi`);
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
      expect(b.widgets["tutor"]?.[0]).toBe("tutor  rust · lvl 20 · rung 3");
      await b.events["before_agent_start"]({ type: "before_agent_start", prompt: "q", systemPromptOptions: { sections: {} } }, b.ctx);
      await b.events["turn_end"]({ type: "turn_end", message: assistant('ok\n```tutor-judgment\n{"judgment":"correct","concept_tags":["traits"],"episode_closed":true}\n```') }, b.ctx);
      await b.commands["tutor-level"].handler("70", b.ctx);
      await b.events["session_shutdown"]({ type: "session_shutdown" }, b.ctx);
      const check = Profile.open(file);
      expect(check.language("rust")?.level).toBe(70);
      expect(check.episodes("rust")).toEqual([expect.objectContaining({ project: dir, concept_tags: ["traits"], turns: 1, rungs_used: 2 })]);
      expect(check.concepts("rust")).toEqual([{ language: "rust", tag: "traits", ease: expect.closeTo(2 / 3), episodes: 1 }]);
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
      expect(b.widgets["tutor"]?.[0]).toBe("tutor  lvl 50 · rung 2");
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
      await b.events["before_agent_start"]({ type: "before_agent_start", prompt: "q", systemPromptOptions: { sections: {} } }, b.ctx);
      await expect(b.events["turn_end"]({ type: "turn_end", message: judged("correct", true) }, b.ctx)).resolves.toBeUndefined();
      expect(b.widgets["tutor"]?.[1]).toMatch(/detached|episode closed/); // the episode still closed
      await expect(b.commands["tutor-level"].handler("70", b.ctx)).resolves.toBeUndefined();
      expect(b.notes.some((n) => /profile write failed/.test(n))).toBe(true);
    } finally {
      other.exec("ROLLBACK"); other.close();
      if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved;
    }
  }, 15000);

  it("/tutor-start shows Pi's cancellable loader during each model call and passes its signal (final review I1)", async () => {
    const { mkdtempSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "pitutor-loader-"));
    const { initTheme } = await import("@earendil-works/pi-coding-agent");
    initTheme(undefined, false); // Pi does this at startup; BorderedLoader needs it
    const b = await boot({ cwd: root });
    const shown: unknown[] = [];
    const signals: unknown[] = [];
    const tui = { requestRender() {} };
    const theme = { fg: (_c: string, s: string) => s };
    const ctx = b.ctx as unknown as { ui: Record<string, unknown>; modelRegistry: Record<string, unknown> };
    ctx.ui.custom = (factory: (t: unknown, th: unknown, kb: unknown, done: (r: unknown) => void) => unknown) =>
      new Promise((resolve) => { shown.push(factory(tui, theme, {}, resolve)); });
    const replies = [
      JSON.stringify({ projects: [1, 2, 3].map((n) => ({ title: `P${n}`, summary: "s.", size: "small", concepts: [] })) }),
      JSON.stringify({ design_md: "# D", tasks_md: "- [ ] P1.T1 x", requirements_md: "## P1.T1", entry_file: "src/main.py", run_cmd: "python src/main.py" }),
    ];
    ctx.modelRegistry.complete = async (_m: unknown, _c: unknown, opts: { signal?: AbortSignal }) => {
      signals.push(opts?.signal);
      return { role: "assistant", stopReason: "stop", content: [{ type: "text", text: replies.shift() }] };
    };
    b.script.push("none yet", "", "never used it", "", "small (1-2 h)", "1. P1 (small) — s.", join(root, "p1"));
    await b.commands["tutor-start"].handler("python", b.ctx);
    const { BorderedLoader } = await import("@earendil-works/pi-coding-agent");
    expect(shown).toHaveLength(3); // suggest + scaffold model calls, then the DevDocs fetch (M5-finish)
    for (const c of shown) expect(c).toBeInstanceOf(BorderedLoader);
    expect(signals.length).toBe(2);
    expect(signals.every((s) => s instanceof AbortSignal)).toBe(true);
    for (const c of shown) (c as { dispose(): void }).dispose();
    expect(existsSync(join(root, "p1", "spec", "tasks.md"))).toBe(true);
  });
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
  const closedEp = { id: "ep-1", trigger: { kind: "error", path: "/p/main.rs", line: 4, msg: "borrow of moved value" }, band: "beginner", rung: 4, opened: 1, turns: 2, concept_tags: ["ownership"], closed: 5, closeReason: "judged" };
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

describe("M5 ease start rung", () => {
  it("a first judgment on concepts with ease ≥ 0.7 starts the episode one rung lower", async () => {
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
      await b.events["before_agent_start"]({ type: "before_agent_start", prompt: "q", systemPromptOptions: { sections: {} } }, b.ctx);
      expect(b.widgets["tutor"]?.[0]).toBe("tutor  rust · lvl 20 · rung 3");
      await b.events["turn_end"]({ type: "turn_end", message: assistant('hm\n```tutor-judgment\n{"judgment":"wrong","concept_tags":["traits"]}\n```') }, b.ctx);
      expect(b.widgets["tutor"]?.[0]).toBe("tutor  rust · lvl 20 · rung 2");
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
    b.replies.push(
      JSON.stringify({ projects: [1, 2, 3].map((n) => ({ title: `P${n}`, summary: "s.", size: "small", concepts: [] })) }),
      JSON.stringify({ design_md: "# D", tasks_md: "- [ ] P1.T1 x", requirements_md: "## P1.T1", entry_file: "src/main.go", run_cmd: "go run ./src" }),
    );
    b.script.push("none yet", "", "never used it", "", "small (1-2 h)", "1. P1 (small) — s.", join(root, "p1"));
    await b.commands["tutor-start"].handler("go", b.ctx);
    expect(existsSync(join(root, "p1", "spec", "tasks.md"))).toBe(true);
    expect(b.notes.some((n) => /go docs fetch failed/.test(n))).toBe(true);
    expect(b.notes.at(-1)).toContain(`cd ${join(root, "p1")} && pi`);
  });
});
