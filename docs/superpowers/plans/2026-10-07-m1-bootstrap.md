# nvim-tutor M1: Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typing in a Neovim side panel streams a reply from Pi, and an editor signal sent through the same channel is consumed by our Pi extension without starting a model run.

**Architecture:** Neovim spawns `pi --mode rpc` as a child process and talks JSONL over stdin/stdout. Our tutor logic is a Pi package (`pi-tutor/`) installed with `pi install ./pi-tutor`; in M1 it only handles the `input` event for `@@tutor-signal` envelopes and emits `tutor_status` entries. A thin Lua plugin (`nvim-tutor/`) owns the RPC client, the panel, and the process lifecycle.

**Tech Stack:** Neovim 0.12, LazyVim, nui.nvim, plenary.nvim (tests); Pi 1.0.x (`@earendil-works/pi-coding-agent`), Node 26, TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-nvim-tutor-design.md`

## Global Constraints

- Pi runtime pinned to `@earendil-works/pi-coding-agent` `^1.0`; Node ≥ 22.19.
- Pi is never modified; we depend only on the surface listed in `pi-tutor/PI_SURFACE.md`.
- Only two custom shapes cross the Neovim↔Pi boundary: `@@tutor-signal ` envelopes (Neovim → Pi via `prompt`) and `tutor_status` custom entries (Pi → Neovim via `entry_appended`).
- The tutor never edits user code: Pi is spawned with `--tools read,bash,grep,find,ls`.
- Only the current buffer's content leaves the editor, and only inside the active project directory (not exercised in M1; no signal carries buffer text yet).
- RPC framing is strict LF-delimited JSONL; never split on U+2028/U+2029.
- Lua files are focused: one module per responsibility (`rpc.lua`, `panel.lua`, `init.lua`).

## Review Focus

1. A JSON record split across two stdout chunks must be reassembled, not parsed as two broken lines (test in Task 5).
2. A stdout chunk containing several records must dispatch each record once (test in Task 5).
3. A `prompt` response with `disposition: "handled"` must not leave the panel in a "waiting" state (test in Task 6).
4. An envelope with invalid JSON after the prefix must be handled (ignored with a status entry), never passed to the model as a prompt (test in Task 3).
5. If the Pi process exits, the panel shows an error line and the next send respawns once instead of writing to a dead pipe (test in Task 7).

---

### Task 1: Upgrade Pi to 1.0.x and record the surface we depend on

**Files:**
- Create: `pi-tutor/PI_SURFACE.md`

**Interfaces:**
- Produces: a working `pi` binary at 1.0.x; `PI_SURFACE.md` listing every Pi API later tasks use.

- [ ] **Step 1: Check the current state**

Run: `pi --version; npm ls -g --depth=0 | grep pi-coding-agent`
Expected: `0.73.0` and `@mariozechner/pi-coding-agent@0.73.0`.

- [ ] **Step 2: Back up Pi settings and auth**

```bash
cp -r ~/.pi/agent ~/.pi/agent.bak-$(date +%Y%m%d)
```

- [ ] **Step 3: Replace the old package with the current one**

```bash
npm uninstall -g @mariozechner/pi-coding-agent
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@^1.0
```

- [ ] **Step 4: Verify**

Run: `pi --version && pi --help | grep -E 'mode|--tools|install'`
Expected: `1.0.x`, and help lists `--mode <mode>`, `--tools`, `pi install <source>`.

Run: `cat ~/.pi/agent/settings.json`
Expected: still contains `defaultProvider` and `defaultModel` from before.

- [ ] **Step 5: Write PI_SURFACE.md**

```markdown
# Pi surface used by pi-tutor

Verified against `@earendil-works/pi-coding-agent` 1.0.4 on 2026-10-07.
Re-verify every line when bumping the version range in package.json.

## CLI
- `pi --mode rpc` : JSONL commands on stdin, events on stdout (docs/rpc.md)
- `--tools read,bash,grep,find,ls` : allowlist of tool names
- `pi install ./pi-tutor`, `pi list`, `pi remove`, `pi update --extensions`

## RPC commands (docs/rpc-commands.md)
- `{"id","type":"prompt","message"}` → response `data.disposition` ∈ started|queued|handled
- `{"id","type":"abort"}`
- `{"id","type":"get_state"}`

## RPC events (docs/json.md)
- `message_update` with `assistantMessageEvent.type == "text_delta"`, field `delta`
- `agent_end`, `agent_settled`
- `entry_appended` with `entry.type == "custom"`, `entry.customType`, `entry.data`

## Extension API (src/core/extensions/types.ts)
- `export default function (pi: ExtensionAPI)` factory
- `pi.on("session_start", (event: {reason}) => void)`
- `pi.on("input", (event: {text, source}) => InputEventResult)`
  where `InputEventResult = {action:"continue"} | {action:"transform", text} | {action:"handled"}`
- `pi.appendEntry(customType: string, data?: unknown): void`

## Package layout (docs/packages.md)
- conventional dirs: `extensions/`, `skills/`, `prompts/`; a subdirectory
  with `index.ts` is one extension; TypeScript loads via jiti, no build.
