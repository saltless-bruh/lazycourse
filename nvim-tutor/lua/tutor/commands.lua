-- Wayfinding spec 2026-11-08 §6: the one command list (pi-tutor/commands.json), read here for the help tab and keys.
local M = {}

local here = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":p:h")
M.path = vim.fs.normalize(here .. "/../../../pi-tutor/commands.json")

local cache

--- Every entry; one that names a twin takes the twin's `for` and `help` when it has none of its own.
---@return table[]
function M.load()
  if cache then return cache end
  local f = assert(io.open(M.path, "r"), "tutor: no command list at " .. M.path)
  local raw = vim.json.decode(f:read("*a"))
  f:close()
  local by = {}
  for _, c in ipairs(raw) do by[c.name] = c end
  -- A twin may itself name a twin (<leader>t? → :TutorHelp → /tutor-help): follow the chain.
  local function own(c, k, hops)
    if not c then return "" end
    if c[k] then return c[k] end
    if hops < 3 and c.twin then return own(by[c.twin], k, hops + 1) end
    return ""
  end
  for _, c in ipairs(raw) do c._for, c._help = own(c, "for", 0), own(c, "help", 0) end
  for _, c in ipairs(raw) do c["for"], c.help, c._for, c._help = c._for, c._help, nil, nil end
  cache = raw
  return cache
end

--- The commands relevant at `where` (and those relevant always).
---@param where string
function M.for_where(where)
  local out = {}
  for _, c in ipairs(M.load()) do
    if not c.planned and (vim.tbl_contains(c.when, where) or vim.tbl_contains(c.when, "always")) then
      table.insert(out, c)
    end
  end
  return out
end

--- One entry's "what it's for"; errors on an unknown name.
function M.describe(name)
  for _, c in ipairs(M.load()) do if c.name == name then return c["for"] end end
  error("tutor: no command " .. name .. " in commands.json")
end

return M
