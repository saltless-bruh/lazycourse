import { describe, it, expect } from "vitest";
import { luaRuntime, luarcJson } from "../extensions/tutor/luarc.js";

describe("luaRuntime (lua_ls Lua.runtime.version names, template.lua:187-194)", () => {
  it("names the installed Lua the way lua_ls does", () => {
    expect(luaRuntime("Lua 5.5.1  Copyright (C) 1994-2025 Lua.org, PUC-Rio")).toBe("Lua 5.5");
    expect(luaRuntime("Lua 5.4.6  Copyright (C) 1994-2023 Lua.org, PUC-Rio")).toBe("Lua 5.4");
    expect(luaRuntime("LuaJIT 2.1.1713484068 -- Copyright (C) 2005-2023 Mike Pall.")).toBe("LuaJIT");
    expect(luaRuntime("Lua 5.6.0  Copyright (C) 1994-2027 Lua.org, PUC-Rio")).toBe("Lua 5.5");
    expect(luaRuntime("bash: lua: command not found")).toBeNull();
  });
  it("writes a .luarc.json lua_ls reads", () => {
    expect(JSON.parse(luarcJson("Lua 5.5"))).toEqual({ $schema: "https://raw.githubusercontent.com/LuaLS/vscode-lua/master/setting/schema.json", "runtime.version": "Lua 5.5" });
    expect(luarcJson("Lua 5.5").endsWith("}\n")).toBe(true);
  });
});
