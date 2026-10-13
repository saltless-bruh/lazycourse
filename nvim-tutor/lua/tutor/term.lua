local M = {}
local Term = {}
Term.__index = Term

---@param opts {cmd: string[], cwd: string, width: number, env?: table<string,string>}
function M.new(opts)
  return setmetatable({ opts = opts, buf = nil, win = nil, job = nil }, Term)
end

local function has(err, code) return tostring(err):find(code, 1, true) ~= nil end

--- True when textlock (E565) forbids window changes right now, e.g. inside an <expr> mapping or a
--- lazy-load from a keymap. Probed with a no-op: making the current window current again.
function M.textlocked()
  local ok, err = pcall(vim.api.nvim_set_current_win, vim.api.nvim_get_current_win())
  return not ok and has(err, "E565")
end

--- Under textlock, run self:<name>(...) on the event loop instead and return true (CLAUDE.md rule).
local function deferred(self, name, ...)
  if not M.textlocked() then return false end
  local args = { ... }
  vim.schedule(function() self[name](self, unpack(args)) end)
  return true
end

--- Start Pi in the pane window. On failure (pi not executable: E475) remove the new buffer and the
--- split, so no dead pane is left for the next :Tutor to reuse, and say why.
---@return boolean ok
function Term:_spawn()
  local buf = vim.api.nvim_create_buf(false, false)
  self.buf = buf
  vim.bo[buf].bufhidden = "hide"
  vim.api.nvim_win_set_buf(self.win, buf)
  local ok, job
  -- jobstart{term=true} attaches to the *current* window's buffer, so run it
  -- with the pane window current, never from the editor window.
  vim.api.nvim_win_call(self.win, function()
    ok, job = pcall(vim.fn.jobstart, self.opts.cmd, {
      term = true,
      cwd = self.opts.cwd,
      env = self.opts.env,
      on_exit = function(id, code)
        -- An older job's exit must not clear a newer job.
        if self.job == id then self.job = nil end
        -- Nor mark the buffer that replaced it on restart: this job's own buffer only.
        vim.schedule(function()
          if vim.api.nvim_buf_is_valid(buf) then vim.b[buf].tutor_exit_code = code end
        end)
      end,
    })
  end)
  if not ok or type(job) ~= "number" or job <= 0 then
    self.job = nil
    self.buf = nil
    if self.win and vim.api.nvim_win_is_valid(self.win) then pcall(vim.api.nvim_win_close, self.win, true) end
    self.win = nil
    if vim.api.nvim_buf_is_valid(buf) then pcall(vim.api.nvim_buf_delete, buf, { force = true }) end
    vim.notify("[tutor] could not start " .. tostring(self.opts.cmd[1]) .. ": " .. tostring(job), vim.log.levels.ERROR)
    return false
  end
  self.job = job
  vim.b[buf].tutor_term = true
  vim.keymap.set("t", "<Esc><Esc>", [[<C-\><C-n>]], { buffer = buf })
  return true
end

function Term:show()
  if self:is_visible() then return end
  if deferred(self, "show") then return end
  vim.cmd("botright vsplit")
  self.win = vim.api.nvim_get_current_win()
  vim.api.nvim_win_set_width(self.win, math.floor(vim.o.columns * self.opts.width))
  vim.wo[self.win].number = false
  vim.wo[self.win].relativenumber = false
  vim.wo[self.win].signcolumn = "no"
  vim.wo[self.win].winfixwidth = true
  if self.buf and vim.api.nvim_buf_is_valid(self.buf) then
    vim.api.nvim_win_set_buf(self.win, self.buf)
  elseif not self:_spawn() then
    return
  end
  if self:is_running() then pcall(vim.cmd, "startinsert") end
end

function Term:hide()
  if self.win and vim.api.nvim_win_is_valid(self.win) then
    if deferred(self, "hide") then return end
    local ok, err = pcall(vim.api.nvim_win_close, self.win, true)
    if not ok then
      if has(err, "E565") then vim.schedule(function() self:hide() end); return end
      -- The last window cannot be closed (E444; E5601 when only floating windows would remain):
      -- show an empty buffer there instead. Any other error is real.
      if not (has(err, "E444") or has(err, "E5601")) then error(err, 0) end
      vim.api.nvim_win_call(self.win, function() vim.cmd("enew") end)
    end
  end
  self.win = nil
end

--- Stop the job, close the pane and wipe its buffer (used when setup() runs again).
function Term:close()
  if self.job then vim.fn.jobstop(self.job); self.job = nil end
  self:hide()
  if self.buf and vim.api.nvim_buf_is_valid(self.buf) then vim.api.nvim_buf_delete(self.buf, { force = true }) end
  self.buf = nil
end

function Term:toggle()
  if self:is_visible() then self:hide() else self:show() end
end

function Term:is_visible()
  return self.win ~= nil and vim.api.nvim_win_is_valid(self.win)
end

function Term:is_running() return self.job ~= nil end
function Term:job_id() return self.job end
function Term:bufnr() return self.buf end

function Term:send(text)
  if not self:is_running() then return false end
  vim.api.nvim_chan_send(self.job, text .. "\r")
  return true
end

function Term:restart()
  if deferred(self, "restart") then return end
  if self.job then
    vim.fn.jobstop(self.job)
    self.job = nil
  end
  local old = self.buf
  if not self:is_visible() then
    -- show() spawns when no buffer exists yet; that is the restart.
    self:show()
    if old == nil then return end
  end
  self:_spawn() -- on failure it already removed the pane and said why; the old buffer goes either way
  if old and vim.api.nvim_buf_is_valid(old) then
    vim.api.nvim_buf_delete(old, { force = true })
  end
end

return M
