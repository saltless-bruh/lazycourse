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
