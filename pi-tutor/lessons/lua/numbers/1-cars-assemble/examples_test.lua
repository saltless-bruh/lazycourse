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
local cars_assemble = solution

describe('cars assemble', function()
  it('should return the amount of working cars produced by the assembly line every hour', function()
    assert.are.equal(0.0, cars_assemble.calculate_working_cars_per_hour(0, 100))
    assert.are.equal(221.0, cars_assemble.calculate_working_cars_per_hour(221, 100))
    assert.are.equal(340.8, cars_assemble.calculate_working_cars_per_hour(426, 80))
    assert.are.equal(1398.92, cars_assemble.calculate_working_cars_per_hour(6824, 20.5))
    assert.are.equal(0.0, cars_assemble.calculate_working_cars_per_hour(8000, 0))
  end)

  it('should return the amount of working cars produced by the assembly line every minute', function()
    assert.are.equal(0, cars_assemble.calculate_working_cars_per_minute(0, 100))
    assert.are.equal(3, cars_assemble.calculate_working_cars_per_minute(221, 100))
    assert.are.equal(5, cars_assemble.calculate_working_cars_per_minute(426, 80))
    assert.are.equal(23, cars_assemble.calculate_working_cars_per_minute(6824, 20.5))
    assert.are.equal(0, cars_assemble.calculate_working_cars_per_minute(8000, 0))
  end)

  it('should return the cost of producing the given number of cars', function()
    assert.are.equal(0, cars_assemble.calculate_cost(0))
    assert.are.equal(10000, cars_assemble.calculate_cost(1))
    assert.are.equal(20000, cars_assemble.calculate_cost(2))
    assert.are.equal(90000, cars_assemble.calculate_cost(9))
    assert.are.equal(95000, cars_assemble.calculate_cost(10))
    assert.are.equal(200000, cars_assemble.calculate_cost(21))
    assert.are.equal(355000, cars_assemble.calculate_cost(37))
    assert.are.equal(950000, cars_assemble.calculate_cost(100))
    assert.are.equal(1410000, cars_assemble.calculate_cost(148))
  end)
end)
