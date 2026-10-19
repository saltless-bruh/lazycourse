---
concept: files-io
title: "Reading and writing files"
tags: [functions]
source: lua/lua 8cb93ba manual io.lines, io.open (Lua licence); exercises ours
requires: [basics]
order: 10.6
---

From the Lua reference manual (excerpts, markup converted):

**`io.lines`**

Opens the given file name in read mode
and returns an iterator function that
works like `file:lines(...)` over the opened file.
When the iterator function fails to read any value,
it automatically closes the file.
Besides the iterator function,
`io.lines` returns three other values:
two `nil` values as placeholders,
plus the created file handle.
Therefore, when used in a generic `for` loop,
the file is closed also if the loop is interrupted by an
error or a `break`.

The call `io.lines()` (with no file name) is equivalent
to `io.input():lines("l")`;
that is, it iterates over the lines of the default input file.
In this case, the iterator does not close the file when the loop ends.

In case of errors opening the file,
this function raises the error,
instead of returning an error code.

**`io.open`**

This function opens a file,
in the mode specified in the string `mode`.
In case of success,
it returns a new file handle.

The `mode` string can be any of the following: The mode string can be `"r"` (read, the default), `"w"` (write) or `"a"` (append), among others.

Source: [Lua 5.4 manual, io library](https://github.com/lua/lua/blob/8cb93bada561977eb370819e39d7d644e5fd0a3f/manual/manual.of), Lua licence (licenses/lua-manual/), excerpt.
