import { describe, it, expect, afterEach, vi } from "vitest";
import { writeFileSync, mkdtempSync, readFileSync, mkdirSync, symlinkSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NeovimClient } from "neovim";
import { startHeadlessNvim, type Headless } from "./nvim-harness.js";
import { boot, episodes, turn, judged, assistant, realExec, REASONED } from "./fake-pi.js";
import { spawnSync } from "node:child_process";
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
  it("an idle stretch during a recipe opens no episode; without a recipe it does (habits Task 6a)", async () => {
    const b = await linked();
    mkdirSync(join(h!.root, "spec"), { recursive: true });
    writeFileSync(join(h!.root, "spec", "tasks.md"), "- [ ] P1.T1 split the bill\n");
    await b.commands["tutor-plan"].handler("P1.T1", b.ctx);
    const idle = (ms: number) => nvim!.lua(`vim.rpcnotify(vim.g.tutor_chan, "tutor", ...)`, [{ kind: "idle", buf: 1, path: join(h!.root, "a.py"), line: 1, since_ms: ms }]);
    await idle(10_000_000);
    await new Promise((r) => setTimeout(r, 300));
    expect(episodes(b.entries)).toEqual([]);
    await b.commands["tutor-plan"].handler("off", b.ctx);
    await idle(1_000);
    await idle(10_000_000);
    await until(() => episodes(b.entries).some((e) => (e.trigger as { kind: string }).kind === "idle"));
  }, 20000);

  it("an error that sits opens no episode and sends no nudge; the learner asks (spec 2026-10-26 §5.2)", async () => {
    const b = await linked();
    await setError("boom");
    await new Promise((r) => setTimeout(r, 600));
    expect(b.sent).toEqual([]);
    expect(episodes(b.entries)).toEqual([]);
  }, 20000);
  it("a right-click question is answered as a question and records how long the error was on screen", async () => {
    const b = await linked();
    await setError("boom");
    await new Promise((r) => setTimeout(r, 300));
    const opts = { sections: {} as Record<string, string> };
    await b.events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: "[ask-error] a.py:1: boom | code: x =", systemPromptOptions: opts }, b.ctx);
    const ask = b.entries.filter((e) => e.type === "tutor_ask_error").at(-1)?.data as { path: string; line: number; msg: string; shownMs: number | null };
    expect(ask).toMatchObject({ path: "a.py", line: 1, msg: "boom" });
    expect(ask.shownMs).toBeGreaterThanOrEqual(200);
    expect(episodes(b.entries).at(-1)).toMatchObject({ trigger: { kind: "chat" } });
  }, 20000);

  it("opens the episode silently while Pi is mid-reply", async () => {
    const b = await linked(true);
    await runPayload(1, "Traceback\nKeyError: 'x'");
    await until(() => b.widgets["tutor"]?.[1]?.startsWith("stuck: run failed") === true);
    expect(b.sent).toEqual([]);
  }, 20000);

  it("an editor error leaves an open chat episode alone (spec 2026-10-26 §5.2)", async () => {
    const b = await linked();
    await b.events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: "what does :w do?", systemPromptOptions: { sections: {} } }, b.ctx);
    expect(episodes(b.entries).at(-1)).toMatchObject({ trigger: { kind: "chat" } });
    await setError("boom");
    await new Promise((r) => setTimeout(r, 600));
    expect(episodes(b.entries).find((e) => e.closeReason === "superseded")).toBeUndefined();
    expect(b.sent).toEqual([]);
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

describe("ticking (spec 2026-10-21 §7: evidence, never the model)", () => {
  const tasks = () => readFileSync(join(h!.root, "spec", "tasks.md"), "utf8");
  const done = (ids: string[]) => assistant("nice\n```tutor-judgment\n" + JSON.stringify({ judgment: "correct", task_done_ids: ids }) + "\n```");
  it("neither the model's task_done_ids nor a passing run ticks a task", async () => {
    const b = await linked();
    mkdirSync(join(h!.root, "spec"));
    writeFileSync(join(h!.root, "spec", "tasks.md"), "- [ ] P1.T1 parse\n- [ ] P1.T2 print\n");
    await turn(b.events, b.ctx, REASONED, done(["P1.T1"]));
    await runPayload(0);
    await new Promise((r) => setTimeout(r, 300));
    expect(tasks()).toBe("- [ ] P1.T1 parse\n- [ ] P1.T2 print\n");
    expect(b.entries.filter((e) => e.type === "tutor_tick")).toEqual([]);
  }, 20000);
});

/** A python project with a trusted check on P2.T2, a real sandbox and real commands (spec 2026-10-21 §7). */
const bwrapReady = spawnSync("bwrap", ["--ro-bind", "/", "/", "--unshare-all", "true"]).status === 0 && spawnSync("python3", ["--version"]).status === 0;
const DONE_LANG = {
  python: { run: "python3 src/main.py", entry: "src/main.py", manifest: null },
  rust: { run: "cargo run", entry: "src/main.rs", manifest: ["Cargo.toml", '[package]\nname = "p"\nversion = "0.1.0"\nedition = "2021"\n\n[workspace]\n'] },
  go: { run: "go run ./src", entry: "src/main.go", manifest: ["go.mod", "module p\n\ngo 1.22\n"] },
} as const;
async function doneProject(code: string, checks: object[] = [{ task: "P2.T2", kind: "value", expr: "split_amount(48, 3)", expected: "16.0", milestone: 1, status: "trusted" }], language: keyof typeof DONE_LANG = "python", milestone: object = {}) {
  const L = DONE_LANG[language];
  const { Profile } = await import("../extensions/tutor/profile.js");
  const { realpathSync } = await import("node:fs");
  h = await startHeadlessNvim();
  const root = realpathSync(h.root);
  mkdirSync(join(root, "src")); mkdirSync(join(root, "spec"));
  writeFileSync(join(root, "README.md"), `---\nrun: ${L.run}\nlanguage: ${language}\n---\n# Split\n`);
  if (L.manifest) writeFileSync(join(root, L.manifest[0]), L.manifest[1]);
  writeFileSync(join(root, "spec", "tasks.md"), "- [ ] P2.T2 split the bill\n  - [ ] P2.T2.S1 divide\n- [ ] P2.T3 print\n");
  writeFileSync(join(root, L.entry), code);
  const file = join(mkdtempSync(join(tmpdir(), "done-prof-")), "p.sqlite");
  const seed = Profile.open(file);
  seed.saveLanguage(language, 10, {}, 1);
  seed.addProject(language, root, "Split", 1);
  seed.setSetting(`checks:${root}`, JSON.stringify({ milestones: { 1: { ran: true, reference: "def split_amount(t, p):\n    return t / p\n",
    checks, ...milestone } } }));
  seed.close();
  const saved = process.env.PI_TUTOR_PROFILE;
  process.env.PI_TUTOR_PROFILE = file;
  const b = await boot({ nvim: h.socket, cwd: root });
  (b.pi as { exec: unknown }).exec = realExec;
  shutdown = async () => { await b.events["session_shutdown"]({ type: "session_shutdown" }, b.ctx); if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved; };
  const { attach } = await import("neovim");
  nvim = attach({ socket: h.socket });
  return { b, root };
}

