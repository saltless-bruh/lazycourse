local term = require("tutor.term")

local M = {}
M.state = { term = nil, run_job = nil }
M._notify_override = nil
local opts = {}

---@param pi_cmd string[]
function M.build_cmd(pi_cmd)
  local cmd = vim.deepcopy(pi_cmd)
  if vim.fs.basename(cmd[1]) == "pi" then
    -- pi-tutor's memory tools (spec 2026-10-13 §7.1); --tools is an allowlist for extension tools too.
    vim.list_extend(cmd, { "--tools", "read,grep,find,ls,tutor_remember,tutor_recall" })
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

local KINDS = { run = true, test = true }

--- The README.md front matter of `dir`: `key: value` lines between a first-line `---` and the
--- next `---` (written by /tutor-start). Missing file, no front matter or an unclosed block: {}.
---@param dir string
---@return table<string, string>
function M.front_matter(dir)
  local ok, lines = pcall(vim.fn.readfile, vim.fs.joinpath(dir, "README.md"), "", 40)
  if not ok or lines[1] ~= "---" then return {} end
  local fm = {}
  for i = 2, #lines do
    if lines[i] == "---" then return fm end
    local k, v = lines[i]:match("^([%w_-]+):%s*(.-)%s*$")
    if k and v ~= "" then fm[k] = v end
  end
  return {}
end

---@param kind? "run"|"test"
function M.run(kind)
  kind = kind or "run"
  if not KINDS[kind] then
    vim.notify("[tutor] usage: :TutorRun [run|test]", vim.log.levels.WARN)
    return
  end
  if M.state.run_job then
    vim.notify("[tutor] a run is already running", vim.log.levels.WARN)
    return
  end
  -- M8: the project's own README names its commands; the plugin option is the fallback.
  local cmd = M.front_matter(opts.cwd)[kind] or opts[kind .. "_cmd"]
  if not cmd then
    vim.notify(("[tutor] no %s command: add `%s:` to README.md's front matter (or the %s_cmd option)"):format(kind, kind, kind), vim.log.levels.WARN)
    return
  end
  -- A string run_cmd runs through 'shell' (jobstart does that); only a list names a program to check.
  -- A relative program path (./run.sh) means the project's, not Neovim's cwd: jobstart checks it
  -- against Neovim's cwd, so it gets the absolute path.
  local argv = cmd
  if type(cmd) == "table" then
    argv = vim.deepcopy(cmd)
    local exe = argv[1]
    if type(exe) == "string" and exe:find("/") and not vim.startswith(exe, "/") and opts.cwd then
      argv[1] = vim.fs.joinpath(opts.cwd, exe)
    end
    if type(argv[1]) ~= "string" or vim.fn.executable(argv[1]) == 0 then
      vim.notify("[tutor] run_cmd is not executable: " .. tostring(cmd[1]), vim.log.levels.WARN)
      return
    end
  end
  local payload_cmd = type(cmd) == "table" and cmd or { cmd }
  local out, err = {}, {}
  local ok, job = pcall(vim.fn.jobstart, argv, {
    cwd = opts.cwd,
    stdout_buffered = true, stderr_buffered = true,
    on_stdout = function(_, d) out = d end,
    on_stderr = function(_, d) err = d end,
    on_exit = function(id, code)
      -- An older run's exit (one setup() stopped) must not clear a newer run.
      if M.state.run_job == id then M.state.run_job = nil end
      local payload = { kind = "run_output", cmd = payload_cmd, code = code,
        stdout = table.concat(out, "\n"), stderr = table.concat(err, "\n") }
      if not M.notify_tutor(payload) then
        vim.notify("[tutor] run finished (exit " .. code .. ") but pi-tutor is not connected", vim.log.levels.INFO)
      end
    end,
  })
  if not ok or type(job) ~= "number" or job <= 0 then
    vim.notify("[tutor] could not start run_cmd: " .. tostring(job), vim.log.levels.WARN)
    return
  end
  M.state.run_job = job
end

