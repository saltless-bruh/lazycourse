import { describe, it, expect, afterEach, vi } from "vitest";
import { writeFileSync, mkdtempSync, readFileSync, mkdirSync, symlinkSync } from "node:fs";
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
async function doneProject(code: string, checks: object[] = [{ task: "P2.T2", kind: "value", expr: "split_amount(48, 3)", expected: "16.0", milestone: 1, status: "trusted" }], language: keyof typeof DONE_LANG = "python") {
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
    checks } } }));
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
    await until(() => b.sent.length === 1); // the error episode's own nudge
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
  it("an editor error opens an episode silently while the architect is active", async () => {
    const b = await linked();
    await b.commands["tutor-architect"].handler("", b.ctx);
    await setError("boom");
    await until(() => episodes(b.entries).some((e) => (e.trigger as { kind: string }).kind === "error"));
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
    await setError("boom"); // replaces it mid-reply
    await until(() => episodes(b.entries).some((e) => (e.trigger as { kind: string }).kind === "error"));
    await b.events["turn_end"]({ type: "turn_end", message: judged("correct") }, b.ctx);
    expect(episodes(b.entries).at(-1)).toMatchObject({ trigger: { kind: "error" }, attempts: 0, turns: 0 });
  }, 20000);
  it("a run that started without an episode does not judge one opened mid-reply (M6c M6)", async () => {
    const b = await linked(); // beginner: error threshold 0
    const opts = { sections: {} as Record<string, string> };
    await b.events["before_agent_start"]({ type: "before_agent_start", messageType: "user", prompt: "[tutor] a proactive nudge", systemPromptOptions: opts }, b.ctx); // no episode
    expect(episodes(b.entries)).toHaveLength(0);
    await setError("boom"); // an editor episode opens mid-reply
    await until(() => episodes(b.entries).some((e) => (e.trigger as { kind: string }).kind === "error"));
    await b.events["turn_end"]({ type: "turn_end", message: judged("wrong") }, b.ctx);
    expect(episodes(b.entries).at(-1)).toMatchObject({ trigger: { kind: "error" }, attempts: 0, turns: 0 });
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
