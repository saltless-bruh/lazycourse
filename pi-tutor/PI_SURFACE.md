# Pi and Neovim surface used by pi-tutor

Verified against `@earendil-works/pi-coding-agent` 1.1.0 `dist/core/extensions/types.d.ts`
(2026-10-12), installed binary 1.1.0 (2026-10-12), `neovim` npm client 5.5.0, Neovim 0.12.6 (2026-10-12).
Re-verify every line when bumping versions.

## Pi CLI
- `pi --tools read,grep,find,ls` run interactively inside a Neovim `:terminal` (cwd = project root)
- `pi install ./pi-tutor`, `pi list`, `pi remove`, `pi update --extensions`
- `bash` is excluded from `--tools` and also blocked by the `tool_call` guard (M3 ruling: no
  read-only shell filter). Observed 2026-10-11: with bash allowed the model wrote a file via `echo > x.txt`.
- nvim-tutor starts Pi with `PI_TUTOR=1` (`jobstart` `env`, merged into the inherited env).
  Without it the extension's default export returns before registering anything.

## Pi extension API (src/core/extensions/types.ts)
- `export default function (pi: ExtensionAPI)`
- `pi.on("session_start", (event, ctx) => …)` with `ctx.cwd`, `ctx.hasUI`, `ctx.ui`
- `pi.on("session_shutdown", …)`
- `pi.registerCommand(name, { description, handler(args, ctx) })`
- `pi.appendEntry(customType, data)`
- `pi.sendUserMessage(text, { deliverAs: "followUp" })`: always triggers a turn; `deliverAs` is
  ignored when idle and required while streaming (agent-session.js:1551). Used once per
  editor-triggered episode, text prefixed `[tutor]`.
- `ctx.isIdle()` (types.d.ts:236): nudges are sent only when true. The session_start `ctx` is kept.
- `pi.on("tool_call", (event, ctx) => ToolCallEventResult | undefined)` (types.d.ts:1200);
  `event.toolName`, `event.input` (mutable; we never mutate); result `{ block: true, reason }`.
  Inputs: read `{path}`, grep `{pattern, path?, glob?}`, find `{pattern, path?}`, ls `{path?}`.
  Paths resolve like Pi's `resolveToCwd` (dist/utils/paths.js:59-87: unicode spaces → " ",
  strip "@", expand "~", file:// URLs, relative to cwd); `path-utils` is not exported, so
  `guard.ts` mirrors it. Re-check on every Pi bump.
- `BeforeAgentStartEvent.prompt` (types.d.ts:711): `[tutor]`-prefixed prompts do not open a chat episode.
- `AssistantMessage.stopReason` (`pi-ai` types.d.ts:313): only `"stop"` turns are judged.
- `ctx.modelRegistry.complete(ctx.model, { systemPrompt, messages: [UserMessage] })` → `AssistantMessage`
  (model-registry.d.ts:40; pattern from examples/extensions/qna.ts). Used by `/tutor-start` for the
  suggester and the scaffold; non-`"stop"` `stopReason` is an error (`errorMessage` shown).
- `ctx.ui.select(title, options)` / `ctx.ui.input(title, placeholder)` → `string | undefined` (Esc = undefined);
  `ctx.ui.setWorkingMessage(text?)`; `ctx.model` (undefined → `/tutor-start` refuses).
- `ctx.ui.setWidget(key, string[] | undefined)`, `ctx.ui.setStatus(key, text)`,
  `ctx.ui.setWorkingMessage(text)`, `ctx.ui.notify(msg, level)`
- `pi.on("before_agent_start", (event, ctx) => …)`: mutate `event.systemPromptOptions.sections["tutor"]`
  (band prompt); return `{ message: { customType: "tutor_editor", content, display: false, details } }`
  for the per-turn editor context (`BeforeAgentStartEventResult.message`). Never return `systemPrompt`.
- `pi.on("turn_end", (event) => …)`: `event.message` is the AgentMessage; assistant `content` is
  `(TextContent | ThinkingContent | ToolCall)[]`, `ToolCall.type === "toolCall"`.
- `ctx.sessionManager.getBranch()` (ReadonlySessionManager): custom entries are
  `{ type: "custom", customType, data }`; used to restore `tutor_level` on resume.
- `pi.on("context", (event: { messages: AgentMessage[] }) => { messages? })` transforms the
  conversation before each LLM call (types.d.ts:666, 1058, 1176); used to keep only the newest
  `tutor_editor` custom message. `CustomMessage` is `{ role: "custom", customType, content, display }`.
- Custom entry types we write: `tutor_signal`, `tutor_level { level }`, `tutor_judgment` (Judgment),
  `tutor_episode` (Episode, written on open / judgment / reband / close; the last open one is restored).
- System prompt section key: `tutor`. `package.json` `"prompts": ["./prompts/*.md"]` is non-recursive,
  so `prompts/system/*.md` are not registered as `/` templates.

## Neovim (via `neovim` npm client over `$NVIM`)
- `$NVIM` is set for `:terminal` children to `v:servername` (verified 0.12.5)
- Editor window = first window in the tabpage whose buffer has `buftype == ""` (current, then
  `winnr("#")`, then any); the Pi pane is a terminal window, so "current window" is wrong when the
  user is typing in Pi. All pulls and the snapshot go through this resolver (`EDITOR_WIN_LUA`).
- The snapshot Lua checks the root inside Neovim and returns `{ path }` only for outside buffers.
- `vim.bo[b].filetype`, `nvim_win_get_cursor(w)`, `nvim_buf_get_lines(b, from, to, false)` with
  `to` past EOF (strict_indexing=false clamps) — one `nvim_exec_lua` round trip in `NvimLink.snapshot()`.
- `attach({ socket })`, `raw.request("nvim_get_api_info")` → `[channel, meta]`
- `raw.lua(code, args)`, `raw.call(fn, args)`, `raw.command(cmd)`, `raw.input(keys)`
- `raw.on("notification", (method, args))` receives `vim.rpcnotify(channel, "tutor", payload)`
- `raw.on("disconnect")` fires when the socket closes (client.js:121); used for detached mode.
- `raw.close()` (client.js:232) closes only our socket. Never `raw.quit()`: it is `command("qa!")`
  (Neovim.js:715) and kills the user's editor; `NvimLink.close()` used it until M3.
- `require("tutor").switch(dir, file)` (nvim-tutor init.lua) is called by `NvimLink.switchProject` via
  `vim.defer_fn(…, 500)` so the restart that kills this Pi happens after `/tutor-start` returns.
- The client logs via winston and patches `console`; `NVIM_NODE_LOG_FILE` is set before import
  so nothing is written to Pi's terminal.
- Push autocmds live in `extensions/tutor/push.lua.ts` and are installed with `nvim_exec_lua`;
  `vim.g.tutor_chan` holds the extension's channel for `:TutorRun`.

## Node
- `node:sqlite` `DatabaseSync` (profile). No ExperimentalWarning on Node 26.11.1 (2026-10-12); on Node 22.x it
  warns on stderr — check before supporting an older Node, the warning would draw over Pi's TUI.

## Install location on this machine
- Pi installed with `npm install -g --prefix ~/.local` because `/usr/lib/node_modules` is
  root-owned; `~/.local/bin` precedes `/usr/bin` on PATH, shadowing the old 0.73 copy.
