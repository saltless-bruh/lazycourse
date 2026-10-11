# Pi and Neovim surface used by pi-tutor

Verified against `@earendil-works/pi-coding-agent` 1.0.4 source (2026-10-07), installed
binary 1.1.0 (2026-10-11), `neovim` npm client 5.5.0, Neovim 0.12.5 (2026-10-12).
Re-verify every line when bumping versions.

## Pi CLI
- `pi --tools read,grep,find,ls` run interactively inside a Neovim `:terminal` (cwd = project root)
- `pi install ./pi-tutor`, `pi list`, `pi remove`, `pi update --extensions`
- `bash` is excluded: with it allowed, the model wrote a file via `echo > x.txt` (observed
  2026-10-11). M3's `tool_call` guard may re-enable it behind a read-only command filter.

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
- `raw.on("disconnect")` fires when the socket closes (client.js:121); used for detached mode.
- The client logs via winston and patches `console`; `NVIM_NODE_LOG_FILE` is set before import
  so nothing is written to Pi's terminal.
- Push autocmds live in `extensions/tutor/push.lua.ts` and are installed with `nvim_exec_lua`;
  `vim.g.tutor_chan` holds the extension's channel for `:TutorRun`.

## Install location on this machine
- Pi installed with `npm install -g --prefix ~/.local` because `/usr/lib/node_modules` is
  root-owned; `~/.local/bin` precedes `/usr/bin` on PATH, shadowing the old 0.73 copy.
