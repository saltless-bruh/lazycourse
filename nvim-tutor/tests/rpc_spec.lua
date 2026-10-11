local rpc = require("tutor.rpc")
local fixture = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":p:h") .. "/fixtures/fake_pi.js"

describe("rpc.split_records", function()
  it("returns complete lines and keeps the remainder", function()
    local recs, rest = rpc.split_records('{"a":1}\n{"b":2}\n{"c"')
    assert.same({ '{"a":1}', '{"b":2}' }, recs)
    assert.equals('{"c"', rest)
  end)
  it("strips a trailing CR and skips empty lines", function()
    local recs, rest = rpc.split_records('{"a":1}\r\n\n')
    assert.same({ '{"a":1}' }, recs)
    assert.equals("", rest)
  end)
  it("does not split on U+2028 inside a string", function()
    local recs = rpc.split_records('{"s":"a\226\128\168b"}\n')
    assert.equals(1, #recs)
    assert.equals("a\226\128\168b", vim.json.decode(recs[1]).s)
  end)
end)

describe("rpc client against fake pi", function()
  local function start(on_exit)
    local events = {}
    local client = rpc.new({
      cmd = { "node", fixture },
      cwd = vim.fn.getcwd(),
      on_event = function(ev) table.insert(events, ev) end,
      on_exit = on_exit or function() end,
    })
    return client, events
  end

  it("correlates a response and dispatches split/merged events", function()
    local client, events = start()
    local resp
    client:request({ type = "prompt", message = "hi" }, function(r) resp = r end)
    vim.wait(2000, function() return resp ~= nil and #events >= 4 end)
    assert.equals("started", resp.data.disposition)
    local deltas = {}
    for _, ev in ipairs(events) do
      if ev.type == "message_update" then table.insert(deltas, ev.assistantMessageEvent.delta) end
    end
    assert.same({ "Hel", "lo\226\128\168!" }, deltas)
    assert.equals("agent_settled", events[#events].type)
    client:close()
  end)

  it("reports handled dispositions", function()
    local client = start()
    local resp
    client:request({ type = "prompt", message = '@@tutor-signal {"type":"ping"}' }, function(r) resp = r end)
    vim.wait(2000, function() return resp ~= nil end)
    assert.equals("handled", resp.data.disposition)
    client:close()
  end)

  it("calls on_exit with the exit code and reports not alive", function()
    local code
    local client = start(function(c) code = c end)
    client:request({ type = "exit" }, function() end)
    vim.wait(2000, function() return code ~= nil end)
    assert.equals(3, code)
    assert.is_false(client:is_alive())
  end)
end)
