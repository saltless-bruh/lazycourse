#!/usr/bin/env node
// Worst-case rendered size of each pack card (`node scripts/card-size.mjs [lang…]`), the same
// estimate the budget test uses: ceil(chars / 4), with every language known and a long constraint.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PACKS = join(dirname(fileURLToPath(import.meta.url)), "..", "packs");
const HEADER = 380; // the six header lines at their longest
for (const lang of process.argv.slice(2).length ? process.argv.slice(2) : ["python", "rust", "go", "typescript", "lua", "editor"]) {
  const f = join(PACKS, lang, "card.md");
  if (!existsSync(f)) continue;
  const t = readFileSync(f, "utf8");
  const i = t.indexOf("## Concept tags");
  const body = (i < 0 ? t : t.slice(0, i)).trim();
  const tags = i < 0 ? [] : t.slice(i).split("\n").map((l) => /^- `([^`]+)`:\s*(.*?)(?:\s*\(aliases:[^)]*\))?\s*$/.exec(l)).filter(Boolean);
  const line = tags.map((m) => "`" + m[1] + "` " + m[2]).join(" · ");
  const total = Math.ceil(((lang === "editor" ? 25 : HEADER) + body.length + line.length + 6) / 4);
  process.stdout.write(`${lang}: ≈${total} tokens (limit ${lang === "editor" ? 300 : 600}), ${tags.length} tags\n`);
}
