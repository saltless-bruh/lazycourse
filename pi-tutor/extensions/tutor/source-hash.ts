import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// Spec 2026-10-21 §11a: running code that has not changed since the last failed attempt is not a new attempt.
// The hash covers the learner's source files only: not the plan, lessons, exams, build output, virtualenvs, dot
// folders or the data a program writes (final review I4).
const SKIP = new Set(["node_modules", "target", "__pycache__", "spec", "learn", "exam", "venv", "env", "build", "dist", "out"]);
const MAX_FILES = 200, MAX_BYTES = 1024 * 1024, MAX_FILE = 256 * 1024;
/** Final review I4: source files only. Data the program writes on each run (json, txt, logs) is not a new try. */
const SOURCE = /\.(?:py|rs|go|ts|tsx|mts|cts|js|jsx|mjs|cjs|lua|c|h|cpp|hpp|cc|java|kt|swift|zig|rb|php|cs|hs|ml|ex|exs|sh)$/;
/** Dot folders (.git, .venv, .pi, .checks) and the skip list; final review I4: a big .venv used up the budget. */
const skipDir = (name: string) => name.startsWith(".") || SKIP.has(name);

export function sourceHash(root: string): string {
  const h = createHash("sha1");
  let files = 0, bytes = 0;
  const walk = (dir: string) => {
    let names: string[];
    try { names = readdirSync(dir).sort(); } catch { return; }
    for (const name of names) {
      if (files >= MAX_FILES || bytes >= MAX_BYTES) return;
      const abs = join(dir, name);
      let st;
      try { st = lstatSync(abs); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { if (!skipDir(name)) walk(abs); continue; }
      if (!st.isFile() || !SOURCE.test(name) || st.size > MAX_FILE) continue;
      let text: Buffer;
      try { text = readFileSync(abs); } catch { continue; }
      files++; bytes += text.length;
      h.update(relative(root, abs)).update("\0").update(text).update("\0");
    }
  };
  walk(root);
  return h.digest("hex");
}

/** The learner's source texts under `root` (same files the hash covers): their own names come from these. */
export function projectSources(root: string): string[] {
  const out: string[] = [];
  let bytes = 0;
  const walk = (dir: string) => {
    let names: string[];
    try { names = readdirSync(dir).sort(); } catch { return; }
    for (const name of names) {
      if (out.length >= MAX_FILES || bytes >= MAX_BYTES) return;
      const abs = join(dir, name);
      let st;
      try { st = lstatSync(abs); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { if (!skipDir(name)) walk(abs); continue; }
      if (!st.isFile() || !SOURCE.test(name) || st.size > MAX_FILE) continue;
      let text: string;
      try { text = readFileSync(abs, "utf8"); } catch { continue; }
      if (text.includes("\0")) continue;
      bytes += text.length;
      out.push(text);
    }
  };
  walk(root);
  return out;
}
