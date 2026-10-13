import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { startHeadlessNvim, type Headless } from "./nvim-harness.js";
import { NvimLink, SNAPSHOT_LUA, nvimLogPath, type TutorPayload } from "../extensions/tutor/nvim.js";

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

describe("NvimLink hardening (review fixes)", () => {
  it("resolves null quickly for a stale socket path instead of hanging or throwing", async () => {
    const t0 = Date.now();
    const unhandled: unknown[] = [];
    const h = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", h);
    const r = await NvimLink.connect({ socket: `/tmp/pitutor-stale-${process.pid}.sock`, root: "/x", onPayload: () => {} });
    await new Promise((res) => setTimeout(res, 200));
    process.off("unhandledRejection", h);
    expect(r).toBeNull();
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(unhandled).toHaveLength(0);
  }, 10000);

  it("does not treat a sibling directory with the root as prefix as inside the project", async () => {
    const hh = await startHeadlessNvim();
    const payloads: TutorPayload[] = [];
    const sibling = hh.root + "-secrets";
    mkdirSync(sibling);
    writeFileSync(join(sibling, "key.py"), "k = 1\n");
    const l = await NvimLink.connect({ socket: hh.socket, root: hh.root, onPayload: (p) => payloads.push(p) });
    try {
      await l!.raw.command(`edit ${join(sibling, "key.py")}`);
      await l!.raw.lua(`local ns = vim.api.nvim_create_namespace("t"); vim.diagnostic.set(ns, 0, {{ lnum = 0, col = 0, severity = 1, message = "boom" }})`);
      await new Promise((r) => setTimeout(r, 300));
      expect(payloads.filter((p) => p.kind === "diagnostics")).toHaveLength(0);
      expect(await l!.currentFile()).toBeNull();
      expect(await l!.bufferText()).toBeNull();
    } finally { await l?.close(); hh.kill(); rmSync(sibling, { recursive: true, force: true }); }
  }, 20000);

  it("matches a buffer opened through a symlinked project path", async () => {
    const hh = await startHeadlessNvim();
    const payloads: TutorPayload[] = [];
    const linkPath = hh.root + "-link";
    symlinkSync(hh.root, linkPath);
    writeFileSync(join(hh.root, "s.py"), "s = 1\n");
    const l = await NvimLink.connect({ socket: hh.socket, root: linkPath, onPayload: (p) => payloads.push(p) });
    try {
      await l!.raw.command(`edit ${join(linkPath, "s.py")}`);
      // Neovim stores the resolved path as the buffer name; what matters is that
      // a buffer reached through the symlinked root is recognised as inside it.
      const f = await l!.currentFile();
      expect(f).not.toBeNull();
      expect(f!.endsWith("/s.py")).toBe(true);
      await l!.raw.lua(`local ns = vim.api.nvim_create_namespace("t"); vim.diagnostic.set(ns, 0, {{ lnum = 0, col = 0, severity = 1, message = "boom" }})`);
      await until(() => payloads.some((p) => p.kind === "diagnostics"), 3000);
    } finally { await l?.close(); hh.kill(); rmSync(linkPath, { force: true }); }
  }, 20000);

  it("snapshot('full') returns the whole buffer, filetype, cursor and diagnostics", async () => {
    const { link, h } = await setup();
    writeFileSync(join(h.root, "s.py"), Array.from({ length: 60 }, (_, i) => `line${i + 1}`).join("\n") + "\n");
    await link.raw.command(`edit ${join(h.root, "s.py")}`);
    await link.raw.lua(`vim.bo.filetype = "python"; vim.api.nvim_win_set_cursor(0, { 30, 0 })`);
    await link.raw.lua(`local ns = vim.api.nvim_create_namespace("t"); vim.diagnostic.set(ns, 0, {{ lnum = 4, col = 0, severity = 1, message = "boom" }})`);
    const s = await link.snapshot("full");
    expect(s).not.toBeNull();
    expect(s!.path).toBe(join(h.root, "s.py"));
    expect(s!.filetype).toBe("python");
    expect(s!.cursor).toBe(30);
    expect(s!.from).toBe(1);
    expect(s!.lines).toHaveLength(60);
    expect(s!.diagnostics).toEqual([{ line: 5, severity: 1, msg: "boom" }]);
  }, 20000);

  it("snapshot('window') returns radius lines around the cursor, clamped at the top", async () => {
    const { link, h } = await setup();
    writeFileSync(join(h.root, "w.py"), Array.from({ length: 60 }, (_, i) => `line${i + 1}`).join("\n") + "\n");
    await link.raw.command(`edit ${join(h.root, "w.py")}`);
    await link.raw.lua(`vim.api.nvim_win_set_cursor(0, { 30, 0 })`);
    const mid = await link.snapshot("window", 20);
    expect(mid!.from).toBe(10);
    expect(mid!.lines).toHaveLength(41);
    expect(mid!.lines[0]).toBe("line10");
    await link.raw.lua(`vim.api.nvim_win_set_cursor(0, { 1, 0 })`);
    const top = await link.snapshot("window", 20);
    expect(top!.from).toBe(1);
    expect(top!.lines).toHaveLength(21);
    await link.raw.lua(`vim.api.nvim_win_set_cursor(0, { 60, 0 })`);
    const bottom = await link.snapshot("window", 20);
    expect(bottom!.from).toBe(40);
    expect(bottom!.lines).toHaveLength(21);
  }, 20000);

  it("snapshot returns null for a buffer outside the root", async () => {
    const { link } = await setup();
    await link.raw.command(`edit /tmp/outside-snap-${process.pid}.py`);
    expect(await link.snapshot("full")).toBeNull();
    expect(await link.snapshot("window")).toBeNull();
  }, 20000);
});

