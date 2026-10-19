local M = {}

function M.count_lines(path)
  local n = 0
  for _ in io.lines(path) do n = n + 1 end
  return n
end

return M
