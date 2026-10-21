import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// Spec 2026-10-21 §11a: running code that has not changed since the last failed attempt is not a new attempt.
// The hash covers the learner's files only: not the plan, lessons, exams, build output or tool folders.
const SKIP = new Set([".git", "node_modules", "target", "__pycache__", "spec", "learn", "exam", ".pi", ".checks"]);
const MAX_FILES = 200, MAX_BYTES = 1024 * 1024;

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
      if (st.isDirectory()) { if (!SKIP.has(name)) walk(abs); continue; }
      if (!st.isFile()) continue;
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
      if (st.isDirectory()) { if (!SKIP.has(name)) walk(abs); continue; }
      if (!st.isFile() || st.size > 256 * 1024) continue;
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
