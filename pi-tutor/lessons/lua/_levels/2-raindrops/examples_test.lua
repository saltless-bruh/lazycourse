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
local raindrops = solution

describe('raindrops', function()
  it('the sound for 1 is 1', function()
    assert.equal('1', raindrops(1))
  end)

  it('the sound for 3 is pling', function()
    assert.equal('Pling', raindrops(3))
  end)

  it('the sound for 5 is plang', function()
    assert.equal('Plang', raindrops(5))
  end)

  it('the sound for 7 is plong', function()
    assert.equal('Plong', raindrops(7))
  end)

  it('the sound for 6 is pling as it has a factor 3', function()
    assert.equal('Pling', raindrops(6))
  end)

  it('2 to the power 3 does not make a raindrop sound as 3 is the exponent not the base', function()
    assert.equal('8', raindrops(8))
  end)

  it('the sound for 9 is pling as it has a factor 3', function()
    assert.equal('Pling', raindrops(9))
  end)

  it('the sound for 10 is plang as it has a factor 5', function()
    assert.equal('Plang', raindrops(10))
  end)

  it('the sound for 14 is plong as it has a factor of 7', function()
    assert.equal('Plong', raindrops(14))
  end)

  it('the sound for 15 is plingplang as it has factors 3 and 5', function()
    assert.equal('PlingPlang', raindrops(15))
  end)

  it('the sound for 21 is plingplong as it has factors 3 and 7', function()
    assert.equal('PlingPlong', raindrops(21))
  end)

  it('the sound for 25 is plang as it has a factor 5', function()
    assert.equal('Plang', raindrops(25))
  end)

  it('the sound for 27 is pling as it has a factor 3', function()
    assert.equal('Pling', raindrops(27))
  end)

  it('the sound for 35 is plangplong as it has factors 5 and 7', function()
    assert.equal('PlangPlong', raindrops(35))
  end)

  it('the sound for 49 is plong as it has a factor 7', function()
    assert.equal('Plong', raindrops(49))
  end)

  it('the sound for 52 is 52', function()
    assert.equal('52', raindrops(52))
  end)

  it('the sound for 105 is plingplangplong as it has factors 3, 5 and 7', function()
    assert.equal('PlingPlangPlong', raindrops(105))
  end)

  it('the sound for 3125 is plang as it has a factor 5', function()
    assert.equal('Plang', raindrops(3125))
  end)
end)
