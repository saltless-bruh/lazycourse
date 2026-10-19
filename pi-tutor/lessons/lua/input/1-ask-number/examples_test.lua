local function typed(...)
  local answers, i = { ... }, 0
  return function() i = i + 1; return answers[i] end
end
check("first try", function() assert(solution.ask_number(typed("7")) == 7) end)
check("keeps asking", function() assert(solution.ask_number(typed("seven", "", "12")) == 12) end)
