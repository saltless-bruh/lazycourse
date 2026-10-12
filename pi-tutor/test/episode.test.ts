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
async function linked(busy = false) {
  h = await startHeadlessNvim();
  const b = await boot({ nvim: h.socket, cwd: h.root });
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
});
