import extension from "../extensions/tutor/index.js";

export type Handler = (...a: unknown[]) => unknown;

export function fakePi() {
  const events: Record<string, Handler> = {};
  const commands: Record<string, { handler: (args: string, ctx: unknown) => Promise<void> }> = {};
  const entries: { type: string; data: unknown }[] = [];
  const sent: { text: string; opts: unknown }[] = [];
  const pi = {
    on: (name: string, h: Handler) => { events[name] = h; return () => {}; },
    registerCommand: (name: string, def: { handler: (args: string, ctx: unknown) => Promise<void> }) => { commands[name] = def; },
    appendEntry: (type: string, data: unknown) => { entries.push({ type, data }); },
    sendUserMessage: (text: string, opts: unknown) => { sent.push({ text, opts }); },
  };
  return { pi, events, commands, entries, sent };
}

export function fakeCtx(branch: unknown[] = [], cwd = "/tmp/proj") {
  const widgets: Record<string, string[] | undefined> = {};
  const statuses: Record<string, string | undefined> = {};
  const notes: string[] = [];
  const busy = { value: false };
  return {
    ctx: {
      hasUI: true, cwd,
      isIdle: () => !busy.value,
      sessionManager: { getBranch: () => branch },
      ui: {
        setWidget: (k: string, c: string[] | undefined) => { widgets[k] = c; },
        setStatus: (k: string, t: string | undefined) => { statuses[k] = t; },
        notify: (m: string) => notes.push(m),
      },
    },
    widgets, statuses, notes, busy,
  };
}

/** Boot the extension. Detached (no $NVIM) unless `nvim` names a socket. */
export async function boot(opts: { branch?: unknown[]; cwd?: string; nvim?: string } = {}) {
  const f = fakePi();
  extension(f.pi as never);
  const c = fakeCtx(opts.branch ?? [], opts.cwd);
  const saved = process.env.NVIM;
  if (opts.nvim) process.env.NVIM = opts.nvim; else delete process.env.NVIM;
  await f.events["session_start"]({ type: "session_start", reason: "startup" }, c.ctx);
  if (saved) process.env.NVIM = saved; else delete process.env.NVIM;
  return { ...f, ...c };
}

export const assistant = (text: string, stopReason = "stop") =>
  ({ role: "assistant", content: [{ type: "text", text }], stopReason });

export const judged = (judgment: string, episode_closed = false, stopReason = "stop") =>
  assistant("hm\n```tutor-judgment\n" + JSON.stringify({ judgment, episode_closed }) + "\n```", stopReason);

export const episodes = (entries: { type: string; data: unknown }[]) =>
  entries.filter((e) => e.type === "tutor_episode").map((e) => e.data as Record<string, unknown>);
