local rpc = require("tutor.rpc")
local panel_mod = require("tutor.panel")

local M = {}
M.state = { client = nil, panel = nil, respawned = false }
local opts = {}

local SIGNAL_PREFIX = "@@tutor-signal "

---@param pi_cmd string[]
---@return string[]
function M.build_cmd(pi_cmd)
  local cmd = vim.deepcopy(pi_cmd)
  if vim.fs.basename(cmd[1]) == "pi" then
    vim.list_extend(cmd, { "--mode", "rpc", "--tools", "read,grep,find,ls" })
  end
  return cmd
end

--- Readiness callback for the get_state round trip. Only moves "starting pi"
--- to "idle"; a prompt sent meanwhile keeps its "waiting" state.
function M._on_ready(resp)
  if resp.success and M.state.panel.status.state == "starting pi" then
    M.state.panel:set_status({ state = "idle" })
  end
end

local function check_version()
  if opts.check_version == false then return end
  local out = vim.fn.system({ opts.pi_cmd[1], "--version" })
  local v = vim.trim(out)
  if not v:match(opts.required_pi) then
    vim.notify(("[tutor] pi %s found, expected %s"):format(v, opts.required_pi), vim.log.levels.WARN)
  end
end

local function on_event(ev)
  local p = M.state.panel
  if ev.type == "message_update" and ev.assistantMessageEvent and ev.assistantMessageEvent.type == "text_delta" then
    p:append_delta(ev.assistantMessageEvent.delta)
  elseif ev.type == "agent_settled" then
    p:end_reply()
  elseif ev.type == "entry_appended" and ev.entry and ev.entry.customType == "tutor_status" then
    local d = ev.entry.data or {}
    if d.kind == "signal_malformed" then
      vim.notify("[tutor] pi-tutor rejected a signal: " .. tostring(d.error), vim.log.levels.WARN)
    end
  end
end

local function spawn()
  M.state.panel:set_status({ state = "starting pi" })
  M.state.client = rpc.new({
    cmd = M.build_cmd(opts.pi_cmd),
    cwd = opts.cwd,
    on_event = on_event,
    on_exit = function(code)
      M.state.panel:set_status({ state = "pi exited (" .. code .. ")" })
    end,
  })
  -- Readiness: Pi does not deliver session_start entries over RPC at startup,
  -- so a successful get_state round trip is the ready signal.
  M.state.client:request({ type = "get_state" }, M._on_ready)
end

local function ensure_alive()
  if M.state.client and M.state.client:is_alive() then return true end
  if M.state.respawned then
    M.state.panel:set_status({ state = "pi dead; :TutorRestart" })
    return false
  end
  M.state.respawned = true
  spawn()
  return true
end

function M.send(text)
  if not ensure_alive() then return end
  M.state.panel:append_user(text)
  M.state.panel:set_status({ state = "waiting" })
  M.state.client:request({ type = "prompt", message = text }, function(resp)
    if not resp.success then
      vim.notify("[tutor] pi rejected prompt: " .. tostring(resp.error), vim.log.levels.ERROR)
      M.state.panel:end_reply()
    elseif resp.data and resp.data.disposition == "handled" then
      M.state.panel:end_reply()
    end
  end)
end

---@param signal table
---@param cb? fun(disposition: string)
function M.send_signal(signal, cb)
  if not ensure_alive() then return end
  local msg = SIGNAL_PREFIX .. vim.json.encode(signal)
  M.state.client:request({ type = "prompt", message = msg }, function(resp)
    local d = resp.data and resp.data.disposition or "error"
    if d ~= "handled" then
      vim.notify("[tutor] signal not handled by pi-tutor: " .. d, vim.log.levels.WARN)
    end
    if cb then cb(d) end
  end)
end

function M.restart()
  if M.state.client then M.state.client:close() end
  M.state.respawned = false
  spawn()
end

function M.setup(user_opts)
  opts = vim.tbl_deep_extend("force", {
    pi_cmd = { "pi" },
    cwd = vim.fn.getcwd(),
    required_pi = "^1%.",
    check_version = true,
  }, user_opts or {})
  if M.state.client then M.state.client:close() end
  M.state.panel = panel_mod.new({ on_submit = M.send })
  M.state.respawned = false
  check_version()
  spawn()
  vim.api.nvim_create_user_command("Tutor", function() M.state.panel:toggle() end, {})
  vim.api.nvim_create_user_command("TutorSend", function(a) M.send(a.args) end, { nargs = "+" })
  vim.api.nvim_create_user_command("TutorRestart", M.restart, {})
  vim.api.nvim_create_autocmd("VimLeavePre", {
    group = vim.api.nvim_create_augroup("TutorLifecycle", { clear = true }),
    callback = function() if M.state.client then M.state.client:close() end end,
  })
end

return M
