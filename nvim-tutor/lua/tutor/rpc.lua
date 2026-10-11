local M = {}

--- Split a buffer into complete LF-terminated records and the unread rest.
---@param buf string
---@return string[] records, string rest
function M.split_records(buf)
  local records = {}
  local start = 1
  while true do
    local nl = buf:find("\n", start, true)
    if not nl then break end
    local line = buf:sub(start, nl - 1)
    if line:sub(-1) == "\r" then line = line:sub(1, -2) end
    if line ~= "" then table.insert(records, line) end
    start = nl + 1
  end
  return records, buf:sub(start)
end

local Client = {}
Client.__index = Client

---@class TutorRpcOpts
---@field cmd string[]
---@field cwd string
---@field on_event fun(ev: table)
---@field on_exit fun(code: integer)

---@param opts TutorRpcOpts
function M.new(opts)
  local self = setmetatable({
    next_id = 0,
    pending = {},
    rest = "",
    alive = false,
    on_event = opts.on_event,
  }, Client)
  self.proc = vim.system(opts.cmd, {
    cwd = opts.cwd,
    stdin = true,
    stdout = function(err, data)
      if err or not data then return end
      vim.schedule(function() self:_feed(data) end)
    end,
    stderr = function(_, data)
      if data then vim.schedule(function() vim.notify("[tutor/pi] " .. data, vim.log.levels.DEBUG) end) end
    end,
  }, function(result)
    self.alive = false
    vim.schedule(function() opts.on_exit(result.code) end)
  end)
  self.alive = true
  return self
end

function Client:_feed(data)
  local records, rest = M.split_records(self.rest .. data)
  self.rest = rest
  for _, line in ipairs(records) do
    local ok, rec = pcall(vim.json.decode, line)
    if ok and type(rec) == "table" then
      if rec.type == "response" and rec.id and self.pending[rec.id] then
        local cb = self.pending[rec.id]
        self.pending[rec.id] = nil
        cb(rec)
      else
        self.on_event(rec)
      end
    end
  end
end

---@param record table
---@param cb fun(resp: table)
function Client:request(record, cb)
  self.next_id = self.next_id + 1
  local id = "nvim-" .. self.next_id
  record.id = id
  self.pending[id] = cb
  self.proc:write(vim.json.encode(record) .. "\n")
end

function Client:is_alive() return self.alive end

function Client:close()
  if self.alive then
    pcall(function() self.proc:write(nil) end)
    self.proc:kill("sigterm")
    self.alive = false
  end
end

return M
