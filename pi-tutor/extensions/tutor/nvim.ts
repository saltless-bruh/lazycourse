import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, realpathSync } from "node:fs";
import type { NeovimClient } from "neovim";
import { PUSH_LUA } from "./push.lua.js";

// The neovim client logs through winston and patches console; route it to a file
// before it loads so nothing ever reaches Pi's terminal.
process.env.NVIM_NODE_LOG_FILE ||= join(tmpdir(), "pi-tutor-nvim.log");

export type TutorPayload =
  | { kind: "diagnostics"; buf: number; path: string; errors: number; warnings: number; first?: { line: number; msg: string } }
  | { kind: "idle"; buf: number; path: string; line: number; since_ms: number }
  | { kind: "churn"; buf: number; path: string; region: [number, number]; edits: number }
  | { kind: "run_output"; cmd: string[]; code: number; stdout: string; stderr: string };

export interface EditorSnapshot {
  path: string;
  filetype: string;
  /** 1-based cursor line. */
  cursor: number;
  /** 1-based line number of `lines[0]`. */
  from: number;
  lines: string[];
  diagnostics: { line: number; severity: number; msg: string }[];
}

/**
 * Lua prelude: resolve the *editor* window. When the user types into the Pi
 * pane, the current window is a terminal, so "current buffer" would be
 * `term://…`. Prefer the previous window, then any normal-buffer window in
 * the tabpage, and only then the current one.
 */
export const EDITOR_WIN_LUA = String.raw`
local function __editor_win()
  local function ok(w)
    if not (w and vim.api.nvim_win_is_valid(w)) then return false end
    return vim.bo[vim.api.nvim_win_get_buf(w)].buftype == ""
  end
  local cur = vim.api.nvim_get_current_win()
  if ok(cur) then return cur end
  local prev = vim.fn.win_getid(vim.fn.winnr("#"))
  if ok(prev) then return prev end
  for _, w in ipairs(vim.api.nvim_tabpage_list_wins(0)) do if ok(w) then return w end end
  return cur
end
`;

/**
 * Snapshot Lua. Args: mode ("full"|"window"), radius, root. Returns only
 * `{ path }` when the editor buffer is outside `root`, so no text or
 * diagnostics leave Neovim for files the tutor may not read (spec §8).
 */
export const SNAPSHOT_LUA = EDITOR_WIN_LUA + String.raw`
local mode, radius, root = ...
local w = __editor_win()
local b = vim.api.nvim_win_get_buf(w)
local path = vim.api.nvim_buf_get_name(b)
local prefix = root .. "/"
local inside = path ~= "" and (vim.startswith(path, prefix) or vim.startswith(vim.fn.resolve(path), prefix))
if not inside then return { path = path } end
local cur = vim.api.nvim_win_get_cursor(w)[1]
local from, to = 1, -1
if mode == "window" then from = math.max(1, cur - radius); to = cur + radius end
local lines = vim.api.nvim_buf_get_lines(b, from - 1, to, false)
local diags = {}
for _, d in ipairs(vim.diagnostic.get(b)) do diags[#diags + 1] = { line = d.lnum + 1, severity = d.severity, msg = d.message } end
return { path = path, filetype = vim.bo[b].filetype, cursor = cur, from = from, lines = lines, diagnostics = diags }
`;

export interface NvimLinkOptions {
  socket?: string;
  root: string;
  idleMs?: number;
  churnEdits?: number;
  onPayload: (p: TutorPayload) => void;
  onDisconnect?: () => void;
}

export class NvimLink {
  readonly channel: number;
  readonly raw: NeovimClient;
  connected = true;
  /** Resolved project root without trailing slash. */
  readonly root: string;

  private constructor(raw: NeovimClient, channel: number, root: string) {
    this.raw = raw; this.channel = channel; this.root = root;
  }

