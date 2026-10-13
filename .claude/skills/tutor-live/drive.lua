-- Headless acceptance drive for the tutor pane. Prints evidence lines for the skill to grade.
local function out(s) io.stdout:write(s .. "\n") end
local function termlines()
  local t = require("tutor").state.term
  return vim.api.nvim_buf_get_lines(t:bufnr(), 0, -1, false)
end
local function has(pat) for _, l in ipairs(termlines()) do if l:find(pat, 1, true) then return true end end return false end
-- Off-link widget wording (ui.ts): "outside nvim" before any link, "nvim closed" after one is lost.
local function offlink() return has("outside nvim") or has("nvim closed") end
vim.defer_fn(function()
  local ok, err = pcall(function()
    vim.cmd("Tutor")
    local ok1 = vim.wait(30000, function() return has("tutor") and (has("idle") or offlink()) end, 200)
    out("WIDGET present=" .. tostring(ok1) .. " offlink=" .. tostring(offlink()) .. " chan=" .. tostring(vim.g.tutor_chan))
    vim.cmd("TutorLevel 40")
    out("LEVEL lvl40=" .. tostring(vim.wait(15000, function() return has("lvl 40") end, 200)))
    vim.cmd("wincmd h")
    vim.cmd("edit /tmp/tutor-live/a.py")
    local ns = vim.api.nvim_create_namespace("live")
    vim.diagnostic.set(ns, 0, { { lnum = 0, col = 0, severity = 1, message = "boom" } })
    out("DIAG widget=" .. tostring(vim.wait(15000, function() return has("error: boom") end, 200)))
    vim.cmd("TutorLevel 10")
    vim.wait(15000, function() return has("lvl 10") end, 200)
    vim.diagnostic.set(ns, 0, { { lnum = 0, col = 0, severity = 1, message = "bang" } })
    local ep = vim.wait(15000, function() return has("stuck: error") end, 200)
    local nudge = vim.wait(15000, function() return has("[tutor] stuck signal") end, 200)
    out("EPISODE widget=" .. tostring(ep) .. " nudge=" .. tostring(nudge))
    vim.cmd("TutorRun")
    out("\nRUN done") -- :TutorRun's notify ends without a newline in headless mode
    for _, l in ipairs(termlines()) do
      if l:find("tutor", 1, true) or l:find("boom", 1, true) then out("LINE " .. l) end
    end
  end)
  if not ok then out("ERROR " .. tostring(err)) end
  vim.cmd("qa!")
end, 500)