```

- [ ] **Step 6: Commit**

```bash
git add pi-tutor/PI_SURFACE.md
git commit -m "chore: pin Pi 1.0 surface"
```

---

### Task 2: pi-tutor package skeleton with vitest

**Files:**
- Create: `pi-tutor/package.json`
- Create: `pi-tutor/tsconfig.json`
- Create: `pi-tutor/extensions/tutor/index.ts`
- Create: `pi-tutor/test/smoke.test.ts`

**Interfaces:**
- Produces: `pi-tutor/extensions/tutor/index.ts` exporting `default function (pi: ExtensionAPI)`; `npm test` runs vitest.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "pi-tutor",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions/tutor/index.ts"],
    "skills": ["./skills"],
    "prompts": ["./prompts/*.md"]
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "^1.0.0"
  },
  "devDependencies": {
    "@earendil-works/pi-coding-agent": "^1.0.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["extensions", "test"]
}
```

- [ ] **Step 3: Create empty resource dirs and the smoke test**

```bash
mkdir -p pi-tutor/skills pi-tutor/prompts pi-tutor/extensions/tutor pi-tutor/test
touch pi-tutor/skills/.gitkeep pi-tutor/prompts/.gitkeep
```

`pi-tutor/test/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import extension from "../extensions/tutor/index.js";

describe("extension factory", () => {
  it("registers an input handler and a session_start handler", () => {
    const events: string[] = [];
    const fakePi = {
      on: (name: string, _h: unknown) => { events.push(name); return () => {}; },
      appendEntry: () => {},
    };
    extension(fakePi as never);
    expect(events).toContain("input");
    expect(events).toContain("session_start");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd pi-tutor && npm install && npm test`
Expected: FAIL, cannot resolve `../extensions/tutor/index.js`.

- [ ] **Step 5: Write the minimal extension**

`pi-tutor/extensions/tutor/index.ts`:
```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", () => {
    pi.appendEntry("tutor_status", { kind: "ready", package: "pi-tutor", version: "0.1.0" });
  });
  pi.on("input", () => ({ action: "continue" as const }));
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: PASS, 1 test; tsc exits 0.

- [ ] **Step 7: Add .gitignore and commit**

```bash
printf 'node_modules/\n' > pi-tutor/.gitignore
git add pi-tutor
git commit -m "feat(pi-tutor): package skeleton with vitest"
```

---

### Task 3: Signal envelope parsing and the `input` handler

**Files:**
- Create: `pi-tutor/extensions/tutor/signals.ts`
- Modify: `pi-tutor/extensions/tutor/index.ts`
- Create: `pi-tutor/test/signals.test.ts`

**Interfaces:**
- Produces: `parseSignalEnvelope(text: string): ParseResult` where
  `ParseResult = {kind:"not_signal"} | {kind:"signal", signal: Signal} | {kind:"malformed", error: string}` and
  `Signal = { type: string; [k: string]: unknown }`.
- Produces: `SIGNAL_PREFIX = "@@tutor-signal "` (Lua side must send exactly this prefix).
- Produces: `handleInput(text, appendEntry): InputEventResult` used by the extension.

- [ ] **Step 1: Write the failing tests**

`pi-tutor/test/signals.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseSignalEnvelope, handleInput, SIGNAL_PREFIX } from "../extensions/tutor/signals.js";

describe("parseSignalEnvelope", () => {
  it("returns not_signal for ordinary chat", () => {
    expect(parseSignalEnvelope("how do I use a for loop")).toEqual({ kind: "not_signal" });
  });
  it("parses a valid envelope", () => {
    const r = parseSignalEnvelope(SIGNAL_PREFIX + '{"type":"ping","n":1}');
    expect(r).toEqual({ kind: "signal", signal: { type: "ping", n: 1 } });
  });
  it("rejects an envelope with no type field", () => {
    const r = parseSignalEnvelope(SIGNAL_PREFIX + '{"n":1}');
    expect(r.kind).toBe("malformed");
  });
  it("rejects invalid JSON", () => {
    const r = parseSignalEnvelope(SIGNAL_PREFIX + "{not json");
    expect(r.kind).toBe("malformed");
  });
  it("does not treat a prefix in the middle of text as a signal", () => {
    expect(parseSignalEnvelope("hello " + SIGNAL_PREFIX + "{}")).toEqual({ kind: "not_signal" });
  });
});

