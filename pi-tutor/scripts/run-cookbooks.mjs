#!/usr/bin/env node
// Runs every cookbook example with the toolchains installed here (`npm run cookbooks`; not part of
// `npm test`). Each example must run with no arguments and exit 0. A missing toolchain is a skip.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
const has = (cmd, args) => spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
const RUN = {
  python: { tag: "python", ok: () => has("python3", ["--version"]), run: (d, src) => { const f = join(d, "x.py"); writeFileSync(f, src); return ["python3", [f], d]; } },
  lua: { tag: "lua", ok: () => has("lua", ["-v"]), run: (d, src) => { const f = join(d, "x.lua"); writeFileSync(f, src); return ["lua", [f], d]; } },
  typescript: { tag: "ts", ok: () => has("node", ["--version"]), run: (d, src) => { const f = join(d, "x.ts"); writeFileSync(f, src); return ["node", [f], d]; } },
  // The module sits in a subfolder: Go ignores a go.mod in the system temp root, and TMPDIR is `d`.
  go: { tag: "go", ok: () => has("go", ["version"]), run: (d, src) => {
    const m = join(d, "mod"); mkdirSync(m);
    writeFileSync(join(m, "go.mod"), "module x\n\ngo 1.22\n");
    if (/func Test\w*\(t \*testing\.T\)/.test(src)) { writeFileSync(join(m, "x_test.go"), src); return ["go", ["test", "./..."], m]; }
    writeFileSync(join(m, "main.go"), src); return ["go", ["run", "."], m]; } },
  rust: { tag: "rust", ok: () => has("rustc", ["--version"]), run: (d, src) => {
    const f = join(d, "x.rs"); writeFileSync(f, src);
    const test = src.includes("#[cfg(test)]");
    execFileSync("rustc", ["--edition", "2024", ...(test ? ["--test"] : []), "-o", join(d, "x"), f], { stdio: "pipe" });
    return [join(d, "x"), [], d]; } },
};

let failed = 0, ran = 0;
for (const [lang, r] of Object.entries(RUN)) {
  const file = join(SKILLS, `tutor-${lang}-cookbook`, "SKILL.md");
  if (!existsSync(file)) continue;
  if (!r.ok()) { process.stdout.write(`skip ${lang}: toolchain not installed\n`); continue; }
  for (const sec of readFileSync(file, "utf8").split(/^## /m).slice(1)) {
    const id = sec.split(":")[0].trim();
    const m = new RegExp("```" + r.tag + "\\n([\\s\\S]*?)\\n```").exec(sec);
    if (!m) continue;
    const d = mkdtempSync(join(tmpdir(), `cb-${lang}-`));
    try {
      const [cmd, args, cwd] = r.run(d, m[1] + "\n");
      const p = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: 60_000, env: { ...process.env, TMPDIR: d } });
      ran++;
      if (p.status !== 0) { failed++; process.stdout.write(`FAIL ${lang} ${id}\n${p.stdout}${p.stderr}\n`); }
    } catch (e) { failed++; ran++; process.stdout.write(`FAIL ${lang} ${id}\n${e.stderr ?? e.message}\n`); }
  }
}
process.stdout.write(`${ran - failed}/${ran} cookbook examples ran\n`);
process.exit(failed ? 1 : 0);