  static async connect(opts: NvimLinkOptions): Promise<NvimLink | null> {
    const socket = opts.socket ?? process.env.NVIM;
    if (!socket || !existsSync(socket)) return null;
    let root: string;
    try { root = realpathSync(opts.root).replace(/\/+$/, ""); } catch { root = opts.root.replace(/\/+$/, ""); }
    const timeoutMs = 3000;
    try {
      const { attach } = await import("neovim");
      const raw = attach({ socket });
      // Swallow transport errors: a stale socket must degrade to detached mode, never throw.
      raw.on("error", () => {});
      const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
        Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("nvim connect timeout")), timeoutMs))]);
      const [channel] = (await withTimeout(raw.request("nvim_get_api_info", []))) as [number, unknown];
      const link = new NvimLink(raw, channel, root);
      raw.on("notification", (method: string, args: unknown[]) => {
        if (method === "tutor" && args[0]) opts.onPayload(args[0] as TutorPayload);
      });
      raw.on("disconnect", () => { link.connected = false; opts.onDisconnect?.(); });
      await withTimeout(raw.lua(PUSH_LUA, [channel, { root, idle_ms: opts.idleMs ?? 30000, churn_edits: opts.churnEdits ?? 10 }]));
      return link;
    } catch {
      return null;
    }
  }

  private isInRoot(name: string): boolean {
    if (!name) return false;
    const prefix = this.root + "/";
    if (name.startsWith(prefix)) return true;
    try { return realpathSync(name).startsWith(prefix); } catch { return false; }
  }

  private async currentBufIfInRoot(): Promise<number | null> {
    const [buf, name] = (await this.raw.lua(EDITOR_WIN_LUA + `local b = vim.api.nvim_win_get_buf(__editor_win()); return { b, vim.api.nvim_buf_get_name(b) }`)) as [number, string];
    return this.isInRoot(name) ? buf : null;
  }

  async currentFile(): Promise<string | null> {
    const buf = await this.currentBufIfInRoot();
    if (buf === null) return null;
    return (await this.raw.call("nvim_buf_get_name", [buf])) as string;
  }

  async bufferText(): Promise<string | null> {
    const buf = await this.currentBufIfInRoot();
    if (buf === null) return null;
    const lines = (await this.raw.call("nvim_buf_get_lines", [buf, 0, -1, false])) as string[];
    return lines.join("\n");
  }

  async cursorLine(): Promise<number> {
    return (await this.raw.lua(EDITOR_WIN_LUA + `return vim.api.nvim_win_get_cursor(__editor_win())[1]`)) as number;
  }

  async diagnostics(): Promise<{ line: number; severity: number; msg: string }[]> {
    const buf = await this.currentBufIfInRoot();
    if (buf === null) return [];
    return (await this.raw.lua(
      `local out = {} for _, d in ipairs(vim.diagnostic.get(...)) do out[#out+1] = { line = d.lnum + 1, severity = d.severity, msg = d.message } end return out`,
      [buf],
    )) as { line: number; severity: number; msg: string }[];
  }

  /** One round trip: the editor buffer's path, filetype, cursor, lines (all or ±radius) and diagnostics. */
  async snapshot(mode: "full" | "window", radius = 20): Promise<EditorSnapshot | null> {
    const s = (await this.raw.lua(SNAPSHOT_LUA, [mode, radius, this.root])) as Partial<EditorSnapshot> & { path: string };
    if (!s.lines || !this.isInRoot(s.path)) return null;
    return s as EditorSnapshot;
  }

  async openLocation(path: string, line: number): Promise<void> {
    await this.raw.lua(`local p, l = ...; vim.cmd.edit(vim.fn.fnameescape(p)); vim.api.nvim_win_set_cursor(0, { l, 0 })`, [path, line]);
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    try { await this.raw.lua(`vim.g.tutor_chan = nil; if _G.__pi_tutor_timer then _G.__pi_tutor_timer:stop() end`); } catch { /* nvim may be gone */ }
    this.connected = false;
    this.raw.quit?.();
  }
}
