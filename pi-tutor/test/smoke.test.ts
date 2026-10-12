import { describe, it, expect } from "vitest";
import extension from "../extensions/tutor/index.js";

type Handler = (...a: unknown[]) => unknown;
function fakePi() {
  const events: Record<string, Handler> = {};
  const commands: Record<string, { handler: (args: string, ctx: unknown) => Promise<void> }> = {};
  const entries: { type: string; data: unknown }[] = [];
  const pi = {
    on: (name: string, h: Handler) => { events[name] = h; return () => {}; },
    registerCommand: (name: string, def: { handler: (args: string, ctx: unknown) => Promise<void> }) => { commands[name] = def; },
    appendEntry: (type: string, data: unknown) => { entries.push({ type, data }); },
  };
  return { pi, events, commands, entries };
}
function fakeCtx(branch: unknown[] = []) {
  const widgets: Record<string, string[] | undefined> = {};
  const statuses: Record<string, string | undefined> = {};
  const notes: string[] = [];
  return {
    ctx: {
      hasUI: true, cwd: "/tmp/proj",
      sessionManager: { getBranch: () => branch },
      ui: {
        setWidget: (k: string, c: string[] | undefined) => { widgets[k] = c; },
        setStatus: (k: string, t: string | undefined) => { statuses[k] = t; },
        notify: (m: string) => notes.push(m),
      },
    },
    widgets, statuses, notes,
  };
}
/** Boot the extension detached (no $NVIM) so tests never need a Neovim. */
async function boot(branch: unknown[] = []) {
  const f = fakePi();
  extension(f.pi as never);
  const c = fakeCtx(branch);
  const saved = process.env.NVIM; delete process.env.NVIM;
  await f.events["session_start"]({ type: "session_start", reason: "startup" }, c.ctx);
  if (saved) process.env.NVIM = saved;
  return { ...f, ...c };
}
const assistant = (text: string) => ({ role: "assistant", content: [{ type: "text", text }], stopReason: "stop" });

describe("extension wiring", () => {
  it("registers lifecycle handlers and commands", () => {
    const { pi, events, commands } = fakePi();
    extension(pi as never);
    expect(Object.keys(events)).toEqual(expect.arrayContaining(["session_start", "session_shutdown", "before_agent_start", "turn_end"]));
    expect(Object.keys(commands)).toEqual(expect.arrayContaining(["tutor-level", "tutor-status"]));
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
    const { widgets } = await boot([
      { type: "custom", customType: "tutor_level", data: { level: 10 } },
      { type: "custom", customType: "tutor_signal", data: {} },
      { type: "custom", customType: "tutor_level", data: { level: 80 } },
    ]);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 80 · rung 1");
  });

  it("before_agent_start sets the band section and sends no editor message when detached", async () => {
    const { events, commands, ctx } = await boot();
    const opts = { sections: {} as Record<string, string> };
    const r1 = await events["before_agent_start"]({ type: "before_agent_start", prompt: "hi", systemPromptOptions: opts }, ctx);
    expect(opts.sections["tutor"]).toMatch(/^# Tutor band: intermediate\n/);
    expect(opts.sections["tutor"]).toContain("```tutor-judgment");
    expect(r1).toBeUndefined();
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
