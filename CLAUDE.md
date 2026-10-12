# lazycourse

Personal AI-tutor for LazyVim: Pi's TUI runs in a Neovim split, the `pi-tutor`
extension watches the editor over Neovim RPC. Read `README.md` and
`docs/superpowers/specs/2026-10-07-nvim-tutor-design.md` for the design.

## Layout
- `pi-tutor/` TypeScript Pi package (extension, skills, prompts). `extensions/tutor/`
  is the code; `PI_SURFACE.md` lists every Pi and Neovim API we depend on.
- `nvim-tutor/` Lua plugin: `term.lua` (terminal split), `init.lua` (commands).
- `docs/superpowers/` specs and per-milestone plans.

## Commands
- TypeScript: `cd pi-tutor && npm test` (vitest; `test/nvim.test.ts` spawns a real
  headless Neovim) and `npm run typecheck`.
- Lua: `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`.
- Live check in the real editor config: `/tutor-live`.

## Rules that are easy to break
- The extension runs inside Pi's full-screen TUI. Nothing may write to stdout or
  stderr there: no `console.log`, and third-party loggers go to a file
  (`NVIM_NODE_LOG_FILE` is set before importing `neovim`).
- Before using a new Pi `ExtensionAPI`, `ctx.ui`, or Neovim RPC call, verify it in
  `pi-tutor/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`
  and add it to `pi-tutor/PI_SURFACE.md`. Pi ships breaking changes often.
- Every editor path the extension pushes or pulls must be inside the project root
  (`root + "/"` prefix after `realpath`). Never read buffers outside it.
- Pi runs with `--tools read,grep,find,ls`. `bash` stays off until a `tool_call`
  guard filters it; the model once wrote a file through shell redirection.
- Neovim-side: `jobstart{term=true}` attaches to the *current* window's buffer; use
  `nvim_win_call`. Buffer writes under textlock (lazy-load from a keymap) throw
  E565; retry on the event loop.
- TDD: write the failing test, watch it fail, then implement. Both suites are
  cheap; run the one that owns the file after each change (a hook does this).

## Out-of-repo state
- `~/.config/nvim/lua/plugins/tutor.lua` loads the plugin with `dir=` pointing here.
- `~/.pi/agent/settings.json` holds the Pi provider/model and the `packages` entry
  installed with `pi install ./pi-tutor`.
- Pi is installed under `~/.local` (`npm -g --prefix ~/.local`), shadowing an old
  root-owned copy in `/usr/bin`.
