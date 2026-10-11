local Split = require("nui.split")
local Input = require("nui.input")

local M = {}
local Panel = {}
Panel.__index = Panel

---@param opts {on_submit: fun(text: string)}
function M.new(opts)
  local self = setmetatable({
    on_submit = opts.on_submit,
    status = { state = "idle" },
    open = false,
    chat_lines = {},
    reply_open = false,
  }, Panel)
  self.chat_buf = vim.api.nvim_create_buf(false, true)
  vim.bo[self.chat_buf].filetype = "markdown"
  vim.bo[self.chat_buf].buftype = "nofile"
  return self
end

function Panel:_render()
  vim.bo[self.chat_buf].modifiable = true
  vim.api.nvim_buf_set_lines(self.chat_buf, 0, -1, false, self.chat_lines)
  vim.bo[self.chat_buf].modifiable = false
  if self.split and self.split.winid and vim.api.nvim_win_is_valid(self.split.winid) then
    vim.api.nvim_win_set_cursor(self.split.winid, { math.max(#self.chat_lines, 1), 0 })
    vim.wo[self.split.winid].winbar = self:status_line()
  end
end

function Panel:lines() return vim.deepcopy(self.chat_lines) end

function Panel:status_line()
  local s = self.status
  local parts = {}
  if s.language then table.insert(parts, s.language) end
  if s.level then table.insert(parts, "lvl " .. s.level) end
  if s.rung then table.insert(parts, "rung " .. s.rung) end
  if s.task then table.insert(parts, s.task) end
  table.insert(parts, s.state or "idle")
  return table.concat(parts, " · ")
end

function Panel:set_status(fields)
  for k, v in pairs(fields) do self.status[k] = v end
  self:_render()
end

function Panel:append_user(text)
  for i, l in ipairs(vim.split(text, "\n", { plain = true })) do
    table.insert(self.chat_lines, (i == 1 and "> " or "  ") .. l)
  end
  table.insert(self.chat_lines, "")
  self.reply_open = false
  self:_render()
end

function Panel:append_delta(text)
  if not self.reply_open then
    table.insert(self.chat_lines, "")
    self.reply_open = true
  end
  local pieces = vim.split(text, "\n", { plain = true })
  self.chat_lines[#self.chat_lines] = self.chat_lines[#self.chat_lines] .. pieces[1]
  for i = 2, #pieces do table.insert(self.chat_lines, pieces[i]) end
  self:_render()
end

function Panel:end_reply()
  if self.reply_open then
    table.insert(self.chat_lines, "")
    self.reply_open = false
  end
  self.status.state = "idle"
  self:_render()
end

function Panel:submit(text)
  if text == nil or text:match("^%s*$") then return end
  self.on_submit(text)
end

function Panel:is_open() return self.open end

function Panel:toggle()
  if self.open then
    if self.input then self.input:unmount(); self.input = nil end
    if self.split then self.split:unmount(); self.split = nil end
    self.open = false
    return
  end
  self.split = Split({ relative = "editor", position = "right", size = "40%", bufnr = self.chat_buf })
  self.split:mount()
  self.input = Input({
    relative = "editor",
    position = { row = "100%", col = "100%" },
    size = { width = "40%", height = 1 },
    border = { style = "single", text = { top = " tutor ", top_align = "left" } },
  }, {
    prompt = "› ",
    on_submit = function(value) self:submit(value) end,
  })
  self.input:mount()
  self.input:map("n", "<Esc>", function() self:toggle() end, { noremap = true })
  self.open = true
  self:_render()
end

return M
