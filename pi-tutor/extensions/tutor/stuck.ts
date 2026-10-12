import type { TutorPayload } from "./nvim.js";
import type { Trigger } from "./ladder.js";

// Stuck detector (spec §5): push payloads + clock → open / cleared / run_passed.
// It does not know whether an episode is open; index.ts ignores "open" while one is.
export type StuckEvent =
  | { type: "open"; trigger: Trigger }
  | { type: "cleared"; path: string; msg: string }
  | { type: "run_passed" };

interface ErrorWatch { line: number; msg: string; since: number; fired: boolean }

export class StuckDetector {
  /** First error per file. Identity is the message; the line may move. */
  private errors = new Map<string, ErrorWatch>();
  /** First churn time per `path:regionStart`. */
  private churnAt = new Map<string, number>();
  private idleLast = -1;
  private idleFired = false;

  constructor(private readonly limits: () => { errorMs: number; idleMs: number }) {}

  observe(p: TutorPayload, now: number): StuckEvent[] {
    const out: StuckEvent[] = [];
    switch (p.kind) {
      case "diagnostics": {
        const prev = this.errors.get(p.path);
        if (p.errors > 0 && p.first) {
          if (prev && prev.msg === p.first.msg) { prev.line = p.first.line; break; }
          if (prev) out.push({ type: "cleared", path: p.path, msg: prev.msg });
          this.errors.set(p.path, { line: p.first.line, msg: p.first.msg, since: now, fired: false });
          out.push(...this.tick(now));
        } else if (prev) {
          this.errors.delete(p.path);
          out.push({ type: "cleared", path: p.path, msg: prev.msg });
        }
        break;
      }
      case "idle": {
        // A smaller since_ms than last time means the learner typed: a new stretch.
        if (p.since_ms < this.idleLast) this.idleFired = false;
        this.idleLast = p.since_ms;
        if (!this.idleFired && p.since_ms >= this.limits().idleMs) {
          this.idleFired = true;
          out.push({ type: "open", trigger: { kind: "idle", path: p.path, line: p.line } });
        }
        break;
      }
      case "churn": {
        const key = `${p.path}:${p.region[0]}`;
        const first = this.churnAt.get(key);
        if (first !== undefined && now - first <= this.limits().idleMs) {
          this.churnAt.delete(key);
          out.push({ type: "open", trigger: { kind: "churn", path: p.path, region: p.region } });
        } else {
          this.churnAt.set(key, now);
        }
        break;
      }
      case "run_output":
        if (p.code === 0) out.push({ type: "run_passed" });
        break;
    }
    return out;
  }

  /** Fires errors that have persisted past the current error threshold, once each. */
  tick(now: number): StuckEvent[] {
    const { errorMs } = this.limits();
    const out: StuckEvent[] = [];
    for (const [path, w] of this.errors) {
      if (!w.fired && now - w.since >= errorMs) {
        w.fired = true;
        out.push({ type: "open", trigger: { kind: "error", path, line: w.line, msg: w.msg } });
      }
    }
    return out;
  }
}
