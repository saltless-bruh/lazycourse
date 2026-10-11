# nvim-tutor M1b: Pi TUI in a terminal split, extension as Neovim client

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `:Tutor` shows Pi's own TUI in a right split; the `pi-tutor` extension connects back to Neovim over `$NVIM`, receives diagnostics/idle/churn/run-output notifications, can pull buffer text on demand, and shows tutor state in a Pi widget. The M1 RPC panel is deleted.

**Architecture:** Neovim opens a `:terminal` running `pi`; Neovim exports `$NVIM` to it. Inside Pi, the extension uses the official `neovim` Node client to attach to that socket, installs autocmds (as a Lua string via `nvim_exec_lua`) that `vim.rpcnotify` back on the extension's channel, and renders state with `ctx.ui.setWidget`/`setStatus`. The Lua plugin is a terminal wrapper plus `:TutorRun`.

**Tech Stack:** Neovim 0.12, LazyVim, plenary (tests); Pi 1.x, TypeScript, `neovim` npm client 5.5, vitest with a real headless Neovim.

**Spec:** `docs/superpowers/specs/2026-10-07-nvim-tutor-design.md` (rev 3, sections 2, 3.4, 8, 9, 11)

## Global Constraints

- Pi `^1.0`, Node ≥ 22.19, unmodified upstream Pi.
- Pi runs interactively with `--tools read,grep,find,ls`; `bash` stays off.
- Only buffers whose path is inside the project root are pushed or pulled.
- No protocol of ours: Neovim → extension is `vim.rpcnotify(chan, "tutor", payload)`; extension → Neovim is Neovim API calls. Payload shapes are exactly those in spec §3.4.
- The `neovim` client must never write to Pi's terminal: set `NVIM_NODE_LOG_FILE` before importing it.
- Widget lines stay ≤ 44 display cells (the split is 45% of a typical 100+ column terminal).
- One module per responsibility: `term.lua`, `init.lua`; `nvim.ts`, `ui.ts`, `index.ts`.

## Review Focus

1. Pi started outside Neovim (no `$NVIM`): the extension must run detached, never throw, and the widget must say so (test in Task 4).
2. A buffer outside the project root must produce no notification and must not be readable through the pull helpers (test in Task 4).
3. Hiding the split with `:Tutor` must not kill the Pi job; showing it again must reuse the same job (test in Task 2).
4. `:TutorRun` while a run is pending must refuse with a message, not start a duplicate (test in Task 3).
5. Neovim exiting while Pi is attached must not crash Pi; the extension marks itself detached and the widget updates (test in Task 4).

---

### Task 1: Delete the RPC panel and the signal envelope

**Files:**
- Delete: `nvim-tutor/lua/tutor/rpc.lua`, `nvim-tutor/lua/tutor/panel.lua`, `nvim-tutor/tests/rpc_spec.lua`, `nvim-tutor/tests/panel_spec.lua`, `nvim-tutor/tests/init_spec.lua`, `nvim-tutor/tests/fixtures/fake_pi.js`
- Delete: `pi-tutor/extensions/tutor/signals.ts`, `pi-tutor/test/signals.test.ts`, `pi-tutor/test/contract.test.ts`, `pi-tutor/test/rpc-harness.ts`
- Modify: `pi-tutor/extensions/tutor/index.ts`, `pi-tutor/test/smoke.test.ts`, `pi-tutor/package.json`
- Create: `nvim-tutor/lua/tutor/init.lua` (temporary stub so the plugin still loads)

**Interfaces:**
- Produces: `pi-tutor/extensions/tutor/index.ts` default export registering `session_start` and `session_shutdown`; `npm test` runs vitest with no exclusions.

- [ ] **Step 1: Update the smoke test to the new registrations**

Replace `pi-tutor/test/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import extension from "../extensions/tutor/index.js";

describe("extension factory", () => {
  it("registers session_start and session_shutdown handlers and no input handler", () => {
    const events: string[] = [];
    const fakePi = {
      on: (name: string, _h: unknown) => { events.push(name); return () => {}; },
      registerCommand: () => {},
      appendEntry: () => {},
    };
    extension(fakePi as never);
    expect(events).toContain("session_start");
    expect(events).toContain("session_shutdown");
    expect(events).not.toContain("input");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd pi-tutor && npm test`
Expected: FAIL, `session_shutdown` missing and `input` present.

- [ ] **Step 3: Delete files and rewrite index.ts**

```bash
git rm -q nvim-tutor/lua/tutor/rpc.lua nvim-tutor/lua/tutor/panel.lua nvim-tutor/tests/rpc_spec.lua nvim-tutor/tests/panel_spec.lua nvim-tutor/tests/init_spec.lua nvim-tutor/tests/fixtures/fake_pi.js
git rm -q pi-tutor/extensions/tutor/signals.ts pi-tutor/test/signals.test.ts pi-tutor/test/contract.test.ts pi-tutor/test/rpc-harness.ts
```

