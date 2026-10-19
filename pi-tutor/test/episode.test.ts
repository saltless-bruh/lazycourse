import { describe, it, expect, afterEach, vi } from "vitest";
import { writeFileSync, mkdtempSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NeovimClient } from "neovim";
import { startHeadlessNvim, type Headless } from "./nvim-harness.js";
import { boot, episodes, turn, judged, assistant, REASONED } from "./fake-pi.js";
import { NvimLink, type NvimLinkOptions } from "../extensions/tutor/nvim.js";

let h: Headless | undefined;
let nvim: NeovimClient | undefined;
let shutdown: (() => unknown) | undefined;
afterEach(async () => {
  await shutdown?.(); shutdown = undefined;
  await nvim?.close(); nvim = undefined;
  h?.kill(); h = undefined;
});
const until = (f: () => boolean, ms = 5000) => new Promise<void>((res, rej) => {
  const t0 = Date.now();
  const id = setInterval(() => { if (f()) { clearInterval(id); res(); } else if (Date.now() - t0 > ms) { clearInterval(id); rej(new Error("timeout")); } }, 25);
});

/** Boot linked to a fresh headless Neovim at beginner level (error threshold 0) and open a file in the root. */
async function linked(busy = false, branch: (root: string) => unknown[] = () => []) {
  h = await startHeadlessNvim();
  const b = await boot({ nvim: h.socket, cwd: h.root, branch: branch(h.root) });
  shutdown = () => b.events["session_shutdown"]({ type: "session_shutdown" }, b.ctx);
  expect(b.widgets["tutor"]?.[1]).not.toMatch(/outside nvim|nvim closed/);
  await b.commands["tutor-level"].handler("10", b.ctx);
  b.busy.value = busy;
  const { attach } = await import("neovim");
  nvim = attach({ socket: h.socket });
  writeFileSync(join(h.root, "a.py"), "x = \n");
  await nvim.command(`edit ${join(h.root, "a.py")}`);
  return b;
}
const setError = (msg: string) => nvim!.lua(`local ns = vim.api.nvim_create_namespace("t"); vim.diagnostic.set(ns, 0, {{ lnum = 0, col = 0, severity = 1, message = ... }})`, [msg]);

describe("language card through a real Neovim (Review Focus #4)", () => {
  it("outside a project the card follows the editor's filetype", async () => {
    const b = await linked(); // opens a.py in h.root, which is not a recorded project
    const first = await turn(b.events, b.ctx, "hi", judged("none"));
    expect(first.sections["tutor_lang"]).toMatch(/^\[language card: python\]/);
    writeFileSync(join(h!.root, "b.lua"), "local x = 1\n");
    await nvim!.command(`edit ${join(h!.root, "b.lua")}`);
    const next = await turn(b.events, b.ctx, "and now?", judged("none"));
    expect(next.sections["tutor_lang"]).toMatch(/^\[language card: lua\]/);
  }, 20000);
  it("a .js buffer gets the JavaScript card (M7 minor, JavaScript pack)", async () => {
    const b = await linked();
    writeFileSync(join(h!.root, "app.js"), "export const n = 1;\n");
    await nvim!.command(`edit ${join(h!.root, "app.js")}`);
    const t = await turn(b.events, b.ctx, "hi", judged("none"));
    expect(t.sections["tutor_lang"]).toMatch(/^\[language card: javascript\]/);
  }, 20000);
  it("a .tsx buffer gets the TypeScript card (M7 minor)", async () => {
    const b = await linked();
    writeFileSync(join(h!.root, "App.tsx"), "export const App = () => null;\n");
    await nvim!.command(`edit ${join(h!.root, "App.tsx")}`);
    const t = await turn(b.events, b.ctx, "hi", judged("none"));
    expect(t.sections["tutor_lang"]).toMatch(/^\[language card: typescript\]/);
  }, 20000);
});

