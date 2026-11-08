-- Wayfinding spec §6: every :Tutor command and tutor key is in the one command list, and the list names no other.
describe("tutor.commands", function()
  before_each(function()
    package.loaded["tutor"] = nil
    package.loaded["tutor.commands"] = nil
    require("tutor").setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false })
  end)

  local function live(where)
    local out = {}
    for _, c in ipairs(require("tutor.commands").load()) do
      if c.where == where and not c.planned then table.insert(out, c.name) end
    end
    table.sort(out)
    return out
  end

  it("every :Tutor command is in the list and the list names no unknown one", function()
    local have = {}
    for name in pairs(vim.api.nvim_get_commands({})) do
      if name:match("^Tutor") then table.insert(have, ":" .. name) end
    end
    table.sort(have)
    assert.same(live("editor"), have)
  end)

  it("every tutor key the plugin sets is in the list", function()
    local listed = {}
    for _, n in ipairs(live("key")) do listed[n] = true end
    local leader = vim.g.mapleader or "\\"
    local seen = 0
    for _, m in ipairs(vim.api.nvim_get_keymap("n")) do
      if (m.desc or ""):match("[Tt]utor") then
        local lhs = m.lhs
        if lhs:sub(1, #leader) == leader then lhs = "<leader>" .. lhs:sub(#leader + 1) end
        assert.is_true(listed[lhs] ~= nil, "key missing from the list: " .. lhs)
        seen = seen + 1
      end
    end
    assert.is_true(seen >= 1)
  end)

  it("for_where returns the commands relevant there", function()
    local names = {}
    for _, c in ipairs(require("tutor.commands").for_where("stuck")) do names[c.name] = true end
    assert.is_true(names[":TutorRun"])
  end)
end)
