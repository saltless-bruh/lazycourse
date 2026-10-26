import type { TutorPayload } from "./nvim.js";
import type { Trigger } from "./ladder.js";

// Stuck detector (spec §5): push payloads + clock → open / cleared / run_passed.
// `canOpen` says whether the caller would accept a new episode now; a refused
// trigger is not consumed, so it fires once the caller is free.
export type StuckEvent =
  | { type: "open"; trigger: Trigger }
  | { type: "cleared"; path: string; msg: string }
  | { type: "run_passed" };

/** How much of a failing run's output an episode carries (spec 2026-10-13 §7 #4). */
export const TRACE_LINES = 30;
export const TRACE_CHARS = 3000;

function tail(text: string, lines: number, chars: number): string {
  const t = text.split(/\r?\n/).filter((l) => l.trim()).slice(-lines).join("\n");
  return t.length > chars ? t.slice(-chars) : t;
}

/**
 * The end of the output, where traces put the error. Test runners (cargo test, npm test) print the
 * failure on stdout and only a summary on stderr (final review I2), so when both streams have text
 * the trace carries the tail of each, labelled.
 */
export function traceOf(stdout: string, stderr: string): string {
  const out = stdout.trim(), err = stderr.trim();
  if (!out || !err) return tail(out || err, TRACE_LINES, TRACE_CHARS);
  const half = Math.floor(TRACE_CHARS / 2) - 10;
  return `stdout:\n${tail(out, TRACE_LINES / 2, half)}\nstderr:\n${tail(err, TRACE_LINES / 2, half)}`;
}

/** What a run's attempts are on (spec 2026-10-21 §5): its error line, numbers blurred so a new value is the same spot. */
export function spotOf(trace: string): string {
  return spotLine(trace).replace(/-?\d+(?:\.\d+)?/g, "#").slice(0, 120);
}

/** The error line spotOf keys on, as the run printed it (what a learner-facing fallback quotes). */
export function spotLine(trace: string): string {
  // Stack frames name functions, not what went wrong: Lua's "[C]: in function 'error'", Node's "at …", Go's
  // goroutine dump, Python's "File …" lines.
  // Lua frames also read "check.lua:6: in local 'check'" or "in global 'require'".
  const frame = /^(?:at |\[C\]|stack traceback|Traceback \(most recent call last\)|goroutine |File "|# \S|note: run with|\S+:\d+: in |.*\bin (?:function|main chunk|\?)|\/.*:\d+ \+0x)/;
  const lines = trace.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !frame.test(l));
  // A message without an error word (Lua's error(msg, 0)) comes first, before its frames.
  const i = lines.map((l) => /error|exception|panic|assert|failed/i.test(l)).lastIndexOf(true);
  let line = i >= 0 ? lines[i] : lines[0] ?? "";
  // Final review I3: a bare exception name (Python's message-less assert) says what failed only with the code line
  // printed above it; a Rust "panicked at …:" header has its message on the line below.
  if (i >= 0 && /^\w+:?$/.test(line) && i > 0) line = `${line} at ${lines[i - 1]}`;
  else if (i >= 0 && /panicked at .*:$/.test(line) && lines[i + 1]) line = `${line} ${lines[i + 1]}`;
  return line.slice(0, 200);
}

interface ErrorWatch { line: number; msg: string; since: number; fired: boolean }

/**
 * Author 2026-10-21: a failed run is a typo run when its own output is a syntax error (Python, Lua, JS/TS,
 * Go, Rust). Runtime and type errors are not: they are graded tries.
 */
const SYNTAX = [
  /^\s*(SyntaxError|IndentationError|TabError)\b/m,
  /'[^']*' expected near |unexpected symbol near |unfinished (string|long string|long comment) near /,
  /\bsyntax error\b/,
  /^error: (expected|unexpected|mismatched closing delimiter|this file contains an unclosed delimiter)\b/m,
];
export function isSyntaxError(trace: string): boolean {
  return SYNTAX.some((re) => re.test(trace));
}

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
    /** Spec 2026-10-26 §5.2: false = an error that sits never nudges; the learner asks (right-click). */
    private readonly opts: { errorNudges?: boolean } = {},
  ) {}

  /** When the file's current first error appeared, or null. */
  errorSince(path: string): number | null {
    return this.errors.get(path)?.since ?? null;
  }

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
        // A failed run is the learner's own explicit check: it opens even when another episode is open.
        out.push(p.code === 0 ? { type: "run_passed" } : { type: "open", trigger: { kind: "run", cmd: p.cmd, code: p.code, trace: traceOf(p.stdout, p.stderr) } });
        break;
    }
    return out;
  }

  /** Fires errors that have persisted past the current error threshold, once each. */
  tick(now: number): StuckEvent[] {
    const { errorMs } = this.limits();
    const out: StuckEvent[] = [];
    if (this.opts.errorNudges === false) return out;
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
