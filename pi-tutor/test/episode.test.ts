import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NeovimClient } from "neovim";
import { startHeadlessNvim, type Headless } from "./nvim-harness.js";
import { boot, episodes } from "./fake-pi.js";

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
  expect(b.widgets["tutor"]?.[1]).not.toMatch(/detached/);
  await b.commands["tutor-level"].handler("10", b.ctx);
  b.busy.value = busy;
  const { attach } = await import("neovim");
  nvim = attach({ socket: h.socket });
  writeFileSync(join(h.root, "a.py"), "x = \n");
  await nvim.command(`edit ${join(h.root, "a.py")}`);
  return b;
}
const setError = (msg: string) => nvim!.lua(`local ns = vim.api.nvim_create_namespace("t"); vim.diagnostic.set(ns, 0, {{ lnum = 0, col = 0, severity = 1, message = ... }})`, [msg]);

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
    await b.events["before_agent_start"]({ type: "before_agent_start", prompt: "what does :w do?", systemPromptOptions: { sections: {} } }, b.ctx);
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
      await b.events["before_agent_start"]({ type: "before_agent_start", prompt: "where do I start?", systemPromptOptions: { sections: {} } }, b.ctx);
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
