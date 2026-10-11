local M = {}
local Term = {}
Term.__index = Term

---@param opts {cmd: string[], cwd: string, width: number}
function M.new(opts)
  return setmetatable({ opts = opts, buf = nil, win = nil, job = nil }, Term)
end

function Term:_spawn()
  self.buf = vim.api.nvim_create_buf(false, false)
  vim.bo[self.buf].bufhidden = "hide"
  vim.api.nvim_win_set_buf(self.win, self.buf)
  local job
  -- jobstart{term=true} attaches to the *current* window's buffer, so run it
  -- with the pane window current, never from the editor window.
  vim.api.nvim_win_call(self.win, function()
    job = vim.fn.jobstart(self.opts.cmd, {
      term = true,
      cwd = self.opts.cwd,
      on_exit = function(id, code)
        -- An older job's exit must not clear a newer job.
        if self.job == id then self.job = nil end
        vim.schedule(function()
          if self.buf and vim.api.nvim_buf_is_valid(self.buf) then
            vim.b[self.buf].tutor_exit_code = code
          end
        end)
      end,
    })
  end)
  self.job = job
  vim.b[self.buf].tutor_term = true
  vim.keymap.set("t", "<Esc><Esc>", [[<C-\><C-n>]], { buffer = self.buf })
end

function Term:show()
  if self:is_visible() then return end
  vim.cmd("botright vsplit")
  self.win = vim.api.nvim_get_current_win()
  vim.api.nvim_win_set_width(self.win, math.floor(vim.o.columns * self.opts.width))
  vim.wo[self.win].number = false
  vim.wo[self.win].relativenumber = false
  vim.wo[self.win].signcolumn = "no"
  vim.wo[self.win].winfixwidth = true
  if self.buf and vim.api.nvim_buf_is_valid(self.buf) then
    vim.api.nvim_win_set_buf(self.win, self.buf)
  else
    self:_spawn()
  end
  if self:is_running() then pcall(vim.cmd, "startinsert") end
end

function Term:hide()
  if self.win and vim.api.nvim_win_is_valid(self.win) then
    vim.api.nvim_win_close(self.win, true)
  end
  self.win = nil
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
  self:_spawn()
  if old and vim.api.nvim_buf_is_valid(old) then
    vim.api.nvim_buf_delete(old, { force = true })
  end
end

return M
