// Installed into Neovim with nvim_exec_lua(PUSH_LUA, [chan, { root, idle_ms, churn_edits }]).
// Everything here runs inside Neovim; keep it dependency-free.
export const PUSH_LUA = String.raw`
local chan, opts = ...
if _G.__pi_tutor_timer then pcall(function() _G.__pi_tutor_timer:stop(); _G.__pi_tutor_timer:close() end) end
local g = vim.api.nvim_create_augroup("PiTutorPush", { clear = true })
local function path_of(buf) return vim.api.nvim_buf_get_name(buf) end
-- opts.root is a resolved real path ending without a slash. Resolve the buffer
-- path too so symlinked checkouts match, and require a "/" boundary so a
-- sibling like "proj-secrets" never counts as inside "proj".
local root_prefix = opts.root .. "/"
local function in_root(buf)
  local p = path_of(buf)
  if p == "" then return false end
  local r = vim.fn.resolve(p)
  return vim.startswith(r, root_prefix) or vim.startswith(p, root_prefix)
end
local function notify(payload)
  local ok = pcall(vim.rpcnotify, chan, "tutor", payload)
  if not ok then vim.g.tutor_chan = nil end
end
vim.g.tutor_chan = chan

vim.api.nvim_create_autocmd("DiagnosticChanged", { group = g, callback = function(a)
  if not in_root(a.buf) then return end
  local errors, warnings, first = 0, 0, nil
  for _, d in ipairs(vim.diagnostic.get(a.buf, { severity = { min = vim.diagnostic.severity.WARN } })) do
    if d.severity == vim.diagnostic.severity.ERROR then
      errors = errors + 1
      if not first then first = { line = d.lnum + 1, msg = d.message } end
    else
      warnings = warnings + 1
    end
  end
  notify({ kind = "diagnostics", buf = a.buf, path = path_of(a.buf), errors = errors, warnings = warnings, first = first })
end })

local last_change = vim.uv.now()
local churn = {}
vim.api.nvim_create_autocmd({ "TextChanged", "TextChangedI" }, { group = g, callback = function(a)
  last_change = vim.uv.now()
  if not in_root(a.buf) then return end
  local line = vim.api.nvim_win_get_cursor(0)[1]
  local region = math.floor((line - 1) / 20)
  local key = a.buf .. ":" .. region
  churn[key] = (churn[key] or 0) + 1
  if churn[key] >= opts.churn_edits then
    churn[key] = 0
    notify({ kind = "churn", buf = a.buf, path = path_of(a.buf), region = { region * 20 + 1, region * 20 + 20 }, edits = opts.churn_edits })
  end
end })
vim.api.nvim_create_autocmd("DiagnosticChanged", { group = g, callback = function() churn = {} end })

local timer = vim.uv.new_timer()
_G.__pi_tutor_timer = timer
timer:start(opts.idle_ms, opts.idle_ms, vim.schedule_wrap(function()
  local buf = vim.api.nvim_get_current_buf()
  if not in_root(buf) then return end
  local since = vim.uv.now() - last_change
  if since >= opts.idle_ms then
    notify({ kind = "idle", buf = buf, path = path_of(buf), line = vim.api.nvim_win_get_cursor(0)[1], since_ms = since })
  end
end))
return chan
`;
