local function file(text)
  local p = os.tmpname()
  local f = assert(io.open(p, "w")); f:write(text); f:close()
  return p
end
check("three lines", function() assert(solution.count_lines(file("a\nb\nc\n")) == 3) end)
check("empty file", function() assert(solution.count_lines(file("")) == 0) end)