describe("stuck episodes through a real Neovim", () => {
  it("a beginner's new error opens an episode and nudges Pi once; clearing it closes the episode", async () => {
    const b = await linked();
    await setError("boom");
    await until(() => b.sent.length > 0);
    expect(b.sent).toEqual([{ text: '[tutor] stuck signal: error "boom" at a.py:1', opts: { deliverAs: "followUp" } }]);
    expect(b.widgets["tutor"]?.[1]).toBe('stuck: error "boom" at a.py:1');
    await setError("boom"); // same error again: no second episode, no second nudge
    await new Promise((r) => setTimeout(r, 300));
    expect(b.sent).toHaveLength(1);
    await nvim!.lua(`vim.diagnostic.reset(vim.api.nvim_create_namespace("t"), 0)`);
    await until(() => b.widgets["tutor"]?.[1] === "episode closed (cleared)");
    expect(episodes(b.entries).at(-1)).toMatchObject({ trigger: { kind: "error", msg: "boom" }, closeReason: "cleared" });
    expect(b.sent).toHaveLength(1);
  }, 20000);

  it("opens the episode silently while Pi is mid-reply", async () => {
    const b = await linked(true);
    await setError("bang");
    await until(() => b.widgets["tutor"]?.[1] === 'stuck: error "bang" at a.py:1');
    expect(b.sent).toEqual([]);
  }, 20000);

  it("an editor error supersedes an open chat episode and still nudges (final review I1)", async () => {
    const b = await linked();
    await b.events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: "what does :w do?", systemPromptOptions: { sections: {} } }, b.ctx);
    expect(episodes(b.entries).at(-1)).toMatchObject({ trigger: { kind: "chat" } });
    await setError("boom");
    await until(() => b.sent.length > 0);
    expect(b.widgets["tutor"]?.[1]).toBe('stuck: error "boom" at a.py:1');
    expect(episodes(b.entries).find((e) => e.closeReason === "superseded")).toMatchObject({ trigger: { kind: "chat" } });
  }, 20000);

  it("a second error within 2 minutes opens its episode but sends no second nudge (final review I2)", async () => {
    const b = await linked();
    await setError("boom");
    await until(() => b.sent.length > 0);
    await setError("bang");
    await until(() => b.widgets["tutor"]?.[1] === 'stuck: error "bang" at a.py:1', 10000);
    expect(b.sent).toHaveLength(1);
  }, 20000);

  it("a restored error episode closes when its error is gone (final review I1)", async () => {
    const b = await linked(false, (root) => [{ type: "custom", customType: "tutor_episode",
      data: { id: "ep-1", trigger: { kind: "error", path: join(root, "a.py"), line: 1, msg: "boom" }, band: "intermediate", rung: 3, opened: 1, turns: 1, concept_tags: [] } }]);
    expect(b.widgets["tutor"]?.[1]).toBe('stuck: error "boom" at a.py:1');
    await nvim!.lua(`local ns = vim.api.nvim_create_namespace("t"); vim.diagnostic.set(ns, 0, {{ lnum = 0, col = 0, severity = 2, message = "only a warning" }})`);
    await until(() => b.widgets["tutor"]?.[1] === "episode closed (cleared)");
    expect(b.sent).toEqual([]);
  }, 20000);
});

describe("profile language in a scaffolded project (M4 final review I3)", () => {
  it("records episodes and /tutor-level under the project's language, not the open buffer's filetype", async () => {
    const { Profile } = await import("../extensions/tutor/profile.js");
    const { realpathSync } = await import("node:fs");
    h = await startHeadlessNvim();
    const root = realpathSync(h.root);
    const file = join(root, "profile.sqlite");
    const seed = Profile.open(file);
    seed.saveLanguage("python", 20, {}, 1);
    seed.addProject("python", root, "Todo CLI", 1);
    seed.close();
    const saved = process.env.PI_TUTOR_PROFILE;
    process.env.PI_TUTOR_PROFILE = file;
    try {
      const b = await boot({ nvim: h.socket, cwd: root });
      shutdown = () => b.events["session_shutdown"]({ type: "session_shutdown" }, b.ctx);
      const { attach } = await import("neovim");
      nvim = attach({ socket: h.socket });
      writeFileSync(join(root, "tasks.md"), "- [ ] P1.T1\n");
      await nvim.command(`edit ${join(root, "tasks.md")}`); // filetype markdown, as right after the switch
      await b.events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: "where do I start?", systemPromptOptions: { sections: {} } }, b.ctx);
      expect(b.widgets["tutor"]?.[0]).toMatch(/^tutor  markdown/); // display follows the buffer
      await b.events["turn_end"]({ type: "turn_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: '```tutor-judgment\n{"judgment":"none","concept_tags":["planning"],"episode_closed":true}\n```' }] } }, b.ctx);
      await b.commands["tutor-level"].handler("60", b.ctx);
      await shutdown(); shutdown = undefined;
      const check = Profile.open(file);
      expect(check.episodes("markdown")).toEqual([]);
      expect(check.episodes("python")).toHaveLength(1);
      expect(check.language("python")?.level).toBe(60);
      check.close();
    } finally { if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved; }
  }, 20000);
});

