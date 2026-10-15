#!/usr/bin/env node
// Spec §10: adapted skills drift from upstream. Compares each adapted skill's references/ and the
// recorded upstream version with a fullstack-dev-skills checkout (`npm run upstream-diff [path]`).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const SKILLS = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
const UP = process.argv[2] ?? join(homedir(), ".claude/plugins/marketplaces/fullstack-dev-skills");
if (!existsSync(join(UP, "version.json"))) { process.stdout.write(`no upstream checkout at ${UP}\n`); process.exit(2); }
const upVersion = JSON.parse(readFileSync(join(UP, "version.json"), "utf8")).version;
let drift = 0;
for (const d of readdirSync(SKILLS).filter((n) => /^tutor-.+-expert$/.test(n))) {
  const m = /^\s*upstream: "?fullstack-dev-skills\/([\w-]+)@([\d.]+)/m.exec(readFileSync(join(SKILLS, d, "SKILL.md"), "utf8"));
  if (!m) continue;
  const [, skill, ours] = m;
  if (ours !== upVersion) { drift++; process.stdout.write(`${d}: recorded ${ours}, upstream now ${upVersion}\n`); }
  const refs = join(UP, "skills", skill, "references");
  for (const f of readdirSync(refs)) {
    const mine = join(SKILLS, d, "references", f);
    if (!existsSync(mine)) { drift++; process.stdout.write(`${d}: new upstream reference ${f}\n`); continue; }
    if (readFileSync(mine, "utf8") !== readFileSync(join(refs, f), "utf8")) { drift++; process.stdout.write(`${d}: ${f} differs\n`); }
  }
}
process.stdout.write(drift ? `${drift} difference(s)\n` : "adapted skills match upstream\n");
process.exit(drift ? 1 : 0);
