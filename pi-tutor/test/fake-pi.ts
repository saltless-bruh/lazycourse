import { mkdtempSync as __mk, writeFileSync as __wf } from "node:fs";
import { tmpdir as __tmp } from "node:os";
import { join as __join } from "node:path";
import { execFile as __execFile } from "node:child_process";
import extension from "../extensions/tutor/index.js";

// The extension only activates when nvim-tutor started Pi (Task 6); tests are tutor mode.
process.env.PI_TUTOR = "1";
process.env.PI_TUTOR_PROFILE ??= ":memory:"; // each boot gets a private in-memory profile
// Never touch the real ~/.pi/agent or the network: temp skills root, and no built-in doc sources.
const __dir = __mk(__join(__tmp(), "pitutor-agent-"));
process.env.PI_CODING_AGENT_DIR ??= __dir;
process.env.PI_TUTOR_DEVDOCS ??= "http://127.0.0.1:9"; // refused: tests never reach devdocs.io
if (!process.env.PI_TUTOR_SOURCES) {
  process.env.PI_TUTOR_SOURCES = __join(__dir, "sources.json");
  __wf(process.env.PI_TUTOR_SOURCES, "{}");
}

export type Handler = (...a: unknown[]) => unknown;

export function fakePi() {
  const events: Record<string, Handler> = {};
  const commands: Record<string, { handler: (args: string, ctx: unknown) => Promise<void> }> = {};
  const entries: { type: string; data: unknown }[] = [];
  const sent: { text: string; opts: unknown }[] = [];
  const execOut: Record<string, { stdout: string; stderr: string; code: number }> = {};
  const skills: { path: string }[] = [];
  const tools: Record<string, { execute: (...a: unknown[]) => Promise<unknown> }> = {};
  const transformers: ((md: string, c: { messageType: string; isStreaming: boolean; availableWidth: number }) => string)[] = [];
  const pi = {
    registerMarkdownTransformer: (t: (typeof transformers)[number]) => { transformers.push(t); },
    registerTool: (t: { name: string; execute: (...a: unknown[]) => Promise<unknown> }) => { tools[t.name] = t; },
    on: (name: string, h: Handler) => { events[name] = h; return () => {}; },
    registerCommand: (name: string, def: { handler: (args: string, ctx: unknown) => Promise<void> }) => { commands[name] = def; },
    appendEntry: (type: string, data: unknown) => { entries.push({ type, data }); },
    sendUserMessage: (text: string, opts: unknown) => { sent.push({ text, opts }); },
    exec: async (command: string) => ({ ...(execOut[command] ?? { stdout: "", stderr: `${command}: not found`, code: 127 }), killed: false }),
    getCommands: () => skills.map((s) => ({ name: "skill:x", source: "skill", sourceInfo: { path: s.path } })),
  };
  return { pi, events, commands, entries, sent, skills, execOut, tools, transformers };
}

export function fakeCtx(branch: unknown[] = [], cwd = "/tmp/proj") {
  const widgets: Record<string, string[] | undefined> = {};
  const statuses: Record<string, string | undefined> = {};
  const notes: string[] = [];
  const busy = { value: false };
  const script: (string | undefined)[] = [];
  const replies: string[] = [];
  const edits: (string | undefined)[] = [];
  const editorSeen: string[] = [];
  const reloads = { n: 0 };
  return {
    ctx: {
      hasUI: true, cwd, mode: "tui",
      isIdle: () => !busy.value,
      reload: async () => { reloads.n++; },
      sessionManager: { getBranch: () => branch },
      model: { id: "fake-model" },
      modelRegistry: {
        complete: async () => ({ role: "assistant", stopReason: "stop", content: [{ type: "text", text: replies.shift() ?? "" }] }),
      },
      ui: {
        setWidget: (k: string, c: string[] | undefined) => { widgets[k] = c; },
        setStatus: (k: string, t: string | undefined) => { statuses[k] = t; },
        setWorkingMessage: () => {},
        notify: (m: string) => notes.push(m),
        select: async () => script.shift(),
        input: async () => script.shift(),
        editor: async (_title: string, prefill?: string) => { editorSeen.push(prefill ?? ""); return edits.length ? edits.shift() : prefill; },
      },
    },
    widgets, statuses, notes, busy, script, replies, edits, editorSeen, reloads,
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

/** A learner message that states reasoning, so a `correct` judgment stands (compliance.hasReasoning). */
export const REASONED = "I think the loop stops early because range excludes the end";

/** One agent run as Pi drives it: before_agent_start for `prompt`, then the given assistant turn(s). */
export async function turn(events: Record<string, Handler>, ctx: unknown, prompt: string, ...messages: unknown[]) {
  const opts = { sections: {} as Record<string, string> };
  const r = (await events["before_agent_start"]({ type: "before_agent_start", prompt, systemPromptOptions: opts }, ctx)) as { message?: { content: string } } | undefined;
  for (const message of messages) {
    // Pi swaps a message_end replacement into the same object before turn_end (agent-session.js _replaceMessageInPlace).
    const r = (await events["message_end"]?.({ type: "message_end", message }, ctx)) as { message?: object } | undefined;
    if (r?.message) { for (const k of Object.keys(message as object)) delete (message as Record<string, unknown>)[k]; Object.assign(message as object, r.message); }
    await events["turn_end"]({ type: "turn_end", message }, ctx);
  }
  return Object.assign(opts, { message: r?.message }); // sections + the hidden per-turn context
}

/** A real pi.exec stand-in (exit code, killed on timeout) for tests that run real toolchains. */
export const realExec = (command: string, args: string[], o: { cwd: string; timeout: number }) =>
  new Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>((res) =>
    __execFile(command, args, { cwd: o.cwd, timeout: o.timeout, maxBuffer: 4 << 20 }, (e, stdout, stderr) => {
      const err = e as (NodeJS.ErrnoException & { code?: number | string; killed?: boolean }) | null;
      res({ stdout: String(stdout), stderr: String(stderr), code: err ? (typeof err.code === "number" ? err.code : 127) : 0, killed: !!err?.killed });
    }));