/** What `:TutorRun` sends (nvim-tutor init.lua M.run → M.notify_tutor). */
const runPayload = (code: number, stderr = "") =>
  nvim!.lua(`vim.rpcnotify(vim.g.tutor_chan, "tutor", ...)`, [{ kind: "run_output", cmd: ["python3", "a.py"], code, stdout: "", stderr }]);

describe("task ticking (M8 D6)", () => {
  const tasks = () => readFileSync(join(h!.root, "spec", "tasks.md"), "utf8");
  const done = (ids: string[]) => assistant("nice\n```tutor-judgment\n" + JSON.stringify({ judgment: "correct", task_done_ids: ids }) + "\n```");
  it("a done task is ticked by the next passing run, not before", async () => {
    const b = await linked();
    mkdirSync(join(h!.root, "spec"));
    writeFileSync(join(h!.root, "spec", "tasks.md"), "- [ ] P1.T1 parse\n- [ ] P1.T2 print\n");
    await turn(b.events, b.ctx, REASONED, done(["P1.T1"]));
    expect(tasks()).toContain("- [ ] P1.T1");
    expect(b.notes.at(-1)).toMatch(/P1\.T1 .*ticked when :TutorRun passes/);
    await runPayload(1);
    await new Promise((r) => setTimeout(r, 300));
    expect(tasks()).toContain("- [ ] P1.T1");
    await runPayload(0);
    await until(() => tasks().includes("- [x] P1.T1"));
    expect(tasks()).toContain("- [ ] P1.T2");
    expect(b.entries.filter((e) => e.type === "tutor_tick").map((e) => e.data)).toEqual([{ ids: ["P1.T1"] }]);
  }, 20000);
  it("waits while spec/tasks.md has unsaved edits in Neovim (Review Focus #5)", async () => {
    const b = await linked();
    mkdirSync(join(h!.root, "spec"));
    writeFileSync(join(h!.root, "spec", "tasks.md"), "- [ ] P1.T1 parse\n");
    await nvim!.command(`edit ${join(h!.root, "spec", "tasks.md")}`);
    await nvim!.command("normal! Ox");
    await turn(b.events, b.ctx, REASONED, done(["P1.T1"]));
    await runPayload(0);
    await until(() => /unsaved/.test(b.notes.at(-1) ?? ""));
    expect(tasks()).toBe("- [ ] P1.T1 parse\n");
  }, 20000);
});

describe("runtime-error episodes (spec 2026-10-13 §7 #4)", () => {
  it("a failing run takes over an open error episode and nudges inside the gap", async () => {
    const b = await linked();
    await setError("boom");
    await until(() => b.sent.length === 1); // the error episode's nudge starts the 2-minute gap
    await runPayload(1, "Traceback (most recent call last):\n  File \"a.py\", line 1\nKeyError: 'x'");
    await until(() => b.sent.length === 2);
    expect(b.sent[1].text).toBe("[tutor] stuck signal: run failed (exit 1): python3 a.py");
    const eps = episodes(b.entries);
    expect(eps.at(-1)).toMatchObject({ trigger: { kind: "run", code: 1, trace: expect.stringContaining("KeyError: 'x'") } });
    expect(eps.find((e) => (e.trigger as { kind: string }).kind === "error" && e.closeReason === "superseded")).toBeTruthy();
    expect(b.widgets["tutor"]?.[1]).toBe("stuck: run failed (exit 1): python3 a.py");
  }, 20000);

  it("a passing run closes the run episode; an editor error does not replace it", async () => {
    const b = await linked();
    await runPayload(1, "KeyError: 'x'");
    await until(() => b.widgets["tutor"]?.[1]?.startsWith("stuck: run failed") === true);
    await setError("later"); // run episodes hold their place
    await new Promise((r) => setTimeout(r, 300));
    expect(episodes(b.entries).at(-1)).toMatchObject({ trigger: { kind: "run" } });
    await runPayload(0);
    await until(() => b.widgets["tutor"]?.[1] === "episode closed (run_passed)");
  }, 20000);
});

