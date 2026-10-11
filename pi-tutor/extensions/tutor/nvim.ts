import { join } from "node:path";
import { tmpdir } from "node:os";
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
  private readonly root: string;

  private constructor(raw: NeovimClient, channel: number, root: string) {
    this.raw = raw; this.channel = channel; this.root = root;
  }

  static async connect(opts: NvimLinkOptions): Promise<NvimLink | null> {
    const socket = opts.socket ?? process.env.NVIM;
    if (!socket) return null;
    const { attach } = await import("neovim");
    const raw = attach({ socket });
    const [channel] = (await raw.request("nvim_get_api_info", [])) as [number, unknown];
    const link = new NvimLink(raw, channel, opts.root);
    raw.on("notification", (method: string, args: unknown[]) => {
      if (method === "tutor" && args[0]) opts.onPayload(args[0] as TutorPayload);
    });
    raw.on("disconnect", () => { link.connected = false; opts.onDisconnect?.(); });
    await raw.lua(PUSH_LUA, [channel, { root: opts.root, idle_ms: opts.idleMs ?? 30000, churn_edits: opts.churnEdits ?? 10 }]);
    return link;
  }

  private async currentBufIfInRoot(): Promise<number | null> {
    const [buf, name] = (await this.raw.lua(`local b = vim.api.nvim_get_current_buf(); return { b, vim.api.nvim_buf_get_name(b) }`)) as [number, string];
    return name && name.startsWith(this.root) ? buf : null;
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
    const [line] = (await this.raw.call("nvim_win_get_cursor", [0])) as [number, number];
    return line;
  }

  async diagnostics(): Promise<{ line: number; severity: number; msg: string }[]> {
    const buf = await this.currentBufIfInRoot();
    if (buf === null) return [];
    return (await this.raw.lua(
      `local out = {} for _, d in ipairs(vim.diagnostic.get(...)) do out[#out+1] = { line = d.lnum + 1, severity = d.severity, msg = d.message } end return out`,
      [buf],
    )) as { line: number; severity: number; msg: string }[];
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
