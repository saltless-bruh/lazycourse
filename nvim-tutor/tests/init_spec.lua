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

  it(":TutorRun refuses a second run while one is pending", function()
    local tutor = require("tutor")
    tutor._notify_override = function() end
    tutor.state.run_job = 12345 -- pretend a run is pending
    local msgs = {}
    local orig = vim.notify
    vim.notify = function(m) table.insert(msgs, m) end
    vim.cmd("TutorRun")
    vim.notify = orig
    assert.is_true(#msgs == 1 and msgs[1]:find("already running") ~= nil)
    tutor.state.run_job = nil
  end)

  it("notify_tutor returns false when no extension is connected", function()
    vim.g.tutor_chan = nil
    assert.is_false(require("tutor").notify_tutor({ kind = "idle" }))
  end)
end)
