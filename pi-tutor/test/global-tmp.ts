// The /tmp leak (2026-11-04: 222 sandbox caches of 66 MB filled /tmp). Tests make throwaway folders with
// mkdtemp(tmpdir()) and do not remove them. Before the workers start, TMPDIR points at one folder for this run,
// so every one of them lands inside it (os.tmpdir() reads TMPDIR); the teardown removes that folder. A run that
// crashed left its folder behind: the next run removes any whose process is gone.
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

export function setup() {
  const system = tmpdir();
  for (const name of readdirSync(system)) {
    const m = /^lazycourse-test-(\d+)$/.exec(name);
    if (m && !alive(Number(m[1]))) rmSync(join(system, name), { recursive: true, force: true });
  }
  const run = join(system, `lazycourse-test-${process.pid}`);
  mkdirSync(run, { recursive: true });
  process.env.LAZYCOURSE_SYSTEM_TMP = system;
  process.env.TMPDIR = run;
  return () => { rmSync(run, { recursive: true, force: true }); };
}