describe("architect role and stuck signals (M6a minor)", () => {
  it("an editor error opens an episode silently while the architect is active", async () => {
    const b = await linked();
    await b.commands["tutor-architect"].handler("", b.ctx);
    await setError("boom");
    await until(() => episodes(b.entries).some((e) => (e.trigger as { kind: string }).kind === "error"));
    await new Promise((r) => setTimeout(r, 300));
    expect(b.sent).toEqual([]);
  }, 20000);
});

describe("final review I1: a failing re-run keeps the hint level", () => {
  it("a second failing run refreshes the run episode's trace in place and keeps its rung, turns and tags", async () => {
    const b = await linked();
    await runPayload(1, "KeyError: 'x'");
    await until(() => b.sent.length === 1);
    await turn(b.events, b.ctx, REASONED, judged("correct")); // beginner start rung 3 → 4
    const before = episodes(b.entries).at(-1)!;
    expect(before).toMatchObject({ rung: 4, turns: 1 });
    await runPayload(1, "KeyError: 'y'");
    await until(() => b.sent.length === 2); // still nudged
    const after = episodes(b.entries).at(-1)!;
    expect(after).toMatchObject({ id: before.id, rung: 4, turns: 1, trigger: { kind: "run", trace: "KeyError: 'y'" } });
    expect(episodes(b.entries).some((e) => e.closeReason === "superseded")).toBe(false);
  }, 20000);
});

describe("widget when the editor link ends (M1b #2, M3 #19)", () => {
  it("Neovim closing is shown as nvim closed, with state and judgment", async () => {
    const b = await linked();
    await turn(b.events, b.ctx, REASONED, judged("partial"));
    h!.kill(); h = undefined;
    await until(() => b.widgets["tutor"]?.[1]?.startsWith("nvim closed") === true);
    expect(b.widgets["tutor"]?.[1]).toMatch(/^nvim closed · stuck: .* · judged partial$/); // the state is clipped, never the judgment (M6c I2)
  }, 20000);
  it("the old link's late disconnect after /new does not mark the new link lost (pane review #5)", async () => {
    const seen: NvimLinkOptions[] = [];
    const real = NvimLink.connect.bind(NvimLink);
    const spy = vi.spyOn(NvimLink, "connect").mockImplementation((o) => { seen.push(o); return real(o); });
    try {
      const b = await linked();
      await b.events["session_shutdown"]({ type: "session_shutdown" }, b.ctx);
      const saved = process.env.NVIM; process.env.NVIM = h!.socket;
      try { await b.events["session_start"]({ type: "session_start", reason: "new" }, b.ctx); } finally { if (saved) process.env.NVIM = saved; else delete process.env.NVIM; }
      expect(seen).toHaveLength(2);
      expect(b.widgets["tutor"]?.[1]).not.toMatch(/outside nvim|nvim closed/); // the new link is up
      seen[0].onDisconnect?.(); // the first link's disconnect, arriving after the new session connected
      await b.commands["tutor-level"].handler("10", b.ctx); // repaint
      expect(b.widgets["tutor"]?.[1]).not.toMatch(/outside nvim|nvim closed/);
    } finally { spy.mockRestore(); }
  }, 20000);
  it("a session shutdown (/new, /resume) does not flash the detached wording", async () => {
    const b = await linked();
    const seen: string[] = [];
    const ui = b.ctx.ui as { setWidget: (k: string, c: string[] | undefined) => void };
    const orig = ui.setWidget;
    ui.setWidget = (k, c) => { if (c) seen.push(c[1]); orig(k, c); };
    await b.events["session_shutdown"]({ type: "session_shutdown" }, b.ctx);
    await new Promise((r) => setTimeout(r, 300));
    expect(seen.filter((l) => /outside nvim|nvim closed|detached/.test(l))).toEqual([]);
    shutdown = undefined;
  }, 20000);
});

const h0 = () => mkdtempSync(join(tmpdir(), "pitutor-ease-"));

