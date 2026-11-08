-- Wayfinding spec 2026-11-08 §8.3: :TutorTour, Part 1 — Neovim basics, each step checked in the editor by code.
describe("tutor.tour", function()
  local home, payloads, saved_home, saved_cwd

  local function lines() return vim.api.nvim_buf_get_lines(0, 0, -1, false) end
  local function find(pat)
    for i, l in ipairs(lines()) do if l:find(pat, 1, true) then return i end end
  end
  --- The practice lines of the current step (between >>> and <<< after its header).
  local function practice_range(n)
    local h = find(("## %d/"):format(n))
    local s, e
    for i = h, #lines() do
      if lines()[i] == ">>>" and not s then s = i end
      if lines()[i] == "<<<" and s then e = i; break end
    end
    return s, e
  end
  local function set_practice(n, new)
    local s, e = practice_range(n)
    vim.api.nvim_buf_set_lines(0, s, e - 1, false, new)
    vim.api.nvim_exec_autocmds("TextChanged", { buffer = 0 })
  end

  before_each(function()
    saved_home, saved_cwd = vim.env.HOME, vim.fn.getcwd()
    home = vim.fn.resolve(vim.fn.tempname()); vim.fn.mkdir(home, "p")
    vim.env.HOME = home
    package.loaded["tutor"] = nil
    package.loaded["tutor.tour"] = nil
    payloads = {}
    require("tutor").setup({ pi_cmd = { "cat" }, cwd = home, check_version = false, auto_open = false })
    require("tutor")._notify_override = function(p) table.insert(payloads, p) end
    vim.cmd("silent! %bwipeout!")
  end)
  after_each(function()
    pcall(function() require("tutor.tour").stop() end)
    require("tutor")._notify_override = nil
    vim.env.HOME = saved_home
    vim.cmd.cd(vim.fn.fnameescape(saved_cwd))
  end)

  it("start writes the practice folder and opens step 1", function()
    require("tutor.tour").start()
    local dir = home .. "/lazycourse/.tour"
    assert.equals(1, vim.fn.filereadable(dir .. "/tour.txt"))
    assert.equals(1, vim.fn.filereadable(dir .. "/hello.lua"))
    assert.equals(1, vim.fn.filereadable(dir .. "/notes.txt"))
    assert.equals(dir .. "/tour.txt", vim.api.nvim_buf_get_name(0)) -- the cursor is in the tour, not the pane
    assert.truthy(vim.api.nvim_get_current_line():find("## 1/", 1, true))
    assert.same({ kind = "tour", step = 1, total = #require("tutor.tour").steps(), title = require("tutor.tour").steps()[1].title, status = "running" }, payloads[#payloads])
  end)

  it("fixing the step-1 line passes it, shows ✓ and sends the next step", function()
    local tour = require("tutor.tour")
    tour.start()
    set_practice(1, tour.steps()[1].check.expect)
    assert.equals(2, tour.state().step)
    assert.same({ kind = "tour", step = 2, total = #tour.steps(), title = tour.steps()[2].title, status = "running" }, payloads[#payloads])
    local s = practice_range(1)
    local marks = vim.api.nvim_buf_get_extmarks(0, vim.api.nvim_create_namespace("tutor.tour"), { s, 0 }, { s, -1 }, { details = true })
    assert.equals("✓", vim.trim(marks[1][4].sign_text))
  end)

  it("a step whose line is still wrong shows ✗ and does not pass", function()
    local tour = require("tutor.tour")
    tour.start()
    set_practice(1, { "something else" })
    assert.equals(1, tour.state().step)
    local s = practice_range(1)
    local marks = vim.api.nvim_buf_get_extmarks(0, vim.api.nvim_create_namespace("tutor.tour"), { s, 0 }, { s, -1 }, { details = true })
    assert.equals("✗", vim.trim(marks[1][4].sign_text))
  end)

  it("steps pass only in order: a later step's line does not count yet", function()
    local tour = require("tutor.tour")
    tour.start()
    set_practice(2, tour.steps()[2].check.expect)
    assert.equals(1, tour.state().step)
  end)

  it("an event step passes on its own event only", function()
    local tour = require("tutor.tour")
    tour.start()
    local n
    for i, s in ipairs(tour.steps()) do if s.check.kind == "event" and s.check.name == "written" then n = i; break end end
    for i = 1, n - 1 do
      local c = tour.steps()[i].check
      if c.kind == "lines" then set_practice(i, c.expect) else tour.event(c.name) end
    end
    assert.equals(n, tour.state().step)
    tour.event("searched")
    assert.equals(n, tour.state().step)
    vim.cmd("silent write")
    assert.equals(n + 1, tour.state().step)
  end)

  it("the step resumes after stop and start; restart starts at step 1", function()
    local tour = require("tutor.tour")
    tour.start()
    set_practice(1, tour.steps()[1].check.expect)
    tour.stop()
    assert.equals("off", payloads[#payloads].status)
    package.loaded["tutor.tour"] = nil
    tour = require("tutor.tour")
    tour.start()
    assert.equals(2, tour.state().step)
    assert.truthy(vim.api.nvim_get_current_line():find("## 2/", 1, true))
    tour.start({ restart = true })
    assert.equals(1, tour.state().step)
  end)

  it(":TutorTour starts it; :TutorTour off stops it", function()
    vim.cmd("TutorTour")
    assert.equals("running", require("tutor.tour").state().status)
    vim.cmd("TutorTour off")
    assert.equals("off", require("tutor.tour").state().status)
  end)

  it("every Part 1 step has a title, text and a check", function()
    for i, s in ipairs(require("tutor.tour").steps()) do
      assert.truthy(s.title and #s.title > 0, i)
      assert.truthy(#s.text > 0, i)
      assert.truthy(s.check.kind == "lines" or s.check.kind == "event", i)
      if s.check.kind == "lines" then assert.truthy(#s.practice > 0, i) end
    end
  end)
end)
