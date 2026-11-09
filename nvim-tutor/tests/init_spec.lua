describe("tutor.init", function()
  before_each(function()
    package.loaded["tutor"] = nil
    vim.g.tutor_chan = nil
    require("tutor").setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false,
      run_cmd = { "sh", "-c", "echo out; echo err 1>&2; exit 3" } })
  end)

  it(":Tutor toggles the split and keeps the job", function()
    local t = require("tutor").state.term
    vim.cmd("Tutor"); assert.is_true(t:is_visible())
    local job = t:job_id()
    vim.cmd("Tutor"); assert.is_false(t:is_visible())
    assert.equals(job, t:job_id())
  end)

  it("starts pi with the read tools, the two tutor memory tools and context7's two docs tools", function()
    local cmd = require("tutor").build_cmd({ "pi" })
    assert.same({ "pi", "--tools", "read,grep,find,ls,tutor_remember,tutor_recall,mcp__context7__resolve_library_id,mcp__context7__query_docs" }, cmd)
  end)

  it("starts pi in tutor mode (PI_TUTOR=1)", function()
    assert.equals("1", require("tutor").state.term.opts.env.PI_TUTOR)
  end)

  it(":TutorDocs and :TutorReload type their slash commands into pi", function()
    local tutor = require("tutor")
    vim.cmd("Tutor")
    vim.cmd("TutorDocs rust")
    vim.cmd("TutorReload")
    local buf = tutor.state.term:bufnr()
    local has = function(s) return vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), s) end
    vim.wait(1000, function() return has("/tutor-docs rust") and has("/reload") end)
    assert.is_true(has("/tutor-docs rust"))
    assert.is_true(has("/reload"))
  end)

  it(":TutorPlan and :TutorArchitect type their slash commands into pi", function()
    local tutor = require("tutor")
    vim.cmd("Tutor")
    vim.cmd("TutorPlan P1.T1")
    vim.cmd("TutorArchitect off")
    local buf = tutor.state.term:bufnr()
    local has = function(s) return vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), s) end
    vim.wait(1000, function() return has("/tutor-plan P1.T1") and has("/tutor-architect off") end)
    assert.is_true(has("/tutor-plan P1.T1"))
    assert.is_true(has("/tutor-architect off"))
  end)

  it(":TutorFeedback types its slash command and completes the four kinds", function()
    local tutor = require("tutor")
    vim.cmd("Tutor")
    vim.cmd("TutorFeedback too-long")
    local buf = tutor.state.term:bufnr()
    vim.wait(1000, function() return vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-feedback too-long") end)
    assert.is_true(vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-feedback too-long"))
    assert.same({ "too-long", "too-vague", "too-much-help", "good" }, vim.fn.getcompletion("TutorFeedback ", "cmdline"))
  end)

  it(":TutorThinking types its slash command and completes the three modes", function()
    local tutor = require("tutor")
    vim.cmd("Tutor")
    vim.cmd("TutorThinking hide")
    local buf = tutor.state.term:bufnr()
    vim.wait(1000, function() return vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-thinking hide") end)
    assert.is_true(vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-thinking hide"))
    assert.same({ "auto", "show", "hide" }, vim.fn.getcompletion("TutorThinking ", "cmdline"))
  end)

  it(":TutorExam types its slash command with size and topic, and completes the sizes (M8)", function()
    local tutor = require("tutor")
    vim.cmd("Tutor")
    vim.cmd("TutorExam medium dicts")
    local buf = tutor.state.term:bufnr()
    vim.wait(1000, function() return vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-exam medium dicts") end)
    assert.is_true(vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-exam medium dicts"))
    assert.same({ "small", "medium", "check", "off", "sandbox" }, vim.fn.getcompletion("TutorExam ", "cmdline"))
    -- Spec 2026-10-19: /tutor-start takes a language, `check` (the level task) or `off` (pause).
    assert.same({ "python", "rust", "go", "typescript", "lua", "javascript", "check", "off", "spec" }, vim.fn.getcompletion("TutorStart ", "cmdline"))
    -- Spec 2026-10-19 §7: learn-first lessons.
    assert.equals(2, vim.fn.exists(":TutorLesson"))
    assert.same({ "next", "check", "skip", "review", "off" }, vim.fn.getcompletion("TutorLesson ", "cmdline"))
  end)

  it(":TutorSubmit and :TutorProgress type their slash commands (M8)", function()
    local tutor = require("tutor")
    vim.cmd("Tutor")
    vim.cmd("TutorSubmit")
    vim.cmd("TutorProgress rust")
    local buf = tutor.state.term:bufnr()
    local has = function(l) return vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), l) end
    vim.wait(1000, function() return has("/tutor-submit") and has("/tutor-progress rust") end)
    assert.is_true(has("/tutor-submit"))
    assert.is_true(has("/tutor-progress rust"))
  end)

  it("a slash wrapper run under textlock (an <expr> mapping) opens the pane later and types (pane #3)", function()
    local tutor = require("tutor")
    vim.keymap.set("n", "<F14>", function() vim.cmd("TutorDocs go"); return "" end, { expr = true })
    vim.v.errmsg = ""
    vim.api.nvim_feedkeys(vim.keycode("<F14>"), "x", false)
    vim.keymap.del("n", "<F14>")
    local has = function()
      local buf = tutor.state.term:bufnr()
      return buf ~= nil and vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-docs go")
    end
    assert.is_true(vim.wait(2000, has))
    assert.is_nil(vim.v.errmsg:find("E565"))
    tutor.state.term:hide()
  end)

  it(":TutorPlan needs a task id", function()
    assert.has_error(function() vim.cmd("TutorPlan") end)
  end)

  it("switch cds into the project, opens the file and restarts pi there", function()
    local tutor = require("tutor")
    local dir = vim.fn.tempname()
    vim.fn.mkdir(dir .. "/spec", "p")
    vim.fn.writefile({ "- [ ] P1.T1" }, dir .. "/spec/tasks.md")
    vim.cmd("Tutor")
    local old = tutor.state.term:job_id()
    assert.is_true(tutor.switch(dir, "spec/tasks.md"))
    local real = vim.fn.resolve(dir)
    assert.equals(real, vim.fn.resolve(vim.fn.getcwd()))
    assert.equals(dir, tutor.state.term.opts.cwd)
    assert.are_not.equal(old, tutor.state.term:job_id())
    local found = false
    for _, w in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
      if vim.fn.resolve(vim.api.nvim_buf_get_name(vim.api.nvim_win_get_buf(w))) == real .. "/spec/tasks.md" then found = true end
    end
    assert.is_true(found)
    assert.is_false(tutor.switch(dir .. "/missing", "x"))
  end)

  local function project()
    local dir = vim.fn.tempname()
    vim.fn.mkdir(dir .. "/spec", "p")
    vim.fn.writefile({ "- [ ] P1.T1" }, dir .. "/spec/tasks.md")
    return dir
  end
  local function shows(file)
    for _, w in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
      if vim.fn.resolve(vim.api.nvim_buf_get_name(vim.api.nvim_win_get_buf(w))) == vim.fn.resolve(file) then return true end
    end
    return false
  end

  it("switch opens the file when the only editor window is a dashboard (nofile) (pane review I1)", function()
    local tutor = require("tutor")
    vim.cmd("silent! only")
    vim.cmd("enew")
    vim.bo.buftype = "nofile"
    local dir = project()
    vim.cmd("Tutor")
    assert.is_true(tutor.switch(dir, "spec/tasks.md"))
    assert.is_true(shows(dir .. "/spec/tasks.md"))
  end)

  it("switch still re-roots pi when the file cannot be opened (pane review I1)", function()
    local tutor = require("tutor")
    vim.cmd("silent! only")
    vim.cmd("enew")
    vim.api.nvim_buf_set_lines(0, 0, -1, false, { "unsaved work" })
    local hidden = vim.o.hidden
    vim.o.hidden = false -- :edit now fails with E37
    local dir = project()
    vim.cmd("Tutor")
    local old = tutor.state.term:job_id()
    local ok, res = pcall(tutor.switch, dir, "spec/tasks.md")
    vim.o.hidden = hidden
    vim.bo.modified = false
    assert.is_true(ok, tostring(res))
    assert.is_true(res)
    assert.equals(dir, tutor.state.term.opts.cwd)
    assert.are_not.equal(old, tutor.state.term:job_id())
  end)

  -- Review 2026-11-09 #4: the tour's warning says to type :TutorTour while tour.txt has unsaved edits; :edit of the
  -- file the window already shows failed with E37 and the learner saw "could not open tour.txt".
  it("switch to the file the editor already shows, with unsaved edits, is no error", function()
    local tutor = require("tutor")
    vim.cmd("silent! only")
    local dir = project()
    vim.cmd.edit(vim.fn.fnameescape(dir .. "/spec/tasks.md"))
    vim.api.nvim_buf_set_lines(0, 0, -1, false, { "edited" })
    local hidden = vim.o.hidden
    vim.o.hidden = false
    vim.cmd("Tutor")
    local notes, orig = {}, vim.notify
    vim.notify = function(m) table.insert(notes, m) end
    local ok, res = pcall(tutor.switch, dir, "spec/tasks.md")
    vim.notify, vim.o.hidden = orig, hidden
    assert.is_true(ok, tostring(res))
    assert.is_nil(table.concat(notes, "\n"):find("could not open", 1, true), table.concat(notes, "\n"))
    assert.is_true(shows(dir .. "/spec/tasks.md"))
    for _, b in ipairs(vim.api.nvim_list_bufs()) do vim.bo[b].modified = false end
  end)

  it("wrappers type slash commands into the terminal", function()
    local tutor = require("tutor")
    vim.cmd("Tutor")
    vim.cmd("TutorLevel 40")
    local buf = tutor.state.term:bufnr()
    vim.wait(1000, function()
      return vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-level 40")
    end)
    assert.is_true(vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-level 40"))
    vim.cmd("Tutor")
  end)

  it(":TutorDone types /tutor-done and completes the open task ids (spec 2026-10-21 §7)", function()
    local tutor = require("tutor")
    local dir = vim.fn.tempname()
    vim.fn.mkdir(dir .. "/spec", "p")
    vim.fn.writefile({ "## Milestone 1: x", "- [x] P1.T1 done", "- [ ] P1.T2 open", "  - [ ] P1.T2.S1 sub", "- [ ] P2.T1 later" }, dir .. "/spec/tasks.md")
    tutor.setup({ pi_cmd = { "cat" }, cwd = dir, check_version = false })
    assert.same({ "P1.T2", "P2.T1", "anyway" }, vim.fn.getcompletion("TutorDone ", "cmdline"))
    vim.cmd("Tutor")
    vim.cmd("TutorDone P1.T2 anyway")
    local buf = tutor.state.term:bufnr()
    vim.wait(1000, function() return vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-done P1.T2 anyway") end)
    assert.is_true(vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-done P1.T2 anyway"))
  end)

  it(":TutorDone completion follows what is typed; :TutorFix types /tutor-fix (habits Task 22)", function()
    local tutor = require("tutor")
    local dir = vim.fn.tempname()
    vim.fn.mkdir(dir .. "/spec", "p")
    vim.fn.writefile({ "- [ ] P1.T2 open", "- [ ] P2.T1 later" }, dir .. "/spec/tasks.md")
    tutor.setup({ pi_cmd = { "cat" }, cwd = dir, check_version = false })
    assert.same({ "P2.T1" }, vim.fn.getcompletion("TutorDone P2", "cmdline"))
    assert.same({ "anyway" }, vim.fn.getcompletion("TutorDone P1.T2 a", "cmdline"))
    vim.cmd("Tutor")
    vim.cmd("TutorFix")
    local buf = tutor.state.term:bufnr()
    vim.wait(1000, function() return vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-fix") end)
    assert.is_true(vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-fix"))
  end)

  it("ask_error types the error under the cursor into the pane; nothing without one (spec 2026-10-26 §5.2)", function()
    local tutor = require("tutor")
    local dir = vim.fn.tempname()
    vim.fn.mkdir(dir, "p")
    vim.fn.writefile({ "x = 1", "print(y)" }, dir .. "/main.py")
    tutor.setup({ pi_cmd = { "cat" }, cwd = dir, check_version = false })
    vim.cmd("Tutor")
    vim.cmd("wincmd t")
    vim.cmd.edit(dir .. "/main.py")
    local ns = vim.api.nvim_create_namespace("tutor-test")
    vim.diagnostic.set(ns, 0, { { lnum = 1, col = 0, message = "name 'y' is not defined", severity = vim.diagnostic.severity.ERROR } })
    vim.api.nvim_win_set_cursor(0, { 1, 0 })
    tutor.ask_error()
    local buf = tutor.state.term:bufnr()
    -- The pane is narrow in a headless test: a long line wraps, so search the pane's text joined up.
    local has = function(pat) return table.concat(vim.api.nvim_buf_get_lines(buf, 0, -1, false), ""):find(pat, 1, true) ~= nil end
    vim.wait(300)
    assert.is_false(has("[ask-error]"))
    vim.api.nvim_win_set_cursor(0, { 2, 0 })
    tutor.ask_error()
    vim.wait(1000, function() return has("[ask-error] main.py:2: name 'y' is not defined | code: print(y)") end)
    assert.is_true(has("[ask-error] main.py:2: name 'y' is not defined | code: print(y)"))
  end)

  -- Ask-first spec 2026-11-09: <leader>ts asks for stuck help; the pane answers, the cursor stays in the code.
  it("ask_stuck sends the cursor's spot (and its error) and keeps the cursor in the editor", function()
    local tutor = require("tutor")
    local dir = vim.fn.tempname()
    vim.fn.mkdir(dir, "p")
    vim.fn.writefile({ "x = 1", "print(y)", "z = 3" }, dir .. "/main.py")
    tutor.setup({ pi_cmd = { "cat" }, cwd = dir, check_version = false })
    local sent = {}
    tutor._notify_override = function(p) table.insert(sent, p) end
    vim.cmd("silent! only")
    vim.cmd.edit(dir .. "/main.py")
    local ns = vim.api.nvim_create_namespace("tutor-test-ts")
    vim.diagnostic.set(ns, 0, { { lnum = 1, col = 0, message = "name 'y' is not defined", severity = vim.diagnostic.severity.ERROR } })
    local win = vim.api.nvim_get_current_win()
    assert.is_false(tutor.state.term:is_visible())
    vim.api.nvim_win_set_cursor(0, { 3, 0 })
    tutor.ask_stuck()
    vim.api.nvim_win_set_cursor(0, { 2, 0 })
    tutor.ask_stuck()
    tutor._notify_override = nil
    assert.equals(vim.fn.resolve(dir .. "/main.py"), vim.fn.resolve(sent[1].path))
    assert.same({ "stuck", 3 }, { sent[1].kind, sent[1].line })
    assert.is_nil(sent[1].error)
    assert.equals("name 'y' is not defined", sent[#sent].error)
    assert.equals(2, sent[#sent].line)
    assert.is_true(tutor.state.term:is_visible())
    assert.equals(win, vim.api.nvim_get_current_win())
    assert.equals("n", vim.api.nvim_get_mode().mode)
    assert.is_not_nil(vim.fn.maparg("<leader>ts", "n", false, true).callback)
    assert.equals(2, vim.fn.exists(":TutorStuck"))
  end)

  it("ask_stuck outside the project sends nothing and says to open a project file", function()
    local tutor = require("tutor")
    local dir = vim.fn.tempname()
    vim.fn.mkdir(dir, "p")
    tutor.setup({ pi_cmd = { "cat" }, cwd = dir, check_version = false })
    local sent, notes, orig = {}, {}, vim.notify
    tutor._notify_override = function(p) table.insert(sent, p) end
    vim.notify = function(m) table.insert(notes, m) end
    vim.cmd("silent! only")
    vim.cmd("enew")
    tutor.ask_stuck()
    vim.notify = orig
    tutor._notify_override = nil
    assert.same({}, sent)
    assert.truthy(table.concat(notes, "\n"):find("<leader>ts", 1, true))
  end)

  it("the right-click entry is enabled only on a line with a diagnostic; <leader>te asks too", function()
    local tutor = require("tutor")
    local dir = vim.fn.tempname()
    vim.fn.mkdir(dir, "p")
    vim.fn.writefile({ "x = 1", "print(y)" }, dir .. "/main.py")
    tutor.setup({ pi_cmd = { "cat" }, cwd = dir, check_version = false })
    vim.cmd.edit(dir .. "/main.py")
    local ns = vim.api.nvim_create_namespace("tutor-test2")
    vim.diagnostic.set(ns, 0, { { lnum = 1, col = 0, message = "boom", severity = vim.diagnostic.severity.ERROR } })
    local entry = "PopUp.Ask tutor about this error"
    vim.api.nvim_win_set_cursor(0, { 2, 0 })
    vim.cmd("doautocmd MenuPopup")
    assert.is_true(vim.fn.menu_info(entry, "n").enabled)
    vim.api.nvim_win_set_cursor(0, { 1, 0 })
    vim.cmd("doautocmd MenuPopup")
    assert.is_false(vim.fn.menu_info(entry, "n").enabled)
    assert.is_true(vim.fn.maparg("<leader>te", "n") ~= "")
  end)

  it(":TutorStepUp types /tutor-step-up (habits Task 10)", function()
    local tutor = require("tutor")
    local dir = vim.fn.tempname()
    vim.fn.mkdir(dir, "p")
    tutor.setup({ pi_cmd = { "cat" }, cwd = dir, check_version = false })
    vim.cmd("Tutor")
    vim.cmd("TutorStepUp")
    local buf = tutor.state.term:bufnr()
    vim.wait(1000, function() return vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-step-up") end)
    assert.is_true(vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-step-up"))
    vim.cmd("TutorStepUp check")
    vim.wait(1000, function() return vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-step-up check") end)
    assert.is_true(vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-step-up check"))
    assert.same({ "check", "submit" }, vim.fn.getcompletion("TutorStepUp ", "cmdline"))
  end)

  it(":TutorDone completes task ids a model wrote loosely (final review I4)", function()
    local tutor = require("tutor")
    local dir = vim.fn.tempname()
    vim.fn.mkdir(dir .. "/spec", "p")
    vim.fn.writefile({ "- [x] **P1.T1** done", "- [ ] **P1.T2** open", "  - [ ] P1.T2.S1: sub", "* [ ] P1.T3: starred" }, dir .. "/spec/tasks.md")
    assert.same({ "P1.T2", "P1.T3" }, tutor.open_tasks(dir))
  end)

  local function project(lines)
    local dir = vim.fn.tempname()
    vim.fn.mkdir(dir, "p")
    vim.fn.writefile(lines, dir .. "/README.md")
    return dir
  end

  it("front_matter reads key: value lines between the first two --- lines (M8)", function()
    local tutor = require("tutor")
    local dir = project({ "---", "run: python3 main.py", "test: python3 -m unittest discover -v", "language: python", "---", "# T" })
    assert.same({ run = "python3 main.py", test = "python3 -m unittest discover -v", language = "python" }, tutor.front_matter(dir))
    assert.same({}, tutor.front_matter(project({ "# no front matter" })))
    assert.same({}, tutor.front_matter(project({ "---", "run: x" }))) -- never closed
    assert.same({}, tutor.front_matter(vim.fn.tempname())) -- no README
  end)

  it(":TutorRun test runs the README's test: command in the project, over the run_cmd option (M8)", function()
    package.loaded["tutor"] = nil
    local dir = project({ "---", "run: echo running", "test: echo testing; exit 5", "---" })
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = dir, check_version = false, run_cmd = { "sh", "-c", "echo option" } })
    local got
    tutor._notify_override = function(p) got = p end
    vim.cmd("TutorRun test")
    vim.wait(2000, function() return got ~= nil end)
    assert.equals(5, got.code)
    assert.equals("testing\n", got.stdout)
    assert.same({ "echo testing; exit 5" }, got.cmd)
    got = nil
    vim.cmd("TutorRun")
    vim.wait(2000, function() return got ~= nil end)
    assert.equals("running", got.stdout) -- the visible split's lines (learner-session fixes §1)
  end)

  it(":TutorRun test with no test: anywhere says where to add it; a bad kind shows usage (M8)", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = project({ "---", "run: x", "---" }), check_version = false })
    local msgs = {}
    local orig = vim.notify
    vim.notify = function(m) table.insert(msgs, m) end
    vim.cmd("TutorRun test")
    vim.cmd("TutorRun bogus")
    vim.notify = orig
    assert.is_truthy(msgs[1]:find("add `test:` to README.md", 1, true))
    assert.is_truthy(msgs[2]:find("usage: :TutorRun [run|test|stop]", 1, true))
    assert.is_nil(tutor.state.run_job)
  end)

  it(":TutorRun notifies the extension channel with output and exit code", function()
    local tutor = require("tutor")
    local got
    tutor._notify_override = function(p) got = p end
    vim.cmd("TutorRun")
    vim.wait(2000, function() return got ~= nil end)
    assert.equals("run_output", got.kind)
    assert.equals(3, got.code)
    -- the visible split is one terminal: what the learner saw, output and errors together (learner-session fixes §1)
    assert.is_truthy(got.stdout:find("out", 1, true) and got.stdout:find("err", 1, true), got.stdout)
    assert.equals("", got.stderr)
  end)

  it(":TutorRun test refuses a second hidden test run while one is pending (real job, M1b #3)", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, test_cmd = { "sh", "-c", "sleep 2" } })
    tutor._notify_override = function() end
    local msgs = {}
    local orig = vim.notify
    vim.notify = function(m) table.insert(msgs, m) end
    vim.cmd("TutorRun test")
    vim.cmd("TutorRun test")
    vim.notify = orig
    assert.is_true(#msgs == 1 and msgs[1]:find("still running") ~= nil)
    vim.fn.jobstop(tutor.state.run_job)
  end)

  it(":TutorRun with a missing program says so (M1b #4)", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, run_cmd = { "no-such-program-xyz" } })
    local msgs = {}
    local orig = vim.notify
    vim.notify = function(m) table.insert(msgs, m) end
    assert.has_no.errors(function() vim.cmd("TutorRun") end)
    vim.notify = orig
    assert.is_truthy(msgs[1] and msgs[1]:find("not executable: no%-such%-program%-xyz"))
    assert.is_nil(tutor.state.run_job)
  end)

  -- Learner-session fixes Task 1 (spec §1): the run is a visible split the learner can type into.
  local function term_win()
    local job = require("tutor").state.run_job
    for _, w in ipairs(vim.api.nvim_list_wins()) do
      local b = vim.api.nvim_win_get_buf(w)
      if vim.b[b].tutor_run and vim.b[b].terminal_job_id == job then return w end
    end
  end
  it(":TutorRun shows the program in a split and takes typed input", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false,
      run_cmd = { "sh", "-c", 'printf "name? "; read x; printf "age? "; read y; echo "hi $x $y"; exit 3' } })
    local got
    tutor._notify_override = function(p) got = p end
    vim.cmd("TutorRun")
    assert.is_truthy(term_win())
    local job = tutor.state.run_job
    vim.wait(300)
    vim.fn.chansend(job, "bo\n")
    vim.wait(200)
    vim.fn.chansend(job, "9\n")
    vim.wait(3000, function() return got ~= nil end)
    assert.is_truthy(got)
    assert.equals(3, got.code)
    assert.is_truthy(got.stdout:match("name%? .*age%? .*hi bo 9"), got.stdout)
  end)

  it("review I2: :TutorRun from a lazy keymap (under textlock) runs on the event loop, with no E565", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, run_cmd = { "sh", "-c", "sleep 5" } })
    tutor._notify_override = function() end
    vim.v.errmsg = ""
    vim.keymap.set("n", "<F13>", function() vim.cmd("TutorRun"); return "" end, { expr = true })
    local ok = pcall(vim.api.nvim_feedkeys, vim.keycode("<F13>"), "x", false)
    vim.keymap.del("n", "<F13>")
    assert.is_true(ok)
    assert.is_true(vim.wait(1000, function() return term_win() ~= nil and tutor.state.run_job ~= nil end))
    assert.is_nil(vim.v.errmsg:find("E565"))
    vim.cmd("TutorRun stop")
  end)

  it(":TutorRun stop stops a running program, reported as stopped", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, run_cmd = { "sh", "-c", "sleep 30" } })
    local sent = {}
    tutor._notify_override = function(p) table.insert(sent, p) end
    vim.cmd("TutorRun")
    local job = tutor.state.run_job
    vim.cmd("TutorRun stop")
    vim.fn.jobwait({ job }, 1000)
    vim.wait(300)
    assert.same({}, sent)
    assert.is_nil(tutor.state.run_job)
  end)

  it("a second :TutorRun restarts instead of refusing", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, run_cmd = { "sh", "-c", "sleep 30" } })
    local notes = {}
    local orig = vim.notify
    vim.notify = function(m) table.insert(notes, m) end
    tutor._notify_override = function() end
    vim.cmd("TutorRun")
    local first = tutor.state.run_job
    vim.cmd("TutorRun")
    local second = tutor.state.run_job
    vim.notify = orig
    assert.are_not.equal(first, second)
    assert.are_not.equal(-1, vim.fn.jobwait({ first }, 1000)[1])
    for _, m in ipairs(notes) do assert.is_nil(m:match("already running")) end
    vim.cmd("TutorRun stop")
  end)

  it("closing the split stops the program (Review Focus 2)", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, run_cmd = { "sh", "-c", "sleep 30" } })
    local sent = {}
    tutor._notify_override = function(p) table.insert(sent, p) end
    vim.cmd("TutorRun")
    local job = tutor.state.run_job
    vim.api.nvim_win_close(term_win(), true)
    assert.are_not.equal(-1, vim.fn.jobwait({ job }, 1000)[1])
    vim.wait(300)
    assert.same({}, sent)
    assert.is_nil(tutor.state.run_job)
  end)

  it("quitting a run with Ctrl+C is not a failed try (side-agent note)", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    -- a loop that only ends when the learner quits it, like a guessing game
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false,
      run_cmd = { "sh", "-c", 'trap "exit 130" INT; while true; do sleep 0.1; done' } })
    local sent = {}
    tutor._notify_override = function(p) table.insert(sent, p) end
    vim.cmd("TutorRun")
    local job = tutor.state.run_job
    vim.wait(300)
    vim.fn.chansend(job, "\3")
    assert.are_not.equal(-1, vim.fn.jobwait({ job }, 2000)[1])
    vim.wait(300)
    assert.same({}, sent)
    assert.is_nil(tutor.state.run_job)
  end)

  local function capture_notes(fn)
    local notes, orig = {}, vim.notify
    vim.notify = function(m) table.insert(notes, m) end
    local ok, err = pcall(fn)
    vim.notify = orig
    assert(ok, err)
    return table.concat(notes, "\n")
  end

  it("minor M2: :TutorRun test while the program waits in the split names the program, not a test", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, run_cmd = { "sh", "-c", "sleep 30" }, test_cmd = { "true" } })
    tutor._notify_override = function() end
    vim.cmd("TutorRun")
    local notes = capture_notes(function() vim.cmd("TutorRun test") end)
    assert.is_nil(notes:find("a test run"), notes)
    assert.is_truthy(notes:find("your program is still running"), notes)
    vim.cmd("TutorRun stop")
  end)

  it("minor M3: a test run stopped at its time limit tells the learner and the tutor it timed out", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, test_cmd = { "sh", "-c", "sleep 30" }, test_timeout_ms = 300 })
    local got
    tutor._notify_override = function(p) got = p end
    local notes = capture_notes(function()
      vim.cmd("TutorRun test")
      vim.wait(3000, function() return got ~= nil end)
    end)
    assert.is_truthy(got)
    assert.is_truthy(got.stderr:find("stopped after 0.3 s"), got.stderr)
    assert.is_true(got.timed_out)
    assert.is_truthy(notes:find("stopped after 0.3 s"), notes)
  end)

  it("minor M4: :TutorRun stop and closing the split both say the run stopped", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, run_cmd = { "sh", "-c", "sleep 30" } })
    tutor._notify_override = function() end
    vim.cmd("TutorRun")
    local a = capture_notes(function() vim.cmd("TutorRun stop") end)
    assert.is_truthy(a:find("run stopped"), a)
    vim.cmd("TutorRun")
    local b = capture_notes(function() vim.api.nvim_win_close(term_win(), true) end)
    assert.is_truthy(b:find("run stopped"), b)
    local c = capture_notes(function() vim.cmd("TutorRun stop") end)
    assert.is_nil(c:find("run stopped"), c) -- nothing was running
  end)

  it("minor M6: closing the run split wipes its terminal buffer", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, run_cmd = { "true" } })
    tutor._notify_override = function() end
    vim.cmd("TutorRun")
    local win = term_win()
    local buf = vim.api.nvim_win_get_buf(win)
    vim.wait(1000, function() return tutor.state.run_job == nil end)
    vim.api.nvim_win_close(win, true)
    vim.wait(100)
    assert.is_false(vim.api.nvim_buf_is_valid(buf))
  end)

  it("review minor: a file opened in the run split leaves no stale run buffer and no second split", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, run_cmd = { "sh", "-c", "sleep 30" } })
    tutor._notify_override = function() end
    vim.cmd("TutorRun")
    local win = term_win()
    local old = vim.api.nvim_win_get_buf(win)
    local wins = #vim.api.nvim_tabpage_list_wins(0)
    vim.api.nvim_win_call(win, function() vim.cmd("enew") end)
    vim.cmd("TutorRun")
    assert.equals(wins, #vim.api.nvim_tabpage_list_wins(0))
    assert.is_true(vim.wait(1000, function() return not vim.api.nvim_buf_is_valid(old) end))
    vim.cmd("TutorRun stop")
  end)

  it(":TutorRun test can never hang (stdin is empty)", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, test_cmd = { "sh", "-c", "read x || exit 7" } })
    local got
    tutor._notify_override = function(p) got = p end
    vim.cmd("TutorRun test")
    vim.wait(2000, function() return got ~= nil end)
    assert.is_truthy(got)
    assert.equals(7, got.code)
  end)

  it(":TutorRun accepts a string run_cmd (run through the shell) (M6c M3)", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, run_cmd = "echo hi; exit 4" })
    local got
    tutor._notify_override = function(p) got = p end
    assert.has_no.errors(function() vim.cmd("TutorRun") end)
    vim.wait(2000, function() return got ~= nil end)
    assert.equals(4, got.code)
    assert.equals("hi", got.stdout)
    assert.same({ "echo hi; exit 4" }, got.cmd)
  end)

  it(":TutorRun checks a relative run_cmd against the project cwd (pane #10)", function()
    package.loaded["tutor"] = nil
    local dir = vim.fn.tempname()
    vim.fn.mkdir(dir, "p")
    vim.fn.writefile({ "#!/bin/sh", "echo ran" }, dir .. "/run.sh")
    vim.fn.setfperm(dir .. "/run.sh", "rwxr-xr-x")
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = dir, check_version = false, run_cmd = { "./run.sh" } })
    local got
    tutor._notify_override = function(p) got = p end
    vim.cmd("TutorRun")
    vim.wait(2000, function() return got ~= nil end)
    assert.is_truthy(got)
    assert.equals("ran", got.stdout)
  end)

  it("setup again stops a pending run; the old run's exit does not clear a newer one (pane #10)", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    local o = { pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, run_cmd = { "sh", "-c", "sleep 5" } }
    tutor.setup(o)
    tutor._notify_override = function() end
    vim.cmd("TutorRun")
    local first = tutor.state.run_job
    tutor.setup(o)
    assert.are_not.equal(-1, vim.fn.jobwait({ first }, 1000)[1]) -- the first run was stopped, not left running
    vim.cmd("TutorRun")
    local second = tutor.state.run_job
    assert.is_number(second)
    vim.wait(300)
    assert.equals(second, tutor.state.run_job)
    vim.fn.jobstop(second)
  end)

  it("Phase 8 D (M6c parked): a run setup() stopped is not reported to the tutor as a failed run", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    local o = { pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, run_cmd = { "sh", "-c", "sleep 5" } }
    tutor.setup(o)
    local sent = {}
    tutor._notify_override = function(p) table.insert(sent, p) end
    vim.cmd("TutorRun")
    local first = tutor.state.run_job
    tutor.setup(o)
    vim.fn.jobwait({ first }, 1000)
    vim.wait(300)
    assert.same({}, sent)
  end)

  it("Phase 8 D (M6c parked): setup() still makes its pane when closing the old one raises", function()
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false })
    tutor.state.term.close = function() error("E999: boom", 0) end
    local old = tutor.state.term
    assert.has_no.errors(function() tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false }) end)
    assert.are_not.equal(old, tutor.state.term)
  end)

  it("setup twice stops the first pane's job (M1b #8)", function()
    local tutor = require("tutor")
    vim.cmd("Tutor")
    local first = tutor.state.term
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false })
    assert.is_false(first:is_running())
  end)

  it("notify_tutor returns false when no extension is connected", function()
    vim.g.tutor_chan = nil
    assert.is_false(require("tutor").notify_tutor({ kind = "idle" }))
  end)
