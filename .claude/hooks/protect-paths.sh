#!/usr/bin/env bash
# PreToolUse(Edit|Write|Bash): ask before touching the surface doc, user config, or global installs.
set -u
input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name')
ask() { printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}\n' "$1"; exit 0; }
if [ "$tool" = "Bash" ]; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
  case "$cmd" in
    *"npm install -g"*|*"npm i -g"*|*"pi install"*|*"pi remove"*|*"pi update"*)
      ask "Global install or Pi package change: confirm (changes state outside the repo)";;
  esac
  exit 0
fi
f=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
case "$f" in
  */pi-tutor/PI_SURFACE.md) ask "PI_SURFACE.md changes only alongside code that uses a new Pi/Neovim call";;
  "$HOME"/.pi/agent/*|"$HOME"/.config/nvim/*) ask "User config outside the repo: confirm";;
esac
exit 0