describe("M6c: episodes against a real Neovim", () => {
  it("a judgment for a replaced episode leaves the new one alone (M3 #17)", async () => {
    const b = await linked(); // beginner: error threshold 0
    const opts = { sections: {} as Record<string, string> };
    await b.events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: REASONED, systemPromptOptions: opts }, b.ctx); // chat episode
    await setError("boom"); // replaces it mid-reply
    await until(() => episodes(b.entries).some((e) => (e.trigger as { kind: string }).kind === "error"));
    await b.events["turn_end"]({ type: "turn_end", message: judged("correct") }, b.ctx);
    expect(episodes(b.entries).at(-1)).toMatchObject({ trigger: { kind: "error" }, rung: 3, turns: 0 });
  }, 20000);
  it("a run that started without an episode does not judge one opened mid-reply (M6c M6)", async () => {
    const b = await linked(); // beginner: error threshold 0
    const opts = { sections: {} as Record<string, string> };
    await b.events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: "[tutor] a proactive nudge", systemPromptOptions: opts }, b.ctx); // no episode
    expect(episodes(b.entries)).toHaveLength(0);
    await setError("boom"); // an editor episode opens mid-reply
    await until(() => episodes(b.entries).some((e) => (e.trigger as { kind: string }).kind === "error"));
    await b.events["turn_end"]({ type: "turn_end", message: judged("wrong") }, b.ctx);
    expect(episodes(b.entries).at(-1)).toMatchObject({ trigger: { kind: "error" }, rung: 3, turns: 0 });
  }, 20000);
  it("display-only filetypes are not languages for /tutor-docs and memory (M5 #38, M6b #57)", async () => {
    const b = await linked();
    writeFileSync(join(h!.root, "notes.md"), "# notes\n");
    await nvim!.command(`edit ${join(h!.root, "notes.md")}`);
    await turn(b.events, b.ctx, "hi", judged("none")); // snapshot sets state.language = markdown
    await b.commands["tutor-docs"].handler("", b.ctx);
    expect(b.notes.at(-1)).toMatch(/usage: \/tutor-docs <language>/);
    await nvim!.command(`edit ${join(h!.root, "a.py")}`);
    await turn(b.events, b.ctx, "hi", judged("none")); // python
    await b.tools["tutor_remember"].execute("1", { type: "learner", text: "likes short loops" });
    const saved = await b.tools["tutor_recall"].execute("2", { query: "loops" }) as { content: { text: string }[] };
    expect(saved.content[0].text).toBe("#1 [learner] likes short loops (python)");
  }, 20000);
  it("an eased episode records at least one rung used (M5 #40)", async () => {
    const { Profile } = await import("../extensions/tutor/profile.js");
    const file = join(h0(), "profile.sqlite");
    const seed = Profile.open(file);
    seed.saveLanguage("python", 10, {}, 1);
    seed.recordEpisode({ language: "python", project: null, concept_tags: ["dicts"], rungs_used: 1, turns: 1, opened: 1, closed: 2 }, 1);
    seed.close();
    const saved = process.env.PI_TUTOR_PROFILE; process.env.PI_TUTOR_PROFILE = file;
    try {
      h = await startHeadlessNvim();
      const p = Profile.open(file); p.addProject("python", h.root, "x", 1); p.close();
      const b = await boot({ nvim: h.socket, cwd: h.root });
      shutdown = () => b.events["session_shutdown"]({ type: "session_shutdown" }, b.ctx);
      await turn(b.events, b.ctx, REASONED, assistant('ok\n```tutor-judgment\n{"judgment":"none","concept_tags":["dicts"],"episode_closed":true}\n```'));
      await b.events["session_shutdown"]({ type: "session_shutdown" }, b.ctx); shutdown = undefined;
      const check = Profile.open(file);
      expect(check.episodes("python").at(-1)?.rungs_used).toBe(1);
      check.close();
    } finally {
      if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved;
    }
  }, 20000);
});

describe("M6c: connected turn context (M2 #15)", () => {
  it("a connected before_agent_start carries the [editor] snapshot of the open file", async () => {
    const b = await linked();
    const t = await turn(b.events, b.ctx, "hi", judged("none"));
    expect(t.message?.content).toMatch(/\[editor\] .*a\.py \(python\), cursor line 1/);
  }, 20000);
});
