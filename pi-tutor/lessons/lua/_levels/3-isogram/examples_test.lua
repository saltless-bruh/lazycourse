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
local is_isogram = solution

describe('isogram', function()
  it('empty string', function()
    assert.is_true(is_isogram(''))
  end)

  it('isogram with only lower case characters', function()
    assert.is_true(is_isogram('isogram'))
  end)

  it('word with one duplicated character', function()
    assert.is_false(is_isogram('eleven'))
  end)

  it('word with one duplicated character from the end of the alphabet', function()
    assert.is_false(is_isogram('zzyzx'))
  end)

  it('longest reported english isogram', function()
    assert.is_true(is_isogram('subdermatoglyphic'))
  end)

  it('word with duplicated character in mixed case', function()
    assert.is_false(is_isogram('Alphabet'))
  end)

  it('word with duplicated character in mixed case, lowercase first', function()
    assert.is_false(is_isogram('alphAbet'))
  end)

  it('hypothetical isogrammic word with hyphen', function()
    assert.is_true(is_isogram('thumbscrew-japingly'))
  end)

  it('hypothetical word with duplicated character following hyphen', function()
    assert.is_false(is_isogram('thumbscrew-jappingly'))
  end)

  it('isogram with duplicated hyphen', function()
    assert.is_true(is_isogram('six-year-old'))
  end)

  it('made-up name that is an isogram', function()
    assert.is_true(is_isogram('Emily Jung Schwartzkopf'))
  end)

  it('duplicated character in the middle', function()
    assert.is_false(is_isogram('accentor'))
  end)

  it('same first and last characters', function()
    assert.is_false(is_isogram('angola'))
  end)

  it('word with duplicated character and with two hyphens', function()
    assert.is_false(is_isogram('up-to-date'))
  end)
end)