end)

-- Wayfinding spec 2026-11-08 §8.4: the plugin owns its keys; Neovim opens the tutor by itself in a project or
-- ~/lazycourse; a first-ever start elsewhere gets one line.
describe("tutor start-up", function()
  local tmp = vim.fn.resolve(vim.fn.tempname()); vim.fn.mkdir(tmp, "p")
  local project = tmp .. "/proj"; vim.fn.mkdir(project, "p")
  local lazycourse = tmp .. "/lazycourse"; vim.fn.mkdir(lazycourse .. "/x", "p")
  local home = tmp .. "/home"; vim.fn.mkdir(home, "p")
  local commit = project .. "/COMMIT_EDITMSG"; vim.fn.writefile({ "msg" }, commit)

  it("should_autostart decides from the start folder and arguments", function()
    local s = require("tutor").should_autostart
    assert.is_true(s({}, project, { project }, lazycourse))
    assert.is_true(s({}, project .. "/src", { project }, lazycourse))
    assert.is_true(s({}, lazycourse .. "/x", {}, lazycourse))
    assert.is_true(s({}, lazycourse, {}, lazycourse))
    assert.is_false(s({}, home, { project }, lazycourse))
    assert.is_false(s({}, tmp .. "/proj-other", { project }, lazycourse))
    assert.is_false(s({ commit }, project, { project }, lazycourse)) -- git's commit editor (Review Focus 4)
    assert.is_true(s({ project }, home, { project }, lazycourse))   -- nvim <project dir>
    assert.is_false(s({ home }, project, { project }, lazycourse))
  end)

  local function fresh(o)
    package.loaded["tutor"] = nil
    require("tutor").setup(vim.tbl_extend("force", { pi_cmd = { "cat" }, cwd = home, check_version = false }, o or {}))
    return require("tutor")
  end
  local function capture(fn)
    local notes, orig = {}, vim.notify
    vim.notify = function(m) table.insert(notes, m) end
    local ok, err = pcall(fn)
    vim.notify = orig
    assert(ok, err)
    return table.concat(notes, "\n")
  end

  it("setup sets the four tutor keys", function()
    fresh()
    local leader = vim.g.mapleader or "\\"
    for _, k in ipairs({ "tt", "tr", "te", "t?" }) do
      assert.truthy(vim.fn.maparg(leader .. k, "n") ~= "", "missing <leader>" .. k)
    end
  end)

  -- 2026-11-09: :TutorTour typed right after start-up went into the pane (the cursor was there, in typing mode) and
  -- reached the model as a chat message. Auto-open shows the pane but leaves the learner in the editor.
  it("auto-open leaves the cursor in the editor, in normal mode", function()
    local pf = tmp .. "/projects.json"; vim.fn.writefile({ vim.json.encode({ project }) }, pf)
    local t = fresh({ projects_file = pf, profile_file = pf, lazycourse = lazycourse })
    local editor = vim.api.nvim_get_current_win()
    t.on_start({ argv = {}, cwd = project, ui = true })
    vim.wait(50)
    assert.is_true(t.state.term:is_visible())
    assert.equals(editor, vim.api.nvim_get_current_win())
    assert.equals("n", vim.api.nvim_get_mode().mode)
    t.state.term:hide()
  end)

  it("in a project folder the tutor opens; elsewhere it does not", function()
    local pf = tmp .. "/projects.json"; vim.fn.writefile({ vim.json.encode({ project }) }, pf)
    local t = fresh({ projects_file = pf, profile_file = pf, lazycourse = lazycourse })
    t.on_start({ argv = {}, cwd = project, ui = true })
    assert.is_true(t.state.term:is_visible())
    t.state.term:hide()
    t = fresh({ projects_file = pf, profile_file = pf, lazycourse = lazycourse })
    t.on_start({ argv = {}, cwd = home, ui = true })
    assert.is_false(t.state.term:is_visible())
  end)

  it("never opens headless or with auto_open off", function()
    local pf = tmp .. "/projects.json"; vim.fn.writefile({ vim.json.encode({ project }) }, pf)
    local t = fresh({ projects_file = pf, profile_file = pf, lazycourse = lazycourse })
    t.on_start({ argv = {}, cwd = project, ui = false })
    assert.is_false(t.state.term:is_visible())
    t = fresh({ projects_file = pf, profile_file = pf, lazycourse = lazycourse, auto_open = false })
    t.on_start({ argv = {}, cwd = project, ui = true })
    assert.is_false(t.state.term:is_visible())
  end)

  it("the first-run hint shows only without a profile file", function()
    local t = fresh({ projects_file = tmp .. "/none.json", profile_file = tmp .. "/none.sqlite", lazycourse = lazycourse })
    local notes = capture(function() t.on_start({ argv = {}, cwd = home, ui = true }) end)
    assert.truthy(notes:find("New to lazycourse? :TutorTour teaches Neovim and the tutor", 1, true), notes)
    local pf = tmp .. "/p.sqlite"; vim.fn.writefile({ "x" }, pf)
    t = fresh({ projects_file = tmp .. "/none.json", profile_file = pf, lazycourse = lazycourse })
    notes = capture(function() t.on_start({ argv = {}, cwd = home, ui = true }) end)
    assert.is_nil(notes:find("New to lazycourse", 1, true))
  end)
end)

