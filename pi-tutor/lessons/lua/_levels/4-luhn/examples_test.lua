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
local luhn = solution

describe('luhn', function()
  it('single digit strings can not be valid', function()
    assert.is_false(luhn.valid('1'))
  end)

  it('a single zero is invalid', function()
    assert.is_false(luhn.valid('0'))
  end)

  it('a simple valid sin that remains valid if reversed', function()
    assert.is_true(luhn.valid('059'))
  end)

  it('a simple valid sin that becomes invalid if reversed', function()
    assert.is_true(luhn.valid('59'))
  end)

  it('a valid canadian sin', function()
    assert.is_true(luhn.valid('055 444 285'))
  end)

  it('invalid canadian sin', function()
    assert.is_false(luhn.valid('055 444 286'))
  end)

  it('invalid credit card', function()
    assert.is_false(luhn.valid('8273 1232 7352 0569'))
  end)

  it('invalid long number with an even remainder', function()
    assert.is_false(luhn.valid('1 2345 6789 1234 5678 9012'))
  end)

  it('invalid long number with a remainder divisible by 5', function()
    assert.is_false(luhn.valid('1 2345 6789 1234 5678 9013'))
  end)

  it('valid number with an even number of digits', function()
    assert.is_true(luhn.valid('095 245 88'))
  end)

  it('valid number with an odd number of spaces', function()
    assert.is_true(luhn.valid('234 567 891 234'))
  end)

  it('valid strings with a non-digit added at the end become invalid', function()
    assert.is_false(luhn.valid('059a'))
  end)

  it('valid strings with punctuation included become invalid', function()
    assert.is_false(luhn.valid('055-444-285'))
  end)

  it('valid strings with symbols included become invalid', function()
    assert.is_false(luhn.valid('055# 444$ 285'))
  end)

  it('single zero with space is invalid', function()
    assert.is_false(luhn.valid(' 0'))
  end)

  it('more than a single zero is valid', function()
    assert.is_true(luhn.valid('0000 0'))
  end)

  it('input digit 9 is correctly converted to output digit 9', function()
    assert.is_true(luhn.valid('091'))
  end)

  it('very long input is valid', function()
    assert.is_true(luhn.valid('9999999999 9999999999 9999999999 9999999999'))
  end)

  it('valid luhn with an odd number of digits and non zero first digit', function()
    assert.is_true(luhn.valid('109'))
  end)

  it('using ascii value for non-doubled non-digit isn\'t allowed', function()
    assert.is_false(luhn.valid('055b 444 285'))
  end)

  it('using ascii value for doubled non-digit isn\'t allowed', function()
    assert.is_false(luhn.valid(':9'))
  end)

  it('non-numeric, non-space char in the middle with a sum that\'s divisible by 10 isn\'t allowed', function()
    assert.is_false(luhn.valid('59%59'))
  end)
end)
