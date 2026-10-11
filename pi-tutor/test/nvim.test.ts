import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startHeadlessNvim, type Headless } from "./nvim-harness.js";
import { NvimLink, type TutorPayload } from "../extensions/tutor/nvim.js";

let h: Headless | undefined;
let link: NvimLink | null = null;
afterEach(async () => { await link?.close(); link = null; h?.kill(); h = undefined; });

async function setup(opts: { idleMs?: number; churnEdits?: number } = {}) {
  h = await startHeadlessNvim();
  const payloads: TutorPayload[] = [];
  link = await NvimLink.connect({ socket: h.socket, root: h.root, onPayload: (p) => payloads.push(p), ...opts });
  if (!link) throw new Error("no link");
  return { payloads, link, h };
}
const until = (f: () => boolean, ms = 5000) => new Promise<void>((res, rej) => {
  const t0 = Date.now(); const id = setInterval(() => { if (f()) { clearInterval(id); res(); } else if (Date.now() - t0 > ms) { clearInterval(id); rej(new Error("timeout")); } }, 25);
});

describe("NvimLink", () => {
  it("returns null when no socket is given and NVIM is unset", async () => {
    const saved = process.env.NVIM; delete process.env.NVIM;
    expect(await NvimLink.connect({ root: "/x", onPayload: () => {} })).toBeNull();
    if (saved) process.env.NVIM = saved;
  }, 10000);

  it("sets vim.g.tutor_chan and receives a diagnostics payload", async () => {
    const { payloads, link, h } = await setup();
    const nvim = link.raw;
    expect(await nvim.lua("return vim.g.tutor_chan")).toBe(link.channel);
    writeFileSync(join(h.root, "a.py"), "x = \n");
    await nvim.command(`edit ${join(h.root, "a.py")}`);
    await nvim.lua(`local ns = vim.api.nvim_create_namespace("t"); vim.diagnostic.set(ns, 0, {{ lnum = 0, col = 0, severity = 1, message = "boom" }})`);
    await until(() => payloads.some((p) => p.kind === "diagnostics"));
    const d = payloads.find((p) => p.kind === "diagnostics") as Extract<TutorPayload, { kind: "diagnostics" }>;
    expect(d.errors).toBe(1);
    expect(d.first).toEqual({ line: 1, msg: "boom" });
    expect(d.path).toBe(join(h.root, "a.py"));
  }, 20000);

  it("ignores buffers outside the project root for push and pull", async () => {
    const { payloads, link, h } = await setup();
    const nvim = link.raw;
    await nvim.command(`edit /tmp/outside-${process.pid}.py`);
    await nvim.lua(`local ns = vim.api.nvim_create_namespace("t"); vim.diagnostic.set(ns, 0, {{ lnum = 0, col = 0, severity = 1, message = "boom" }})`);
    await new Promise((r) => setTimeout(r, 300));
    expect(payloads.filter((p) => p.kind === "diagnostics")).toHaveLength(0);
    expect(await link.currentFile()).toBeNull();
    expect(await link.bufferText()).toBeNull();
    void h;
  }, 20000);

  it("emits idle after the configured quiet period", async () => {
    const { payloads, link, h } = await setup({ idleMs: 200 });
    writeFileSync(join(h.root, "b.py"), "print(1)\n");
    await link.raw.command(`edit ${join(h.root, "b.py")}`);
    await until(() => payloads.some((p) => p.kind === "idle"), 3000);
    const i = payloads.find((p) => p.kind === "idle") as Extract<TutorPayload, { kind: "idle" }>;
    expect(i.since_ms).toBeGreaterThanOrEqual(200);
  }, 20000);

  it("emits churn after N edits in the same 20-line region", async () => {
    const { payloads, link, h } = await setup({ churnEdits: 3, idleMs: 60000 });
    writeFileSync(join(h.root, "c.py"), "a\n");
    await link.raw.command(`edit ${join(h.root, "c.py")}`);
    for (let i = 0; i < 3; i++) await link.raw.input("ox<Esc>");
    await until(() => payloads.some((p) => p.kind === "churn"), 3000);
    const c = payloads.find((p) => p.kind === "churn") as Extract<TutorPayload, { kind: "churn" }>;
    expect(c.region).toEqual([1, 20]);
    expect(c.edits).toBe(3);
  }, 20000);

  it("pulls file, text, cursor and diagnostics inside the root", async () => {
    const { link, h } = await setup();
    writeFileSync(join(h.root, "d.py"), "one\ntwo\n");
    await link.raw.command(`edit ${join(h.root, "d.py")}`);
    await link.raw.lua(`local ns = vim.api.nvim_create_namespace("t"); vim.diagnostic.set(ns, 0, {{ lnum = 1, col = 0, severity = 2, message = "warn" }})`);
    expect(await link.currentFile()).toBe(join(h.root, "d.py"));
    expect(await link.bufferText()).toBe("one\ntwo");
    expect(await link.cursorLine()).toBe(1);
    expect(await link.diagnostics()).toEqual([{ line: 2, severity: 2, msg: "warn" }]);
  }, 20000);

  it("openLocation jumps the editor to path:line", async () => {
    const { link, h } = await setup();
    writeFileSync(join(h.root, "e.py"), "1\n2\n3\n");
    await link.openLocation(join(h.root, "e.py"), 3);
    expect(await link.currentFile()).toBe(join(h.root, "e.py"));
    expect(await link.cursorLine()).toBe(3);
  }, 20000);

  it("calls onDisconnect and clears state when Neovim exits", async () => {
    h = await startHeadlessNvim();
    let disconnected = false;
    link = await NvimLink.connect({ socket: h.socket, root: h.root, onPayload: () => {}, onDisconnect: () => { disconnected = true; } });
    h.kill();
    await until(() => disconnected, 5000);
    expect(link!.connected).toBe(false);
    link = null;
  }, 20000);
});