`pi-tutor/extensions/tutor/index.ts`:
```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", () => {
    pi.appendEntry("tutor_status", { kind: "ready", package: "pi-tutor", version: "0.2.0" });
  });
  pi.on("session_shutdown", () => {});
}
```

`nvim-tutor/lua/tutor/init.lua` (stub, replaced in Task 3):
```lua
local M = {}
function M.setup() end
return M
```

In `pi-tutor/package.json` set `"version": "0.2.0"` and scripts to:
```json
"test": "vitest run",
"typecheck": "tsc --noEmit"
```
Remove the `test:contract` script.

- [ ] **Step 4: Run tests and typecheck**

Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: PASS 1 test; tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove RPC panel and signal envelope ahead of terminal pane"
```

---

### Task 2: `term.lua`, the terminal split wrapper

**Files:**
- Create: `nvim-tutor/lua/tutor/term.lua`
- Create: `nvim-tutor/tests/term_spec.lua`
- Keep: `nvim-tutor/tests/minimal_init.lua` (unchanged; nui no longer needed but harmless)

**Interfaces:**
- Produces `tutor.term`:
  - `term.new(opts: {cmd: string[], cwd: string, width: number}) -> Term`
  - `Term:show()` opens the right split (creating the job on first call), `Term:hide()`, `Term:toggle()`, `Term:is_visible() -> boolean`
  - `Term:is_running() -> boolean`, `Term:restart()`, `Term:send(text: string)` (appends `\r`), `Term:job_id() -> integer|nil`, `Term:bufnr() -> integer|nil`

- [ ] **Step 1: Write the failing tests**

`nvim-tutor/tests/term_spec.lua`:
```lua
local term = require("tutor.term")

local function new()
  -- `cat` echoes what we send; it stays alive until the job is killed.
  return term.new({ cmd = { "cat" }, cwd = vim.fn.getcwd(), width = 0.4 })
end

describe("tutor.term", function()
  it("starts the job on first show and keeps it across hide/show", function()
    local t = new()
    assert.is_false(t:is_visible())
    t:show()
    assert.is_true(t:is_visible())
    local job = t:job_id()
    assert.is_number(job)
    assert.is_true(t:is_running())
    t:hide()
    assert.is_false(t:is_visible())
    assert.is_true(t:is_running())
    t:show()
    assert.equals(job, t:job_id())
    t:hide()
  end)

  it("send writes text plus carriage return into the job", function()
    local t = new()
    t:show()
    t:send("hello")
    vim.wait(1000, function()
      local lines = vim.api.nvim_buf_get_lines(t:bufnr(), 0, -1, false)
      return vim.tbl_contains(lines, "hello")
    end)
    local lines = vim.api.nvim_buf_get_lines(t:bufnr(), 0, -1, false)
    assert.is_true(vim.tbl_contains(lines, "hello"))
    t:hide()
  end)

  it("restart replaces the job id", function()
    local t = new()
    t:show()
    local job = t:job_id()
    t:restart()
    vim.wait(500, function() return t:job_id() ~= job end)
    assert.is_not.equals(job, t:job_id())
    assert.is_true(t:is_running())
    t:hide()
  end)

  it("sizes the split to the requested fraction of columns", function()
    local t = new()
    t:show()
    local want = math.floor(vim.o.columns * 0.4)
    local got = vim.api.nvim_win_get_width(t.win)
    assert.is_true(math.abs(got - want) <= 1)
    t:hide()
  end)
end)
```

- [ ] **Step 2: Run to see them fail**

Run: `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`
Expected: error `module 'tutor.term' not found`.

- [ ] **Step 3: Implement term.lua**

```lua
local M = {}
local Term = {}
Term.__index = Term

---@param opts {cmd: string[], cwd: string, width: number}
function M.new(opts)
  return setmetatable({ opts = opts, buf = nil, win = nil, job = nil }, Term)
end

function Term:_spawn()
  self.buf = vim.api.nvim_create_buf(false, false)
  vim.bo[self.buf].bufhidden = "hide"
  vim.api.nvim_win_set_buf(self.win, self.buf)
  self.job = vim.fn.jobstart(self.opts.cmd, {
    term = true,
    cwd = self.opts.cwd,
    on_exit = function(_, code)
      self.job = nil
      vim.schedule(function()
        if self.buf and vim.api.nvim_buf_is_valid(self.buf) then
          vim.b[self.buf].tutor_exit_code = code
        end
      end)
    end,
  })
  vim.b[self.buf].tutor_term = true
  vim.keymap.set("t", "<Esc><Esc>", [[<C-\><C-n>]], { buffer = self.buf })
end

function Term:show()
  if self:is_visible() then return end
  vim.cmd("botright vsplit")
  self.win = vim.api.nvim_get_current_win()
  vim.api.nvim_win_set_width(self.win, math.floor(vim.o.columns * self.opts.width))
  vim.wo[self.win].number = false
  vim.wo[self.win].relativenumber = false
  vim.wo[self.win].signcolumn = "no"
  vim.wo[self.win].winfixwidth = true
  if self.buf and vim.api.nvim_buf_is_valid(self.buf) then
    vim.api.nvim_win_set_buf(self.win, self.buf)
  else
    self:_spawn()
  end
  if self:is_running() then vim.cmd("startinsert") end
