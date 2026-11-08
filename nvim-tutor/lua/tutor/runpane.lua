-- The learner's run (learner-session fixes, spec §1): the project's command in a visible terminal split below the
-- editor, so the learner sees the output and types input there. When the program ends, the split's last lines go to
-- the tutor; a run stopped by the learner (or by a restart) reports nothing. One run at a time.
local M = {}

local current = nil ---@type { buf: integer, win: integer, job: integer|nil, stopped: boolean }|nil

local function close_win(win)
  if win and vim.api.nvim_win_is_valid(win) and #vim.api.nvim_list_wins() > 1 then pcall(vim.api.nvim_win_close, win, true) end
end

--- The last `n` lines the split shows, without the terminal's own "[Process exited N]" line and trailing blanks.
local function tail(buf, n)
  if not vim.api.nvim_buf_is_valid(buf) then return {} end
  local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
  while #lines > 0 and (lines[#lines]:match("^%s*$") or lines[#lines]:match("^%[Process exited")) do lines[#lines] = nil end
  local from = math.max(1, #lines - n + 1)
  return vim.list_slice(lines, from, #lines)
end

function M.running()
  return current ~= nil and current.job ~= nil
end

--- Stop the running program; its exit is not reported.
function M.stop()
  local c = current
  if not c then return end
  current = nil
  c.stopped = true
  if c.job then pcall(vim.fn.jobstop, c.job) end
end

---@param argv string|string[]
---@param cwd string
---@param on_exit fun(code: integer, lines: string[], job: integer)  not called for a stopped run
---@param on_end fun(job: integer)  called whenever the job ends, stopped or not
---@return { buf: integer, win: integer, job: integer|nil }|nil, string|nil
function M.start(argv, cwd, on_exit, on_end)
  M.stop()
  local back = vim.api.nvim_get_current_win()
  -- One run window: a finished run's split is reused, so restarts never pile up windows; with no room for a
  -- split (E36), the run gets its own tab.
  local win
  for _, w in ipairs(vim.api.nvim_list_wins()) do
    -- Review minor: the window is marked too, so it is found after the learner opened a file in it.
    if vim.w[w].tutor_run or vim.b[vim.api.nvim_win_get_buf(w)].tutor_run then win = w end
  end
  if win then
    vim.api.nvim_set_current_win(win)
  elseif not pcall(vim.cmd, "botright 12split") then
    vim.cmd("tabnew")
  end
  win = vim.api.nvim_get_current_win()
  local old = vim.api.nvim_win_get_buf(win)
  local buf = vim.api.nvim_create_buf(false, true)
  -- Minor M6: closing the split wipes the run's buffer (a reused window's old buffer goes the same way).
  vim.bo[buf].bufhidden = "wipe"
  vim.api.nvim_win_set_buf(win, buf)
  if vim.api.nvim_buf_is_valid(old) and vim.b[old].tutor_run and old ~= buf then pcall(vim.api.nvim_buf_delete, old, { force = true }) end
  vim.b[buf].tutor_run = true
  vim.w[win].tutor_run = true
  vim.wo[win].sidescrolloff = 0 -- re-run topic 5: no sideways scroll that cuts the output's left edge
  local c = { buf = buf, win = win, job = nil, stopped = false }
  -- jobstart{term=true} attaches to the current window's buffer (CLAUDE.md): run it inside the split.
  local ok, job = pcall(vim.api.nvim_win_call, win, function()
    return vim.fn.jobstart(argv, {
      term = true,
      cwd = cwd,
      on_exit = function(id, code)
        c.job = nil
        if current == c then current = nil end
        vim.schedule(function()
          on_end(id)
          if not c.stopped then on_exit(code, tail(buf, 60), id) end
          -- Review minor: a run buffer no window shows (a file was opened in the split) is wiped once it ends;
          -- 'bufhidden' cannot wipe a terminal whose job still ran.
          if vim.api.nvim_buf_is_valid(buf) and #vim.fn.win_findbuf(buf) == 0 then pcall(vim.api.nvim_buf_delete, buf, { force = true }) end
        end)
      end,
    })
  end)
  if not ok or type(job) ~= "number" or job <= 0 then
    close_win(win)
    pcall(vim.api.nvim_set_current_win, back)
    return nil, tostring(job)
  end
  c.job = job
  current = c
  -- Closing the split stops a program still running (Review Focus 2); `q` closes it once the program ended.
  vim.api.nvim_create_autocmd("WinClosed", {
    pattern = tostring(win),
    once = true,
    callback = function()
      if c.job then
        vim.notify("[tutor] run stopped", vim.log.levels.INFO) -- minor M4
        c.stopped = true
        if current == c then current = nil end
        pcall(vim.fn.jobstop, c.job)
      end
    end,
  })
  vim.keymap.set("n", "q", function()
    if not c.job then close_win(win) end
  end, { buffer = buf, desc = "close the finished run" })
  vim.cmd("startinsert")
  return c
end

return M