local function slash(text)
  local function run(a)
    -- Under textlock (E565) the pane cannot open now: type the command from the event loop.
    if term.textlocked() then vim.schedule(function() run(a) end); return end
    local t = M.state.term
    if not t:is_visible() then t:show() end
    local line = text .. (a and a.args ~= "" and (" " .. a.args) or "")
    if not t:send(line) then vim.notify("[tutor] pi is not running; :TutorRestart", vim.log.levels.WARN) end
  end
  return run
end

--- Re-root the tutor at `dir`: cd there, open `file` in the editor window, restart Pi with cwd = dir.
---@return boolean ok
function M.switch(dir, file)
  if vim.fn.isdirectory(dir) == 0 then
    vim.notify("[tutor] not a directory: " .. dir, vim.log.levels.WARN)
    return false
  end
  opts.cwd = dir
  vim.cmd.cd(vim.fn.fnameescape(dir))
  -- Editor window: a normal buffer, else any non-terminal one (LazyVim's dashboard is
  -- buftype=nofile), else a new split left of the Pi pane.
  local target, fallback
  for _, w in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
    local bt = vim.bo[vim.api.nvim_win_get_buf(w)].buftype
    if bt == "" then target = w; break end
    if bt ~= "terminal" and not fallback then fallback = w end
  end
  target = target or fallback
  local path = vim.fn.fnameescape(dir .. "/" .. file)
  -- The open may fail (E37 unsaved buffer with 'nohidden'); Pi must follow the :cd regardless.
  local ok, err = pcall(function()
    if target then
      vim.api.nvim_win_call(target, function() vim.cmd.edit(path) end)
    else
      vim.cmd("topleft vsplit " .. path)
    end
  end)
  if not ok then vim.notify("[tutor] could not open " .. file .. ": " .. tostring(err), vim.log.levels.WARN) end
  M.state.term.opts.cwd = dir
  M.state.term:restart()
  return true
end

function M.setup(user_opts)
  opts = vim.tbl_deep_extend("force", {
    pi_cmd = { "pi" }, cwd = vim.fn.getcwd(), width = 0.45, run_cmd = nil, test_cmd = nil, check_version = true,
  }, user_opts or {})
  check_version()
  -- PI_TUTOR=1 tells pi-tutor this Pi is the tutor; plain `pi` elsewhere stays untouched.
  -- setup() again (e.g. a config reload) must not leave the old Pi running in a hidden buffer.
  if M.state.term then M.state.term:close() end
  M.state.term = term.new({ cmd = M.build_cmd(opts.pi_cmd), cwd = opts.cwd, width = opts.width, env = { PI_TUTOR = "1" } })
  -- A pending run is stopped, not orphaned: its exit would otherwise land after a newer run started.
  if M.state.run_job then pcall(vim.fn.jobstop, M.state.run_job) end
  M.state.run_job = nil
  local cmd = vim.api.nvim_create_user_command
  cmd("Tutor", function() M.state.term:toggle() end, {})
  cmd("TutorRestart", function() M.state.term:restart() end, {})
  cmd("TutorRun", function(a) M.run(a.args ~= "" and a.args or "run") end,
    { nargs = "?", complete = function() return { "run", "test" } end })
  cmd("TutorStart", slash("/tutor-start"), {})
  cmd("TutorLevel", slash("/tutor-level"), { nargs = "?" })
  cmd("TutorLearn", slash("/tutor-learn"), {})
  cmd("TutorDocs", slash("/tutor-docs"), { nargs = "?" })
  cmd("TutorPlan", slash("/tutor-plan"), { nargs = 1 })
  cmd("TutorArchitect", slash("/tutor-architect"), { nargs = "?" })
  cmd("TutorFeedback", slash("/tutor-feedback"), { nargs = 1,
    complete = function() return { "too-long", "too-vague", "too-much-help", "good" } end })
  cmd("TutorThinking", slash("/tutor-thinking"), { nargs = "?",
    complete = function() return { "auto", "show", "hide" } end })
  cmd("TutorExam", slash("/tutor-exam"), { nargs = "*",
    complete = function() return { "small", "medium", "check", "off" } end })
  cmd("TutorReload", slash("/reload"), {})
end

return M
