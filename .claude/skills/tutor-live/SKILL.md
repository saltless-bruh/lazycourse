---
name: tutor-live
description: Run the headless live acceptance of the tutor pane in the real LazyVim config with the real Pi, and report widget, level, diagnostic, run, and stray-process results.
disable-model-invocation: true
---

# Tutor live acceptance

Runs the real plugin inside the user's actual LazyVim config against the real
`pi` binary and the configured provider. This is the check unit tests cannot do.

Run from the repo root:

```bash
rm -rf /tmp/tutor-live && mkdir -p /tmp/tutor-live && printf 'x = \n' > /tmp/tutor-live/a.py
cd /tmp/tutor-live && timeout 120 nvim --headless -c "luafile $CLAUDE_SKILL_DIR/drive.lua" > /tmp/tutor-live/out.txt 2>&1; echo "exit=$?"
grep -aE "^(WIDGET|LEVEL|DIAG|EPISODE|RUN|LINE)" /tmp/tutor-live/out.txt
sleep 1; pgrep -fa 'pi --tools' | grep -v pgrep | grep -v snapshot || echo "no stray pi"
```

Expected:
- `WIDGET present=true detached=false chan=<n>`
- `LEVEL lvl40=true`
- `DIAG widget=true`
- `EPISODE widget=true nudge=true` (level 10 = beginner, error threshold 0)
- `RUN done` preceded by `[tutor] no run_cmd configured` (unless `run_cmd` is set)
- `no stray pi`

Report each line as pass/fail. If `WIDGET present=false`, read the first 40
lines of `/tmp/tutor-live/out.txt` for the Lua error and stop there; do not
guess at fixes without a failing test.
