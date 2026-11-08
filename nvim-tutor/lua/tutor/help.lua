-- Wayfinding spec 2026-11-08 §8.2: every command in its own tab, split by where it is typed, each fully explained.
-- `vim.g.tutor_now` = { where, next } is set by the tutor (pi-tutor's paint) so the tab starts with what fits now.
local commands = require("tutor.commands")
local M = {}

local WIDTH = 78

local function wrap(text, indent)
  local out, line = {}, indent
  for word in text:gmatch("%S+") do
    if #line + #word + 1 > WIDTH and line ~= indent then
      table.insert(out, line)
      line = indent
    end
    line = line == indent and (indent .. word) or (line .. " " .. word)
  end
  if line ~= indent then table.insert(out, line) end
  return out
end

local function entry(lines, c)
  local head = "  " .. c.name .. (c.args and (" " .. c.args) or "")
  if c.twin then head = head .. "   (same as " .. c.twin .. ")" end
  if c.context then head = head .. "   (in the " .. c.context .. ")" end
  table.insert(lines, head)
  vim.list_extend(lines, wrap(c.help ~= "" and c.help or c["for"], "      "))
end

local function section(lines, title, list)
  if #list == 0 then return end
  table.insert(lines, "")
  table.insert(lines, title)
  table.insert(lines, string.rep("─", #title))
  for _, c in ipairs(list) do entry(lines, c) end
end

--- The tab's lines, from the command list and `now` (may be nil).
function M.lines(now)
  local all = vim.tbl_filter(function(c) return not c.planned end, commands.load())
  local lines = { "lazycourse help — q closes this tab", "" }
  if now and now.next then table.insert(lines, "Now: " .. now.next:gsub("^next: ", "")) end
  if now and now.where then
    section(lines, "Useful now", vim.tbl_filter(function(c) return vim.tbl_contains(c.when, now.where) end, all))
  end
  section(lines, "In the editor  (type these in your code window)", vim.tbl_filter(function(c)
    return (c.where == "editor" or c.where == "key") and c.group ~= "moving"
  end, all))
  section(lines, "In the tutor pane  (type these where you talk to the tutor)", vim.tbl_filter(function(c)
    return c.where == "pane"
  end, all))
  section(lines, "Moving around", vim.tbl_filter(function(c) return c.group == "moving" end, all))
  return lines
end

local tab_buf

--- Opens the help tab (or goes to it), returns its buffer.
function M.open()
  if tab_buf and vim.api.nvim_buf_is_valid(tab_buf) then
    for _, tab in ipairs(vim.api.nvim_list_tabpages()) do
      for _, w in ipairs(vim.api.nvim_tabpage_list_wins(tab)) do
        if vim.api.nvim_win_get_buf(w) == tab_buf then
          vim.api.nvim_set_current_tabpage(tab)
          vim.api.nvim_set_current_win(w)
          return tab_buf
        end
      end
    end
  end
  vim.cmd("tabnew")
  local buf = vim.api.nvim_get_current_buf()
  vim.bo[buf].buftype = "nofile"
  vim.bo[buf].bufhidden = "wipe"
  vim.bo[buf].swapfile = false
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, M.lines(vim.g.tutor_now))
  vim.bo[buf].modifiable = false
  vim.bo[buf].filetype = "tutorhelp"
  pcall(vim.api.nvim_buf_set_name, buf, "tutor-help")
  vim.keymap.set("n", "q", "<Cmd>tabclose<CR>", { buffer = buf, nowait = true, desc = "close the tutor help" })
  tab_buf = buf
  return buf
end

return M