describe("handleInput", () => {
  it("continues for ordinary chat without appending entries", () => {
    const entries: unknown[] = [];
    const r = handleInput("hello", (t, d) => entries.push([t, d]));
    expect(r).toEqual({ action: "continue" });
    expect(entries).toEqual([]);
  });
  it("marks a valid signal handled and records it", () => {
    const entries: [string, unknown][] = [];
    const r = handleInput(SIGNAL_PREFIX + '{"type":"ping"}', (t, d) => entries.push([t, d]));
    expect(r).toEqual({ action: "handled" });
    expect(entries).toEqual([["tutor_status", { kind: "signal_received", signal: { type: "ping" } }]]);
  });
  it("marks a malformed envelope handled and records the error, never continuing", () => {
    const entries: [string, unknown][] = [];
    const r = handleInput(SIGNAL_PREFIX + "{bad", (t, d) => entries.push([t, d]));
    expect(r).toEqual({ action: "handled" });
    expect(entries[0][0]).toBe("tutor_status");
    expect((entries[0][1] as { kind: string }).kind).toBe("signal_malformed");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pi-tutor && npm test`
Expected: FAIL, cannot resolve `signals.js`.

- [ ] **Step 3: Implement signals.ts**

```ts
export const SIGNAL_PREFIX = "@@tutor-signal ";

export type Signal = { type: string; [k: string]: unknown };

export type ParseResult =
  | { kind: "not_signal" }
  | { kind: "signal"; signal: Signal }
  | { kind: "malformed"; error: string };

export type InputEventResult =
  | { action: "continue" }
  | { action: "transform"; text: string }
  | { action: "handled" };

export type AppendEntry = (customType: string, data?: unknown) => void;

export function parseSignalEnvelope(text: string): ParseResult {
  if (!text.startsWith(SIGNAL_PREFIX)) return { kind: "not_signal" };
  const body = text.slice(SIGNAL_PREFIX.length);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    return { kind: "malformed", error: `invalid JSON: ${(e as Error).message}` };
  }
  if (typeof parsed !== "object" || parsed === null || typeof (parsed as Signal).type !== "string") {
    return { kind: "malformed", error: "envelope must be an object with a string `type`" };
  }
  return { kind: "signal", signal: parsed as Signal };
}

export function handleInput(text: string, appendEntry: AppendEntry): InputEventResult {
  const r = parseSignalEnvelope(text);
  switch (r.kind) {
    case "not_signal":
      return { action: "continue" };
    case "signal":
      appendEntry("tutor_status", { kind: "signal_received", signal: r.signal });
      return { action: "handled" };
    case "malformed":
      appendEntry("tutor_status", { kind: "signal_malformed", error: r.error });
      return { action: "handled" };
  }
}
```

- [ ] **Step 4: Wire it into the extension**

Replace `pi-tutor/extensions/tutor/index.ts`:
```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { handleInput } from "./signals.js";

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", () => {
    pi.appendEntry("tutor_status", { kind: "ready", package: "pi-tutor", version: "0.1.0" });
  });
  pi.on("input", (event) => handleInput(event.text, (t, d) => pi.appendEntry(t, d)));
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: PASS, 9 tests; tsc exits 0. If tsc complains that the `input` handler's return type does not match Pi's `InputEventResult`, import that type from `@earendil-works/pi-coding-agent` instead of the local alias and delete the local alias.

- [ ] **Step 6: Commit**

```bash
git add pi-tutor
git commit -m "feat(pi-tutor): consume @@tutor-signal envelopes via input event"
```

---

### Task 4: Install the package into Pi and write the RPC contract test

**Files:**
- Create: `pi-tutor/test/contract.test.ts`
- Create: `pi-tutor/test/rpc-harness.ts`

**Interfaces:**
- Produces: `spawnPi(cwd): PiHandle` with `send(record)`, `waitFor(pred, timeoutMs)`, `close()` used only by tests.
- Verifies the two boundary shapes end to end with the real `pi` binary and no model call.

- [ ] **Step 1: Install the package into Pi**

```bash
cd pi-tutor && pi install "$(pwd)" && pi list
```
Expected: `pi list` shows the absolute path of `pi-tutor`.

- [ ] **Step 2: Write the harness**

`pi-tutor/test/rpc-harness.ts`:
```ts
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export type Record = { [k: string]: unknown; type: string };

export interface PiHandle {
  send(record: Record): void;
  waitFor(pred: (r: Record) => boolean, timeoutMs?: number): Promise<Record>;
  received: Record[];
  close(): void;
}

export function spawnPi(cwd: string, extraArgs: string[] = []): PiHandle {
  const proc: ChildProcessWithoutNullStreams = spawn(
    "pi",
    ["--mode", "rpc", "--no-session", "--tools", "read,bash,grep,find,ls", ...extraArgs],
    { cwd, stdio: ["pipe", "pipe", "pipe"] },
  );
  const received: Record[] = [];
  const waiters: { pred: (r: Record) => boolean; resolve: (r: Record) => void }[] = [];
  let buf = "";
  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      if (!line) continue;
      const rec = JSON.parse(line) as Record;
      received.push(rec);
      for (let w = waiters.length - 1; w >= 0; w--) {
        if (waiters[w].pred(rec)) waiters.splice(w, 1)[0].resolve(rec);
      }
    }
  });
  return {
    received,
    send(record) { proc.stdin.write(JSON.stringify(record) + "\n"); },
    waitFor(pred, timeoutMs = 15000) {
      const hit = received.find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout waiting for record")), timeoutMs);
        waiters.push({ pred, resolve: (r) => { clearTimeout(t); resolve(r); } });
      });
    },
    close() { proc.kill(); },
  };
}
```

- [ ] **Step 3: Write the failing contract test**

`pi-tutor/test/contract.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnPi, type PiHandle } from "./rpc-harness.js";
import { SIGNAL_PREFIX } from "../extensions/tutor/signals.js";

let pi: PiHandle | undefined;
afterEach(() => pi?.close());

describe("pi-tutor RPC contract", () => {
  it("emits a ready tutor_status on session start", async () => {
    pi = spawnPi(mkdtempSync(join(tmpdir(), "pitutor-")));
    const e = await pi.waitFor((r) => r.type === "entry_appended"
      && (r.entry as { customType?: string }).customType === "tutor_status");
    expect((e.entry as { data: { kind: string } }).data.kind).toBe("ready");
  });

  it("handles a signal envelope without starting a run", async () => {
    pi = spawnPi(mkdtempSync(join(tmpdir(), "pitutor-")));
    await pi.waitFor((r) => r.type === "entry_appended");
    pi.send({ id: "s1", type: "prompt", message: SIGNAL_PREFIX + '{"type":"ping"}' });
    const resp = await pi.waitFor((r) => r.type === "response" && r.id === "s1");
    expect(resp.success).toBe(true);
    expect((resp.data as { disposition: string }).disposition).toBe("handled");
    const e = await pi.waitFor((r) => r.type === "entry_appended"
      && (r.entry as { data?: { kind?: string } }).data?.kind === "signal_received");
    expect((e.entry as { data: { signal: { type: string } } }).data.signal.type).toBe("ping");
    expect(pi.received.some((r) => r.type === "agent_start")).toBe(false);
  });
});
```

- [ ] **Step 4: Run and observe**

Run: `cd pi-tutor && npx vitest run test/contract.test.ts`
Expected: PASS if Pi emits `entry_appended` under `--no-session`. If the first test times out with no `entry_appended` at all, remove `"--no-session"` from `spawnPi` and add `"--session-dir", cwd` so sessions are written into the temp dir, then rerun. Record whichever worked in `PI_SURFACE.md` under RPC (one line: "entry_appended requires sessions: yes/no").

- [ ] **Step 5: Exclude the contract test from the default `npm test`**

In `pi-tutor/package.json` scripts, set:
```json
"test": "vitest run --exclude test/contract.test.ts",
"test:contract": "vitest run test/contract.test.ts"
```
Run: `npm test && npm run test:contract`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add pi-tutor
git commit -m "test(pi-tutor): RPC contract test against real pi binary"
```

---

### Task 5: LazyVim bootstrap and the Lua RPC client

**Files:**
- Create: `nvim-tutor/lua/tutor/rpc.lua`
- Create: `nvim-tutor/tests/minimal_init.lua`
- Create: `nvim-tutor/tests/fixtures/fake_pi.js`
- Create: `nvim-tutor/tests/rpc_spec.lua`
- Create: `~/.config/nvim/lua/plugins/tutor.lua` (outside repo; content shown)

**Interfaces:**
- Produces `tutor.rpc`:
  - `rpc.split_records(buf: string) -> records: string[], rest: string` (pure)
  - `rpc.new(opts: {cmd: string[], cwd: string, on_event: fun(ev: table), on_exit: fun(code: integer)}) -> Client`
  - `Client:request(record: table, cb: fun(resp: table))` assigns `id`, correlates the response
  - `Client:is_alive() -> boolean`
  - `Client:close()`

- [ ] **Step 1: Bootstrap LazyVim (one-time, outside the repo)**

```bash
mv ~/.config/nvim ~/.config/nvim.bak-$(date +%Y%m%d)
mv ~/.local/share/nvim ~/.local/share/nvim.bak-$(date +%Y%m%d) 2>/dev/null || true
git clone https://github.com/LazyVim/starter ~/.config/nvim
rm -rf ~/.config/nvim/.git
```
Then write `~/.config/nvim/lua/plugins/tutor.lua`:
```lua
return {
  {
    dir = vim.fn.expand("~/Documents/personal_Project/AI-Driven_Teaching_Coding_Project/nvim-tutor"),
    name = "nvim-tutor",
    dependencies = { "MunifTanjim/nui.nvim", "nvim-lua/plenary.nvim" },
    cmd = { "Tutor" },
    keys = { { "<leader>tt", "<cmd>Tutor<cr>", desc = "Toggle tutor panel" } },
    opts = {},
    config = function(_, opts) require("tutor").setup(opts) end,
  },
}
```
Run: `nvim --headless "+Lazy! sync" +qa`
Expected: exits 0; `ls ~/.local/share/nvim/lazy` lists `nui.nvim` and `plenary.nvim`.

- [ ] **Step 2: Write the test bootstrap and fake Pi**

`nvim-tutor/tests/minimal_init.lua`:
```lua
local lazy = vim.fn.stdpath("data") .. "/lazy"
vim.opt.rtp:prepend(lazy .. "/plenary.nvim")
vim.opt.rtp:prepend(lazy .. "/nui.nvim")
vim.opt.rtp:prepend(vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":p:h:h"))
```

`nvim-tutor/tests/fixtures/fake_pi.js` (a stand-in process that speaks Pi's JSONL shapes; test infrastructure only):
```js
// Echoes Pi-like records. Splits one reply across two writes to test reassembly.
process.stdin.setEncoding("utf8");
let buf = "";
process.stdout.write(JSON.stringify({ type: "entry_appended", entry: { type: "custom", customType: "tutor_status", data: { kind: "ready" } } }) + "\n");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line) continue;
    const cmd = JSON.parse(line);
    if (cmd.type === "prompt" && cmd.message.startsWith("@@tutor-signal ")) {
      process.stdout.write(JSON.stringify({ id: cmd.id, type: "response", command: "prompt", success: true, data: { disposition: "handled" } }) + "\n");
    } else if (cmd.type === "prompt") {
      const resp = JSON.stringify({ id: cmd.id, type: "response", command: "prompt", success: true, data: { disposition: "started" } }) + "\n";
      const d1 = JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hel" } }) + "\n";
      const d2 = JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "lo !" } }) + "\n";
      const end = JSON.stringify({ type: "agent_settled" }) + "\n";
      const all = resp + d1 + d2 + end;
      const cut = Math.floor(all.length / 2);
      process.stdout.write(all.slice(0, cut));
      setTimeout(() => process.stdout.write(all.slice(cut)), 20);
    } else if (cmd.type === "exit") {
      process.exit(3);
    } else {
      process.stdout.write(JSON.stringify({ id: cmd.id, type: "response", command: cmd.type, success: true, data: {} }) + "\n");
    }
  }
});
```

- [ ] **Step 3: Write the failing tests**

`nvim-tutor/tests/rpc_spec.lua`:
```lua
local rpc = require("tutor.rpc")
local fixture = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":p:h") .. "/fixtures/fake_pi.js"

