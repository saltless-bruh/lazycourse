local term = require("tutor.term")
local runpane = require("tutor.runpane")

local M = {}
M.state = { term = nil, run_job = nil }
-- Run jobs setup() stopped: their exit is not reported (Phase 8 D).
local stopped = {}
M._notify_override = nil
local opts = {}

---@param pi_cmd string[]
function M.build_cmd(pi_cmd)
  local cmd = vim.deepcopy(pi_cmd)
  if vim.fs.basename(cmd[1]) == "pi" then
    -- pi-tutor's memory tools (spec 2026-10-13 §7.1); --tools is an allowlist for extension tools too.
    -- Spec 2026-10-19 §8: naming mcp__ entries makes Pi filter MCP tools too, so only context7's two
    -- docs lookups reach the model and a server added to mcp.json later cannot widen the tool set.
    vim.list_extend(cmd, { "--tools",
      "read,grep,find,ls,tutor_remember,tutor_recall,mcp__context7__resolve_library_id,mcp__context7__query_docs" })
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

--- Open task ids in `dir`/spec/tasks.md (`- [ ] P1.T2 …`, subtasks left out), for :TutorDone completion.
---@param dir string
---@return string[]
function M.open_tasks(dir)
  local ok, lines = pcall(vim.fn.readfile, vim.fs.joinpath(dir, "spec", "tasks.md"))
  local ids = {}
  if not ok then return ids end
  for _, l in ipairs(lines) do
    -- However the model wrapped the id (`**P1.T2**`, `P1.T2:`); subtasks left out (final review I4).
    local id, after = nil, nil
    if l:match("^%s*[-*+] %[ %]") then id, after = l:match("%f[%w](P%d+%.T%d+)(.?.?)") end
    if id and after ~= ".S" and not vim.tbl_contains(ids, id) then ids[#ids + 1] = id end
  end
  return ids
end

---@param kind? "run"|"test"|"stop"
function M.run(kind)
  kind = kind or "run"
  -- Review I2: from a lazy-loaded keymap the command runs under textlock, where splits and jobstart{term} throw
  -- E565 (CLAUDE.md); the whole run waits for the event loop.
  if require("tutor.term").textlocked() then
    vim.schedule(function() M.run(kind) end)
    return
  end
  -- Learner-session fixes (spec §1): stop ends the visible run; its exit is not reported.
  if kind == "stop" then
    -- Minor M4: stopping says so, like Ctrl+C does.
    if runpane.running() then vim.notify("[tutor] run stopped", vim.log.levels.INFO) end
    runpane.stop()
    M.state.run_job = nil
    return
  end
  if not KINDS[kind] then
    vim.notify("[tutor] usage: :TutorRun [run|test|stop]", vim.log.levels.WARN)
    return
  end
  -- A second run replaces the visible one (no "already running" dead end); a hidden test run is still one at a time.
  if kind == "run" and runpane.running() then
    runpane.stop()
    M.state.run_job = nil
  end
  if M.state.run_job then
    -- Minor M2: a visible run waiting for input is the learner's program, not a test.
    vim.notify(runpane.running() and "[tutor] your program is still running in the run split: finish it, or :TutorRun stop"
      or "[tutor] a test run is still running", vim.log.levels.WARN)
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
  local function report(code, stdout, stderr, timed_out)
    local payload = { kind = "run_output", cmd = payload_cmd, code = code, stdout = stdout, stderr = stderr, timed_out = timed_out or nil }
    if not M.notify_tutor(payload) then
      vim.notify("[tutor] run finished (exit " .. code .. ") but pi-tutor is not connected", vim.log.levels.INFO)
    end
  end
  if kind == "run" then
    local pane, why = runpane.start(argv, opts.cwd, function(code, lines, id)
      if stopped[id] then stopped[id] = nil return end
      -- Side-agent note: Ctrl+C in the split (exit 130, Python's KeyboardInterrupt) is the learner quitting the
      -- program, like :TutorRun stop: never a failed try.
      if code == 130 then
        vim.notify("[tutor] run stopped", vim.log.levels.INFO)
        return
      end
      report(code, table.concat(lines, "\n"), "")
    end, function(id)
      if M.state.run_job == id then M.state.run_job = nil end
    end)
    if not pane then
      vim.notify("[tutor] could not start run_cmd: " .. tostring(why), vim.log.levels.WARN)
      return
    end
    M.state.run_job = pane.job
    return
  end
  -- The hidden test run gets no input (a read fails at once) and at most 60 s (test_timeout_ms).
  local out, err = {}, {}
  local limit = opts.test_timeout_ms or 60000
  local timed_out = false
  local ok, job = pcall(vim.fn.jobstart, argv, {
    cwd = opts.cwd,
    stdin = "null",
    stdout_buffered = true, stderr_buffered = true,
    on_stdout = function(_, d) out = d end,
    on_stderr = function(_, d) err = d end,
    on_exit = function(id, code)
      -- An older run's exit (one setup() stopped) must not clear a newer run.
      if M.state.run_job == id then M.state.run_job = nil end
      -- Phase 8 D (M6c parked): a run setup() stopped (exit 143) is no failed run of the learner's.
      if stopped[id] then stopped[id] = nil return end
      -- Minor M3: a test stopped at the limit is reported as timed out, not as a plain failure.
      local errs = table.concat(err, "\n")
      if timed_out then
        local note = ("[tutor] the tests were stopped after %s s: they may wait for input or loop forever"):format(limit / 1000)
        errs = (errs ~= "" and errs .. "\n" or "") .. note
        vim.notify(note, vim.log.levels.WARN)
      end
      report(code, table.concat(out, "\n"), errs, timed_out)
    end,
  })
  if not ok or type(job) ~= "number" or job <= 0 then
    vim.notify("[tutor] could not start run_cmd: " .. tostring(job), vim.log.levels.WARN)
    return
  end
  M.state.run_job = job
  vim.defer_fn(function() if M.state.run_job == job then timed_out = true; pcall(vim.fn.jobstop, job) end end, limit)
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

local ASK_ENTRY = [[PopUp.Ask\ tutor\ about\ this\ error]]

--- Spec 2026-10-26 §5.2: the error under the cursor, its line and code, typed into Pi as a question.
--- One line (Pi submits on Enter): `[ask-error] <relpath>:<line>: <message> | code: <line text>`.
function M.ask_error()
  local row = vim.api.nvim_win_get_cursor(0)[1]
  local d = vim.diagnostic.get(0, { lnum = row - 1 })
  if #d == 0 then vim.notify("[tutor] no error on this line", vim.log.levels.INFO); return end
  table.sort(d, function(a, b) return a.severity < b.severity end)
  local file = vim.api.nvim_buf_get_name(0)
  local root = vim.fs.normalize(opts.cwd) .. "/"
  local rel = file:sub(1, #root) == root and file:sub(#root + 1) or vim.fn.fnamemodify(file, ":t")
  local code = vim.trim(vim.api.nvim_get_current_line())
  local msg = d[1].message:gsub("%s*\n%s*", " ")
  slash(string.format("[ask-error] %s:%d: %s | code: %s", rel, row, msg, code))()
  pcall(function() require("tutor.tour").event("asked_error") end)
end

--- Re-root the tutor at `dir`: cd there, open `file` in the editor window, restart Pi with cwd = dir.
---@return boolean ok
function M.switch(dir, file)
  if vim.fn.isdirectory(dir) == 0 then
    vim.notify("[tutor] not a directory: " .. dir, vim.log.levels.WARN)
    return false
  end
  opts.cwd = dir
  vim.fn.chdir(dir) -- not :cd, which prints the folder; that message covered the tutor pane (re-run topic 5)
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

local function data_dir()
  return (vim.env.XDG_DATA_HOME or vim.fn.expand("~/.local/share")) .. "/nvim-tutor"
end

local function profile_path()
  local env = vim.env.PI_TUTOR_PROFILE
  return (env and env ~= "" and env ~= ":memory:") and env or (data_dir() .. "/profile.sqlite")
end

--- The profile and project-list files this plugin reads (wayfinding spec §8.4).
function M.paths() return { profile_file = opts.profile_file, projects_file = opts.projects_file } end

local function real(p)
  return vim.uv.fs_realpath(p) or vim.fs.normalize(p)
end

local function inside(path, dir)
  return path == dir or vim.startswith(path, dir .. "/")
end

--- Wayfinding spec §8.4: open the tutor by itself? Not with a file argument (git's commit editor, `nvim notes.md`);
--- a directory argument is the start folder; then only inside a known project or `lazycourse`.
---@param argv string[] @param cwd string @param projects string[] @param lazycourse string
function M.should_autostart(argv, cwd, projects, lazycourse)
  return M.autostart_root(argv, cwd, projects, lazycourse) ~= nil
end

--- The tutor's root when Neovim opens it by itself: the project the start folder is in (final review M6: not the
--- subfolder), else the start folder inside `lazycourse`; nil when it should not open.
function M.autostart_root(argv, cwd, projects, lazycourse)
  local start = cwd
  for _, a in ipairs(argv) do
    if vim.fn.isdirectory(a) == 1 then start = a else return nil end
  end
  start = real(start)
  for _, p in ipairs(projects) do
    if inside(start, real(p)) then return real(p) end
  end
  if inside(start, real(lazycourse)) then return start end
  return nil
end

local function read_projects(file)
  local f = io.open(file, "r")
  if not f then return {} end
  local ok, list = pcall(vim.json.decode, f:read("*a"))
  f:close()
  return ok and type(list) == "table" and list or {}
end

--- What Neovim's start does (VimEnter), injectable for tests: open the pane, or the first-run hint.
---@param s { argv: string[], cwd: string, ui: boolean }
function M.on_start(s)
  if not s.ui or not opts.auto_open then return end
  local root = M.autostart_root(s.argv, s.cwd, read_projects(opts.projects_file), opts.lazycourse)
  if root then
    opts.cwd = root -- the tutor's project root, and :TutorRun's folder
    M.state.term.opts.cwd = opts.cwd
    local editor = vim.api.nvim_get_current_win()
    M.state.term:show()
    -- 2026-11-09: the learner starts in the editor, in normal mode, so a first `:TutorTour` reaches Neovim, not the
    -- model; the pane is beside it and the session card there says how to move over.
    if vim.api.nvim_win_is_valid(editor) then vim.api.nvim_set_current_win(editor) end
    vim.cmd.stopinsert()
  elseif vim.fn.filereadable(opts.profile_file) == 0 then
    vim.notify("[tutor] New to lazycourse? :TutorTour teaches Neovim and the tutor", vim.log.levels.INFO, { timeout = 15000 })
  end
end

function M.setup(user_opts)
  opts = vim.tbl_deep_extend("force", {
    pi_cmd = { "pi" }, cwd = vim.fn.getcwd(), width = 0.45, run_cmd = nil, test_cmd = nil, check_version = true,
    -- Wayfinding spec 2026-11-08 §8.4: Neovim opens the tutor by itself only in a project or ~/lazycourse.
    auto_open = true,
    lazycourse = vim.fn.expand("~/lazycourse"),
    -- Where pi-tutor keeps its profile (PI_TUTOR_PROFILE wins, as in pi-tutor's profile.ts) and the project list.
    profile_file = profile_path(),
    projects_file = vim.fs.dirname(profile_path()) .. "/projects.json",
  }, user_opts or {})
  check_version()
  -- PI_TUTOR=1 tells pi-tutor this Pi is the tutor; plain `pi` elsewhere stays untouched.
  -- setup() again (e.g. a config reload) must not leave the old Pi running in a hidden buffer.
  if M.state.term then
    -- Phase 8 D (M6c parked): an error closing the old pane is shown; setup() still makes the new one.
    local ok, err = pcall(M.state.term.close, M.state.term)
    if not ok then vim.notify("[tutor] closing the old pane: " .. tostring(err), vim.log.levels.WARN) end
  end
  M.state.term = term.new({ cmd = M.build_cmd(opts.pi_cmd), cwd = opts.cwd, width = opts.width, env = { PI_TUTOR = "1" } })
  -- A pending run is stopped, not orphaned: its exit would otherwise land after a newer run started.
  if M.state.run_job then stopped[M.state.run_job] = true pcall(vim.fn.jobstop, M.state.run_job) end
  runpane.stop()
  M.state.run_job = nil
  local cmd = vim.api.nvim_create_user_command
  cmd("Tutor", function() M.state.term:toggle() end, {})
  cmd("TutorRestart", function() M.state.term:restart() end, {})
  cmd("TutorRun", function(a) M.run(a.args ~= "" and a.args or "run") end,
    { nargs = "?", complete = function() return { "run", "test", "stop" } end })
  cmd("TutorStart", slash("/tutor-start"), { nargs = "?",
    complete = function() return { "python", "rust", "go", "typescript", "lua", "javascript", "check", "off", "spec" } end })
  cmd("TutorLesson", slash("/tutor-lesson"), { nargs = "?",
    complete = function() return { "next", "check", "skip", "review", "off" } end })
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
    complete = function() return { "small", "medium", "check", "off", "sandbox" } end })
  -- Habits Task 22: a completion function's list is not filtered by Neovim; keep what starts with the typed word.
  cmd("TutorDone", slash("/tutor-done"), { nargs = "*",
    complete = function(lead)
      return vim.tbl_filter(function(w) return vim.startswith(w, lead) end, vim.list_extend(M.open_tasks(opts.cwd), { "anyway" }))
    end })
  cmd("TutorFix", slash("/tutor-fix"), {})
  cmd("TutorSubmit", slash("/tutor-submit"), {})
  cmd("TutorProgress", slash("/tutor-progress"), { nargs = "?" })
  cmd("TutorStepUp", slash("/tutor-step-up"), { nargs = "?", complete = function() return { "check", "submit" } end })
  cmd("TutorReload", slash("/reload"), {})
  cmd("TutorHelp", function() require("tutor.help").open() end, {})
  cmd("TutorTour", function(a)
    local tour = require("tutor.tour")
    if a.args == "off" then tour.stop() else tour.start({ restart = a.args == "restart" }) end
  end, { nargs = "?", complete = function() return { "restart", "off" } end })
  vim.cmd("amenu " .. ASK_ENTRY .. " <Cmd>lua require('tutor').ask_error()<CR>")
  vim.api.nvim_create_autocmd("MenuPopup", {
    group = vim.api.nvim_create_augroup("tutor-ask-error", { clear = true }),
    callback = function()
      local has = #vim.diagnostic.get(0, { lnum = vim.api.nvim_win_get_cursor(0)[1] - 1 }) > 0
      vim.cmd("amenu " .. (has and "enable " or "disable ") .. ASK_ENTRY)
    end,
  })
  vim.keymap.set("n", "<leader>te", M.ask_error, { desc = "Ask tutor about this error" })
  -- Wayfinding spec §8.4: the plugin owns its keys (they were lazy.nvim `keys` in the user's config), so the
  -- command list's drift test sees them all.
  local commands = require("tutor.commands")
  vim.keymap.set("n", "<leader>tt", "<Cmd>Tutor<CR>", { desc = "tutor: " .. commands.describe("<leader>tt") })
  vim.keymap.set("n", "<leader>tr", "<Cmd>TutorRun<CR>", { desc = "tutor: " .. commands.describe("<leader>tr") })
  vim.keymap.set("n", "<leader>t?", "<Cmd>TutorHelp<CR>", { desc = "tutor: " .. commands.describe("<leader>t?") })
  local ok, wk = pcall(require, "which-key")
  if ok and wk.add then wk.add({ { "<leader>t", group = "tutor" } }) end
  -- Live check 2026-11-09: at VimEnter the terminal UI was not attached yet (no UI, so nothing opened). UIEnter fires
  -- once a screen is attached, never headless; the short delay lets the notification popups load first.
  vim.api.nvim_create_autocmd("UIEnter", {
    group = vim.api.nvim_create_augroup("tutor-start", { clear = true }), once = true,
    callback = function()
      local argv, cwd = vim.fn.argv(), vim.fn.getcwd()
      vim.defer_fn(function() M.on_start({ argv = argv, cwd = cwd, ui = true }) end, 300)
    end,
  })
end

return M
