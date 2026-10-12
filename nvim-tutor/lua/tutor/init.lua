local term = require("tutor.term")

local M = {}
M.state = { term = nil, run_job = nil }
M._notify_override = nil
local opts = {}

---@param pi_cmd string[]
function M.build_cmd(pi_cmd)
  local cmd = vim.deepcopy(pi_cmd)
  if vim.fs.basename(cmd[1]) == "pi" then
    vim.list_extend(cmd, { "--tools", "read,grep,find,ls" })
  end
  return cmd
end

local function check_version()
  if opts.check_version == false then return end
  local ok, out = pcall(vim.fn.system, { opts.pi_cmd[1], "--version" })
  local v = ok and vim.trim(out) or ""
  if not v:match("^1%.") then
    vim.notify(("[tutor] pi %s found, expected 1.x"):format(v == "" and "not found" or v), vim.log.levels.WARN)
  end
end

--- Send a payload to the pi-tutor extension if it is connected.
---@param payload table
---@return boolean sent
function M.notify_tutor(payload)
  if M._notify_override then M._notify_override(payload); return true end
  local chan = vim.g.tutor_chan
  if not chan then return false end
  local ok = pcall(vim.rpcnotify, chan, "tutor", payload)
  if not ok then vim.g.tutor_chan = nil end
  return ok
end

function M.run()
  if M.state.run_job then
    vim.notify("[tutor] a run is already running", vim.log.levels.WARN)
    return
  end
  local cmd = opts.run_cmd
  if not cmd then
    vim.notify("[tutor] no run_cmd configured", vim.log.levels.WARN)
    return
  end
  local out, err = {}, {}
  M.state.run_job = vim.fn.jobstart(cmd, {
    cwd = opts.cwd,
    stdout_buffered = true, stderr_buffered = true,
    on_stdout = function(_, d) out = d end,
    on_stderr = function(_, d) err = d end,
    on_exit = function(_, code)
      M.state.run_job = nil
      local payload = { kind = "run_output", cmd = cmd, code = code,
        stdout = table.concat(out, "\n"), stderr = table.concat(err, "\n") }
      if not M.notify_tutor(payload) then
        vim.notify("[tutor] run finished (exit " .. code .. ") but pi-tutor is not connected", vim.log.levels.INFO)
      end
    end,
  })
end

local function slash(text)
  return function(a)
    local t = M.state.term
    if not t:is_visible() then t:show() end
    local line = text .. (a and a.args ~= "" and (" " .. a.args) or "")
    if not t:send(line) then vim.notify("[tutor] pi is not running; :TutorRestart", vim.log.levels.WARN) end
  end
end

function M.setup(user_opts)
  opts = vim.tbl_deep_extend("force", {
    pi_cmd = { "pi" }, cwd = vim.fn.getcwd(), width = 0.45, run_cmd = nil, check_version = true,
  }, user_opts or {})
  check_version()
  -- PI_TUTOR=1 tells pi-tutor this Pi is the tutor; plain `pi` elsewhere stays untouched.
  M.state.term = term.new({ cmd = M.build_cmd(opts.pi_cmd), cwd = opts.cwd, width = opts.width, env = { PI_TUTOR = "1" } })
  M.state.run_job = nil
  local cmd = vim.api.nvim_create_user_command
  cmd("Tutor", function() M.state.term:toggle() end, {})
  cmd("TutorRestart", function() M.state.term:restart() end, {})
  cmd("TutorRun", M.run, {})
  cmd("TutorStart", slash("/tutor-start"), {})
  cmd("TutorLevel", slash("/tutor-level"), { nargs = "?" })
  cmd("TutorLearn", slash("/tutor-learn"), {})
end

return M