const tool = (cmd: string, args: string[]) => spawnSync(cmd, args).status === 0;
const valueCheck = (expr: string, expected: string) => [{ task: "P2.T2", kind: "value", expr, expected, milestone: 1, status: "trusted" }];
describe.skipIf(!bwrapReady)("habit events from what code sees (spec 2026-10-26 §3, habits Task 7)", () => {
  const habits = async () => {
    const { Profile } = await import("../extensions/tutor/profile.js");
    const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
    try { return p.habitEvents().map((e) => [e.habit, e.ok]); } finally { p.close(); }
  };
  const two = [
    { task: "P2.T2", kind: "value", expr: "split_amount(48, 3)", expected: "16.0", milestone: 1, status: "trusted" },
    { task: "P2.T2", kind: "value", expr: "split_amount(50, 3)", expected: "16.666666666666668", milestone: 1, status: "trusted" },
  ];
  const code = (op: string) => `def split_amount(total, people):\n    return total ${op} people\n`;
  it("tries that get closer, a fix before the fix step, and small edits between runs are recorded", async () => {
    const { b, root } = await doneProject(code("*"), two);
    await b.commands["tutor-done"].handler("P2.T2", b.ctx); // 0 of 2
    writeFileSync(join(root, "src", "main.py"), code("//"));
    await b.commands["tutor-done"].handler("P2.T2", b.ctx); // 1 of 2: closer
    writeFileSync(join(root, "src", "main.py"), code("/"));
    await b.commands["tutor-done"].handler("P2.T2", b.ctx); // ticked
    const h = await habits();
    expect(h.filter(([k]) => k === "right-direction")).toEqual([["right-direction", true], ["right-direction", true]]);
    expect(h).toContainEqual(["own-fixes", true]);
    expect(h.filter(([k]) => k === "small-runs")).toEqual([["small-runs", true], ["small-runs", true]]);
  }, 60000);
  it("a question during a stuck try counts by what the next try does", async () => {
    const { b, root } = await doneProject(code("*"), two);
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    await turn(b.events, b.ctx, "how do I share a total between people?", judged("none"));
    writeFileSync(join(root, "src", "main.py"), code("//"));
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(await habits()).toContainEqual(["right-question", true]);
  }, 60000);
  it("habits solid in this language raise the level inside its band on a tick, with the reason; /tutor-progress shows them (Task 8)", async () => {
    const { b, root } = await doneProject(code("/"), two);
    const { Profile } = await import("../extensions/tutor/profile.js");
    const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
    let at = 1;
    for (const habit of ["small-runs", "right-direction", "steps-first", "right-question"] as const)
      for (let i = 0; i < 5; i++) p.addHabitEvent({ habit, ok: true, language: "python", project: i % 2 ? root : "/p/other", at: at++, evidence: `seed-${at}` });
    p.close();
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(b.notes.some((n) => /^level 10 → 19: your questions moved you forward$/.test(n))).toBe(true);
    expect(b.widgets["tutor"]?.[0]).toContain("lvl 19");
    await b.commands["tutor-progress"].handler("", b.ctx);
    const shown = JSON.stringify(b.messages.at(-1));
    expect(shown).toContain("Habits (beginner)");
    expect(shown).toMatch(/asks the right question: solid/);
  }, 60000);
  it("the step-up is offered once a day when every beginner habit is solid; /tutor-step-up says what is missing otherwise (Task 10)", async () => {
    const { b, root } = await doneProject(code("/"), two);
    await b.commands["tutor-step-up"].handler("", b.ctx);
    expect(b.notes.at(-1)).toMatch(/^not yet: these habits are still growing: .*fixes own bugs/);
    const { Profile } = await import("../extensions/tutor/profile.js");
    const { GATE_HABITS } = await import("../extensions/tutor/levels.js");
    const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
    let at = 1;
    for (const habit of GATE_HABITS.beginner)
      for (let i = 0; i < 5; i++) p.addHabitEvent({ habit, ok: true, language: "python", project: i % 2 ? root : "/p/other", at: at++, evidence: "seed" });
    p.close();
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(b.notes.filter((n) => /\/tutor-step-up/.test(n) && /habits are solid/.test(n))).toHaveLength(1);
    writeFileSync(join(root, "spec", "tasks.md"), "- [x] P2.T2 split\n- [ ] P2.T3 print\n");
    await b.commands["tutor-done"].handler("P2.T3 anyway", b.ctx);
    expect(b.notes.filter((n) => /\/tutor-step-up/.test(n) && /habits are solid/.test(n))).toHaveLength(1);
    await b.commands["tutor-progress"].handler("", b.ctx);
    expect(JSON.stringify(b.messages.at(-1))).toMatch(/step-up: ready/);
  }, 60000);
  it("the step-up's coding test: three parts in stepup/, checked in the sandbox; passing asks before the level moves (Task 12)", async () => {
    const { b, root } = await doneProject(code("/"), two);
    const { Profile } = await import("../extensions/tutor/profile.js");
    const { GATE_HABITS } = await import("../extensions/tutor/levels.js");
    const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
    let at = 1;
    for (const habit of GATE_HABITS.beginner) for (let i = 0; i < 5; i++) p.addHabitEvent({ habit, ok: true, language: "python", project: i % 2 ? root : "/p/x", at: at++, evidence: "seed" });
    p.close();
    await b.commands["tutor-plan"].handler("off", b.ctx);
    const replies = [
      JSON.stringify({ talk: "Write `top_word(text)` returning the most frequent word.", solve: "Write `weekday(iso)` returning the weekday name of an ISO date.", fix: "Write `tip(total)` returning 15% of the total." }),
      "check P1.T1: top_word('a b a') == 'a'\ncheck P1.T1: top_word('x') == 'x'", "```python\ndef top_word(text):\n    words = text.split()\n    return max(words, key=words.count)\n```",
      "check P1.T1: weekday('2026-11-02') == 'Monday'", "```python\nimport datetime\ndef weekday(iso):\n    return datetime.date.fromisoformat(iso).strftime('%A')\n```",
      "check P1.T1: tip(40) == 6.0\ncheck P1.T1: tip(100) == 15.0", "```python\ndef tip(total):\n    return total * 0.15\n```",
    ];
    (b.ctx as unknown as { modelRegistry: { complete: unknown } }).modelRegistry.complete = async () => ({ role: "assistant", stopReason: "stop", content: [{ type: "text", text: replies.shift() ?? "" }] });
    await b.commands["tutor-step-up"].handler("", b.ctx);
    await until(() => b.messages.some((m) => /talking test/.test(JSON.stringify(m.message))), 20000);
    await turn(b.events, b.ctx, "I would split into words and keep the one that appears most", judged("none"));
    await turn(b.events, b.ctx, "1. split the text\n2. count each word\n3. keep the biggest\npieces: split, max, count", judged("none"));
    await until(() => existsSync(join(root, "stepup", "fix.py")), 30000);
    expect(readFileSync(join(root, "stepup", "fix.py"), "utf8")).toMatch(/return total \/ 0\.15/);
    expect(readFileSync(join(root, "stepup", "README.md"), "utf8")).toMatch(/weekday/);
    const { Profile: P2 } = await import("../extensions/tutor/profile.js");
    const q = P2.open(process.env.PI_TUTOR_PROFILE!);
    const saved = JSON.parse(q.setting(`stepup:${root}`) ?? "{}") as { solveRef?: string; fixRef?: string };
    q.close();
    expect(saved.solveRef).toMatch(/strftime/);
    expect(saved.fixRef).toMatch(/total \* 0\.15/);
    expect(readFileSync(join(root, "stepup", "README.md"), "utf8")).not.toMatch(/strftime|0\.15/);
    writeFileSync(join(root, "stepup", "solve.py"), "import datetime\ndef weekday(iso):\n    return datetime.date.fromisoformat(iso).strftime('%A')\n");
    writeFileSync(join(root, "stepup", "fix.py"), "def tip(total):\n    return total * 0.15\n");
    writeFileSync(join(root, "stepup", "plan.py"), "def top_word(text):\n    words = text.split()\n    return max(words, key=words.count)\n");
    await b.commands["tutor-step-up"].handler("check", b.ctx);
    expect(b.notes.at(-1)).toMatch(/solve 1\/1 · fix 2\/2 · plan 2\/2/);
    // Final review C1 + I4: a new Pi session restores the step-up, and the tutor gets the exam rule for stepup/.
    const { realpathSync } = await import("node:fs");
    const c = await boot({ nvim: h!.socket, cwd: realpathSync(h!.root) });
    (c.pi as { exec: unknown }).exec = realExec;
    await c.commands["tutor-step-up"].handler("check", c.ctx);
    expect(c.notes.at(-1)).toMatch(/solve 1\/1 · fix 2\/2 · plan 2\/2/);
    const asked = await turn(c.events, c.ctx, "what is wrong in fix.py?", judged("none"));
    expect(JSON.stringify(asked.message?.content ?? "")).toMatch(/\[step-up\] coding test.*never write, complete or fix/);
    await c.commands["tutor-step-up"].handler("submit", c.ctx);
    expect(c.notes.at(-1)).toMatch(/you passed the step-up.*\/tutor-level 34/);
    expect(c.widgets["tutor"]?.[0]).not.toContain("lvl 34");
    await c.commands["tutor-progress"].handler("", c.ctx);
    expect(JSON.stringify(c.messages.at(-1))).toMatch(/passed the beginner step-up/); // final review M12
    await c.events["session_shutdown"]({ type: "session_shutdown" }, c.ctx);
  }, 120000);
  it("the intermediate step-up (Task 17) adds tests that must catch a broken solution and an improve-it part", async () => {
    const { b, root } = await doneProject(code("/"), two);
    await b.commands["tutor-level"].handler("40", b.ctx);
    const { Profile } = await import("../extensions/tutor/profile.js");
    const { GATE_HABITS } = await import("../extensions/tutor/levels.js");
    const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
    let at = 1;
    for (const habit of GATE_HABITS.intermediate) for (let i = 0; i < 5; i++) p.addHabitEvent({ habit, ok: true, language: "python", project: i % 2 ? root : "/p/x", at: at++, evidence: "seed" });
    p.close();
    await b.commands["tutor-plan"].handler("off", b.ctx);
    const SLOW = "def count_unique(items):\n    seen = []\n    for x in items:\n        if x not in seen:\n            seen.append(x)\n    return len(seen)\n";
    const replies = [
      JSON.stringify({ talk: "Write `top_word(text)` returning the most frequent word.", solve: "Write `weekday(iso)` returning the weekday name of an ISO date.", fix: "Write `tip(total)` returning 15% of the total.", improve: "Write `count_unique(items)` returning how many different items there are." }),
      "check P1.T1: top_word('a b a') == 'a'", "```python\ndef top_word(text):\n    words = text.split()\n    return max(words, key=words.count)\n```",
      "check P1.T1: weekday('2026-11-02') == 'Monday'\ncheck P1.T1: weekday('2026-11-03') == 'Tuesday'", "```python\nimport datetime\ndef weekday(iso):\n    return datetime.date.fromisoformat(iso).strftime('%A')\n```",
      "check P1.T1: tip(50) == 7.5", "```python\ndef tip(total):\n    return total * 0.15\n```",
      "check P1.T1: count_unique([1, 1, 2]) == 2", "```python\ndef count_unique(items):\n    return len(set(items))\n```",
      "```python\n" + SLOW + "```",
      "check P1.T1: count_unique([]) == 0\ntimed P1.T1: count_unique(list(range(20000)))",
    ];
    (b.ctx as unknown as { modelRegistry: { complete: unknown } }).modelRegistry.complete = async () => ({ role: "assistant", stopReason: "stop", content: [{ type: "text", text: replies.shift() ?? "" }] });
    await b.commands["tutor-step-up"].handler("", b.ctx);
    await until(() => b.messages.some((m) => /talking test/.test(JSON.stringify(m.message))), 20000);
    await turn(b.events, b.ctx, "1. split the text\n2. count each word\n3. keep the biggest\npieces: split, max, count", judged("none"));
    await until(() => existsSync(join(root, "stepup", "README.md")), 60000);
    expect(readFileSync(join(root, "stepup", "improve.py"), "utf8")).toBe(SLOW);
    const readme = readFileSync(join(root, "stepup", "README.md"), "utf8");
    expect(readme).toMatch(/4\. `stepup\/test_solve\.py`: .*tests for `weekday`.*must fail on a broken version/s);
    expect(readme).toMatch(/5\. `stepup\/improve\.py`: .*works but is clumsy.*measured now: longest function 5 statements · nesting 2 · branches 2/s);
    writeFileSync(join(root, "stepup", "solve.py"), "import datetime\ndef weekday(iso):\n    return datetime.date.fromisoformat(iso).strftime('%A')\n");
    writeFileSync(join(root, "stepup", "fix.py"), "def tip(total):\n    return total * 0.15\n");
    writeFileSync(join(root, "stepup", "plan.py"), "def top_word(text):\n    words = text.split()\n    return max(words, key=words.count)\n");
    writeFileSync(join(root, "stepup", "test_solve.py"), "from solve import weekday\n\ndef test_runs():\n    weekday('2026-11-02')\n");
    await b.commands["tutor-step-up"].handler("check", b.ctx);
    expect(b.notes.at(-1)).toMatch(/solve 2\/2 · fix 1\/1 · plan 1\/1 · tests 0\/1 · improve 0\/1/);
    // the learner's tests run against the hidden solution: a wrong solve.py cannot make wrong tests look right
    // final review I4: tests of the project's own code, not of solve, do not count, even though they catch a broken copy of it
    writeFileSync(join(root, "stepup", "test_solve.py"), "from main import split_amount\n\ndef test_x():\n    assert split_amount(48, 3) == 16\n");
    await b.commands["tutor-step-up"].handler("check", b.ctx);
    expect(b.notes.at(-1)).toMatch(/tests 0\/1/);
    writeFileSync(join(root, "stepup", "solve.py"), "def weekday(iso):\n    return 'Sunday'\n");
    writeFileSync(join(root, "stepup", "test_solve.py"), "from solve import weekday\n\ndef test_monday():\n    assert weekday('2026-11-02') == 'Monday'\n");
    writeFileSync(join(root, "stepup", "improve.py"), "def count_unique(items):\n    return len(set(items))\n");
    await b.commands["tutor-step-up"].handler("check", b.ctx);
    expect(b.notes.at(-1)).toMatch(/solve 0\/2 · fix 1\/1 · plan 1\/1 · tests 1\/1 · improve 1\/1/);
    writeFileSync(join(root, "stepup", "solve.py"), "import datetime\ndef weekday(iso):\n    return datetime.date.fromisoformat(iso).strftime('%A')\n");
    await b.commands["tutor-step-up"].handler("submit", b.ctx);
    expect(b.notes.at(-1)).toMatch(/you passed the step-up.*\/tutor-level 67/);
  }, 180000);
  // Habits Task 24b: the step-up for Rust and Go, each part in its own crate / module folder.
  for (const lang of ["rust", "go"] as const) it.skipIf(!tool(lang === "rust" ? "cargo" : "go", lang === "rust" ? ["--version"] : ["version"]))(`the step-up in ${lang}: each part in its own folder, checked one at a time`, async () => {
    const R = lang === "rust";
    const { b, root } = await doneProject(R ? "fn main() {}\n" : "package main\n\nfunc main() {}\n", [], lang);
    // final review I1: the parts take the project's own manifest settings (here a newer go line)
    if (!R) writeFileSync(join(root, "go.mod"), "module p\n\ngo 1.23\n");
    const { Profile } = await import("../extensions/tutor/profile.js");
    const { GATE_HABITS } = await import("../extensions/tutor/levels.js");
    const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
    let at = 1;
    for (const habit of GATE_HABITS.beginner) for (let i = 0; i < 5; i++) p.addHabitEvent({ habit, ok: true, language: lang, project: i % 2 ? root : "/p/x", at: at++, evidence: "seed" });
    p.close();
    await b.commands["tutor-plan"].handler("off", b.ctx);
    const fence = (code: string) => "```" + lang + "\n" + code + "```";
    const TALK = R ? "fn count_even(xs: &[i32]) -> usize {\n    xs.iter().filter(|x| *x % 2 == 0).count()\n}\n\nfn main() {}\n"
      : "package main\n\nimport \"strings\"\n\nfunc CountWords(s string) int {\n\treturn len(strings.Fields(s))\n}\n\nfunc main() {}\n";
    const SOLVE = R ? "use std::collections::HashSet;\n\nfn distinct(xs: &[i32]) -> usize {\n    xs.iter().collect::<HashSet<_>>().len()\n}\n\nfn main() {}\n"
      : "package main\n\nimport \"strings\"\n\nfunc Shout(s string) string {\n\treturn strings.ToUpper(s)\n}\n\nfunc main() {}\n";
    const FIX = R ? "fn total(xs: &[i32]) -> i32 {\n    let mut s = 0;\n    for x in xs {\n        s = s + x;\n    }\n    s\n}\n\nfn main() {}\n"
      : "package main\n\nfunc Total(xs []int) int {\n\ts := 0\n\tfor _, x := range xs {\n\t\ts = s + x\n\t}\n\treturn s\n}\n\nfunc main() {}\n";
    const replies = [
      JSON.stringify(R ? { talk: "Write `fn count_even(xs: &[i32]) -> usize` returning how many items are even.", solve: "Write `fn distinct(xs: &[i32]) -> usize` returning how many different values there are.", fix: "Write `fn total(xs: &[i32]) -> i32` returning the sum." }
        : { talk: "Write `func CountWords(s string) int` returning how many words s has.", solve: "Write `func Shout(s string) string` returning s in capitals.", fix: "Write `func Total(xs []int) int` returning the sum." }),
      R ? "check P1.T1: count_even(&[1, 2, 4]) == 2" : "check P1.T1: CountWords(\"a b  c\") == 3", fence(TALK),
      R ? "check P1.T1: distinct(&[1, 1, 2]) == 2" : 'check P1.T1: Shout("hi") == "HI"', fence(SOLVE),
      R ? "check P1.T1: total(&[1, 2, 3]) == 6" : "check P1.T1: Total([]int{1, 2, 3}) == 6", fence(FIX),
    ];
    (b.ctx as unknown as { modelRegistry: { complete: unknown } }).modelRegistry.complete = async () => ({ role: "assistant", stopReason: "stop", content: [{ type: "text", text: replies.shift() ?? "" }] });
    await b.commands["tutor-step-up"].handler("", b.ctx);
    await until(() => b.messages.some((m) => /talking test/.test(JSON.stringify(m.message))), 120000);
    await turn(b.events, b.ctx, R ? "1. go through the numbers\n2. keep the even ones\n3. count them\npieces: iter, filter, count" : "1. split the text into words\n2. count them\npieces: fields, len", judged("none"));
    await until(() => existsSync(join(root, "stepup", "README.md")), 240000);
    const file = (part: string) => join(root, "stepup", part, R ? "src/main.rs" : "main.go");
    const man = readFileSync(join(root, "stepup", "fix", R ? "Cargo.toml" : "go.mod"), "utf8");
    expect(man).toMatch(R ? /name = "fix"[\s\S]*edition = "2021"[\s\S]*\[workspace\]/ : /^module fix\n\ngo 1\.23\n/);
    // final review M5: the plan part keeps the plan the learner gave
    expect(readFileSync(file("plan"), "utf8")).toMatch(/\/\/ Your plan:\n\/\/ 1\. go through the numbers|\/\/ Your plan:\n\/\/ 1\. split the text into words/);
    expect(readFileSync(file("fix"), "utf8")).toMatch(/s = s - x/);
    expect(readFileSync(join(root, "stepup", "README.md"), "utf8")).toMatch(R ? /stepup\/solve\/src\/main\.rs/ : /stepup\/solve\/main\.go/);
    writeFileSync(file("solve"), SOLVE);
    writeFileSync(file("fix"), FIX);
    writeFileSync(file("plan"), TALK);
    await b.commands["tutor-step-up"].handler("check", b.ctx);
    expect(b.notes.at(-1)).toMatch(/solve 1\/1 · fix 1\/1 · plan 1\/1/);
    await b.commands["tutor-step-up"].handler("submit", b.ctx);
    expect(b.notes.at(-1)).toMatch(/you passed the step-up.*\/tutor-level 34/);
  }, 600000);
  // Phase 7 live run (Rust, nemotron): a part whose checks the hidden solution never confirms got the whole
  // step-up aborted. It is asked for once more; still nothing confirmed, the note names the part.
  for (const second of ["confirmed", "unconfirmed"] as const) it(`a part with no confirmed checks is asked for once more (${second} the second time)`, async () => {
    const { b, root } = await doneProject(code("/"), two);
    const { Profile } = await import("../extensions/tutor/profile.js");
    const { GATE_HABITS } = await import("../extensions/tutor/levels.js");
    const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
    let at = 1;
    for (const habit of GATE_HABITS.beginner) for (let i = 0; i < 5; i++) p.addHabitEvent({ habit, ok: true, language: "python", project: i % 2 ? root : "/p/x", at: at++, evidence: "seed" });
    p.close();
    await b.commands["tutor-plan"].handler("off", b.ctx);
    const WEEK = "```python\nimport datetime\ndef weekday(iso):\n    return datetime.date.fromisoformat(iso).strftime('%A')\n```";
    const replies = [
      JSON.stringify({ talk: "Write `top_word(text)` returning the most frequent word.", solve: "Write `weekday(iso)` returning the weekday name of an ISO date.", fix: "Write `tip(total)` returning 15% of the total." }),
      "check P1.T1: top_word('a b a') == 'a'", "```python\ndef top_word(text):\n    words = text.split()\n    return max(words, key=words.count)\n```",
      "check P1.T1: weekday('2026-11-02') == 'Sunday'", WEEK,
      second === "confirmed" ? "check P1.T1: weekday('2026-11-02') == 'Monday'" : "check P1.T1: weekday('2026-11-02') == 'Friday'", WEEK,
      "check P1.T1: tip(50) == 7.5", "```python\ndef tip(total):\n    return total * 0.15\n```",
    ];
    (b.ctx as unknown as { modelRegistry: { complete: unknown } }).modelRegistry.complete = async () => ({ role: "assistant", stopReason: "stop", content: [{ type: "text", text: replies.shift() ?? "" }] });
    await b.commands["tutor-step-up"].handler("", b.ctx);
    await until(() => b.messages.some((m) => /talking test/.test(JSON.stringify(m.message))), 20000);
    await turn(b.events, b.ctx, "1. split the text\n2. count each word\n3. keep the biggest\npieces: split, max, count", judged("none"));
    if (second === "confirmed") {
      await until(() => existsSync(join(root, "stepup", "README.md")), 60000);
      await b.commands["tutor-step-up"].handler("check", b.ctx);
      expect(b.notes.at(-1)).toMatch(/solve 0\/1 · fix 0\/1 · plan 0\/1/);
    } else {
      await until(() => b.notes.some((n) => /could not be prepared/.test(n)), 60000);
      expect(b.notes.find((n) => /could not be prepared/.test(n))).toMatch(/no confirmed checks for the solve part/);
      expect(existsSync(join(root, "stepup", "README.md"))).toBe(false);
    }
  }, 120000);
  it("final review I2: a coding test whose setup stopped is prepared again by check", async () => {
    const { b, root } = await doneProject(code("/"), two);
    const { Profile } = await import("../extensions/tutor/profile.js");
    const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
    p.setSetting(`stepup:${root}`, JSON.stringify({ stage: "coding", language: "python", band: "beginner", talkTask: "Write `top_word(text)`.", solveTask: "Write `weekday(iso)`.", fixTask: "Write `tip(total)`.", module: "datetime",
      talkRef: "def top_word(text):\n    words = text.split()\n    return max(words, key=words.count)\n", talkChecks: [{ task: "P1.T1", kind: "value", expr: "top_word('a b a')", expected: "'a'", milestone: 1, status: "trusted" }],
      plan: { steps: ["split", "most"], pieces: ["split", "max"] }, talk: { matched: 2, total: 2 }, started: 1 }));
    p.close();
    const { realpathSync } = await import("node:fs");
    const c = await boot({ nvim: h!.socket, cwd: realpathSync(root) });
    (c.pi as { exec: unknown }).exec = realExec;
    const replies = [
      "check P1.T1: weekday('2026-11-02') == 'Monday'", "```python\nimport datetime\ndef weekday(iso):\n    return datetime.date.fromisoformat(iso).strftime('%A')\n```",
      "check P1.T1: tip(40) == 6.0\ncheck P1.T1: tip(100) == 15.0", "```python\ndef tip(total):\n    return total * 0.15\n```",
    ];
    (c.ctx as unknown as { modelRegistry: { complete: unknown } }).modelRegistry.complete = async () => ({ role: "assistant", stopReason: "stop", content: [{ type: "text", text: replies.shift() ?? "" }] });
    await c.commands["tutor-step-up"].handler("check", c.ctx);
    expect(c.notes.at(-1)).toMatch(/preparing the coding test again/);
    await until(() => existsSync(join(root, "stepup", "fix.py")), 30000);
    await c.events["session_shutdown"]({ type: "session_shutdown" }, c.ctx);
  }, 120000);
  it("after a failed step-up, a retake waits for 3 more ticked tasks (Task 12)", async () => {
    const { b, root } = await doneProject(code("/"), two);
    const { Profile } = await import("../extensions/tutor/profile.js");
    const { GATE_HABITS } = await import("../extensions/tutor/levels.js");
    const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
    p.setSetting("stepup-wait:python", "2");
    let at = 1;
    for (const habit of GATE_HABITS.beginner) for (let i = 0; i < 5; i++) p.addHabitEvent({ habit, ok: true, language: "python", project: i % 2 ? root : "/p/x", at: at++, evidence: "seed" });
    p.close();
    await b.commands["tutor-step-up"].handler("", b.ctx);
    expect(b.notes.at(-1)).toMatch(/after 2 more task\(s\)/);
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(b.notes.some((n) => /habits are solid: \/tutor-step-up/.test(n))).toBe(false); // final review M9: no offer while waiting
    await b.commands["tutor-step-up"].handler("", b.ctx);
    expect(b.notes.at(-1)).toMatch(/after 1 more task\(s\)/);
    // Phase 8 A7: a tick no check passed (`anyway`, self-checked) is no solved task, so the wait stays.
    await b.commands["tutor-done"].handler("P2.T3 anyway", b.ctx);
    expect(b.notes.some((n) => /ticked P2\.T3/.test(n))).toBe(true);
    await b.commands["tutor-step-up"].handler("", b.ctx);
    expect(b.notes.at(-1)).toMatch(/after 1 more task\(s\)/);
  }, 60000);
  it("improve it (Task 17): /tutor-improve measures a ticked task before and after; better and nothing worse is the optimizes habit", async () => {
    const SLOW = "def count_unique(items):\n    seen = []\n    for x in items:\n        if x not in seen:\n            seen.append(x)\n    return len(seen)\n";
    const { b, root } = await doneProject(SLOW, [{ task: "P2.T2", kind: "value", expr: "count_unique([1, 1, 2])", expected: "2", milestone: 1, status: "trusted" }], "python",
      { reference: "def count_unique(items):\n    return len(set(items))\n" });
    await b.commands["tutor-level"].handler("70", b.ctx);
    writeFileSync(join(root, "spec", "tasks.md"), "- [x] P2.T2 count the unique items: `count_unique(items)`\n- [ ] P2.T3 print\n");
    await b.commands["tutor-improve"].handler("done", b.ctx);
    expect(b.notes.at(-1)).toMatch(/no improve-it task is running: \/tutor-improve <ticked task id> starts one/);
    b.replies.push("check P2.T2: count_unique([]) == 0\ncheck P2.T2: count_unique([3, 3, 3]) == 1\ntimed P2.T2: count_unique(list(range(20000)))");
    await b.commands["tutor-improve"].handler("P2.T2", b.ctx);
    expect(b.notes.at(-1)).toMatch(/improve P2\.T2: .*measured now: longest function 5 statements · nesting 2 · branches 2 · edge cases 2\/2 · count_unique\(list\(range\(20000\)\)\) \d+ ms\. The task's checks must still pass.*\/tutor-improve done/s);
    writeFileSync(join(root, "src", "main.py"), "def count_unique(items):\n    return 0\n");
    await b.commands["tutor-improve"].handler("done", b.ctx);
    expect(b.notes.at(-1)).toMatch(/P2\.T2 not yet: the task's checks must still pass: count_unique\(\[1, 1, 2\]\) gave 0, expected 2/);
    writeFileSync(join(root, "src", "main.py"), "def count_unique(items):\n    return len(set(items))\n");
    await b.commands["tutor-improve"].handler("done", b.ctx);
    expect(b.notes.at(-1)).toMatch(/P2\.T2 improved: speed: \d+ ms → \d+ ms · longest function: 5 → 1 statements · nesting: 2 → 0 · branches: 2 → 0/);
    expect(await habits()).toContainEqual(["optimizes", true]);
    await b.commands["tutor-improve"].handler("done", b.ctx);
    expect(b.notes.at(-1)).toMatch(/no improve-it task is running/);
    // final review I3: make it worse, start again, undo it — a repeat on the same task never counts twice
    writeFileSync(join(root, "src", "main.py"), SLOW);
    b.replies.push("check P2.T2: count_unique([]) == 0");
    await b.commands["tutor-improve"].handler("P2.T2", b.ctx);
    writeFileSync(join(root, "src", "main.py"), "def count_unique(items):\n    return len(set(items))\n");
    await b.commands["tutor-improve"].handler("done", b.ctx);
    expect(b.notes.at(-1)).toMatch(/P2\.T2 improved: .*\(optimizes counts once per task; P2\.T2 already counted\)/);
    expect((await habits()).filter(([h]) => h === "optimizes")).toHaveLength(1);
  }, 240000);
  it("improve it (load flake): the before code is timed again next to the after code, so unchanged code is never faster", async () => {
    const SLOW = "def count_unique(items):\n    seen = []\n    for x in items:\n        if x not in seen:\n            seen.append(x)\n    return len(seen)\n";
    const { b, root } = await doneProject(SLOW, [{ task: "P2.T2", kind: "value", expr: "count_unique([1, 1, 2])", expected: "2", milestone: 1, status: "trusted" }], "python",
      { reference: "def count_unique(items):\n    return len(set(items))\n" });
    writeFileSync(join(root, "spec", "tasks.md"), "- [x] P2.T2 count the unique items\n");
    b.replies.push("timed P2.T2: count_unique(list(range(20000)))");
    await b.commands["tutor-improve"].handler("P2.T2", b.ctx);
    // the first timing happened in a busy moment: ten times slower than the code really is
    const { Profile } = await import("../extensions/tutor/profile.js");
    const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
    const st = JSON.parse(p.setting(`improve:${root}`)!);
    st.before.ms *= 10;
    p.setSetting(`improve:${root}`, JSON.stringify(st)); p.close();
    await b.commands["tutor-improve"].handler("done", b.ctx);
    expect(b.notes.at(-1)).toMatch(/P2\.T2 is not better yet: nothing measured changed/);
    expect((await habits()).map(([h]) => h)).not.toContain("optimizes");
  }, 180000);
  it("improve it (phase 5 live run): an edit made while /tutor-improve is still measuring does not change the before", async () => {
    const SLOW = "def count_unique(items):\n    seen = []\n    for x in items:\n        if x not in seen:\n            seen.append(x)\n    return len(seen)\n";
    const { b, root } = await doneProject(SLOW, [{ task: "P2.T2", kind: "value", expr: "count_unique([1, 1, 2])", expected: "2", milestone: 1, status: "trusted" }], "python",
      { reference: "def count_unique(items):\n    return len(set(items))\n" });
    writeFileSync(join(root, "spec", "tasks.md"), "- [x] P2.T2 count the unique items\n");
    (b.ctx as unknown as { modelRegistry: { complete: unknown } }).modelRegistry.complete = async () => {
      writeFileSync(join(root, "src", "main.py"), "def count_unique(items):\n    return len(set(items))\n"); // the learner, too early
      return { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "check P2.T2: count_unique([]) == 0" }] };
    };
    await b.commands["tutor-improve"].handler("P2.T2", b.ctx);
    expect(b.notes.at(-1)).toMatch(/measured now: longest function 5 statements · nesting 2 · branches 2/);
    await b.commands["tutor-improve"].handler("done", b.ctx);
    expect(b.notes.at(-1)).toMatch(/P2\.T2 improved: longest function: 5 → 1 statements/);
  }, 180000);
  it("improve it (Task 17): something worse is no optimizes; /tutor-improve off drops it", async () => {
    const { b, root } = await doneProject("def count_unique(items):\n    return len(set(items))\n", [{ task: "P2.T2", kind: "value", expr: "count_unique([1, 1, 2])", expected: "2", milestone: 1, status: "trusted" }], "python",
      { reference: "def count_unique(items):\n    return len(set(items))\n" });
    writeFileSync(join(root, "spec", "tasks.md"), "- [x] P2.T2 count the unique items\n");
    b.replies.push("check P2.T2: count_unique([]) == 0");
    await b.commands["tutor-improve"].handler("P2.T2", b.ctx);
    writeFileSync(join(root, "src", "main.py"), "def count_unique(items):\n    n = 0\n    for i, x in enumerate(items):\n        if x not in items[:i]:\n            n += 1\n    return n\n");
    await b.commands["tutor-improve"].handler("done", b.ctx);
    expect(b.notes.at(-1)).toMatch(/P2\.T2 is not better yet: worse: longest function: 1 → 5 statements · nesting: 0 → 2 · branches: 0 → 2/);
    expect(await habits()).toContainEqual(["optimizes", false]);
    b.replies.push("check P2.T2: count_unique([]) == 0");
    await b.commands["tutor-improve"].handler("P2.T2", b.ctx);
    await b.commands["tutor-improve"].handler("off", b.ctx);
    expect(b.notes.at(-1)).toMatch(/improve-it task for P2\.T2 dropped/);
    await b.commands["tutor-improve"].handler("P2.T3", b.ctx);
    expect(b.notes.at(-1)).toMatch(/P2\.T3 is not a ticked task/);
  }, 180000);
  it("complex (Task 17): a task naming three functions, ticked from checks without the fix step, is the complex habit", async () => {
    const SRC = "def parse(s):\n    return [int(x) for x in s.split()]\n\n\ndef total(xs):\n    return sum(xs)\n\n\ndef report(s):\n    return 'total ' + str(total(parse(s)))\n";
    const { b, root } = await doneProject(SRC, [{ task: "P2.T2", kind: "value", expr: "report('1 2')", expected: "'total 3'", milestone: 1, status: "trusted" }]);
    writeFileSync(join(root, "spec", "tasks.md"), "- [ ] P2.T2 write `parse(s)`, `total(xs)` and `report(s)` that work together\n- [ ] P2.T3 print\n");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(readFileSync(join(root, "spec", "tasks.md"), "utf8")).toContain("- [x] P2.T2");
    expect(await habits()).toContainEqual(["complex", true]);
  }, 60000);
  it("complex (side-agent note): a new module counts only in a multi-part task, so a one-liner using math is not complex", async () => {
    const c = (task: string, expr: string, expected: string) => ({ task, kind: "value", expr, expected, milestone: 1, status: "trusted" });
    const { b, root } = await doneProject("def split_amount(total, people):\n    return total / people\n",
      [c("P2.T2", "split_amount(50, 4)", "12.5"), c("P2.T3", "area(1)", "3.141592653589793"), c("P2.T4", "dumps_sorted({'b': 1, 'a': 2})", "'{\"a\": 2, \"b\": 1}'")]);
    writeFileSync(join(root, "spec", "tasks.md"), "- [ ] P2.T2 write `split_amount(total, people)` with `round(x)` and `max(a, b)`\n- [ ] P2.T3 write `area(r)`, a circle's area\n- [ ] P2.T4 write `sort_keys(d)` and `dumps_sorted(d)` that use it\n");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx); // the first tick learns which modules are known
    writeFileSync(join(root, "src", "main.py"), "import math\n\ndef area(r):\n    return math.pi * r * r\n");
    await b.commands["tutor-done"].handler("P2.T3", b.ctx);
    expect(readFileSync(join(root, "spec", "tasks.md"), "utf8")).toContain("- [x] P2.T3");
    expect((await habits()).map(([h]) => h)).not.toContain("complex");
    writeFileSync(join(root, "src", "main.py"), "import json\n\ndef sort_keys(d):\n    return dict(sorted(d.items()))\n\ndef dumps_sorted(d):\n    return json.dumps(sort_keys(d))\n");
    await b.commands["tutor-done"].handler("P2.T4", b.ctx);
    expect(await habits()).toContainEqual(["complex", true]);
  }, 90000);
  it("pro score (Task 16): a tick at 67+ shows the score's facts and asks the tutor for notes; /tutor-notes off stops them; three high scores suggest a level", async () => {
    const { b, root } = await doneProject(code("/"), two);
    await b.commands["tutor-level"].handler("70", b.ctx);
    const levelEntries = () => b.entries.filter((e) => e.type === "tutor_level").length;
    const levelsBefore = levelEntries();
    writeFileSync(join(root, "spec", "tasks.md"), "- [ ] P2.T2 split the bill. done when: `split_amount(48, 3)` is 16.0 and `split_amount(50, 3)` is 16.666666666666668\n- [ ] P2.T3 print\n- [ ] P2.T4 again\n- [ ] P2.T5 again\n");
    mkdirSync(join(root, "tests"), { recursive: true });
    const good = (t: string) => `from main import split_amount\n\ndef test_${t}_even():\n    assert split_amount(48, 3) == 16\n`;
    writeFileSync(join(root, "tests", "test_split.py"), good("p2_t2"));
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(b.notes.some((n) => n.includes("pro score 88/100: checks pass 25 · your tests pass 25 · your tests catch a broken version 25 · done-when cases covered 1/2 13"))).toBe(true);
    const notes = () => b.messages.filter((m) => (m.message as { customType?: string }).customType === "tutor_notes");
    expect(notes()).toHaveLength(1);
    expect((notes()[0].message as { content: string }).content).toMatch(/at most three notes on design or naming.*path:line.*no points/s);
    expect((notes()[0].message as { content: string }).content).toMatch(/The functions: src\/main\.py:1 split_amount\./);
    expect(notes()[0].options).toEqual({ triggerTurn: true });
    await b.commands["tutor-notes"].handler("off", b.ctx);
    // P2.T3..T5 share the same checks (they are matched by task id), so give each its own trusted checks.
    const { Profile } = await import("../extensions/tutor/profile.js");
    const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
    const st = JSON.parse(p.setting(`checks:${root}`)!);
    st.milestones[1].checks.push(...["P2.T3", "P2.T4", "P2.T5"].flatMap((task) => two.map((c) => ({ ...c, task }))));
    p.setSetting(`checks:${root}`, JSON.stringify(st)); p.close();
    for (const t of ["P2.T3", "P2.T4"]) {
      writeFileSync(join(root, "tests", "test_split.py"), good(t.toLowerCase().replace(".", "_")).replace("== 16\n", "== 16\n    assert split_amount(50, 3) == 50 / 3\n"));
      await b.commands["tutor-done"].handler(t, b.ctx);
    }
    expect(notes()).toHaveLength(1);
    expect(b.notes.some((n) => /your last 3 pro scores average 9\d; \/tutor-level 80 if you want harder work/.test(n))).toBe(true);
    expect(levelEntries()).toBe(levelsBefore); // the tutor suggests; it never moves the level
    // Side-agent note: tasks ticked without an own test are not judged for a level (25 is no sign of a weak pro).
    rmSync(join(root, "tests"), { recursive: true, force: true });
    const st2 = (() => { const q = Profile.open(process.env.PI_TUTOR_PROFILE!); try { return q.setting("proscores:python"); } finally { q.close(); } })();
    await b.commands["tutor-done"].handler("P2.T5", b.ctx);
    expect(b.notes.at(-1)).toMatch(/pro score 25\/100/);
    const q = Profile.open(process.env.PI_TUTOR_PROFILE!);
    try { expect(q.setting("proscores:python")).toBe(st2); } finally { q.close(); }
  }, 180000);
  it("habits Task 22: a failed /tutor-done writes spec/checks.md again, so it shows the checks that ran", async () => {
    const { b, root } = await doneProject(code("*"), two);
    expect(existsSync(join(root, "spec", "checks.md"))).toBe(false);
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(b.notes.at(-1)).toMatch(/P2\.T2 not yet/);
    expect(readFileSync(join(root, "spec", "checks.md"), "utf8")).toContain("split_amount(50, 3) == 16.666666666666668");
  }, 60000);
  it("own tests (Task 14): a test that cannot fail does not tick; a failing own test is a try; a good one ticks", async () => {
    const { b, root } = await doneProject(code("/"), two);
    await b.commands["tutor-level"].handler("40", b.ctx);
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(join(root, "tests", "test_split.py"), "from main import split_amount\n\ndef test_p2_t2_runs():\n    split_amount(48, 3)\n");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(b.notes.at(-1)).toMatch(/your test passes even on a broken version/);
    expect(readFileSync(join(root, "spec", "tasks.md"), "utf8")).toContain("- [ ] P2.T2");
    expect(await habits()).toContainEqual(["tests-that-fail", false]);
    writeFileSync(join(root, "tests", "test_split.py"), "from main import split_amount\n\ndef test_p2_t2_even():\n    assert split_amount(48, 3) == 15\n");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(b.notes.at(-1)).toMatch(/P2\.T2 not yet: your test test_p2_t2_even fails/);
    expect(episodes(b.entries).at(-1)).toMatchObject({ attempts: 1, spot: "test:P2.T2:test_p2_t2_even" });
    writeFileSync(join(root, "tests", "test_split.py"), "from main import split_amount\n\ndef test_p2_t2_even():\n    assert split_amount(48, 3) == 16\n");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(readFileSync(join(root, "spec", "tasks.md"), "utf8")).toContain("- [x] P2.T2");
    expect(b.notes.some((n) => /ticked P2\.T2 .*your test/.test(n))).toBe(true);
    expect(await habits()).toContainEqual(["tests-that-fail", true]);
  }, 120000);
  it("own tests (phase 4 live run): a test not named for the task still ticks on the checks, and the note says how to name it", async () => {
    const { b, root } = await doneProject(code("/"), two);
    await b.commands["tutor-level"].handler("40", b.ctx);
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(join(root, "tests", "test_split.py"), "from main import split_amount\n\ndef test_split():\n    assert split_amount(48, 3) == 16\n");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(readFileSync(join(root, "spec", "tasks.md"), "utf8")).toContain("- [x] P2.T2");
    expect(b.notes.at(-1)).toMatch(/no test of yours is named for P2\.T2 \(test_p2_t2_<what>\), so none was run/);
  }, 60000);
  it("own tests (final review I1): with nothing in the code to break, the checks tick it, a note says so, no habit", async () => {
    const { b, root } = await doneProject("def split_amount(total, people):\n    return total / people\n\n\ndef same(x):\n    return x\n", [{ task: "P2.T2", kind: "value", expr: "split_amount(48, 3)", expected: "16.0", milestone: 1, status: "trusted" }]);
    await b.commands["tutor-level"].handler("70", b.ctx);
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(join(root, "tests", "test_split.py"), "from main import same\n\ndef test_p2_t2_same():\n    assert same(3) == 3\n");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(readFileSync(join(root, "spec", "tasks.md"), "utf8")).toContain("- [x] P2.T2");
    expect(b.notes.at(-1)).toMatch(/your test passes; no broken version of the code it calls could be made to try it on/);
    expect((await habits()).map(([h]) => h)).not.toContain("tests-that-fail");
  }, 60000);
  it("own tests (Task 14): a beginner's own test is not asked for, so a test that cannot fail does not block", async () => {
    const { b, root } = await doneProject(code("/"), two);
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(join(root, "tests", "test_split.py"), "from main import split_amount\n\ndef test_p2_t2_runs():\n    split_amount(48, 3)\n");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(readFileSync(join(root, "spec", "tasks.md"), "utf8")).toContain("- [x] P2.T2");
    expect((await habits()).map(([h]) => h)).not.toContain("tests-that-fail");
  }, 60000);
  it("final review I1: a run that is no try (a syntax error) moves no habit", async () => {
    const { b, root } = await doneProject(code("*"), two);
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    writeFileSync(join(root, "src", "main.py"), "def split_amount(total, people)\n    return total * people\n");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    writeFileSync(join(root, "src", "main.py"), code("*"));
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect((await habits()).filter(([k]) => k === "right-direction")).toEqual([]);
  }, 60000);
  it("final review I4: a level set by hand is not overridden by habits already there", async () => {
    const { b, root } = await doneProject(code("/"), two);
    const { Profile } = await import("../extensions/tutor/profile.js");
    const p = Profile.open(process.env.PI_TUTOR_PROFILE!);
    let at = 1;
    for (const habit of ["small-runs", "right-direction", "steps-first"] as const)
      for (let i = 0; i < 5; i++) p.addHabitEvent({ habit, ok: true, language: "python", project: i % 2 ? root : "/p/other", at: at++, evidence: "seed" });
    p.close();
    await b.commands["tutor-level"].handler("8", b.ctx);
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(b.widgets["tutor"]?.[0]).toContain("lvl 8");
  }, 60000);
  it("final review I5: a :TutorRun run counts toward small runs", async () => {
    const { b, root } = await doneProject(code("*"), two);
    const run = () => nvim!.lua(`vim.rpcnotify(vim.g.tutor_chan, "tutor", ...)`, [{ kind: "run_output", cmd: ["python3", "src/main.py"], code: 0, stdout: "", stderr: "" }]);
    const runsSeen = () => b.entries.filter((e) => e.type === "tutor_signal" && (e.data as { kind: string }).kind === "run_output").length;
    await run();
    await until(() => runsSeen() === 1); // the first run is the baseline: edit only after the tutor has seen it
    writeFileSync(join(root, "src", "main.py"), code("/"));
    await run();
    await until(() => runsSeen() === 2);
    for (let i = 0; i < 100 && !(await habits()).some(([k]) => k === "small-runs"); i++) await new Promise((r) => setTimeout(r, 100));
    expect(await habits()).toContainEqual(["small-runs", true]);
  }, 60000);
  it("final review I6: one reads-errors miss per error, none for recipe replies", async () => {
    const { b, root } = await doneProject(code("/"), two);
    await nvim!.command(`edit ${join(root, "src", "main.py")}`);
    await nvim!.lua(`local ns = vim.api.nvim_create_namespace("t"); vim.diagnostic.set(ns, 0, {{ lnum = 1, col = 0, severity = 1, message = "boom" }})`);
    await new Promise((r) => setTimeout(r, 300));
    await turn(b.events, b.ctx, "P2.T2 is the split box", judged("none")); // a recipe reply (the recipe auto-started)
    await b.commands["tutor-plan"].handler("off", b.ctx);
    await turn(b.events, b.ctx, "why is it red?", judged("none"));
    await turn(b.events, b.ctx, "still red, why?", judged("none"));
    expect((await habits()).filter(([k]) => k === "reads-errors")).toEqual([["reads-errors", false]]);
  }, 60000);
  it("final review I7: recipe steps survive a Pi restart", async () => {
    const { b } = await doneProject(code("*"), two);
    const say = (x: typeof b, t: string) => turn(x.events, x.ctx, t, judged("none"));
    await say(b, "P2.T2 is the split box");
    await say(b, "total: float, people: int → float");
    await say(b, "split_amount(48, 3) → 16.0\nedge: split_amount(0, 3) → 0.0");
    const { realpathSync } = await import("node:fs");
    const c = await boot({ nvim: h!.socket, cwd: realpathSync(h!.root) });
    (c.pi as { exec: unknown }).exec = realExec;
    await c.commands["tutor-plan"].handler("P2.T2", c.ctx);
    for (let i = 0; i < 5; i++) await c.commands["tutor-plan"].handler("skip", c.ctx); // Find → Build
    expect(await habits()).toContainEqual(["steps-first", true]);
    await c.events["session_shutdown"]({ type: "session_shutdown" }, c.ctx);
  }, 60000);
  it("final review I8: a task ticked without a check run records no ideas-to-code miss", async () => {
    const { b } = await doneProject(code("/"), []);
    for (const t of ["P2.T2 is the split box", "total: float, people: int → float", "split_amount(48, 3) → 16.0\nedge: split_amount(0, 3) → 0.0", "1. take the total\n2. divide it by the people\n3. give it back"]) await turn(b.events, b.ctx, t, judged("none"));
    await b.commands["tutor-done"].handler("P2.T2 anyway", b.ctx);
    expect((await habits()).filter(([k]) => k === "ideas-to-code")).toEqual([]);
  }, 60000);
  it("final review M2+M3: a non-question is not a question; with no earlier try a question records nothing", async () => {
    const { b, root } = await doneProject(code("*"), two);
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    await turn(b.events, b.ctx, "ok", judged("none"));
    await turn(b.events, b.ctx, "ok", judged("none"));
    expect((await habits()).filter(([k]) => k === "right-question")).toEqual([]);
  }, 60000);
  it("a right-click ask on a fresh error is a reads-errors miss; a chat question with an error open is too", async () => {
    const { b, root } = await doneProject(code("/"), two);
    await nvim!.command(`edit ${join(root, "src", "main.py")}`);
    await nvim!.lua(`local ns = vim.api.nvim_create_namespace("t"); vim.diagnostic.set(ns, 0, {{ lnum = 1, col = 0, severity = 1, message = "boom" }})`);
    await new Promise((r) => setTimeout(r, 300));
    await turn(b.events, b.ctx, "[ask-error] src/main.py:2: boom | code: return total / people", judged("none"));
    await b.commands["tutor-plan"].handler("off", b.ctx); // recipe replies are not chat questions (final review I6)
    await turn(b.events, b.ctx, "why is it red?", judged("none"));
    expect((await habits()).filter(([k]) => k === "reads-errors")).toEqual([["reads-errors", false], ["reads-errors", false]]);
  }, 60000);
  it("own recipe steps before Build, then passing checks, record steps-first and ideas-to-code", async () => {
    const { b, root } = await doneProject(code("*"), two);
    const say = (t: string) => turn(b.events, b.ctx, t, judged("none"));
    await say("P2.T2 is the split box");
    await say("total: float, people: int → float");
    await say("split_amount(48, 3) → 16.0\nedge: split_amount(0, 3) → 0.0");
    await say("1. take the total\n2. divide it by the number of people\n3. give the share back");
    await say("divide the total by people → /\ngive the share back → return");
    writeFileSync(join(root, "src", "main.py"), code("/"));
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    const h = await habits();
    expect(h).toContainEqual(["steps-first", true]);
    expect(h).toContainEqual(["ideas-to-code", true]);
  }, 60000);
});

