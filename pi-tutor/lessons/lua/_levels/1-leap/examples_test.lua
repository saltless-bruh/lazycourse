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
local is_leap_year = solution

describe('leap', function()
  it('year not divisible by 4 in common year', function()
    assert.is_false(is_leap_year(2015))
  end)

  it('year divisible by 2, not divisible by 4 in common year', function()
    assert.is_false(is_leap_year(1970))
  end)

  it('year divisible by 4, not divisible by 100 in leap year', function()
    assert.is_true(is_leap_year(1996))
  end)

  it('year divisible by 4 and 5 is still a leap year', function()
    assert.is_true(is_leap_year(1960))
  end)

  it('year divisible by 100, not divisible by 400 in common year', function()
    assert.is_false(is_leap_year(2100))
  end)

  it('year divisible by 100 but not by 3 is still not a leap year', function()
    assert.is_false(is_leap_year(1900))
  end)

  it('year divisible by 400 is leap year', function()
    assert.is_true(is_leap_year(2000))
  end)

  it('year divisible by 400 but not by 125 is still a leap year', function()
    assert.is_true(is_leap_year(2400))
  end)

  it('year divisible by 200, not divisible by 400 in common year', function()
    assert.is_false(is_leap_year(1800))
  end)
end)
