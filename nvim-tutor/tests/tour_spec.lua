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

  -- Part 2: the tutor. Steps pass on the editor's own events (or Pi's "asked"), in order.
  local function advance_to(name)
    local tour = require("tutor.tour")
    for _ = 1, #tour.steps() do
      local c = tour.steps()[tour.state().step].check
      if c.kind == "event" and c.name == name then return tour.state().step end
      if c.kind == "lines" then
        local f = tour.dir() .. "/tour.txt"
        if vim.api.nvim_buf_get_name(0) ~= f then vim.cmd.edit(vim.fn.fnameescape(f)) end
        set_practice(tour.state().step, c.expect)
      else tour.event(c.name) end
    end
    error("no step " .. name)
  end

  it("Part 2 has the pane, asking, running, the error and help steps, in that order", function()
    local names = {}
    for _, st in ipairs(require("tutor.tour").steps()) do
      if st.part == 2 then table.insert(names, st.check.name) end
    end
    assert.same({ "pane_open", "asked", "pane_left", "editor_back", "run_done", "run_closed", "asked_error", "help_opened" }, names)
  end)

  it("each Part 2 event passes only its own step", function()
    local tour = require("tutor.tour")
    tour.start()
    local n = advance_to("pane_open")
    tour.event("pane_left"); assert.equals(n, tour.state().step)
    tour.event("pane_open"); assert.equals(n + 1, tour.state().step)
  end)

  it("entering and leaving the tutor pane's terminal mode are the pane steps", function()
    local tutor, tour = require("tutor"), require("tutor.tour")
    tour.start()
    local n = advance_to("pane_open")
    local tw = vim.fn.win_findbuf(tutor.state.term:bufnr())[1]
    vim.api.nvim_set_current_win(tw)
    vim.api.nvim_exec_autocmds("TermEnter", {})
    assert.equals(n + 1, tour.state().step)
    tour.event("asked")
    vim.api.nvim_exec_autocmds("TermLeave", {})
    assert.equals(n + 3, tour.state().step)
    vim.cmd("wincmd p")
    if vim.bo.buftype ~= "" then vim.cmd("wincmd h") end
    vim.api.nvim_exec_autocmds("WinEnter", {})
    assert.equals(n + 4, tour.state().step)
  end)

  it("a run that ends, then its split closing, are the run steps", function()
    local tour = require("tutor.tour")
    tour.start()
    local n = advance_to("run_done")
    vim.cmd("botright split | enew")
    local b, w = vim.api.nvim_get_current_buf(), vim.api.nvim_get_current_win()
    vim.b[b].tutor_run = true
    vim.api.nvim_exec_autocmds("TermClose", { buffer = b })
    assert.equals(n + 1, tour.state().step)
    vim.api.nvim_win_close(w, true)
    assert.equals(n + 2, tour.state().step)
  end)

  it("the ask-error step works with no language server", function()
    local tutor, tour = require("tutor"), require("tutor.tour")
    tour.start()
    local n = advance_to("asked_error")
    vim.cmd.edit(vim.fn.fnameescape(tour.dir() .. "/hello.lua"))
    assert.equals(1, #vim.diagnostic.get(0, { lnum = 1 }))
    vim.api.nvim_win_set_cursor(0, { 2, 0 })
    tutor.ask_error()
    assert.equals(n + 1, tour.state().step)
  end)

  it("opening help is the last step, and the tour is then done", function()
    local tour = require("tutor.tour")
    tour.start()
    advance_to("help_opened")
    require("tutor.help").open()
    assert.equals("done", tour.state().status)
    assert.same("done", payloads[#payloads].status)
  end)

  it("announce re-tells a running tour (a restarted Pi missed it)", function()
    local tour = require("tutor.tour")
    tour.start()
    payloads = {}
    tour.announce()
    assert.equals(1, #payloads)
    assert.equals("running", payloads[1].status)
  end)

  -- Final review I1: a tour left "running" in state.json (Neovim quit mid-tour) must not take over a later Neovim.
  it("a tour this Neovim never started is not announced and passes no step", function()
    local tour = require("tutor.tour")
    vim.fn.mkdir(tour.dir(), "p")
    vim.fn.writefile({ vim.json.encode({ step = 5, status = "running" }) }, tour.dir() .. "/state.json")
    package.loaded["tutor.tour"] = nil
    tour = require("tutor.tour")
    payloads = {}
    tour.announce()
    assert.same({}, payloads)
    tour.event(tour.steps()[5].check.name or "x")
    assert.equals(5, tour.state().step)
  end)

  -- Final review M2: when the tour file cannot be opened, the tour never hooks the learner's own buffer.
  it("if tour.txt does not open, the learner's buffer is left alone", function()
    vim.cmd("enew")
    local mine = vim.api.nvim_get_current_buf()
    vim.api.nvim_buf_set_lines(mine, 0, -1, false, { "my unsaved work" })
    -- switch() reports success even when its :edit failed (E37 with nohidden, E325 swap prompt answered Quit).
    local tutor = require("tutor")
    local real_switch = tutor.switch
    tutor.switch = function() return true end
    local ok = pcall(require("tutor.tour").start, { restart = true })
    tutor.switch = real_switch
    assert.is_true(ok)
    assert.same({ "my unsaved work" }, vim.api.nvim_buf_get_lines(mine, 0, -1, false))
    local has_group, hooks = pcall(vim.api.nvim_get_autocmds, { group = "tutor-tour", buffer = mine })
    assert.same({}, has_group and hooks or {})
    vim.api.nvim_buf_delete(mine, { force = true })
  end)

  -- 2026-11-09 live: a swap file left by a killed Neovim stopped :TutorTour at the "Found a swap file" prompt. The
  -- tour's files are generated practice text: they open without asking.
  it("a leftover swap file for the tour's files never asks", function()
    require("tutor.tour").start()
    vim.v.swapchoice = ""
    vim.api.nvim_exec_autocmds("SwapExists", { pattern = require("tutor.tour").dir() .. "/tour.txt" })
    assert.equals("e", vim.v.swapchoice)
  end)

  -- 2026-11-09 live: the learner's dd removed step 3's "## 3/18" heading; the tour could no longer find step 3 and the
  -- learner was stuck with no word why. :TutorTour (resume) now writes the tour text fresh at the current step.
  it("resuming rewrites a damaged tour text and keeps the progress", function()
    local tour = require("tutor.tour")
    tour.start()
    set_practice(1, tour.steps()[1].check.expect)
    local h = find("## 2/")
    vim.api.nvim_buf_set_lines(0, h - 1, h, false, {})
    vim.cmd("silent write")
    tour.start()
    assert.equals(2, tour.state().step)
    assert.truthy(find("## 2/"))
    assert.truthy(vim.api.nvim_get_current_line():find("## 2/", 1, true))
  end)

  it("a missing heading for the current step says how to put it back", function()
    local tour = require("tutor.tour")
    tour.start()
    local notes, orig = {}, vim.notify
    vim.notify = function(m) table.insert(notes, m) end
    local h = find("## 1/")
    vim.api.nvim_buf_set_lines(0, h - 1, h, false, {})
    vim.api.nvim_exec_autocmds("TextChanged", { buffer = 0 })
    vim.notify = orig
    assert.truthy(table.concat(notes, "\n"):find(":TutorTour", 1, true), table.concat(notes, "\n"))
  end)

  -- Review 2026-11-09 #7: after :TutorTour puts the text back, breaking the same step again is reported again.
  it("the missing-heading warning comes back after :TutorTour restored the text", function()
    local tour = require("tutor.tour")
    tour.start()
    local notes, orig = {}, vim.notify
    vim.notify = function(m) table.insert(notes, m) end
    local function break_heading()
      local h = find("## 1/")
      vim.api.nvim_buf_set_lines(0, h - 1, h, false, {})
      vim.api.nvim_exec_autocmds("TextChanged", { buffer = 0 })
    end
    break_heading()
    tour.start()
    break_heading()
    vim.notify = orig
    local n = 0
    for _, m in ipairs(notes) do if m:find("can't be checked", 1, true) then n = n + 1 end end
    assert.equals(2, n, table.concat(notes, "\n"))
  end)
end)