describe("NvimLink editor-window resolution (M2 review fixes)", () => {
  it("snapshot and pulls read the editor window even when a terminal window is current (C1)", async () => {
    const { link, h } = await setup();
    writeFileSync(join(h.root, "t.py"), Array.from({ length: 40 }, (_, i) => `line${i + 1}`).join("\n") + "\n");
    await link.raw.command(`edit ${join(h.root, "t.py")}`);
    await link.raw.lua(`vim.bo.filetype = "python"; vim.api.nvim_win_set_cursor(0, { 30, 0 })`);
    // Open a terminal split and leave it as the current window, like the Pi pane.
    await link.raw.command("vsplit | terminal");
    expect(await link.raw.lua("return vim.bo[vim.api.nvim_get_current_buf()].buftype")).toBe("terminal");
    const s = await link.snapshot("window", 5);
    expect(s).not.toBeNull();
    expect(s!.path).toBe(join(h.root, "t.py"));
    expect(s!.cursor).toBe(30);
    expect(s!.from).toBe(25);
    expect(s!.filetype).toBe("python");
    expect(await link.currentFile()).toBe(join(h.root, "t.py"));
    expect(await link.cursorLine()).toBe(30);
    expect((await link.bufferText())!.startsWith("line1\n")).toBe(true);
  }, 20000);

  it("the snapshot Lua returns only the path for a buffer outside the root (I1)", async () => {
    const { link } = await setup();
    await link.raw.command(`edit /tmp/outside-lua-${process.pid}.py`);
    await link.raw.call("nvim_buf_set_lines", [0, 0, -1, false, ["secret = 1"]]);
    const r = (await link.raw.lua(SNAPSHOT_LUA, ["full", 20, link.root])) as Record<string, unknown>;
    expect(r.path).toBe(`/tmp/outside-lua-${process.pid}.py`);
    expect(r.lines).toBeUndefined();
    expect(r.diagnostics).toBeUndefined();
    expect(await link.snapshot("full")).toBeNull();
  }, 20000);

  it("close detaches without quitting the user's Neovim", async () => {
    const { link, h } = await setup();
    await link.close();
    await new Promise((r) => setTimeout(r, 200));
    const { attach } = await import("neovim");
    const other = attach({ socket: h.socket });
    try {
      expect(h.proc.exitCode).toBeNull();
      expect(await other.lua("return vim.g.tutor_chan")).toBeNull();
    } finally { await other.close(); }
  }, 20000);

  it("switchProject schedules require('tutor').switch(dir, file) after the call returns", async () => {
    const { link } = await setup();
    await link.raw.lua(`package.loaded.tutor = { switch = function(d, f) vim.g.switched = { d, f } end }`);
    await link.switchProject("/x/proj", "spec/tasks.md");
    expect(await link.raw.lua("return vim.g.switched")).toBeNull(); // deferred, not yet
    await new Promise((r) => setTimeout(r, 800));
    expect(await link.raw.lua("return vim.g.switched")).toEqual(["/x/proj", "spec/tasks.md"]);
  }, 20000);
});

