import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Headless { proc: ChildProcess; socket: string; root: string; kill(): void }

export async function startHeadlessNvim(): Promise<Headless> {
  const root = mkdtempSync(join(tmpdir(), "pitutor-nvim-"));
  const socket = join(root, "nvim.sock");
  const proc = spawn("nvim", ["--headless", "--clean", "--listen", socket], { cwd: root, stdio: "ignore" });
  const t0 = Date.now();
  while (!existsSync(socket)) {
    if (Date.now() - t0 > 10000) throw new Error("nvim socket did not appear");
    await new Promise((r) => setTimeout(r, 50));
  }
  return { proc, socket, root, kill: () => proc.kill() };
}