end

function Term:hide()
  if self.win and vim.api.nvim_win_is_valid(self.win) then
    vim.api.nvim_win_close(self.win, true)
  end
  self.win = nil
end

function Term:toggle()
  if self:is_visible() then self:hide() else self:show() end
end

function Term:is_visible()
  return self.win ~= nil and vim.api.nvim_win_is_valid(self.win)
end

function Term:is_running() return self.job ~= nil end
function Term:job_id() return self.job end
function Term:bufnr() return self.buf end

function Term:send(text)
  if not self:is_running() then return false end
  vim.api.nvim_chan_send(self.job, text .. "\r")
  return true
end

function Term:restart()
  if self.job then
    vim.fn.jobstop(self.job)
    self.job = nil
  end
  local old = self.buf
  if not self:is_visible() then self:show() end
  self:_spawn()
  if old and vim.api.nvim_buf_is_valid(old) then
    vim.api.nvim_buf_delete(old, { force = true })
  end
end

return M
```

- [ ] **Step 4: Run tests**

Run: `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`
Expected: `Success: 4 Failed: 0`. If `startinsert` errors headless, wrap it in `pcall`.

- [ ] **Step 5: Commit**

```bash
git add nvim-tutor
git commit -m "feat(nvim-tutor): terminal split wrapper"
```

---

### Task 3: `init.lua`: commands, `:TutorRun`, wrappers

**Files:**
- Modify: `nvim-tutor/lua/tutor/init.lua`
- Create: `nvim-tutor/tests/init_spec.lua`
- Modify: `~/.config/nvim/lua/plugins/tutor.lua` (outside repo; content below) and the README snippet

**Interfaces:**
- Consumes: `tutor.term` from Task 2.
- Produces: `require("tutor").setup(opts)` with `opts.pi_cmd` (default `{"pi"}`), `opts.cwd` (default `vim.fn.getcwd()`), `opts.width` (0.45), `opts.run_cmd` (string[] or nil), `opts.check_version` (true).
- Produces commands `:Tutor`, `:TutorRestart`, `:TutorRun`, `:TutorStart`, `:TutorLevel N`, `:TutorLearn`.
- Produces `M.state = { term, run_job }` and `M.notify_tutor(payload) -> boolean` which calls `vim.rpcnotify(vim.g.tutor_chan, "tutor", payload)` when `vim.g.tutor_chan` is set (the extension sets it in Task 4).

- [ ] **Step 1: Write the failing tests**

`nvim-tutor/tests/init_spec.lua`:
```lua
describe("tutor.init", function()
  before_each(function()
    package.loaded["tutor"] = nil
    vim.g.tutor_chan = nil
    require("tutor").setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false,
      run_cmd = { "sh", "-c", "echo out; echo err 1>&2; exit 3" } })
  end)

  it(":Tutor toggles the split and keeps the job", function()
    local t = require("tutor").state.term
    vim.cmd("Tutor"); assert.is_true(t:is_visible())
    local job = t:job_id()
    vim.cmd("Tutor"); assert.is_false(t:is_visible())
    assert.equals(job, t:job_id())
  end)

  it("wrappers type slash commands into the terminal", function()
    local tutor = require("tutor")
    vim.cmd("Tutor")
    vim.cmd("TutorLevel 40")
    local buf = tutor.state.term:bufnr()
    vim.wait(1000, function()
      return vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-level 40")
    end)
    assert.is_true(vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-level 40"))
    vim.cmd("Tutor")
  end)

  it(":TutorRun notifies the extension channel with output and exit code", function()
    local tutor = require("tutor")
    local got
    -- Fake the extension channel with a Lua-side channel that records the notification.
    vim.g.tutor_chan = vim.api.nvim_create_namespace("unused") -- replaced below
    tutor._notify_override = function(p) got = p end
    vim.cmd("TutorRun")
    vim.wait(2000, function() return got ~= nil end)
    assert.equals("run_output", got.kind)
    assert.equals(3, got.code)
    assert.equals("out\n", got.stdout)
    assert.equals("err\n", got.stderr)
  end)

  it(":TutorRun refuses a second run while one is pending", function()
    local tutor = require("tutor")
    tutor._notify_override = function() end
    tutor.state.run_job = 12345 -- pretend a run is pending
    local msgs = {}
    local orig = vim.notify
    vim.notify = function(m) table.insert(msgs, m) end
    vim.cmd("TutorRun")
    vim.notify = orig
    assert.is_true(#msgs == 1 and msgs[1]:find("already running") ~= nil)
    tutor.state.run_job = nil
  end)

  it("notify_tutor returns false when no extension is connected", function()
    vim.g.tutor_chan = nil
    assert.is_false(require("tutor").notify_tutor({ kind = "idle" }))
  end)
end)
```

- [ ] **Step 2: Run to see them fail**

Run: `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`
Expected: `init_spec` fails: `state` is nil / commands missing.

- [ ] **Step 3: Implement init.lua**

```lua
local term = require("tutor.term")

local M = {}
M.state = { term = nil, run_job = nil }
M._notify_override = nil
local opts = {}

---@param pi_cmd string[]
function M.build_cmd(pi_cmd)
  local cmd = vim.deepcopy(pi_cmd)
  if vim.fs.basename(cmd[1]) == "pi" then
    vim.list_extend(cmd, { "--tools", "read,grep,find,ls" })
  end
  return cmd
end

local function check_version()
  if opts.check_version == false then return end
  local ok, out = pcall(vim.fn.system, { opts.pi_cmd[1], "--version" })
  local v = ok and vim.trim(out) or ""
  if not v:match("^1%.") then
    vim.notify(("[tutor] pi %s found, expected 1.x"):format(v == "" and "not found" or v), vim.log.levels.WARN)
  end
end

--- Send a payload to the pi-tutor extension if it is connected.
---@param payload table
---@return boolean sent
function M.notify_tutor(payload)
  if M._notify_override then M._notify_override(payload); return true end
  local chan = vim.g.tutor_chan
  if not chan then return false end
  local ok = pcall(vim.rpcnotify, chan, "tutor", payload)
  if not ok then vim.g.tutor_chan = nil end
  return ok
end

function M.run()
  if M.state.run_job then
    vim.notify("[tutor] a run is already running", vim.log.levels.WARN)
    return
  end
  local cmd = opts.run_cmd
  if not cmd then
    vim.notify("[tutor] no run_cmd configured", vim.log.levels.WARN)
    return
  end
  local out, err = {}, {}
  M.state.run_job = vim.fn.jobstart(cmd, {
    cwd = opts.cwd,
    stdout_buffered = true, stderr_buffered = true,
    on_stdout = function(_, d) out = d end,
    on_stderr = function(_, d) err = d end,
    on_exit = function(_, code)
      M.state.run_job = nil
      local payload = { kind = "run_output", cmd = cmd, code = code,
        stdout = table.concat(out, "\n"), stderr = table.concat(err, "\n") }
      if not M.notify_tutor(payload) then
        vim.notify("[tutor] run finished (exit " .. code .. ") but pi-tutor is not connected", vim.log.levels.INFO)
      end
    end,
  })
end

local function slash(text)
  return function(a)
    local t = M.state.term
    if not t:is_visible() then t:show() end
    local line = text .. (a and a.args ~= "" and (" " .. a.args) or "")
    if not t:send(line) then vim.notify("[tutor] pi is not running; :TutorRestart", vim.log.levels.WARN) end
  end
end

function M.setup(user_opts)
  opts = vim.tbl_deep_extend("force", {
    pi_cmd = { "pi" }, cwd = vim.fn.getcwd(), width = 0.45, run_cmd = nil, check_version = true,
  }, user_opts or {})
  check_version()
  M.state.term = term.new({ cmd = M.build_cmd(opts.pi_cmd), cwd = opts.cwd, width = opts.width })
  M.state.run_job = nil
  local cmd = vim.api.nvim_create_user_command
  cmd("Tutor", function() M.state.term:toggle() end, {})
  cmd("TutorRestart", function() M.state.term:restart() end, {})
  cmd("TutorRun", M.run, {})
  cmd("TutorStart", slash("/tutor-start"), {})
  cmd("TutorLevel", slash("/tutor-level"), { nargs = "?" })
  cmd("TutorLearn", slash("/tutor-learn"), {})
end

return M
```

- [ ] **Step 4: Run tests**

Run: `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`
Expected: `term_spec 4/4`, `init_spec 5/5`. Note: `jobstart` with `stdout_buffered` delivers `{"out", ""}`; the trailing empty string makes `table.concat` yield `"out\n"`, which the test expects.

- [ ] **Step 5: Update the LazyVim spec and README snippet**

`~/.config/nvim/lua/plugins/tutor.lua` and the README block:
```lua
return {
  {
    dir = vim.fn.expand("~/Documents/personal_Project/AI-Driven_Teaching_Coding_Project/nvim-tutor"),
    name = "nvim-tutor",
    cmd = { "Tutor", "TutorRestart", "TutorRun", "TutorStart", "TutorLevel", "TutorLearn" },
    keys = {
      { "<leader>tt", "<cmd>Tutor<cr>", desc = "Toggle tutor (pi)" },
      { "<leader>tr", "<cmd>TutorRun<cr>", desc = "Run project and tell tutor" },
    },
    init = function()
      local ok, wk = pcall(require, "which-key")
      if ok then wk.add({ { "<leader>t", group = "tutor" } }) end
    end,
    opts = {},
    config = function(_, o) require("tutor").setup(o) end,
  },
}
```
In README, replace the old plugin block with this one (with `dir = "<repo>/nvim-tutor"`).

- [ ] **Step 6: Commit**

```bash
git add nvim-tutor README.md
git commit -m "feat(nvim-tutor): commands, :TutorRun, slash wrappers over the terminal pane"
```

---

### Task 4: `nvim.ts`, the extension's Neovim client

**Files:**
- Create: `pi-tutor/extensions/tutor/nvim.ts`
- Create: `pi-tutor/extensions/tutor/push.lua.ts` (the Lua installer as a TS string export)
- Create: `pi-tutor/test/nvim.test.ts`, `pi-tutor/test/nvim-harness.ts`
- Modify: `pi-tutor/package.json` (add dependency `neovim`)

**Interfaces:**
- Produces:
  ```ts
  export type TutorPayload =
    | { kind: "diagnostics"; buf: number; path: string; errors: number; warnings: number; first?: { line: number; msg: string } }
    | { kind: "idle"; buf: number; path: string; line: number; since_ms: number }
    | { kind: "churn"; buf: number; path: string; region: [number, number]; edits: number }
    | { kind: "run_output"; cmd: string[]; code: number; stdout: string; stderr: string };
  export interface NvimLinkOptions { socket?: string; root: string; idleMs?: number; churnEdits?: number; onPayload: (p: TutorPayload) => void; onDisconnect?: () => void }
  export class NvimLink {
    static connect(opts: NvimLinkOptions): Promise<NvimLink | null>;  // null when no socket
    readonly channel: number;
    currentFile(): Promise<string | null>;        // null if outside root
    bufferText(): Promise<string | null>;
    cursorLine(): Promise<number>;
    diagnostics(): Promise<{ line: number; severity: number; msg: string }[]>;
    openLocation(path: string, line: number): Promise<void>;
    close(): Promise<void>;
  }
  ```
- `vim.g.tutor_chan` is set to `channel` on connect and cleared on close.

- [ ] **Step 1: Add the dependency**

Run: `cd pi-tutor && npm install neovim@^5.5.0`
Expected: `package.json` gains `"dependencies": { "neovim": "^5.5.0" }`.

- [ ] **Step 2: Write the harness and failing tests**

`pi-tutor/test/nvim-harness.ts`:
```ts
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Headless { proc: ChildProcess; socket: string; root: string; kill(): void }

export async function startHeadlessNvim(): Promise<Headless> {
  const root = mkdtempSync(join(tmpdir(), "pitutor-nvim-"));
  const socket = join(root, "nvim.sock");
  const proc = spawn("nvim", ["--headless", "--clean", "--listen", socket], { cwd: root, stdio: "ignore" });
  const t0 = Date.now();
  while (!existsSync(socket)) {
    if (Date.now() - t0 > 10000) throw new Error("nvim socket did not appear");
    await new Promise((r) => setTimeout(r, 50));
  }
  return { proc, socket, root, kill: () => proc.kill() };
}
```

`pi-tutor/test/nvim.test.ts`:
```ts
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
```

- [ ] **Step 3: Run to see them fail**

Run: `cd pi-tutor && npm test`
Expected: FAIL, cannot resolve `../extensions/tutor/nvim.js`.

- [ ] **Step 4: Write the Lua installer string**

`pi-tutor/extensions/tutor/push.lua.ts`:
```ts
// Installed into Neovim with nvim_exec_lua(PUSH_LUA, [chan, { root, idle_ms, churn_edits }]).
// Everything here runs inside Neovim; keep it dependency-free.
export const PUSH_LUA = String.raw`
local chan, opts = ...
if _G.__pi_tutor_timer then pcall(function() _G.__pi_tutor_timer:stop(); _G.__pi_tutor_timer:close() end) end
local g = vim.api.nvim_create_augroup("PiTutorPush", { clear = true })
local function path_of(buf) return vim.api.nvim_buf_get_name(buf) end
local function in_root(buf)
  local p = path_of(buf)
  return p ~= "" and vim.startswith(p, opts.root)
end
local function notify(payload)
  local ok = pcall(vim.rpcnotify, chan, "tutor", payload)
  if not ok then vim.g.tutor_chan = nil end
end
vim.g.tutor_chan = chan

vim.api.nvim_create_autocmd("DiagnosticChanged", { group = g, callback = function(a)
  if not in_root(a.buf) then return end
  local errors, warnings, first = 0, 0, nil
  for _, d in ipairs(vim.diagnostic.get(a.buf, { severity = { min = vim.diagnostic.severity.WARN } })) do
    if d.severity == vim.diagnostic.severity.ERROR then
      errors = errors + 1
      if not first then first = { line = d.lnum + 1, msg = d.message } end
    else
      warnings = warnings + 1
    end
  end
  notify({ kind = "diagnostics", buf = a.buf, path = path_of(a.buf), errors = errors, warnings = warnings, first = first })
end })

local last_change = vim.uv.now()
local churn = {}
vim.api.nvim_create_autocmd({ "TextChanged", "TextChangedI" }, { group = g, callback = function(a)
  last_change = vim.uv.now()
  if not in_root(a.buf) then return end
  local line = vim.api.nvim_win_get_cursor(0)[1]
  local region = math.floor((line - 1) / 20)
  local key = a.buf .. ":" .. region
  churn[key] = (churn[key] or 0) + 1
  if churn[key] >= opts.churn_edits then
    churn[key] = 0
    notify({ kind = "churn", buf = a.buf, path = path_of(a.buf), region = { region * 20 + 1, region * 20 + 20 }, edits = opts.churn_edits })
  end
end })
vim.api.nvim_create_autocmd("DiagnosticChanged", { group = g, callback = function() churn = {} end })

local timer = vim.uv.new_timer()
_G.__pi_tutor_timer = timer
timer:start(opts.idle_ms, opts.idle_ms, vim.schedule_wrap(function()
  local buf = vim.api.nvim_get_current_buf()
  if not in_root(buf) then return end
  local since = vim.uv.now() - last_change
  if since >= opts.idle_ms then
    notify({ kind = "idle", buf = buf, path = path_of(buf), line = vim.api.nvim_win_get_cursor(0)[1], since_ms = since })
  end
end))
return chan
`;
```

- [ ] **Step 5: Implement nvim.ts**

```ts
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
    await this.raw.lua(`vim.cmd.edit(vim.fn.fnameescape(...)); vim.api.nvim_win_set_cursor(0, { select(2, ...), 0 })`, [path, line]);
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    try { await this.raw.lua(`vim.g.tutor_chan = nil; if _G.__pi_tutor_timer then _G.__pi_tutor_timer:stop() end`); } catch { /* nvim may be gone */ }
    this.connected = false;
    this.raw.quit?.();
  }
}
```

- [ ] **Step 6: Run tests**

Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: PASS 1 + 8 tests. If the `disconnect` event name differs in the client (check `node_modules/neovim/lib/api/client.js` for the emitted name on transport close), use that name; if none is emitted, detect disconnect by catching the rejection of a periodic `nvim_get_api_info` ping every 2 s and record the finding in `PI_SURFACE.md`. If `openLocation`'s `select(2, ...)` misbehaves, bind args first: `local p, l = ...`.

- [ ] **Step 7: Commit**

```bash
git add pi-tutor
git commit -m "feat(pi-tutor): Neovim client link with push autocmds and pull helpers"
```

---

### Task 5: Widget rendering, commands, and wiring in `index.ts`

**Files:**
- Create: `pi-tutor/extensions/tutor/ui.ts`
- Create: `pi-tutor/test/ui.test.ts`
- Modify: `pi-tutor/extensions/tutor/index.ts`
- Modify: `pi-tutor/test/smoke.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TutorState { language?: string; level?: number; rung?: number; task?: string; state: string; connected: boolean; last?: string }
  export function renderWidget(s: TutorState): string[];   // exactly 2 lines, each ≤ 44 cells
  export function renderStatus(s: TutorState): string;     // short footer text
  ```
- `index.ts` keeps a module-level `state: TutorState`, a `link: NvimLink | null`, and the `ctx.ui` from `session_start`; registers `/tutor-level <0-100>` (validated, updates state and widget) and `/tutor-status` (notifies the current state).

- [ ] **Step 1: Write the failing widget tests**

`pi-tutor/test/ui.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderWidget, renderStatus } from "../extensions/tutor/ui.js";

