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
    assert.equals("running\n", got.stdout)
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
    assert.is_truthy(msgs[2]:find("usage: :TutorRun [run|test]", 1, true))
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
    assert.equals("out\n", got.stdout)
    assert.equals("err\n", got.stderr)
  end)

  it(":TutorRun refuses a second run while one is pending (real job, M1b #3)", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, run_cmd = { "sh", "-c", "sleep 2" } })
    tutor._notify_override = function() end
    local msgs = {}
    local orig = vim.notify
    vim.notify = function(m) table.insert(msgs, m) end
    vim.cmd("TutorRun")
    vim.cmd("TutorRun")
    vim.notify = orig
    assert.is_true(#msgs == 1 and msgs[1]:find("already running") ~= nil)
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

  it(":TutorRun accepts a string run_cmd (run through the shell) (M6c M3)", function()
    package.loaded["tutor"] = nil
    local tutor = require("tutor")
    tutor.setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false, run_cmd = "echo hi; exit 4" })
    local got
    tutor._notify_override = function(p) got = p end
    assert.has_no.errors(function() vim.cmd("TutorRun") end)
    vim.wait(2000, function() return got ~= nil end)
    assert.equals(4, got.code)
    assert.equals("hi\n", got.stdout)
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
    assert.equals("ran\n", got.stdout)
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
