-- Wayfinding spec 2026-11-08 §8.2: help opens in its own tab, with every command explained; q closes it.
describe("tutor.help", function()
  before_each(function()
    package.loaded["tutor.help"] = nil
    vim.g.tutor_now = nil
    vim.cmd("silent! tabonly")
  end)

  local function text(buf) return table.concat(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "\n") end

  it("open makes one tab with the editor, pane and moving sections, and q closes it", function()
    local before = #vim.api.nvim_list_tabpages()
    local buf = require("tutor.help").open()
    assert.equals(before + 1, #vim.api.nvim_list_tabpages())
    local t = text(buf)
    assert.truthy(t:find("In the editor", 1, true))
    assert.truthy(t:find("In the tutor pane", 1, true))
    assert.truthy(t:find("Moving around", 1, true))
    assert.truthy(t:find(":TutorDone", 1, true))
    assert.truthy(t:find("/tutor-done", 1, true))
    assert.truthy(t:find("Runs the task's checks", 1, true)) -- the full explanation, not only the one-liner
    assert.is_false(vim.bo[buf].modifiable)
    vim.api.nvim_feedkeys("q", "x", false)
    assert.equals(before, #vim.api.nvim_list_tabpages())
  end)

  it("q closes the help when it is the only tab left, with no error (deferred minor: E784)", function()
    local buf = require("tutor.help").open()
    vim.cmd("tabonly")
    assert.equals(1, #vim.api.nvim_list_tabpages())
    vim.v.errmsg = ""
    local ok = pcall(vim.api.nvim_feedkeys, "q", "x", false)
    assert.is_true(ok)
    assert.equals("", vim.v.errmsg)
    assert.is_false(vim.api.nvim_buf_is_valid(buf))
    assert.equals(1, #vim.api.nvim_list_tabpages())
  end)

  it("q in the last tab goes back to the file that was open before the help (review minor 9)", function()
    local f = vim.fn.tempname() .. ".py"
    vim.fn.writefile({ "x = 1" }, f)
    vim.cmd.edit(f)
    local file_buf = vim.api.nvim_get_current_buf()
    local buf = require("tutor.help").open()
    vim.cmd("tabonly")
    vim.api.nvim_feedkeys("q", "x", false)
    assert.is_false(vim.api.nvim_buf_is_valid(buf))
    assert.equals(file_buf, vim.api.nvim_get_current_buf())
  end)

  it("with tutor_now it starts with the next step and what fits now", function()
    vim.g.tutor_now = { where = "stuck", next = "next: :TutorRun test, or ask: <leader>te" }
    local buf = require("tutor.help").open()
    local first = vim.api.nvim_buf_get_lines(buf, 0, 3, false)
    assert.truthy(table.concat(first, "\n"):find("Now: :TutorRun test, or ask: <leader>te", 1, true))
    assert.truthy(text(buf):find("Useful now", 1, true))
  end)

  it("opening twice keeps one tab", function()
    local before = #vim.api.nvim_list_tabpages()
    require("tutor.help").open()
    vim.cmd("tabprevious")
    require("tutor.help").open()
    assert.equals(before + 1, #vim.api.nvim_list_tabpages())
  end)

  it(":TutorHelp opens it", function()
    package.loaded["tutor"] = nil
    require("tutor").setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false })
    local before = #vim.api.nvim_list_tabpages()
    vim.cmd("TutorHelp")
    assert.equals(before + 1, #vim.api.nvim_list_tabpages())
  end)
end)