describe.skipIf(!bwrapReady)("/tutor-done in Rust and Go (spec 2026-10-22 §4)", () => {
  it.skipIf(!tool("cargo", ["--version"]))("Rust: a wrong value is a try on the check's spot; the fix ticks", async () => {
    const { b, root } = await doneProject("fn split_amount(total: f64, people: u32) -> f64 { total * people as f64 }\nfn main() {}\n", valueCheck("split_amount(48.0, 3)", "16.0"), "rust");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(episodes(b.entries).at(-1)).toMatchObject({ attempts: 1, spot: "check:P2.T2:split_amount(48.0, 3)" });
    writeFileSync(join(root, "src", "main.rs"), "fn split_amount(total: f64, people: u32) -> f64 { total / people as f64 }\nfn main() {}\n");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(readFileSync(join(root, "spec", "tasks.md"), "utf8")).toContain("- [x] P2.T2");
    expect(episodes(b.entries).at(-1)).toMatchObject({ closeReason: "run_passed" });
  }, 120_000);
  it.skipIf(!tool("go", ["version"]))("Go: a check that does not fit is not a try and does not tick", async () => {
    const { b, root } = await doneProject('package main\n\nfunc parse(s string) (int, error) { return 3, nil }\n\nfunc main() {}\n', valueCheck('parse("3")', "3"), "go");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(episodes(b.entries)).toEqual([]);
    expect(readFileSync(join(root, "spec", "tasks.md"), "utf8")).toContain("- [ ] P2.T2");
    expect(b.notes.at(-1)).toMatch(/does not accept/);
  }, 120_000);
  it.skipIf(!tool("go", ["version"]))("Review Focus #4: a compile error elsewhere is not a try and does not tick", async () => {
    const { b, root } = await doneProject("package main\n\nfunc splitAmount(total float64, people int) float64 { return total / float64(people) }\n\nfunc later() { x := 1 }\n\nfunc main() {}\n", valueCheck("splitAmount(48, 3)", "16.0"), "go");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(episodes(b.entries)).toEqual([]);
    expect(readFileSync(join(root, "spec", "tasks.md"), "utf8")).toContain("- [ ] P2.T2");
    expect(b.notes.at(-1)).toMatch(/your project does not compile/);
  }, 120_000);
  it.skipIf(!tool("cargo", ["--version"]))("Rust: a parse error is a typo", async () => {
    const { b } = await doneProject("fn split_amount(total: f64, people: u32) -> f64 {\nfn main() {}\n", valueCheck("split_amount(48.0, 3)", "16.0"), "rust");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(episodes(b.entries)).toEqual([]);
    expect(b.notes.at(-1)).toMatch(/syntax error/);
  }, 120_000);
});

