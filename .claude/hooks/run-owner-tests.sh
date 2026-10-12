#!/usr/bin/env bash
# PostToolUse(Edit|Write): run the suite that owns the edited file. Never blocks.
set -u
f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
[ -n "$f" ] || exit 0
root=$(git -C "$(dirname "$f")" rev-parse --show-toplevel 2>/dev/null) || exit 0
rel=${f#"$root"/}
case "$rel" in
  pi-tutor/extensions/*|pi-tutor/test/*)
    out=$(cd "$root/pi-tutor" && npx vitest run --reporter=dot 2>&1 | tail -4)
    echo "{\"systemMessage\": \"pi-tutor tests after $rel:\n$(printf '%s' "$out" | sed 's/"/\\"/g' | tr '\n' ' ')\"}"
    ;;
  nvim-tutor/lua/*|nvim-tutor/tests/*)
    out=$(cd "$root/nvim-tutor" && timeout 120 nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aoE "(Success|Failed|Errors)[[:space:]]*:[[:space:]]*[0-9]+" | tr -s ' \t' ' ' | tr '\n' ' ')
    echo "{\"systemMessage\": \"nvim-tutor tests after $rel: $out\"}"
    ;;
esac
exit 0