describe("rpc.split_records", function()
  it("returns complete lines and keeps the remainder", function()
    local recs, rest = rpc.split_records('{"a":1}\n{"b":2}\n{"c"')
    assert.same({ '{"a":1}', '{"b":2}' }, recs)
    assert.equals('{"c"', rest)
  end)
  it("strips a trailing CR and skips empty lines", function()
    local recs, rest = rpc.split_records('{"a":1}\r\n\n')
    assert.same({ '{"a":1}' }, recs)
    assert.equals("", rest)
  end)
  it("does not split on U+2028 inside a string", function()
    local recs = rpc.split_records('{"s":"a\226\128\168b"}\n')
    assert.equals(1, #recs)
    assert.equals("a\226\128\168b", vim.json.decode(recs[1]).s)
  end)
end)

describe("rpc client against fake pi", function()
  local function start(on_exit)
    local events = {}
    local client = rpc.new({
      cmd = { "node", fixture },
      cwd = vim.fn.getcwd(),
      on_event = function(ev) table.insert(events, ev) end,
      on_exit = on_exit or function() end,
    })
    return client, events
  end

  it("correlates a response and dispatches split/merged events", function()
    local client, events = start()
    local resp
    client:request({ type = "prompt", message = "hi" }, function(r) resp = r end)
    vim.wait(2000, function() return resp ~= nil and #events >= 4 end)
    assert.equals("started", resp.data.disposition)
    local deltas = {}
    for _, ev in ipairs(events) do
      if ev.type == "message_update" then table.insert(deltas, ev.assistantMessageEvent.delta) end
    end
    assert.same({ "Hel", "lo\226\128\168!" }, deltas)
    assert.equals("agent_settled", events[#events].type)
    client:close()
  end)

  it("reports handled dispositions", function()
    local client = start()
    local resp
    client:request({ type = "prompt", message = '@@tutor-signal {"type":"ping"}' }, function(r) resp = r end)
    vim.wait(2000, function() return resp ~= nil end)
    assert.equals("handled", resp.data.disposition)
    client:close()
  end)

  it("calls on_exit with the exit code and reports not alive", function()
    local code
    local client = start(function(c) code = c end)
    client:request({ type = "exit" }, function() end)
    vim.wait(2000, function() return code ~= nil end)
    assert.equals(3, code)
    assert.is_false(client:is_alive())
  end)
end)
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`
Expected: FAIL, module `tutor.rpc` not found.

- [ ] **Step 5: Implement rpc.lua**

```lua
local M = {}

--- Split a buffer into complete LF-terminated records and the unread rest.
---@param buf string
---@return string[] records, string rest
function M.split_records(buf)
  local records = {}
  local start = 1
  while true do
    local nl = buf:find("\n", start, true)
    if not nl then break end
    local line = buf:sub(start, nl - 1)
    if line:sub(-1) == "\r" then line = line:sub(1, -2) end
    if line ~= "" then table.insert(records, line) end
    start = nl + 1
  end
  return records, buf:sub(start)
end

local Client = {}
Client.__index = Client

---@class TutorRpcOpts
---@field cmd string[]
---@field cwd string
---@field on_event fun(ev: table)
---@field on_exit fun(code: integer)

---@param opts TutorRpcOpts
function M.new(opts)
  local self = setmetatable({
    next_id = 0,
    pending = {},
    rest = "",
    alive = false,
    on_event = opts.on_event,
  }, Client)
  self.proc = vim.system(opts.cmd, {
    cwd = opts.cwd,
    stdin = true,
    stdout = function(err, data)
      if err or not data then return end
      vim.schedule(function() self:_feed(data) end)
    end,
    stderr = function(_, data)
      if data then vim.schedule(function() vim.notify("[tutor/pi] " .. data, vim.log.levels.DEBUG) end) end
    end,
  }, function(result)
    self.alive = false
    vim.schedule(function() opts.on_exit(result.code) end)
  end)
  self.alive = true
  return self
end

function Client:_feed(data)
  local records, rest = M.split_records(self.rest .. data)
  self.rest = rest
  for _, line in ipairs(records) do
    local ok, rec = pcall(vim.json.decode, line)
    if ok and type(rec) == "table" then
      if rec.type == "response" and rec.id and self.pending[rec.id] then
        local cb = self.pending[rec.id]
        self.pending[rec.id] = nil
        cb(rec)
      else
        self.on_event(rec)
      end
    end
  end
end

---@param record table
---@param cb fun(resp: table)
function Client:request(record, cb)
  self.next_id = self.next_id + 1
  local id = "nvim-" .. self.next_id
  record.id = id
  self.pending[id] = cb
  self.proc:write(vim.json.encode(record) .. "\n")
end

function Client:is_alive() return self.alive end

function Client:close()
  if self.alive then
    pcall(function() self.proc:write(nil) end)
    self.proc:kill("sigterm")
    self.alive = false
  end
end

return M
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`
Expected: `Success: 6  Failed: 0`.

- [ ] **Step 7: Commit**

```bash
git add nvim-tutor
git commit -m "feat(nvim-tutor): JSONL RPC client for pi"
```

---

### Task 6: The panel

**Files:**
- Create: `nvim-tutor/lua/tutor/panel.lua`
- Create: `nvim-tutor/tests/panel_spec.lua`

**Interfaces:**
- Produces `tutor.panel`:
  - `panel.new(opts: {on_submit: fun(text: string)}) -> Panel`
  - `Panel:toggle()`, `Panel:is_open() -> boolean`
  - `Panel:append_user(text)`, `Panel:append_delta(text)`, `Panel:end_reply()`
  - `Panel:set_status(fields: {language?: string, level?: integer, rung?: integer, task?: string, state?: string})`
  - `Panel:lines() -> string[]` (chat buffer contents, for tests)
  - `Panel:status_line() -> string`

- [ ] **Step 1: Write the failing tests**

`nvim-tutor/tests/panel_spec.lua`:
```lua
local panel = require("tutor.panel")

describe("panel", function()
  it("appends user text and streams a reply into one assistant block", function()
    local p = panel.new({ on_submit = function() end })
    p:toggle()
    p:append_user("hello")
    p:append_delta("Hel")
    p:append_delta("lo\nworld")
    p:end_reply()
    assert.same({ "> hello", "", "Hello", "world", "" }, p:lines())
    p:toggle()
  end)

  it("renders the status line from fields", function()
    local p = panel.new({ on_submit = function() end })
    p:set_status({ language = "rust", level = 42, rung = 2, task = "P1.T2.S3", state = "idle" })
    assert.equals("rust · lvl 42 · rung 2 · P1.T2.S3 · idle", p:status_line())
  end)

  it("leaves no waiting state after a handled prompt", function()
    local p = panel.new({ on_submit = function() end })
    p:set_status({ state = "waiting" })
    p:end_reply()
    assert.equals("idle", p.status.state)
  end)

  it("calls on_submit with the input text and clears it", function()
    local got
    local p = panel.new({ on_submit = function(t) got = t end })
    p:toggle()
    p:submit("what is a trait")
    assert.equals("what is a trait", got)
    p:toggle()
  end)
end)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`
Expected: FAIL, module `tutor.panel` not found.

- [ ] **Step 3: Implement panel.lua**

```lua
local Split = require("nui.split")
local Input = require("nui.input")

local M = {}
local Panel = {}
Panel.__index = Panel

---@param opts {on_submit: fun(text: string)}
function M.new(opts)
  local self = setmetatable({
    on_submit = opts.on_submit,
    status = { state = "idle" },
    open = false,
    chat_lines = {},
    reply_open = false,
  }, Panel)
  self.chat_buf = vim.api.nvim_create_buf(false, true)
  vim.bo[self.chat_buf].filetype = "markdown"
  vim.bo[self.chat_buf].buftype = "nofile"
  return self
end

function Panel:_render()
  vim.bo[self.chat_buf].modifiable = true
  vim.api.nvim_buf_set_lines(self.chat_buf, 0, -1, false, self.chat_lines)
  vim.bo[self.chat_buf].modifiable = false
  if self.split and self.split.winid and vim.api.nvim_win_is_valid(self.split.winid) then
    vim.api.nvim_win_set_cursor(self.split.winid, { math.max(#self.chat_lines, 1), 0 })
    vim.wo[self.split.winid].winbar = self:status_line()
  end
end

function Panel:lines() return vim.deepcopy(self.chat_lines) end

function Panel:status_line()
  local s = self.status
  local parts = {}
  if s.language then table.insert(parts, s.language) end
  if s.level then table.insert(parts, "lvl " .. s.level) end
  if s.rung then table.insert(parts, "rung " .. s.rung) end
  if s.task then table.insert(parts, s.task) end
  table.insert(parts, s.state or "idle")
  return table.concat(parts, " · ")
end

function Panel:set_status(fields)
  for k, v in pairs(fields) do self.status[k] = v end
  self:_render()
end

function Panel:append_user(text)
  for i, l in ipairs(vim.split(text, "\n", { plain = true })) do
    table.insert(self.chat_lines, (i == 1 and "> " or "  ") .. l)
  end
  table.insert(self.chat_lines, "")
  self.reply_open = false
  self:_render()
end

function Panel:append_delta(text)
  if not self.reply_open then
    table.insert(self.chat_lines, "")
    self.reply_open = true
  end
  local pieces = vim.split(text, "\n", { plain = true })
  self.chat_lines[#self.chat_lines] = self.chat_lines[#self.chat_lines] .. pieces[1]
  for i = 2, #pieces do table.insert(self.chat_lines, pieces[i]) end
  self:_render()
end

function Panel:end_reply()
  if self.reply_open then
    table.insert(self.chat_lines, "")
    self.reply_open = false
  end
  self.status.state = "idle"
  self:_render()
end

function Panel:submit(text)
  if text == nil or text:match("^%s*$") then return end
  self.on_submit(text)
end

function Panel:is_open() return self.open end

function Panel:toggle()
  if self.open then
    if self.input then self.input:unmount(); self.input = nil end
    if self.split then self.split:unmount(); self.split = nil end
    self.open = false
    return
  end
  self.split = Split({ relative = "editor", position = "right", size = "40%", bufnr = self.chat_buf })
  self.split:mount()
  self.input = Input({
    relative = "editor", position = { row = "100%", col = "100%" }, size = { width = "40%", height = 1 },
    border = { style = "single", text = { top = " tutor ", top_align = "left" } },
  }, {
    prompt = "› ",
    on_submit = function(value) self:submit(value) end,
  })
  self.input:mount()
  self.input:map("n", "<Esc>", function() self:toggle() end, { noremap = true })
  self.open = true
  self:_render()
end

return M
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`
Expected: `Success: 10  Failed: 0`. If nui's `Input` cannot mount headless in the first test, the test may call `p:append_user` without `p:toggle()`; the chat buffer does not need a window.

- [ ] **Step 5: Commit**

```bash
git add nvim-tutor
git commit -m "feat(nvim-tutor): chat panel with status winbar"
```

---

### Task 7: Plugin entry: spawn Pi, wire panel to RPC, respawn once

**Files:**
- Create: `nvim-tutor/lua/tutor/init.lua`
- Create: `nvim-tutor/tests/init_spec.lua`

**Interfaces:**
- Consumes: `tutor.rpc.new`, `tutor.panel.new`.
- Produces: `require("tutor").setup(opts)` with `opts.pi_cmd` (default `{"pi"}`), `opts.cwd` (default `vim.fn.getcwd()`), `opts.required_pi = "^1%."`.
- Produces: user commands `:Tutor` (toggle), `:TutorSend {text}` (send without the input box; used by tests and keymaps).
- Produces: `M.send_signal(signal: table)` for later milestones (sends an envelope, expects `handled`).
- Produces: `M.state` = `{ client, panel, respawned: boolean }` for tests.

- [ ] **Step 1: Write the failing tests**

`nvim-tutor/tests/init_spec.lua`:
```lua
local fixture = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":p:h") .. "/fixtures/fake_pi.js"

describe("tutor.init", function()
  before_each(function()
    package.loaded["tutor"] = nil
    require("tutor").setup({ pi_cmd = { "node", fixture }, cwd = vim.fn.getcwd(), check_version = false })
  end)

  it("streams a reply into the panel", function()
    local tutor = require("tutor")
    vim.cmd("TutorSend hi")
    vim.wait(2000, function() return tutor.state.panel.status.state == "idle" and #tutor.state.panel:lines() > 2 end)
    local lines = tutor.state.panel:lines()
    assert.equals("> hi", lines[1])
    assert.equals("Hello\226\128\168!", lines[3])
  end)

  it("send_signal resolves handled and does not enter waiting", function()
    local tutor = require("tutor")
    local disp
    tutor.send_signal({ type = "ping" }, function(d) disp = d end)
    vim.wait(2000, function() return disp ~= nil end)
    assert.equals("handled", disp)
    assert.equals("idle", tutor.state.panel.status.state)
  end)

  it("respawns once after the process exits", function()
    local tutor = require("tutor")
    tutor.state.client:request({ type = "exit" }, function() end)
    vim.wait(2000, function() return not tutor.state.client:is_alive() end)
    vim.cmd("TutorSend again")
    vim.wait(2000, function() return tutor.state.respawned and tutor.state.client:is_alive() end)
    assert.is_true(tutor.state.respawned)
    assert.is_true(tutor.state.client:is_alive())
  end)
end)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`
Expected: FAIL, module `tutor` not found.

- [ ] **Step 3: Implement init.lua**

```lua
local rpc = require("tutor.rpc")
local panel_mod = require("tutor.panel")

local M = {}
M.state = { client = nil, panel = nil, respawned = false }
local opts = {}

local SIGNAL_PREFIX = "@@tutor-signal "

local function pi_args()
  local cmd = vim.deepcopy(opts.pi_cmd)
  if cmd[1] == "pi" then
    vim.list_extend(cmd, { "--mode", "rpc", "--tools", "read,bash,grep,find,ls" })
  end
  return cmd
end

local function check_version()
  if opts.check_version == false then return end
  local out = vim.fn.system({ opts.pi_cmd[1], "--version" })
  local v = vim.trim(out)
  if not v:match(opts.required_pi) then
    vim.notify(("[tutor] pi %s found, expected %s"):format(v, opts.required_pi), vim.log.levels.WARN)
  end
end

local function on_event(ev)
  local p = M.state.panel
  if ev.type == "message_update" and ev.assistantMessageEvent and ev.assistantMessageEvent.type == "text_delta" then
    p:append_delta(ev.assistantMessageEvent.delta)
  elseif ev.type == "agent_settled" then
    p:end_reply()
  elseif ev.type == "entry_appended" and ev.entry and ev.entry.customType == "tutor_status" then
    local d = ev.entry.data or {}
    if d.kind == "ready" then p:set_status({ state = "idle" }) end
  end
end

local function spawn()
  M.state.client = rpc.new({
    cmd = pi_args(),
    cwd = opts.cwd,
    on_event = on_event,
    on_exit = function(code)
      M.state.panel:set_status({ state = "pi exited (" .. code .. ")" })
    end,
  })
end

local function ensure_alive()
  if M.state.client and M.state.client:is_alive() then return true end
  if M.state.respawned then
    M.state.panel:set_status({ state = "pi dead; :TutorRestart" })
    return false
  end
  M.state.respawned = true
  spawn()
  return true
end

function M.send(text)
  if not ensure_alive() then return end
  M.state.panel:append_user(text)
  M.state.panel:set_status({ state = "waiting" })
  M.state.client:request({ type = "prompt", message = text }, function(resp)
    if not resp.success or (resp.data and resp.data.disposition == "handled") then
      M.state.panel:end_reply()
    end
  end)
end

---@param signal table
---@param cb? fun(disposition: string)
function M.send_signal(signal, cb)
  if not ensure_alive() then return end
  local msg = SIGNAL_PREFIX .. vim.json.encode(signal)
  M.state.client:request({ type = "prompt", message = msg }, function(resp)
    local d = resp.data and resp.data.disposition or "error"
    if d ~= "handled" then
      vim.notify("[tutor] signal not handled by pi-tutor: " .. d, vim.log.levels.WARN)
    end
    if cb then cb(d) end
  end)
end

function M.restart()
  if M.state.client then M.state.client:close() end
  M.state.respawned = false
  spawn()
end

function M.setup(user_opts)
  opts = vim.tbl_deep_extend("force", {
    pi_cmd = { "pi" },
    cwd = vim.fn.getcwd(),
    required_pi = "^1%.",
    check_version = true,
  }, user_opts or {})
  M.state.panel = panel_mod.new({ on_submit = M.send })
  M.state.respawned = false
  check_version()
  spawn()
  vim.api.nvim_create_user_command("Tutor", function() M.state.panel:toggle() end, {})
  vim.api.nvim_create_user_command("TutorSend", function(a) M.send(a.args) end, { nargs = "+" })
  vim.api.nvim_create_user_command("TutorRestart", M.restart, {})
  vim.api.nvim_create_autocmd("VimLeavePre", { callback = function()
    if M.state.client then M.state.client:close() end
  end })
end

return M
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`
Expected: `Success: 13  Failed: 0`.

- [ ] **Step 5: Commit**

```bash
git add nvim-tutor
git commit -m "feat(nvim-tutor): plugin entry, commands, respawn-once"
```

---

### Task 8: Manual acceptance with the real Pi and a README update

**Files:**
- Modify: `README.md` (replace the Status section and add a Tests section)

- [ ] **Step 1: Run the real thing**

```bash
cd /tmp && mkdir -p tutor-smoke && cd tutor-smoke && nvim
```
In Neovim: `:Tutor`, type `say hello in one line` in the input box, press Enter.
Expected: the right split shows `> say hello in one line`, then a streamed reply, and the winbar ends in `idle`. If `pi` has no provider configured, run `pi` once in a terminal and `/login`, then retry.

- [ ] **Step 2: Verify the signal path for real**

In Neovim: `:lua require("tutor").send_signal({type="ping"}, function(d) print(d) end)`
Expected: prints `handled`; no reply appears in the panel.

- [ ] **Step 3: Verify the tool fence**

In the panel, type: `create a file named x.txt containing hi`
Expected: the model reports it cannot write files (no `write`/`edit` tool is available); `ls` shows no `x.txt`.

- [ ] **Step 4: Update README.md**

Replace the `## Status` section body with `Milestone 1 (bootstrap) done: the panel streams Pi replies and editor signals reach the extension.` and add this section before `## Upgrading Pi`:

```markdown
## Tests
- `cd pi-tutor && npm test` (unit), `npm run test:contract` (spawns real `pi`)
- `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README status and test commands after M1"
```