describe("M6c: link hardening", () => {
  it("openLocation refuses a path outside the root and reports it (M1b #5)", async () => {
    const { link, h } = await setup();
    writeFileSync(join(h.root, "e.py"), "a\nb\n");
    expect(await link.openLocation("/etc/hosts", 1)).toBe(false);
    expect(await link.openLocation(join(h.root, "e.py"), 2)).toBe(true);
    expect(await link.cursorLine()).toBe(2);
  }, 20000);
  it("openLocation checks the realpath, not the spelling: ../ and an in-root symlink out are refused (M6c M1)", async () => {
    const { link, h } = await setup();
    const outside = join(h.root + "-out");
    mkdirSync(outside);
    writeFileSync(join(outside, "x.py"), "secret\n");
    symlinkSync(join(outside, "x.py"), join(h.root, "notes.py"));
    try {
      expect(await link.openLocation(`${h.root}/../../etc/hosts`, 1)).toBe(false);
      expect(await link.openLocation(join(h.root, "notes.py"), 1)).toBe(false);
      expect(await link.raw.call("nvim_buf_get_name", [0])).not.toMatch(/notes\.py|hosts/);
    } finally { rmSync(outside, { recursive: true, force: true }); }
  }, 20000);
  it("a buffer reached through an in-root symlink to a file outside is not pushed or pulled (M6c pane #1)", async () => {
    const { payloads, link, h } = await setup();
    const outside = join(h.root + "-out2");
    mkdirSync(outside);
    writeFileSync(join(outside, "x.py"), "secret = 1\n");
    symlinkSync(join(outside, "x.py"), join(h.root, "notes.py"));
    try {
      await link.raw.command(`edit ${join(h.root, "notes.py")}`);
      await link.raw.lua(`local ns = vim.api.nvim_create_namespace("t"); vim.diagnostic.set(ns, 0, {{ lnum = 0, col = 0, severity = 1, message = "boom" }})`);
      await new Promise((r) => setTimeout(r, 300));
      expect(payloads.filter((p) => p.kind === "diagnostics")).toHaveLength(0);
      expect(await link.currentFile()).toBeNull();
      expect(await link.bufferText()).toBeNull();
      expect(await link.snapshot("full")).toBeNull();
      const r = (await link.raw.lua(SNAPSHOT_LUA, ["full", 20, link.root])) as { lines?: string[] };
      expect(r.lines).toBeUndefined();
    } finally { rmSync(outside, { recursive: true, force: true }); }
  }, 20000);
  it("cursorLine is null when the editor buffer is outside the root (M1b #5)", async () => {
    const { link } = await setup();
    await link.raw.command("edit /etc/hosts");
    expect(await link.cursorLine()).toBeNull();
  }, 20000);
  it("a snapshot on a blocked Neovim rejects after its timeout instead of hanging (M2 #12)", async () => {
    const { link } = await setup();
    void link.raw.lua("vim.uv.sleep(3000)").catch(() => {});
    const t0 = Date.now();
    await expect(link.snapshot("window", 20, 300)).rejects.toThrow(/timed out/);
    expect(Date.now() - t0).toBeLessThan(2000);
  }, 20000);
});

describe("nvimLogPath (M1b #6)", () => {
  it("is per user under XDG_STATE_HOME, else ~/.local/state", () => {
    expect(nvimLogPath({ XDG_STATE_HOME: "/s" } as NodeJS.ProcessEnv)).toBe("/s/pi-tutor/nvim.log");
    expect(nvimLogPath({ HOME: "/home/u" } as NodeJS.ProcessEnv)).toBe("/home/u/.local/state/pi-tutor/nvim.log");
  });
});
