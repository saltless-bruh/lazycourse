-- :TutorTour (wayfinding spec 2026-11-08 §8.3): one practice file, steps checked here by code, progress told to
-- the tutor with a `tour` payload. The tutor (the model) only explains; it never passes a step.
local M = {}

--- Final review I1: true only while this Neovim runs the tour (start() attached its checks). A "running" state.json
--- left by a Neovim that quit mid-tour is resumed by :TutorTour, never announced or advanced on its own.
M.active = false

local here = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":p:h")
local STEPS_FILE = vim.fs.normalize(here .. "/../../tour/steps.lua")
local NS = vim.api.nvim_create_namespace("tutor.tour")
local GROUP = "tutor-tour"

local steps_cache
--- The tour's steps (nvim-tutor/tour/steps.lua).
function M.steps()
  steps_cache = steps_cache or dofile(STEPS_FILE)
  return steps_cache
end

--- ~/lazycourse/.tour, read from $HOME each time (tests move HOME).
function M.dir() return vim.env.HOME .. "/lazycourse/.tour" end
local function file(name) return M.dir() .. "/" .. name end

--- { step, status = "running"|"done"|"off" } from state.json; a fresh tour is step 1, off.
function M.state()
  local f = io.open(file("state.json"), "r")
  if not f then return { step = 1, status = "off" } end
  local ok, st = pcall(vim.json.decode, f:read("*a"))
  f:close()
  if not ok or type(st) ~= "table" or type(st.step) ~= "number" then return { step = 1, status = "off" } end
  return st
end

local function save(st)
  vim.fn.mkdir(M.dir(), "p")
  local f = assert(io.open(file("state.json"), "w"))
  f:write(vim.json.encode({ step = st.step, status = st.status }))
  f:close()
end

local function tell(st)
  local total = #M.steps()
  local n = math.min(st.step, total)
  require("tutor").notify_tutor({ kind = "tour", step = n, total = total, title = M.steps()[n].title, status = st.status })
end

