// Author 2026-10-21: a Lua project names the Lua it runs, so lua_ls (LuaJIT by default in LazyVim) does not mark
// what that Lua allows (`//`, `goto`, integers). The names are lua_ls's own (script/config/template.lua:187-194).

const NEWEST = 5;

/** `lua -v` output → lua_ls's `Lua.runtime.version`, or null when it is not a Lua version line. */
export function luaRuntime(versionOutput: string): string | null {
  if (/\bLuaJIT\b/.test(versionOutput)) return "LuaJIT";
  const m = /\bLua (\d+)\.(\d+)/.exec(versionOutput);
  if (!m) return null;
  const major = Number(m[1]), minor = Number(m[2]);
  if (major > 5 || (major === 5 && minor > NEWEST)) return `Lua 5.${NEWEST}`;
  return major === 5 && minor >= 1 ? `Lua 5.${minor}` : null;
}

export function luarcJson(runtime: string): string {
  return `${JSON.stringify({ $schema: "https://raw.githubusercontent.com/LuaLS/vscode-lua/master/setting/schema.json", "runtime.version": runtime }, null, 2)}\n`;
}
