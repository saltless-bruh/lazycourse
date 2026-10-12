---
name: pi-surface-check
description: Before using any Pi ExtensionAPI, ctx.ui, or Neovim RPC call in pi-tutor, verify it exists in the installed types and record it in PI_SURFACE.md. Use whenever editing files under pi-tutor/extensions.
user-invocable: false
---

# Pi surface check

Pi's extension API changes between minor versions, and `pi-tutor/PI_SURFACE.md`
is the only record of what this project relies on. Follow this before writing
code that calls into Pi or Neovim.

1. Identify every new call: `pi.<method>`, `pi.on("<event>")`, `ctx.<field>`,
   `ctx.ui.<method>`, and every Neovim API name passed to `raw.call` /
   `raw.lua` / `raw.request`.
2. Verify Pi calls against the installed types:
   ```bash
   grep -n "<name>" pi-tutor/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts
   ```
   Read the surrounding signature, event payload, and result type. Do not rely
   on memory or on docs for a different version.
3. Verify Neovim calls with `:help <name>` semantics via a headless check when
   unsure:
   ```bash
   nvim --headless --clean -c 'lua print(vim.api.<name> ~= nil)' -c qa
   ```
4. Add each verified call to the matching section of `pi-tutor/PI_SURFACE.md`
   with the version it was verified against (`pi --version`, `nvim --version`).
5. If a call is missing or its shape differs, stop and say so; do not guess an
   alternative silently. Record the finding in PI_SURFACE.md's "Observed
   behaviour" section.