local function header(n) return ("## %d/%d  %s"):format(n, #M.steps(), M.steps()[n].title) end

--- The practice file's text: every step, each practice block between >>> and <<<.
function M.render()
  local out = {
    "lazycourse tour — Neovim first, then the tutor. Work down this file: each step gets a ✓ when it is done.",
    "Part 1 is adapted from Neovim's own tutor (Pierce, Ware, Moolenaar, Morales, Nesbitt; Vim license).",
  }
  for n, s in ipairs(M.steps()) do
    vim.list_extend(out, { "", header(n) })
    vim.list_extend(out, s.text)
    if s.practice then
      vim.list_extend(out, { "", ">>>" })
      vim.list_extend(out, s.practice)
      table.insert(out, "<<<")
    end
  end
  return out
end

local function write(name, lines, force)
  if not force and vim.fn.filereadable(file(name)) == 1 then return end
  vim.fn.writefile(lines, file(name))
end

local function write_files(restart)
  vim.fn.mkdir(M.dir(), "p")
  write("tour.txt", M.render(), restart)
  write("notes.txt", { "You opened notes.txt. Press Ctrl-o to go back to the tour." })
  write("hello.lua", {
    'io.write("What is your name? ")',
    "local name = io.read()",
    'print("Hello, " .. (name or "you") .. "! Your program ran.")',
  })
  write("README.md", { "---", "run: nvim -l hello.lua", "language: lua", "---", "# Tour practice", "",
    "The tour's practice folder: hello.lua is what :TutorRun runs." })
end

local function tour_buf()
  local b = vim.fn.bufnr(file("tour.txt"))
  return b > 0 and vim.api.nvim_buf_is_loaded(b) and b or nil
end

local function find(buf, pat)
  for i, l in ipairs(vim.api.nvim_buf_get_lines(buf, 0, -1, false)) do
    if vim.startswith(l, pat) then return i end
  end
end

--- 1-based lines of step n's >>> and <<< markers in `buf`, or nil.
local function block(buf, n)
  local h = find(buf, ("## %d/"):format(n))
  if not h then return nil end
  local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
  local s
  for i = h + 1, #lines do
    if lines[i]:match("^## %d+/") then return nil end
    if lines[i] == ">>>" and not s then s = i end
    if lines[i] == "<<<" and s then return s, i end
  end
end

local function mark(buf, n, ok)
  local s = block(buf, n)
  if not s then return end
  vim.api.nvim_buf_clear_namespace(buf, NS, s, s + 1)
  vim.api.nvim_buf_set_extmark(buf, NS, s, 0, { sign_text = ok and "✓" or "✗", sign_hl_group = ok and "DiagnosticOk" or "DiagnosticError" })
end

local function pass(st)
  local buf = tour_buf()
  if buf then mark(buf, st.step, true) end
  local done_title = M.steps()[st.step].title
  st.step = st.step + 1
  if st.step > #M.steps() then
    st.step, st.status = #M.steps(), "done"
    M.active = false
    pcall(vim.api.nvim_del_augroup_by_name, GROUP)
  end
  save(st)
  tell(st)
  vim.notify(st.status == "done" and "[tutor] ✓ tour done — tell the tutor what you'd like to learn"
    or ("[tutor] ✓ %s — next: step %d"):format(done_title, st.step), vim.log.levels.INFO)
end

--- Check the current step's practice lines (on every edit of tour.txt).
function M.check_lines()
  if not M.active then return end
  local st, buf = M.state(), tour_buf()
  if st.status ~= "running" or not buf then return end
  local c = M.steps()[st.step].check
  if c.kind ~= "lines" then return end
  local s, e = block(buf, st.step)
  if not s then return end
  local got = vim.api.nvim_buf_get_lines(buf, s, e - 1, false)
  local ok = #got == #c.expect
  for i = 1, #c.expect do ok = ok and vim.trim(got[i] or "") == c.expect[i] end
  mark(buf, st.step, ok)
  if ok then pass(st) end
end

--- An editor event (Part 1: undo, written, searched, opened; Part 2 adds the pane's). Passes only its own step.
function M.event(name)
  if not M.active then return end
  local st = M.state()
  if st.status ~= "running" then return end
  local c = M.steps()[st.step].check
  if c.kind == "event" and c.name == name then pass(st) end
end

local function attach(buf)
  local g = vim.api.nvim_create_augroup(GROUP, { clear = true })
  vim.api.nvim_create_autocmd({ "TextChanged", "TextChangedI" }, { group = g, buffer = buf, callback = function()
    local ut = vim.fn.undotree()
    if ut.seq_cur < ut.seq_last then M.event("undo") end
    M.check_lines()
  end })
  vim.api.nvim_create_autocmd("BufWritePost", { group = g, buffer = buf, callback = function() M.event("written") end })
  vim.api.nvim_create_autocmd("CmdlineLeave", { group = g, callback = function()
    if vim.fn.getcmdtype() == "/" and not vim.v.event.abort then M.event("searched") end
  end })
  vim.api.nvim_create_autocmd("BufEnter", { group = g, pattern = M.dir() .. "/*", callback = function(a)
    local name = vim.fs.basename(a.file)
    if name == "hello.lua" then M.practice_error(a.buf) end
    if name ~= "tour.txt" then M.event("opened") end
  end })
  -- Part 2: the tutor pane, the run split.
  local function in_pane()
    local t = require("tutor").state.term
    return t and t:bufnr() == vim.api.nvim_get_current_buf()
  end
  vim.api.nvim_create_autocmd("TermEnter", { group = g, callback = function() if in_pane() then M.event("pane_open") end end })
  vim.api.nvim_create_autocmd("TermLeave", { group = g, callback = function() if in_pane() then M.event("pane_left") end end })
  vim.api.nvim_create_autocmd("WinEnter", { group = g, callback = function()
    if vim.bo.buftype == "" then M.event("editor_back") end
  end })
  vim.api.nvim_create_autocmd("TermClose", { group = g, callback = function(a)
    if vim.b[a.buf].tutor_run then M.event("run_done") end
  end })
  vim.api.nvim_create_autocmd("WinClosed", { group = g, callback = function(a)
    local w = tonumber(a.match)
    local ok, b = pcall(vim.api.nvim_win_get_buf, w)
    if ok and (vim.b[b].tutor_run or vim.w[w].tutor_run) then M.event("run_closed") end
  end })
end

local ERR_NS = vim.api.nvim_create_namespace("tutor.tour.error")
--- The ask-error step's own error mark on hello.lua line 2, so it never depends on a language server.
function M.practice_error(buf)
  local st = M.state()
  if st.status ~= "running" or M.steps()[st.step].check.name ~= "asked_error" then return end
  vim.diagnostic.set(ERR_NS, buf, { {
    lnum = 1, col = 0, severity = vim.diagnostic.severity.ERROR, source = "tour",
    message = "practice error from the tour: press <leader>te to ask the tutor about this line",
  } })
end

--- Tell the tutor a running tour's step again (the Pi that the tour's folder switch restarted missed it).
function M.announce()
  if not M.active then return end
  local st = M.state()
  if st.status == "running" then tell(st) end
end

--- Start or resume the tour (`restart` starts over at step 1); opens tour.txt at the current step.
---@param o? { restart?: boolean }
function M.start(o)
  o = o or {}
  local st = M.state()
  local restart = o.restart or st.status == "done"
  if restart then st.step = 1 end
  st.status = "running"
  write_files(restart)
  save(st)
  -- 2026-11-09 live: a swap file left by a killed Neovim stopped the tour at "Found a swap file". The tour's files are
  -- generated practice text, so they always open for editing without asking.
  vim.api.nvim_create_autocmd("SwapExists", {
    group = vim.api.nvim_create_augroup("tutor-tour-swap", { clear = true }),
    pattern = M.dir() .. "/*",
    callback = function() vim.v.swapchoice = "e" end,
  })
  local tutor = require("tutor")
  if not (tutor.state.term and tutor.switch(M.dir(), "tour.txt")) then pcall(vim.cmd.edit, vim.fn.fnameescape(file("tour.txt"))) end
  -- Final review M2: never fall back to the current buffer — it is the learner's own (restart would wipe its edits).
  local buf = tour_buf()
  if not buf then
    vim.notify("[tutor] could not open the tour (" .. file("tour.txt") .. "): save or close the current file, then :TutorTour", vim.log.levels.WARN)
    return
  end
  M.active = true
  if restart then
    vim.api.nvim_buf_call(buf, function() vim.cmd("silent edit!") end)
    vim.api.nvim_buf_clear_namespace(buf, NS, 0, -1)
  end
  attach(buf)
  for n = 1, st.step - 1 do mark(buf, n, true) end
  local h = find(buf, ("## %d/"):format(st.step))
  local win = vim.fn.win_findbuf(buf)[1]
  if win then
    -- The switch restarts the tutor pane and focuses it; the learner starts in the tour, in NORMAL mode.
    vim.api.nvim_set_current_win(win)
    vim.cmd.stopinsert()
    if h then vim.api.nvim_win_set_cursor(win, { h, 0 }) end
  end
  tell(st)
end

--- Stop the tour (`:TutorTour off`); progress is kept for the next :TutorTour.
function M.stop()
  local st = M.state()
  M.active = false
  pcall(vim.api.nvim_del_augroup_by_name, GROUP)
  if st.status == "off" then return end
  st.status = "off"
  save(st)
  tell(st)
end

return M
