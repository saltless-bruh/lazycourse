---
concept: input
title: "Reading what the user types"
tags: [functions]
source: lua/lua 8cb93ba manual io.read (Lua licence); exercises ours
requires: [basics, numbers]
order: 10.5
---

From the Lua reference manual (excerpt, markup converted):

**`io.read`**

Equivalent to `io.input():read(...)`.

`io.read("l")` reads one line (without the newline) and returns `nil` at the end of the input. In the exercise the function receives `read` instead of calling `io.read` directly, so the tests can type for you.

Source: [Lua 5.4 manual, io.read](https://github.com/lua/lua/blob/8cb93bada561977eb370819e39d7d644e5fd0a3f/manual/manual.of), Lua licence (licenses/lua-manual/), excerpt.