-- Wayfinding spec §9.5 (re-run topic 5): after the folder switch the pane looked cut off on the left. Screen-replay
-- 2026-11-09 showed the cause: `:cd` printed the new folder (it does when the last key was typed, or at verbose ≥ 5),
-- and that message popup covered the left of the tutor pane's lines until it timed out.
describe("tutor.switch", function()
  it("changes folder without printing it", function()
    package.loaded["tutor"] = nil
    local saved = vim.fn.getcwd()
    require("tutor").setup({ pi_cmd = { "cat" }, cwd = saved, check_version = false, auto_open = false })
    local dir = vim.fn.resolve(vim.fn.tempname()); vim.fn.mkdir(dir, "p")
    vim.fn.writefile({ "# x" }, dir .. "/README.md")
    vim.o.verbose = 5
    local out = vim.fn.execute("lua require('tutor').switch(" .. vim.inspect(dir) .. ", 'README.md')")
    vim.o.verbose = 0
    vim.cmd.cd(vim.fn.fnameescape(saved))
    -- `:cd` prints the folder as :pwd does ("[global] <dir>", or the bare path); verbose also logs the chdir() call itself.
    assert.is_nil(out:find("[global] " .. dir, 1, true), out)
    for _, l in ipairs(vim.split(out, "\n")) do assert.are_not.equal(dir, vim.trim(l)) end
  end)
end)

