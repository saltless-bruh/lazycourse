# Pi surface used by pi-tutor

Verified against `@earendil-works/pi-coding-agent` docs/types at 1.0.4 (repo `main`,
2026-10-07) and the installed binary 1.1.0 (`pi --help`, 2026-10-11).
Re-verify every line when bumping the version range in package.json.

## CLI
- `pi --mode rpc` : JSONL commands on stdin, events on stdout (docs/rpc.md)
- `--tools read,bash,grep,find,ls` : allowlist of tool names (grep/find/ls are off by default)
- `--no-session`, `--session-dir <dir>`
- `pi install <source>`, `pi list`, `pi remove <source>`, `pi update [source|self|pi]`

## RPC commands (docs/rpc-commands.md)
- `{"id","type":"prompt","message"}` → response `data.disposition` ∈ started|queued|handled
- `{"id","type":"abort"}`
- `{"id","type":"get_state"}`
- Response shape: `{"id","type":"response","command","success","data"|"error"}`

## RPC events (docs/json.md)
- `message_update` with `assistantMessageEvent.type == "text_delta"`, field `delta`
- `agent_end`, `agent_settled`
- `entry_appended` with `entry.type == "custom"`, `entry.customType`, `entry.data`
- Framing: strict LF-delimited JSONL; never split on U+2028/U+2029; optional CR stripped.

## Extension API (src/core/extensions/types.ts)
- `export default function (pi: ExtensionAPI)` factory (`ExtensionFactory`)
- `pi.on("session_start", (event: {reason}) => void)`
- `pi.on("input", (event: {text, source: "interactive"|"rpc"|"extension"}) => InputEventResult)`
  where `InputEventResult = {action:"continue"} | {action:"transform", text, images?} | {action:"handled"}`
- `pi.appendEntry(customType: string, data?: unknown): void`
- No version accessor on `ExtensionAPI`; the Neovim side checks `pi --version`.

## Package layout (docs/packages.md)
- `package.json` with `"pi": { extensions, skills, prompts }` or conventional dirs
  `extensions/`, `skills/`, `prompts/`; a subdirectory with `index.ts` is one extension.
- TypeScript loads via jiti, no build step.
- `pi install ./path` writes to `~/.pi/agent/settings.json` `packages`.

## Install location on this machine
- Installed with `npm install -g --prefix ~/.local` because `/usr/lib/node_modules` is
  root-owned; `~/.local/bin` precedes `/usr/bin` on PATH, shadowing the old 0.73 copy.
