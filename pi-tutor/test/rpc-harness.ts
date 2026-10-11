import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export type Record = { [k: string]: unknown; type: string };

export interface PiHandle {
  send(record: Record): void;
  waitFor(pred: (r: Record) => boolean, timeoutMs?: number): Promise<Record>;
  received: Record[];
  stderr: string[];
  close(): void;
}

export function spawnPi(cwd: string, extraArgs: string[] = []): PiHandle {
  const proc: ChildProcessWithoutNullStreams = spawn(
    "pi",
    ["--mode", "rpc", "--no-session", "--tools", "read,bash,grep,find,ls", ...extraArgs],
    { cwd, stdio: ["pipe", "pipe", "pipe"] },
  );
  const received: Record[] = [];
  const stderr: string[] = [];
  const waiters: { pred: (r: Record) => boolean; resolve: (r: Record) => void }[] = [];
  let buf = "";
  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (c: string) => stderr.push(c));
  proc.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      if (!line) continue;
      const rec = JSON.parse(line) as Record;
      received.push(rec);
      for (let w = waiters.length - 1; w >= 0; w--) {
        if (waiters[w].pred(rec)) waiters.splice(w, 1)[0].resolve(rec);
      }
    }
  });
  return {
    received,
    stderr,
    send(record) { proc.stdin.write(JSON.stringify(record) + "\n"); },
    waitFor(pred, timeoutMs = 15000) {
      const hit = received.find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout waiting for record; stderr: " + stderr.join("").slice(0, 500) + "; received types: " + received.map((r) => r.type).join(","))), timeoutMs);
        waiters.push({ pred, resolve: (r) => { clearTimeout(t); resolve(r); } });
      });
    },
    close() { proc.kill(); },
  };
}