describe("tutor profile paths", function()
  it("follow PI_TUTOR_PROFILE like pi-tutor does, so the projects list is found where Pi wrote it", function()
    local saved = vim.env.PI_TUTOR_PROFILE
    vim.env.PI_TUTOR_PROFILE = "/x/y/p.sqlite"
    package.loaded["tutor"] = nil
    require("tutor").setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, auto_open = false })
    local p = require("tutor").paths()
    vim.env.PI_TUTOR_PROFILE = saved
    assert.same({ profile_file = "/x/y/p.sqlite", projects_file = "/x/y/projects.json" }, p)
  end)
end)

describe("tutor start hook", function()
  it("waits for the screen: it runs on UIEnter, which never fires headless (live check 2026-11-09: at VimEnter the UI was not attached yet)", function()
    package.loaded["tutor"] = nil
    require("tutor").setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false })
    local au = vim.api.nvim_get_autocmds({ group = "tutor-start" })
    assert.equals(1, #au)
    assert.equals("UIEnter", au[1].event)
  end)
end)

describe("run split scrolling", function()
  it("the run split never scrolls sideways either", function()
    local saved = vim.o.sidescrolloff
    vim.o.sidescrolloff = 8
    package.loaded["tutor"] = nil
    require("tutor").setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, auto_open = false,
      run_cmd = { "sh", "-c", "echo hi" } })
    vim.cmd("TutorRun")
    vim.wait(2000, function() for _, w in ipairs(vim.api.nvim_list_wins()) do if vim.w[w].tutor_run then return true end end end)
    local win
    for _, w in ipairs(vim.api.nvim_list_wins()) do if vim.w[w].tutor_run then win = w end end
    local got = win and vim.wo[win].sidescrolloff
    vim.o.sidescrolloff = saved
    assert.is_not_nil(win)
    assert.equals(0, got)
  end)
end)

describe("start root", function()
  -- Final review M6: nvim in a project's subfolder opened the tutor rooted at the subfolder (no project, no run:).
  it("the tutor is rooted at the project, not the subfolder nvim started in", function()
    local tmp = vim.fn.resolve(vim.fn.tempname()); vim.fn.mkdir(tmp .. "/proj/src", "p")
    local root = require("tutor").autostart_root
    assert.equals(tmp .. "/proj", root({}, tmp .. "/proj/src", { tmp .. "/proj" }, tmp .. "/lazycourse"))
    assert.is_nil(root({}, tmp, { tmp .. "/proj" }, tmp .. "/lazycourse"))
  end)
end)
