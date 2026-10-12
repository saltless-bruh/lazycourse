import type { TutorPayload } from "./nvim.js";
import type { Trigger } from "./ladder.js";

// Stuck detector (spec §5): push payloads + clock → open / cleared / run_passed.
// `canOpen` says whether the caller would accept a new episode now; a refused
// trigger is not consumed, so it fires once the caller is free.
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

  constructor(
    private readonly limits: () => { errorMs: number; idleMs: number },
    private readonly canOpen: () => boolean = () => true,
  ) {}

  /** Track an error whose episode was restored from the session, already fired. */
  adopt(t: Trigger, now: number): void {
    if (t.kind === "error") this.errors.set(t.path, { line: t.line, msg: t.msg, since: now, fired: true });
  }

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
        if (!this.idleFired && p.since_ms >= this.limits().idleMs && this.canOpen()) {
          this.idleFired = true;
          out.push({ type: "open", trigger: { kind: "idle", path: p.path, line: p.line } });
        }
        break;
      }
      case "churn": {
        // Every keystroke is a TextChanged edit, so churn alone is just typing;
        // it counts only as rewriting around an error the file still has.
        if (!this.errors.has(p.path)) break;
        const key = `${p.path}:${p.region[0]}`;
        const first = this.churnAt.get(key);
        if (first !== undefined && now - first <= this.limits().idleMs) {
          if (this.canOpen()) {
            this.churnAt.delete(key);
            out.push({ type: "open", trigger: { kind: "churn", path: p.path, region: p.region } });
          }
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
      if (!w.fired && now - w.since >= errorMs && this.canOpen()) {
        w.fired = true;
        out.push({ type: "open", trigger: { kind: "error", path, line: w.line, msg: w.msg } });
        break; // one episode at a time; the rest fire on later ticks
      }
    }
    return out;
  }
}