describe.skipIf(!bwrapReady)("/tutor-done (spec 2026-10-21 §7)", () => {
  it("a failing trusted check is a graded try on the check's spot; unchanged code is not; the fix ticks the task and its subtasks", async () => {
    const { b, root } = await doneProject("def split_amount(total, people):\n    return total * people\n");
    const tasks = () => readFileSync(join(root, "spec", "tasks.md"), "utf8");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(tasks()).toContain("- [ ] P2.T2");
    expect(episodes(b.entries).at(-1)).toMatchObject({ attempts: 1, spot: "check:P2.T2:split_amount(48, 3)" });
    expect(b.sent.at(-1)?.text).toMatch(/run failed \(check P2\.T2\): split_amount\(48, 3\) gave 144, expected 16\.0/);
    await b.commands["tutor-done"].handler("", b.ctx); // the first open task; nothing changed
    expect(episodes(b.entries).at(-1)).toMatchObject({ attempts: 1 });
    writeFileSync(join(root, "src", "main.py"), "def split_amount(total, people):\n    return total / people\n");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(tasks()).toBe("- [x] P2.T2 split the bill\n  - [x] P2.T2.S1 divide\n- [ ] P2.T3 print\n");
    expect(episodes(b.entries).at(-1)).toMatchObject({ closeReason: "run_passed" });
    expect(readFileSync(join(root, "spec", "checks.md"), "utf8")).toContain("## P2.T2 (done)");
  }, 30000);
  it("a task the near-miss guard left weak is marked in spec/checks.md (spec 2026-10-22 §5.5)", async () => {
    const { b, root } = await doneProject("def split_amount(total, people):\n    return total / people\n",
      [{ task: "P2.T2", kind: "value", expr: "split_amount(48, 3)", expected: "16.0", milestone: 1, status: "trusted" }, { task: "P2.T3", kind: "io", stdin: "48\n", contains: "16", milestone: 1, status: "trusted" }],
      "python", { weak: ["P2.T3"] });
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(readFileSync(join(root, "spec", "checks.md"), "utf8")).toContain("## P2.T3 (a near miss may pass these checks)");
  }, 30000);
  it("a failed check's notice shows long decimals short (spec 2026-10-26 §5.3)", async () => {
    const { b } = await doneProject("def split_amount(total, people):\n    return total // people\n", [{ task: "P2.T2", kind: "value", expr: "split_amount(50, 3)", expected: "16.666666666666668", milestone: 1, status: "trusted" }]);
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(b.notes.at(-1)).toMatch(/gave 16, expected 16\.6667$/);
  }, 30000);
  it("final review C1: on a failed check, a reply naming the fix in words is held; teaching about print is not", async () => {
    const { b } = await doneProject("def split_amount(total, people):\n    return total * people\n");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    await turn(b.events, b.ctx, "[tutor] stuck signal: run failed", assistant("Use `/` instead of `*` here. What do you expect?"));
    expect(b.entries.filter((e) => e.type === "tutor_check").at(-1)?.data).toMatchObject({ issues: ["prose-fix"] });
    await turn(b.events, b.ctx, "how do I see a value?", assistant("You can use print to see what a variable holds. What would you print first?"));
    const last = b.entries.filter((e) => e.type === "tutor_check").at(-1)?.data as { issues?: string[] } | undefined;
    expect(last?.issues ?? []).not.toContain("prose-fix");
  }, 30000);
  it("final review M5: when the short numbers would look equal, the notice shows the full values", async () => {
    const { b } = await doneProject("def split_amount(total, people):\n    return round(total / people, 5)\n", [{ task: "P2.T2", kind: "value", expr: "split_amount(50, 3)", expected: "16.666666666666668", milestone: 1, status: "trusted" }]);
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(b.notes.at(-1)).toMatch(/gave 16\.66667, expected 16\.666666666666668$/);
  }, 30000);
  it("a syntax error in the file is a typo, not a try", async () => {
    const { b } = await doneProject("def split_amount(total, people)\n    return total / people\n");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(episodes(b.entries)).toEqual([]);
    expect(b.notes.at(-1)).toMatch(/syntax error/);
  }, 30000);
  it("anyway ticks a failing task, labelled as ticked by you", async () => {
    const { b, root } = await doneProject("def split_amount(total, people):\n    return total * people\n");
    await b.commands["tutor-done"].handler("P2.T2 anyway", b.ctx);
    expect(readFileSync(join(root, "spec", "tasks.md"), "utf8")).toContain("- [x] P2.T2");
    expect(b.notes.at(-1)).toMatch(/ticked P2\.T2 \(ticked by you\)/);
    expect(readFileSync(join(root, "spec", "checks.md"), "utf8")).toContain("## P2.T2 (done, ticked by you)");
  }, 30000);
  it("anyway after a failed try closes the check episode as given up, not solved (final review I2)", async () => {
    const { b } = await doneProject("def split_amount(total, people):\n    return total * people\n");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(episodes(b.entries).at(-1)).toMatchObject({ attempts: 1 });
    await b.commands["tutor-done"].handler("P2.T2 anyway", b.ctx);
    expect(episodes(b.entries).at(-1)).toMatchObject({ closeReason: "superseded" });
  }, 30000);
  it("a subtask's checks run when its task is done (final review I3)", async () => {
    const { b, root } = await doneProject("def split_amount(total, people):\n    return total * people\n",
      [{ task: "P2.T2.S1", kind: "value", expr: "split_amount(48, 3)", expected: "16.0", milestone: 1, status: "trusted" }]);
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(readFileSync(join(root, "spec", "tasks.md"), "utf8")).toContain("- [ ] P2.T2");
    expect(b.notes.at(-1)).toMatch(/P2\.T2 not yet: split_amount\(48, 3\) gave 144/);
  }, 30000);
  it("a tick where no trusted check passed is labelled self-checked, not done by checks (final review I5)", async () => {
    const { b, root } = await doneProject("def split_amount(total, people):\n    return total / people\n",
      [{ task: "P2.T2", kind: "value", expr: "split_amount(48, 3)", expected: "16.0", milestone: 1, status: "unverified" }]);
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(b.notes.at(-1)).toMatch(/ticked P2\.T2 \(self-checked: /);
    expect(readFileSync(join(root, "spec", "checks.md"), "utf8")).toContain("## P2.T2 (done, self-checked)");
  }, 30000);
  it("spec/checks.md is written only inside the project (final review I6)", async () => {
    const { b, root } = await doneProject("def split_amount(total, people):\n    return total / people\n");
    const outside = join(mkdtempSync(join(tmpdir(), "outside-")), "victim.txt");
    writeFileSync(outside, "keep me\n");
    symlinkSync(outside, join(root, "spec", "checks.md"));
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(readFileSync(join(root, "spec", "tasks.md"), "utf8")).toContain("- [x] P2.T2");
    expect(readFileSync(outside, "utf8")).toBe("keep me\n");
  }, 30000);
  it("unsaved edits made to spec/tasks.md while the checks run are not overwritten by the tick (pane check #1)", async () => {
    const { b, root } = await doneProject("def split_amount(total, people):\n    return total / people\n");
    const path = join(root, "spec", "tasks.md");
    let edited = false;
    (b.pi as { exec: unknown }).exec = async (c: string, a: string[], o: { cwd: string; timeout: number }) => {
      if (!edited) { edited = true; await nvim!.command(`edit ${path}`); await nvim!.command("normal! Gonote to self"); }
      return realExec(c, a, o);
    };
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(readFileSync(path, "utf8")).toContain("- [ ] P2.T2");
    expect(b.notes.at(-1)).toMatch(/unsaved edits/);
    expect(await nvim!.call("getline", ["$"])).toBe("note to self");
  }, 30000);
  it("waits while spec/tasks.md has unsaved edits in Neovim, and runs nothing", async () => {
    const { b, root } = await doneProject("def split_amount(total, people):\n    return total / people\n");
    await nvim!.command(`edit ${join(root, "spec", "tasks.md")}`);
    await nvim!.command("normal! Ox");
    await b.commands["tutor-done"].handler("P2.T2", b.ctx);
    expect(b.notes.at(-1)).toMatch(/unsaved/);
    expect(readFileSync(join(root, "spec", "tasks.md"), "utf8")).toContain("- [ ] P2.T2");
  }, 30000);
});

describe("runtime-error episodes (spec 2026-10-13 §7 #4)", () => {
  it("a run whose own output is a syntax error is a typo run: no attempt, no nudge, even with no editor mark (author 2026-10-21)", async () => {
    const b = await linked();
    await runPayload(1, '  File "a.py", line 1\n    x = (\n        ^\nSyntaxError: \'(\' was never closed');
    await until(() => /syntax error/.test(b.widgets["tutor"]?.[1] ?? ""));
    await new Promise((r) => setTimeout(r, 300));
    expect(b.sent).toEqual([]);
    expect(episodes(b.entries).some((e) => (e.trigger as { kind: string }).kind === "run")).toBe(false);
  }, 20000);
  it("an error marked in the editor no longer makes a runtime error a typo run (author 2026-10-21)", async () => {
    const b = await linked();
    await setError("boom");
    await new Promise((r) => setTimeout(r, 300));
    await runPayload(1, "NameError: name 'totl' is not defined");
    await until(() => (episodes(b.entries).at(-1) as { attempts?: number; trigger: { kind: string } }).trigger.kind === "run");
    expect(episodes(b.entries).at(-1)).toMatchObject({ attempts: 1, spot: "NameError: name 'totl' is not defined" });
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
  it("a failed run opens an episode silently while the architect is active", async () => {
    const b = await linked();
    await b.commands["tutor-architect"].handler("", b.ctx);
    await runPayload(1, "Traceback\nKeyError: 'x'");
    await until(() => episodes(b.entries).some((e) => (e.trigger as { kind: string }).kind === "run"));
    await new Promise((r) => setTimeout(r, 300));
    expect(b.sent).toEqual([]);
  }, 20000);
});

describe("attempts from runs (spec 2026-10-21 §5)", () => {
  const attempts = (b: { entries: { type: string; data: unknown }[] }) => (episodes(b.entries).at(-1) as { attempts?: number } | undefined)?.attempts;
  const edit = (text: string) => writeFileSync(join(h!.root, "a.py"), text);
  it("failed runs on one spot climb; an unchanged rerun and a typo run do not", async () => {
    const b = await linked();
    await runPayload(1, "ZeroDivisionError: division by zero");
    await until(() => attempts(b) === 1 && b.sent.length === 1);
    edit("x = 1\n");
    await runPayload(1, "ZeroDivisionError: division by zero");
    await until(() => attempts(b) === 2 && b.sent.length === 2);
    await runPayload(1, "ZeroDivisionError: division by zero"); // nothing changed
    await new Promise((r) => setTimeout(r, 300));
    expect(attempts(b)).toBe(2);
    expect(b.sent).toHaveLength(2);
    edit("x = (\n");
    const runs = b.entries.filter((e) => e.type === "tutor_signal").length;
    await runPayload(1, "SyntaxError: invalid syntax");
    await until(() => b.entries.filter((e) => e.type === "tutor_signal").length > runs);
    await new Promise((r) => setTimeout(r, 300));
    expect(attempts(b)).toBe(2); // a typo run: the run's own output is a syntax error
    expect(b.sent).toHaveLength(2);
  }, 30000);
  it("a run that fails on a new spot starts over on a new episode", async () => {
    const b = await linked();
    await runPayload(1, "KeyError: 'x'");
    await until(() => attempts(b) === 1);
    const first = episodes(b.entries).at(-1)!;
    edit("x = 2\n");
    await runPayload(1, "TypeError: unsupported operand");
    await until(() => episodes(b.entries).some((e) => e.id === first.id && e.closeReason === "superseded"));
    expect(episodes(b.entries).at(-1)).toMatchObject({ attempts: 1, spot: "TypeError: unsupported operand", trigger: { kind: "run" } });
  }, 20000);
  it("coming back to a spot after a different error resumes its count (live check 2026-10-21)", async () => {
    const b = await linked();
    await runPayload(1, "split_amount(48, 3) gave 144, expected 16.0");
    await until(() => attempts(b) === 1);
    edit("x = 4\n");
    await runPayload(1, "split_amount(48, 3) gave 144.0, expected 16.0");
    await until(() => attempts(b) === 2);
    edit("x = (\n");
    await runPayload(1, "lua: src/main.lua:4: attempt to call a nil value (global 'splt')");
    await until(() => (episodes(b.entries).at(-1) as { spot?: string }).spot?.includes("nil value") === true);
    expect(attempts(b)).toBe(1);
    edit("x = 5\n");
    await runPayload(1, "split_amount(10, 4) gave 2, expected 2.5");
    await until(() => (episodes(b.entries).at(-1) as { spot?: string }).spot?.includes("gave") === true);
    expect(attempts(b)).toBe(3);
  }, 20000);
  it("a chat message never counts as an attempt, even after the code changed (only graded tries count)", async () => {
    const b = await linked();
    await runPayload(1, "ZeroDivisionError: division by zero");
    await until(() => attempts(b) === 1);
    edit("x = 3\n");
    const t = await turn(b.events, b.ctx, "I changed it and it is still wrong", judged("wrong"));
    expect(attempts(b)).toBe(1);
    expect(t.message?.content).toContain("this turn: One small hint");
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
    await runPayload(1, "Traceback\nNameError: boom"); // a failed run replaces it mid-reply (errors no longer open episodes)
    await until(() => episodes(b.entries).some((e) => (e.trigger as { kind: string }).kind === "run"));
    await b.events["turn_end"]({ type: "turn_end", message: judged("correct") }, b.ctx);
    expect(episodes(b.entries).at(-1)).toMatchObject({ trigger: { kind: "run" }, turns: 0 });
  }, 20000);
  it("a run that started without an episode does not judge one opened mid-reply (M6c M6)", async () => {
    const b = await linked(); // beginner: error threshold 0
    const opts = { sections: {} as Record<string, string> };
    await b.events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: "[tutor] a proactive nudge", systemPromptOptions: opts }, b.ctx); // no episode
    expect(episodes(b.entries)).toHaveLength(0);
    await runPayload(1, "Traceback\nNameError: boom"); // a run episode opens mid-reply
    await until(() => episodes(b.entries).some((e) => (e.trigger as { kind: string }).kind === "run"));
    await b.events["turn_end"]({ type: "turn_end", message: judged("wrong") }, b.ctx);
    expect(episodes(b.entries).at(-1)).toMatchObject({ trigger: { kind: "run" }, turns: 0 });
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
