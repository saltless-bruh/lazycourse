-- busted shim (lazycourse): describe/it/assert as plain Lua over check()
local _prefix = {}
local function describe(name, f) table.insert(_prefix, name); f(); table.remove(_prefix) end
local function it(name, f) check(table.concat(_prefix, " ") .. ": " .. name, f) end
local function _eq(a, b)
  if type(a) ~= "table" or type(b) ~= "table" then return a == b end
  for k, v in pairs(a) do if not _eq(v, b[k]) then return false end end
  for k in pairs(b) do if a[k] == nil then return false end end
  return true
end
local function _fail(msg) error(msg, 3) end
local _assert = assert
local assert = setmetatable({
  equal = function(want, got) if want ~= got then _fail(("expected %s, got %s"):format(tostring(want), tostring(got))) end end,
  same = function(want, got) if not _eq(want, got) then _fail("tables differ") end end,
  is_true = function(v) if v ~= true then _fail("expected true, got " .. tostring(v)) end end,
  is_false = function(v) if v ~= false then _fail("expected false, got " .. tostring(v)) end end,
  is_nil = function(v) if v ~= nil then _fail("expected nil, got " .. tostring(v)) end end,
  has_error = function(f, msg) local ok, err = pcall(f); if ok then _fail("expected an error") end
    if msg ~= nil and not tostring(err):find(msg, 1, true) then _fail("expected error " .. msg .. ", got " .. tostring(err)) end end,
}, { __call = function(_, v, msg) return _assert(v, msg) end })
assert.are = { equal = assert.equal, same = assert.same }
assert.are_not = { equal = function(a, b) if a == b then _fail("expected values to differ") end end }
assert.is = { ["true"] = assert.is_true, ["false"] = assert.is_false }
assert.equals, assert.are_equal, assert.are_same, assert.error, assert.has = assert.equal, assert.equal, assert.same, assert.has_error, { error = assert.has_error }
local rules = solution

describe('pacman-rules', function()
  it('should return if Pac-Man was able to eat the ghost or not', function()
    assert.is_true(rules.eat_ghost(true, true))
    assert.is_false(rules.eat_ghost(false, true))
  end)

  it('should return if Pac-Man ate a power pellet or a dot', function()
    assert.is_true(rules.score(true, false))
    assert.is_true(rules.score(false, true))
    assert.is_false(rules.score(false, false))
  end)

  it('should return if Pac-Man lost by touching a ghost without a power pellet', function()
    assert.is_true(rules.lose(false, true))
    assert.is_false(rules.lose(true, true))
  end)

  it('should return if Pac-Man won by eating all dots and has not touched a ghost without a power pellet', function()
    assert.is_true(rules.win(true, true, true))
    assert.is_false(rules.win(false, true, true))
    assert.is_false(rules.win(true, false, true))
  end)
end)
