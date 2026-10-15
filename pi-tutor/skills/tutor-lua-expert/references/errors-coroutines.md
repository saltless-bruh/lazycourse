# Errors and coroutines

## Two ways to fail

Lua code reports failure in one of two styles, and a function should pick one:

- **Raise:** `error(message, level)`. Execution unwinds until a `pcall` catches it. Use it for bugs and for failures the immediate caller cannot sensibly handle.
- **Return:** `return nil, message`. The caller must check the first value. Standard functions like `io.open` and `tonumber` work this way.

```lua
local f, err = io.open("/no/such/file.txt", "r")
print(f, err ~= nil) -- nil true: the second value explains why
```

`assert(value, message)` turns the second style into the first: it returns `value` when it is truthy, otherwise raises `message`.

## pcall and error levels

`pcall(f, ...)` calls `f` and returns `true, results…` or `false, message`. The `level` argument of `error` decides which line the message blames: 1 (default) is the function that called `error`, 2 is its caller, usually the right one for argument checks.

```lua
local function sqrt_of(n)
  if type(n) ~= "number" or n < 0 then
    error("sqrt_of needs a non-negative number", 2)
  end
  return math.sqrt(n)
end

print(pcall(sqrt_of, 9))   -- true 3.0
print(pcall(sqrt_of, -1))  -- false ...: sqrt_of needs a non-negative number
```

## Tracebacks

An uncaught error prints `file:line: message`, then `stack traceback:` with the newest call first. `xpcall(f, debug.traceback)` catches the error and keeps the traceback as text, useful for logging.

```lua
local ok, trace = xpcall(function() error("boom") end, debug.traceback)
print(ok, trace:match("^[^\n]+")) -- false, then the first line of the trace
```

## Coroutines

A coroutine is a function that can pause with `coroutine.yield` and resume later where it left off. `coroutine.wrap` returns a function that resumes it each time it is called, which makes simple generators.

```lua
local function evens(limit)
  return coroutine.wrap(function()
    for n = 2, limit, 2 do coroutine.yield(n) end
  end)
end

for n in evens(8) do io.write(n, " ") end
print()
```

Teach: coroutines are cooperative, not threads; nothing runs in parallel. In Neovim, async APIs (`vim.system`, timers, LSP requests) take callbacks, and errors inside a callback show in `:messages` rather than at the caller.
