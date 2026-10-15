import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";

// The one way the extension writes into a project (M8): exam files and spec/tasks.md.
// CLAUDE.md: every path is inside the root after realpath; a symlinked folder or file never leads out.
const inside = (real: string, root: string) => real === root || real.startsWith(root + sep);

/** The nearest existing ancestor of `p` (checked before any folder is made, so nothing is created outside). */
function nearestExisting(p: string): string {
  let d = p;
  while (!existsSync(d)) d = dirname(d);
  return d;
}

export function writeInRoot(root: string, rel: string, text: string, opts: { exclusive?: boolean } = {}): string {
  if (isAbsolute(rel) || normalize(rel).split(sep).includes("..")) throw new Error(`${rel} is not a path inside the project`);
  const realRoot = realpathSync(root);
  const abs = join(realRoot, normalize(rel));
  if (!inside(realpathSync(nearestExisting(dirname(abs))), realRoot)) throw new Error(`${rel} resolves outside the project`);
  mkdirSync(dirname(abs), { recursive: true });
  if (existsSync(abs) && !inside(realpathSync(abs), realRoot)) throw new Error(`${rel} resolves outside the project`);
  writeFileSync(abs, text, { flag: opts.exclusive ? "wx" : "w" });
  return abs;
}