describe("renderWidget", () => {
  it("renders language, level, rung, task on line 1 and state on line 2", () => {
    const w = renderWidget({ language: "python", level: 30, rung: 2, task: "P1.T2.S1", state: "idle", connected: true });
    expect(w).toEqual(["tutor  python · lvl 30 · rung 2 · P1.T2.S1", "idle"]);
  });
  it("says detached when not connected to Neovim", () => {
    const w = renderWidget({ state: "idle", connected: false });
    expect(w[1]).toBe("detached: pi started outside Neovim");
  });
  it("keeps both lines within 44 cells", () => {
    const w = renderWidget({ language: "typescript", level: 100, rung: 5, task: "P12.T34.S56", state: "stuck: cannot borrow `x` as mutable more than once at a time", connected: true });
    for (const l of w) expect(l.length).toBeLessThanOrEqual(44);
    expect(w[1].endsWith("…")).toBe(true);
  });
  it("omits missing fields", () => {
    expect(renderWidget({ state: "idle", connected: true })[0]).toBe("tutor");
  });
});

describe("renderStatus", () => {
  it("is the level or 'tutor' when unknown", () => {
    expect(renderStatus({ level: 30, state: "idle", connected: true })).toBe("tutor lvl 30");
    expect(renderStatus({ state: "idle", connected: true })).toBe("tutor");
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd pi-tutor && npm test`
Expected: FAIL, cannot resolve `ui.js`.

- [ ] **Step 3: Implement ui.ts**

```ts
export interface TutorState {
  language?: string; level?: number; rung?: number; task?: string;
  state: string; connected: boolean; last?: string;
}

const MAX = 44;

function clip(s: string): string {
  const chars = Array.from(s);
  return chars.length <= MAX ? s : chars.slice(0, MAX - 1).join("") + "…";
}

export function renderWidget(s: TutorState): string[] {
  const parts: string[] = [];
  if (s.language) parts.push(s.language);
  if (s.level !== undefined) parts.push(`lvl ${s.level}`);
  if (s.rung !== undefined) parts.push(`rung ${s.rung}`);
  if (s.task) parts.push(s.task);
  const line1 = parts.length ? `tutor  ${parts.join(" · ")}` : "tutor";
  const line2 = s.connected ? s.state : "detached: pi started outside Neovim";
  return [clip(line1), clip(line2)];
}

export function renderStatus(s: TutorState): string {
  return s.level !== undefined ? `tutor lvl ${s.level}` : "tutor";
}
```

- [ ] **Step 4: Extend the smoke test for commands and wiring**

Replace `pi-tutor/test/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import extension from "../extensions/tutor/index.js";

function fakePi() {
  const events: Record<string, (...a: unknown[]) => unknown> = {};
  const commands: Record<string, { handler: (args: string, ctx: unknown) => Promise<void> }> = {};
  const pi = {
    on: (name: string, h: (...a: unknown[]) => unknown) => { events[name] = h; return () => {}; },
    registerCommand: (name: string, def: { handler: (args: string, ctx: unknown) => Promise<void> }) => { commands[name] = def; },
    appendEntry: () => {},
  };
  return { pi, events, commands };
}
function fakeCtx() {
  const widgets: Record<string, string[] | undefined> = {};
  const notes: string[] = [];
  return {
    ctx: { hasUI: true, cwd: "/tmp/proj", ui: {
      setWidget: (k: string, c: string[] | undefined) => { widgets[k] = c; },
      setStatus: () => {}, notify: (m: string) => notes.push(m),
    } },
    widgets, notes,
  };
}

describe("extension wiring", () => {
  it("registers lifecycle handlers and commands", () => {
    const { pi, events, commands } = fakePi();
    extension(pi as never);
    expect(Object.keys(events)).toEqual(expect.arrayContaining(["session_start", "session_shutdown"]));
    expect(Object.keys(commands)).toEqual(expect.arrayContaining(["tutor-level", "tutor-status"]));
  });

  it("/tutor-level validates its argument and updates the widget", async () => {
    const { pi, events, commands } = fakePi();
    extension(pi as never);
    const { ctx, widgets, notes } = fakeCtx();
    const saved = process.env.NVIM; delete process.env.NVIM;
    await events["session_start"]({ type: "session_start", reason: "startup" }, ctx);
    if (saved) process.env.NVIM = saved;
    expect(widgets["tutor"]?.[1]).toBe("detached: pi started outside Neovim");
    await commands["tutor-level"].handler("abc", ctx);
    expect(notes.at(-1)).toMatch(/0-100/);
    await commands["tutor-level"].handler("40", ctx);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 40");
  });
});
```

- [ ] **Step 5: Run to see the wiring test fail**

Run: `cd pi-tutor && npm test`
Expected: `ui.test.ts` passes; smoke fails: `tutor-level` not registered.

- [ ] **Step 6: Implement index.ts**

```ts
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { NvimLink, type TutorPayload } from "./nvim.js";
import { renderWidget, renderStatus, type TutorState } from "./ui.js";

type Ui = ExtensionContext["ui"];

export default function (pi: ExtensionAPI): void {
  const state: TutorState = { state: "idle", connected: false };
  let link: NvimLink | null = null;
  let ui: Ui | null = null;

  function paint() {
    if (!ui) return;
    ui.setWidget("tutor", renderWidget(state));
    ui.setStatus("tutor", renderStatus(state));
  }

  function onPayload(p: TutorPayload) {
    // M3 replaces this with the stuck detector; for now reflect the latest signal.
    switch (p.kind) {
      case "diagnostics":
        state.state = p.errors > 0 ? `error: ${p.first?.msg ?? ""}` : p.warnings > 0 ? `${p.warnings} warning(s)` : "clean";
        break;
      case "idle": state.state = `idle ${Math.round(p.since_ms / 1000)}s`; break;
      case "churn": state.state = `churning lines ${p.region[0]}-${p.region[1]}`; break;
      case "run_output": state.state = p.code === 0 ? "run passed" : `run failed (exit ${p.code})`; break;
    }
    pi.appendEntry("tutor_signal", p);
    paint();
  }

  pi.on("session_start", async (_event, ctx) => {
    ui = ctx.hasUI ? ctx.ui : null;
    if (!link) {
      link = await NvimLink.connect({
        root: ctx.cwd,
        onPayload,
        onDisconnect: () => { state.connected = false; link = null; paint(); },
      });
      state.connected = link !== null;
    }
    paint();
  });

  pi.on("session_shutdown", async () => {
    await link?.close();
    link = null;
    state.connected = false;
  });

  pi.registerCommand("tutor-level", {
    description: "Set the tutor level 0-100 (beginner → pro)",
    handler: async (args, ctx) => {
      const n = Number(args.trim());
      if (!Number.isInteger(n) || n < 0 || n > 100) {
        ctx.ui.notify("usage: /tutor-level <0-100>", "warning");
        return;
      }
      state.level = n;
      paint();
      ctx.ui.notify(`tutor level set to ${n}`, "info");
    },
  });

  pi.registerCommand("tutor-status", {
    description: "Show the tutor's current state",
    handler: async (_args, ctx) => {
      ctx.ui.notify(renderWidget(state).join(" | "), "info");
    },
  });
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: PASS 1 + 8 + 5 + 2 tests; tsc exit 0. If `ExtensionContext` lacks `cwd` or `hasUI` under those names, read `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` for the exact field names (`cwd` and `hasUI` exist in 1.0.4 `types.ts` lines 329-331) and adjust.

- [ ] **Step 8: Commit**

```bash
git add pi-tutor
git commit -m "feat(pi-tutor): tutor widget, /tutor-level, Neovim link wiring"
```

---

### Task 6: Surface doc, README, and live acceptance

**Files:**
- Modify: `pi-tutor/PI_SURFACE.md`, `README.md`

- [ ] **Step 1: Rewrite PI_SURFACE.md**

```markdown
# Pi and Neovim surface used by pi-tutor

Verified against `@earendil-works/pi-coding-agent` 1.0.4 source (2026-10-07), installed
binary 1.1.0 (2026-10-11), `neovim` npm client 5.5.0, Neovim 0.12.5.
Re-verify every line when bumping versions.

## Pi CLI
- `pi --tools read,grep,find,ls` run interactively inside a Neovim `:terminal` (cwd = project root)
- `pi install ./pi-tutor`, `pi list`, `pi remove`, `pi update --extensions`

## Pi extension API (src/core/extensions/types.ts)
- `export default function (pi: ExtensionAPI)`
- `pi.on("session_start", (event, ctx) => …)` with `ctx.cwd`, `ctx.hasUI`, `ctx.ui`
- `pi.on("session_shutdown", …)`
- `pi.registerCommand(name, { description, handler(args, ctx) })`
- `pi.appendEntry(customType, data)`
- `pi.sendUserMessage(text, { deliverAs })` (M3+)
- `ctx.ui.setWidget(key, string[] | undefined)`, `ctx.ui.setStatus(key, text)`,
  `ctx.ui.setWorkingMessage(text)`, `ctx.ui.notify(msg, level)`

## Neovim (via `neovim` npm client over `$NVIM`)
- `$NVIM` is set for `:terminal` children to `v:servername` (verified 0.12.5)
- `attach({ socket })`, `raw.request("nvim_get_api_info")` → `[channel, meta]`
- `raw.lua(code, args)`, `raw.call(fn, args)`, `raw.command(cmd)`, `raw.input(keys)`
- `raw.on("notification", (method, args))` receives `vim.rpcnotify(channel, "tutor", payload)`
- The client logs via winston and patches `console`; `NVIM_NODE_LOG_FILE` is set before import.
- Disconnect detection: <fill in from Task 4 step 6 finding>
```
Replace the last line with what Task 4 actually found before committing.

- [ ] **Step 2: Update README**

Replace the Status paragraph with: `Milestone 1b done: Pi's own TUI runs in a Neovim split; the extension watches the editor over Neovim's RPC.` Replace the Tests section commands with:
```
- `cd pi-tutor && npm test` (unit + a real headless Neovim for the link tests)
- `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`
```
Add to Setup step 2: `cd pi-tutor && npm install` before `pi install`.

- [ ] **Step 3: Live acceptance**

```bash
cd /tmp && rm -rf tutor-live && mkdir tutor-live && cd tutor-live && printf 'x = \n' > a.py && nvim a.py
```
In Neovim: `Space t t`. Expected: Pi's TUI appears in the right split with a two-line `tutor` widget above the prompt whose second line is `idle`, and Pi's footer shows `tutor`. Type `hi` + Enter; expected a streamed reply inside Pi. Type `/tutor-level 40`; expected the widget's first line becomes `tutor  lvl 40`. Press `<Esc><Esc>` then `<C-w>h`, fix the file so Python's LSP (or `:lua vim.diagnostic.set(...)`) reports an error, expected the widget's second line becomes `error: …` within a second. `:TutorRun` with no run_cmd: expected warning `no run_cmd configured`. Quit Neovim; expected no stray Pi process (`pgrep -f "pi --tools"` empty).

- [ ] **Step 4: Commit**

```bash
git add pi-tutor/PI_SURFACE.md README.md
git commit -m "docs: surface and README for the terminal pane"
```
