local M = {}

function M.ask_number(read)
  while true do
    local line = read()
    if line == nil then return nil end
    local n = tonumber(line)
    if n and n == math.floor(n) then return n end
  end
end

return M
