import { describe, it, expect } from "vitest";
import extension from "../extensions/tutor/index.js";

function fakePi() {
  const events: Record<string, (...a: unknown[]) => unknown> = {};
  const commands: Record<string, { handler: (args: string, ctx: unknown) => Promise<void> }> = {};
  const pi = {
    on: (name: string, h: (...a: unknown[]) => unknown) => { events[name] = h; return () => {}; },
    registerCommand: (name: string, def: { handler: (args: string, ctx: unknown) => Promise<void> }) => { commands[name] = def; },
    appendEntry: () => {},
  };
  return { pi, events, commands };
}
function fakeCtx() {
  const widgets: Record<string, string[] | undefined> = {};
  const notes: string[] = [];
  return {
    ctx: { hasUI: true, cwd: "/tmp/proj", ui: {
      setWidget: (k: string, c: string[] | undefined) => { widgets[k] = c; },
      setStatus: () => {}, notify: (m: string) => notes.push(m),
    } },
    widgets, notes,
  };
}

describe("extension wiring", () => {
  it("registers lifecycle handlers and commands", () => {
    const { pi, events, commands } = fakePi();
    extension(pi as never);
    expect(Object.keys(events)).toEqual(expect.arrayContaining(["session_start", "session_shutdown"]));
    expect(Object.keys(commands)).toEqual(expect.arrayContaining(["tutor-level", "tutor-status"]));
  });

  it("/tutor-level validates its argument and updates the widget", async () => {
    const { pi, events, commands } = fakePi();
    extension(pi as never);
    const { ctx, widgets, notes } = fakeCtx();
    const saved = process.env.NVIM; delete process.env.NVIM;
    await events["session_start"]({ type: "session_start", reason: "startup" }, ctx);
    if (saved) process.env.NVIM = saved;
    expect(widgets["tutor"]?.[1]).toBe("detached: pi started outside Neovim");
    await commands["tutor-level"].handler("abc", ctx);
    expect(notes.at(-1)).toMatch(/0-100/);
    await commands["tutor-level"].handler("40", ctx);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 40");
  });
});
