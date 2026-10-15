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
- Golden check (M6a, `npm run golden`): `pi -p --no-session --mode json -ne -e <ext> --skill <dir> --tools …
  [--model …] <messages…>`. `-ne` keeps the installed pi-tutor package out (verified 2026-10-13: without
  it the package's `/tutor-status` handles the message; with it the text reaches the model). Print mode
  runs extension commands passed as messages (`session.prompt` → `_tryExecuteExtensionCommand`,
  agent-session.js:1527). JSON events used: `message_end` (assistant `content[].text`) and `agent_end`.

## Pi extension API (src/core/extensions/types.ts)
- `export default function (pi: ExtensionAPI)`
- `pi.on("session_start", (event, ctx) => …)` with `ctx.cwd`, `ctx.hasUI`, `ctx.ui`
- `pi.on("session_shutdown", …)`
- `pi.registerCommand(name, { description, handler(args, ctx) })`
- `pi.appendEntry(customType, data)`
- `pi.sendUserMessage(text, { deliverAs: "followUp" })`: always triggers a turn; `deliverAs` is
  ignored when idle and required while streaming (agent-session.js:1551). Used once per
  editor-triggered episode, text prefixed `[tutor]`.
- `pi.sendMessage({ customType, content, display, details }, { triggerTurn: false })` (types.d.ts:1234;
  agent-session.js:1782 `sendCustomMessage`): while idle it appends the message to the session now and renders it
  with the default CustomMessageComponent (a labelled Markdown box, custom-message.js); while streaming it is
  deferred to the end of the turn. Custom messages are in the model's context. M8: tutor_grade, tutor_progress.
- `ctx.isIdle()` (types.d.ts:236): nudges are sent only when true. The session_start `ctx` is kept.
- `pi.on("tool_call", (event, ctx) => ToolCallEventResult | undefined)` (types.d.ts:1200);
  `event.toolName`, `event.input` (mutable; we never mutate); result `{ block: true, reason }`.
  Inputs: read `{path}`, grep `{pattern, path?, glob?}`, find `{pattern, path?}`, ls `{path?}`.
  Paths resolve like Pi's `resolveToCwd` (dist/utils/paths.js:59-87: unicode spaces → " ",
  strip "@", expand "~", file:// URLs, relative to cwd); `path-utils` is not exported, so
  `guard.ts` mirrors it. Re-check on every Pi bump.
- `pi.exec(command, args, { timeout })` → `{ stdout, stderr, code, killed }` (types.d.ts:1256, exec.d.ts): the
  extension (never the model) runs `python3 --version`, `rustc --version`, `go version`, `tsc --version`,
  `lua -v` to pick the DevDocs bundle. M7: the same commands (plus `node --version` when `tsc` is
  missing) run once per language and project root on the first turn that needs the language card,
  cached for the life of the Pi, with a 6 s ceiling of our own on top of `timeout`. They run with
  `cwd: <project root>` (`ExecOptions.cwd`, exec.d.ts:13) so pyenv, rustup and nvm pick the project's version.
- `pi.getCommands()` → `SlashCommandInfo[]`; skills appear as `{ source: "skill", sourceInfo: { path: <SKILL.md> } }`
  regardless of `enableSkillCommands` (agent-session.js:2694). `guard.ts` allows `read/grep/find/ls` inside
  `dirname(path)` of each, because skills load through the `read` tool.
- `ctx.ui.editor(title, prefill)` → `string | undefined` (types.d.ts:139): the `/tutor-learn` draft; Esc = discard.
- `ctx.reload()` (ExtensionCommandContext, types.d.ts:322) after saving or fetching skills, so Pi rescans them.
- Skill format (docs/skills.md): `SKILL.md` frontmatter `name` (lowercase, digits, single hyphens, ≤ 64) and
  `description` (≤ 1024); malformed or description-less skills are not loaded. Global root
  `$PI_CODING_AGENT_DIR/skills` (default `~/.pi/agent/skills`).
- `BeforeAgentStartEvent.prompt` (types.d.ts:711): `[tutor]`-prefixed prompts do not open a chat episode.
- `AssistantMessage.stopReason` (`pi-ai` types.d.ts:313): `"stop"` turns are judged from their text;
  `"aborted"`, `"error"` and `"length"` turns are ignored.
- A tool the model invents never reaches `tool_call` (`pi-agent-core` agent-loop.js:486 answers
  "Tool X not found"). It still appears in `turn_end` as `{ type: "toolCall", id, name, arguments }`
  (`pi-ai` `ToolCall`); a `tutor-judgment`/`tutor_judgment` call's arguments are taken as the judgment,
  at most one judgment per agent run.
- `ExtensionCommandContext.hasUI`: `/tutor-plan` and `/tutor-architect <q>` start a turn only when true.
  `pi.sendUserMessage` is fire-and-forget (agent-session.js:2712); in print mode the caller's next
  prompt would throw "Agent is already processing" (agent-session.js:1552).
- `pi.on("input", (e: InputEvent) => …)` (types.d.ts:886-903, 1203): `e.text`, `e.streamingBehavior?:
  "steer" | "followUp"` (undefined when idle). A message typed mid-reply is delivered into the running
  loop without a new `before_agent_start` (agent-session.js:1550-1560). `input` fires before queueing,
  while the current reply still streams; the extension only counts the queued message there (M6c #56).
- `pi.on("message_start", (e: MessageStartEvent) => …)` (types.d.ts:813, 1192): `e.message` (user,
  assistant, toolResult or custom). Order for a steered/followUp message (pi-agent-core
  agent-loop.js:114-118, 180-186): `input` → current reply's `turn_end` → steering/follow-up poll →
  `message_start` with `role: "user"` and the expanded text → next reply. The initial prompt also emits
  a user `message_start` (agent-loop.js:52-55), after `before_agent_start`. The extension resets its
  per-run state (prompt, judged) on a user `message_start` only while a queued message is pending.
- `@earendil-works/pi-tui` `visibleWidth(str)` (dist/utils.d.ts:16; aliased by Pi's loader): the widget
  clips by terminal columns. Not `truncateToWidth`: it inserts ANSI resets (probe 2026-10-13).
- `NvimLink.snapshot` has a 2 s timeout (a busy Neovim leaves the turn without an editor snapshot); the
  neovim client log is `$XDG_STATE_HOME/pi-tutor/nvim.log` (default `~/.local/state/…`), per user.
- `parseFrontmatter(text)` → `{ frontmatter, body }` (`dist/utils/frontmatter.d.ts`, exported from the
  package index): role files `agents/*.md` and learned skills.
- `pi.registerTool(defineTool({ name, label, description, parameters, execute(toolCallId, params, signal,
  onUpdate, ctx) }))` → `{ content: [{ type: "text", text }], details }` (types.d.ts:446-505,
  examples/extensions/hello.ts): `tutor_remember`, `tutor_recall` (M6b). A tool that throws becomes an
  error result carrying `error.message` (pi-agent-core agent-loop.js:536); the secret scanner's refusal
  reaches the model that way. Parameters use `Type` from `typebox`, which Pi's loader aliases to its own
  copy (loader.js getAliases; also `@earendil-works/pi-ai`).
- `--tools <list>` is an allowlist of "built-in, extension, or custom tools" (docs/cli.md:120): nvim-tutor
  starts Pi with `--tools read,grep,find,ls,tutor_remember,tutor_recall`; the guard allows the two
  memory tools by name.
- `systemPromptOptions.sections` are "XML-wrapped prompt sections keyed by tag name"
  (system-prompt.d.ts:25): `tutor` (role, style, band, ladder, protocol) and `tutor_memory` (the frozen
  memory snapshot, set only when there are memories).
- `ctx.modelRegistry.complete(ctx.model, { systemPrompt, messages: [UserMessage] })` → `AssistantMessage`
  (model-registry.d.ts:40; pattern from examples/extensions/qna.ts). Used by `/tutor-start` for the
  suggester and the scaffold; non-`"stop"` `stopReason` is an error (`errorMessage` shown).
- `ctx.ui.select(title, options)` / `ctx.ui.input(title, placeholder)` → `string | undefined` (Esc = undefined);
  `ctx.ui.setWorkingMessage(text?)` (only visible during an agent turn — interactive-mode.js:2061 — so
  it is not progress for a command); `ctx.model` (undefined → `/tutor-start` refuses).
- `ctx.ui.custom(factory(tui, theme, keybindings, done))` (types.d.ts:121) showing `BorderedLoader`
  (exported from the package, `{ cancellable: true }`, `.signal`, `.onAbort`) during each `/tutor-start`
  model call; its signal goes to `modelRegistry.complete(..., { signal })`. Pattern from qna.ts.
  `initTheme(name?, watcher?)` must have run first (Pi does it at startup; tests call it).
- Project trust: `.pi/{settings.json,mcp.json,extensions,skills,prompts,themes,SYSTEM.md,APPEND_SYSTEM.md}`
  make Pi ask "trust this folder?" (trust-manager.js:8), so the M4 scaffold writes no `.pi/` (M5 decides).
- `ctx.ui.setWidget(key, string[] | undefined)`, `ctx.ui.setStatus(key, text)`,
  `ctx.ui.setWorkingMessage(text)`, `ctx.ui.notify(msg, level)`
- `pi.on("before_agent_start", (event, ctx) => …)`: mutate `event.systemPromptOptions.sections["tutor"]`
  (band prompt); return `{ message: { customType: "tutor_editor", content, display: false, details } }`
  for the per-turn editor context (`BeforeAgentStartEventResult.message`). Never return `systemPrompt`.
- `pi.on("turn_end", (event) => …)`: `event.message` is the AgentMessage; assistant `content` is
  `(TextContent | ThinkingContent | ToolCall)[]`, `ToolCall.type === "toolCall"`.
- `pi.on("message_end", (event: { message }) => { message? })` (types.d.ts:824, 1097, 1194;
  `MessageEndEventResult`): the replacement must keep the role. agent-session.js
  `_replaceMessageInPlace` swaps it into the same object before `turn_end`, session persistence and
  `--mode json` output (probe 2026-10-14, Pi 1.1.0: `turn_end` and the JSON `message_end` both had the
  replaced text). Used to reword internals in assistant replies (compliance.scrubInternals).
- `pi.registerMarkdownTransformer((markdown, { messageType, isStreaming, availableWidth }) => string)`
  (types.d.ts:1128-1141, 1228): interactive TUI only, display only; pi-tui caches the result by text
  and width (markdown.js:185), so it reruns on each streaming update and on resize. Only
  `AssistantMessageComponent` passes `"assistant"` (thinking is `"assistant-thinking"`). `availableWidth` is the Markdown content width (terminal minus `paddingX` 1 each
  side; probe: 70-col tmux → 68); code block lines are indented by `codeBlockIndent` (default 2, pi-tui
  markdown.js:393). Used for the screen rewording and the real diagram width.
  Thinking blocks come through as `"assistant-thinking"` (assistant-message.js:118). When Pi's own
  `hideThinkingBlock` is on, Pi draws its label and never calls the transformer (:112-113). No
  extension API sets `hideThinkingBlock` (only `ctx.ui.setHiddenThinkingLabel`), so `/tutor-thinking`
  swaps the thinking Markdown for one line instead; the setting lives in profile `settings(thinking)`.
- `ctx.sessionManager.getBranch()` (ReadonlySessionManager): custom entries are
  `{ type: "custom", customType, data }`; used to restore `tutor_level` on resume.
- `pi.on("context", (event: { messages: AgentMessage[] }) => { messages? })` transforms the
  conversation before each LLM call (types.d.ts:666, 1058, 1176); used to keep only the newest
  `tutor_editor` custom message. `CustomMessage` is `{ role: "custom", customType, content, display }`.
- Custom entry types we write: `tutor_signal`, `tutor_level { level }`, `tutor_judgment` (Judgment),
  `tutor_role { role }`, `tutor_workflow { task, step, started, done? }`, `tutor_check { issues }`,
  `tutor_feedback { kind, rung }`, `tutor_episode` with a `run` trigger `{ cmd, code, trace }` (M6b),
  `tutor_episode` (Episode, written on open / judgment / reband / close; the last open one is restored).
- System prompt section keys: `tutor`, `tutor_memory`, and `tutor_lang` (M7: the language card and the
  editor card, set every turn in `before_agent_start`). `package.json` `"prompts": ["./prompts/*.md"]` is non-recursive,
  so `prompts/system/*.md` are not registered as `/` templates.

## Neovim (via `neovim` npm client over `$NVIM`)
- `$NVIM` is set for `:terminal` children to `v:servername` (verified 0.12.5)
- Editor window = first window in the tabpage whose buffer has `buftype == ""` (current, then
  `winnr("#")`, then any); the Pi pane is a terminal window, so "current window" is wrong when the
  user is typing in Pi. All pulls and the snapshot go through this resolver (`EDITOR_WIN_LUA`).
- The snapshot Lua checks the root inside Neovim and returns `{ path }` only for outside buffers.
  Root checks (snapshot Lua, push `in_root`, `NvimLink.isInRoot`) compare the resolved path only:
  `vim.fn.resolve(p)` resolves symlinks in every component, also for a file not yet on disk
  (probe 2026-10-13, 0.12.6); Node uses `realpathSync`, falling back to the directory's realpath.
- `vim.bo[b].filetype`, `nvim_win_get_cursor(w)`, `nvim_buf_get_lines(b, from, to, false)` with
  `to` past EOF (strict_indexing=false clamps) — one `nvim_exec_lua` round trip in `NvimLink.snapshot()`.
- `attach({ socket })`, `raw.request("nvim_get_api_info")` → `[channel, meta]`
- `raw.lua(code, args)`, `raw.call(fn, args)`, `raw.command(cmd)`, `raw.input(keys)`
- `raw.on("notification", (method, args))` receives `vim.rpcnotify(channel, "tutor", payload)`
- `raw.on("disconnect")` fires when the socket closes (client.js:121); used for detached mode.
- `raw.close()` (client.js:232) closes only our socket. Never `raw.quit()`: it is `command("qa!")`
  (Neovim.js:715) and kills the user's editor; `NvimLink.close()` used it until M3. `raw.close()` is
  `writer.end(cb)` (transport.js:206); `NvimLink.close()` bounds it and the cleanup Lua (1 s each) so a
  Neovim blocked at a prompt cannot hang `session_shutdown`. A failed connect closes its client too.
- nvim-tutor (Lua): `jobstart(cmd, { term = true })` throws E475 for a program that is not executable,
  checked against Neovim's cwd even when `cwd` is given (probe 2026-10-13), so `:TutorRun` passes a
  relative `run_cmd` program as `opts.cwd`-absolute. Textlock (an `<expr>` mapping, a lazy-load from a
  keymap) makes `nvim_set_current_win`, `nvim_win_set_buf`, `nvim_win_close`, `:vsplit`, `:enew` and
  `jobstart{term}` throw E565, while `nvim_create_buf` and `jobstop` work (probe 2026-10-13, 0.12.6).
  `term.textlocked()` probes it with `nvim_set_current_win(current)` (a no-op without autocmds when
  unlocked) and the pane reruns show/hide/restart via `vim.schedule`.
- `require("tutor").switch(dir, file)` (nvim-tutor init.lua) is called by `NvimLink.switchProject` via
  `vim.defer_fn(…, 500)` so the restart that kills this Pi happens after `/tutor-start` returns.
- The client logs via winston and patches `console`; `NVIM_NODE_LOG_FILE` is set before import
  so nothing is written to Pi's terminal.
- Push autocmds live in `extensions/tutor/push.lua.ts` and are installed with `nvim_exec_lua`;
  `vim.g.tutor_chan` holds the extension's channel for `:TutorRun`.

## Node
- `node:sqlite` `DatabaseSync` (profile). No ExperimentalWarning on Node 26.11.1 (2026-10-12); on Node 22.x it
  warns on stderr — check before supporting an older Node, the warning would draw over Pi's TUI.
- `node:sqlite` has FTS5 with `bm25()` (probe 2026-10-13). Profile schema v2: `memory` + `memory_fts`
  (external content, kept in sync by insert/delete triggers) and `feedback`.

## DevDocs (external, verified 2026-10-13)
- Catalog `https://devdocs.io/docs.json`: `[{ name, slug, type, version, release, mtime, db_size, attribution }]`.
- Bundle `https://documents.devdocs.io/<slug>/index.json?<mtime>` → `{ entries: [{ name, path: "page#anchor", type }], types }`;
  `…/db.json?<mtime>` → `{ "<page>": "<html>" }`. `PI_TUTOR_DEVDOCS=<base>` points both at a mirror.
- Installed here: Python 3.14.8 → python~3.14; Go 1.27.2 → go 1.27.0; Lua 5.5.1 → lua~5.5; Rust 1.90 → rust 1.98
  (newer, warned); TypeScript: no tsc → newest.

## Install location on this machine
- Pi installed with `npm install -g --prefix ~/.local` because `/usr/lib/node_modules` is
  root-owned; `~/.local/bin` precedes `/usr/bin` on PATH, shadowing the old 0.73 copy.
