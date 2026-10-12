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
    expect(opts.sections["tutor"]).toMatch(/^# Tutor band: intermediate\n/);
    expect(opts.sections["tutor"]).toContain("```tutor-judgment");
    expect(r1.message.customType).toBe("tutor_editor");
    expect(r1.message.display).toBe(false);
    expect(r1.message.content).toMatch(/^\[episode\] stuck on: learner question\nhint rung 2\/5/);
    expect(r1.message.content).not.toContain("[editor]");
    await commands["tutor-level"].handler("5", ctx);
    await events["before_agent_start"]({ type: "before_agent_start", prompt: "hi", systemPromptOptions: opts }, ctx);
    expect(opts.sections["tutor"]).toMatch(/^# Tutor band: beginner\n/);
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
