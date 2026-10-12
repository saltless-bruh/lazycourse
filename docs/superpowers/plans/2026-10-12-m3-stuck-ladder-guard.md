# nvim-tutor M3: stuck detector, hint ladder, tool guard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A persisting error, a long pause, or rewriting the same lines opens a stuck episode, which shows in the widget and sends Pi one `[tutor]` nudge. Each episode carries a hint rung that goes up only when the model judges the learner's reasoning `correct`. A `tool_call` guard refuses every tool except `read/grep/find/ls`, and refuses those too when the path is outside the project root.

**Architecture:** Three new pure modules. `ladder.ts` holds the episode type, the rung rules and judgment application. `stuck.ts` holds the `StuckDetector`, which turns push payloads plus the clock into open/cleared/run-passed events. `guard.ts` resolves tool paths the way Pi does and checks them against the root. A new prompt file, `prompts/system/ladder.md`, joins the band section. `context.ts` gains `formatEpisodeContext`, which rides in the existing hidden `tutor_editor` message. `index.ts` wires these together: payloads and a 5 s tick go to the detector, the detector opens and closes episodes, `turn_end` applies judgments, `tool_call` runs the guard, and the latest open `tutor_episode` entry is restored on resume.

**Tech Stack:** Pi 1.1.0 extension API (`tool_call`, `sendUserMessage`, `ctx.isIdle`, `appendEntry`, `sessionManager.getBranch`), TypeScript, `neovim` npm client 5.5, vitest with a real headless Neovim.

**Spec:** `docs/superpowers/specs/2026-10-07-nvim-tutor-design.md` (rev 4; sections 4, 5, 8 "Tool fence", 9, 10 row M3, 11)

## Global Constraints

- Pi `^1.0`, Node ≥ 22.19, unmodified upstream Pi. Pi runs with `--tools read,grep,find,ls`.
- Nothing in the extension writes to stdout/stderr: no `console.*`.
- Every new Pi or Neovim call is verified in `pi-tutor/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` and listed in `pi-tutor/PI_SURFACE.md` (Task 6). Those already verified while writing this plan are `tool_call` (types.d.ts:907-960, 1065, 1200), `sendUserMessage` (1243), `ctx.isIdle()` (236), `BeforeAgentStartEvent.prompt` (711), and `StopReason` (`pi-ai/dist/types.d.ts:313`).
- The editor path, the tool path and every pull must be inside the project root, compared as `root + "/"` after `realpath`.
- Rungs: 1 question, 2 concept, 3 pointer, 4 pseudocode, 5 reveal. The start rung is 3 for beginner, 2 for intermediate and 1 for pro. Only `correct` advances, by one rung; `partial`, `wrong` and `none` hold. Pro caps at 4. There is no manual override (spec §5).
- Error thresholds: beginner 0, intermediate 1 min, pro 3 min. Idle thresholds: 2, 5 and 10 min. Both interpolate per `policy.thresholds(level)` (spec §4, M2).
- Episode state is persisted with `pi.appendEntry("tutor_episode", …)` (spec §5).
- Proactive messages are prefixed `[tutor]` and sent with `deliverAs: "followUp"` (spec §9).
- Widget lines stay ≤ 44 display cells (`ui.ts` clips).
- One module per responsibility. Tests live in `pi-tutor/test/<module>.test.ts`.
- TDD: write the failing test, watch it fail, then implement. Run `cd pi-tutor && npm test` and `npm run typecheck`.

## Plan decisions (deviations from the spec's letter, carried as rulings)

- **The extension only does anything in Pi sessions that Neovim started** (user decision, option B). pi-tutor is installed globally in `~/.pi/agent/settings.json`, so it loads in every Pi session. `nvim-tutor` starts Pi with `PI_TUTOR=1` in its environment. Without that variable, the extension returns right away and registers nothing: no band prompt, no widget, no guard, no commands. Plain `pi` stays untouched. When the variable is set, the guard allows `read/grep/find/ls` inside `ctx.cwd` and blocks everything else. Cost: a `pi` started by hand in a tutor project has no tutor and no guard unless you export `PI_TUTOR=1` yourself (Task 6).
- **`bash` stays off.** The spec allows a read-only command filter in M3. A shell filter that is actually read-only (pipes, `$(…)`, redirects, `find -exec`, `sed -i`, `git` subcommands) is a large attack surface for little gain, because the learner runs code through `:TutorRun`. The guard blocks `bash` and returns a reason that tells the model to ask the learner to run it.
- **Error identity is path plus first-error message.** If the line moves but the message stays the same, it is the same error. Each error fires at most once, so an error that persists after an episode closes by judgment doesn't reopen it.
- **Churn opens an episode when the same 20-line region churns twice within the idle threshold.** The spec says "churn past the idle threshold" without saying how. Cost if wrong: tune one rule in `stuck.ts`.
- **Idle opens once per idle stretch.** A stretch resets when a later `since_ms` is smaller than the previous one, which means the learner typed in between.
- **A learner chat message opens a `chat` episode** when none is open (spec §5). `[tutor]` nudges never do. Chat episodes close only by judgment or a passing run.
- **One nudge per editor-triggered episode, sent only if `ctx.isIdle()`.** If Pi is mid-reply, the episode opens silently. Two things wait for later milestones. Beginner proactive explanations outside an episode wait for M6. Lowering the start rung for concepts with ease ≥ 0.7 waits for M4, which adds the profile. Rung ≥ 3 `file:line` opening waits for M5/M6, along with the deferred `openLocation` root check.
- **Episode context rides in the same hidden `tutor_editor` message** as the snapshot, so the existing `context` pruning keeps only the newest. Detached sessions now return a message whenever an episode is open. The M2 smoke assertion "no message when detached" changes on purpose (Task 5).
- **Only `stopReason === "stop"` turns are judged.** This fixes M2's deferred "aborted replies show judged missing", and it keeps the rung from moving on an aborted or errored reply.
- **At pro, rung 4 is the shape of the fix in words.** `pro.md` forbids even pseudocode, so the two prompt files must agree.

## Review Focus

1. A symlink inside the root that points outside (`etc-link -> /etc`): `read etc-link/passwd` is blocked (Task 3 test).
2. A path that does not exist yet (`src/new/x.py`) is judged by its nearest existing parent. `src/../../x` is blocked (Task 3 test).
3. An error that persists after the model closes its episode doesn't reopen an episode or send a second nudge (Task 2 test).
4. An aborted or errored reply leaves the rung, the episode and the widget unchanged (Task 5 test).
5. A new error while Pi is mid-reply opens the episode but sends no nudge (Task 5 real-Neovim test).

---

### Task 1: Ladder module (episode, rungs, judgment application)

**Files:**
- Create: `pi-tutor/extensions/tutor/ladder.ts`
- Test: `pi-tutor/test/ladder.test.ts`

**Interfaces:**
- Consumes: `startRung(band)`, `Band` from `policy.ts`; `Judgment` from `judgment.ts`.
- Produces:
  ```ts
  export const RUNG_NAMES: readonly ["question", "concept", "pointer", "pseudocode", "reveal"];
  export type Trigger =
    | { kind: "error"; path: string; line: number; msg: string }
    | { kind: "idle"; path: string; line: number }
    | { kind: "churn"; path: string; region: [number, number] }
    | { kind: "chat" };
  export type CloseReason = "cleared" | "run_passed" | "judged";
  export interface Episode { id: string; trigger: Trigger; band: Band; rung: number; opened: number; turns: number; concept_tags: string[]; closed?: number; closeReason?: CloseReason }
  export function rungCap(band: Band): 4 | 5;
  export function openEpisode(trigger: Trigger, band: Band, now: number): Episode;
  export function nextRung(rung: number, judgment: JudgmentValue, band: Band): number;
  export function applyJudgment(ep: Episode, j: Judgment, now: number): Episode;
  export function closeEpisode(ep: Episode, reason: CloseReason, now: number): Episode;
  export function rebandEpisode(ep: Episode, band: Band): Episode;
  export function describeTrigger(t: Trigger): string;
  ```

- [ ] **Step 1: Write the failing test**

`pi-tutor/test/ladder.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { openEpisode, nextRung, applyJudgment, closeEpisode, rebandEpisode, rungCap, describeTrigger, RUNG_NAMES } from "../extensions/tutor/ladder.js";
import type { Judgment } from "../extensions/tutor/judgment.js";

const j = (judgment: Judgment["judgment"], over: Partial<Judgment> = {}): Judgment =>
  ({ judgment, concept_tags: [], task_done_ids: [], episode_closed: false, ...over });
const err = { kind: "error" as const, path: "/p/src/a.py", line: 3, msg: "boom" };

describe("openEpisode", () => {
  it("starts at the band's start rung with no turns", () => {
    expect(openEpisode(err, "beginner", 1000)).toEqual({ id: "ep-1000", trigger: err, band: "beginner", rung: 3, opened: 1000, turns: 0, concept_tags: [] });
    expect(openEpisode({ kind: "chat" }, "intermediate", 1).rung).toBe(2);
    expect(openEpisode({ kind: "chat" }, "pro", 1).rung).toBe(1);
  });
});

describe("nextRung", () => {
  it("advances one rung only on correct", () => {
    expect(nextRung(2, "correct", "intermediate")).toBe(3);
    for (const v of ["partial", "wrong", "none"] as const) expect(nextRung(2, v, "intermediate")).toBe(2);
  });
  it("caps at 5, and at 4 for pro", () => {
    expect(rungCap("beginner")).toBe(5);
    expect(rungCap("intermediate")).toBe(5);
    expect(rungCap("pro")).toBe(4);
    expect(nextRung(5, "correct", "beginner")).toBe(5);
    expect(nextRung(4, "correct", "pro")).toBe(4);
  });
  it("never reaches rung 5 from wrong", () => {
    expect(nextRung(4, "wrong", "beginner")).toBe(4);
  });
});

describe("applyJudgment", () => {
  it("counts the turn, merges concept tags, advances on correct, holds otherwise", () => {
    const ep = openEpisode(err, "intermediate", 1);
    const a = applyJudgment(ep, j("correct", { concept_tags: ["types"] }), 2);
    const b = applyJudgment(a, j("wrong", { concept_tags: ["types", "casts"] }), 3);
    expect([a.rung, b.rung]).toEqual([3, 3]);
    expect(b.turns).toBe(2);
    expect(b.concept_tags).toEqual(["types", "casts"]);
    expect(b.closed).toBeUndefined();
    expect(ep.rung).toBe(2); // input not mutated
  });
  it("closes the episode when the model sets episode_closed", () => {
    const c = applyJudgment(openEpisode(err, "pro", 1), j("correct", { episode_closed: true }), 9);
    expect(c).toMatchObject({ rung: 2, turns: 1, closed: 9, closeReason: "judged" });
  });
});

describe("closeEpisode / rebandEpisode", () => {
  it("stamps close time and reason", () => {
    expect(closeEpisode(openEpisode(err, "pro", 1), "cleared", 5)).toMatchObject({ closed: 5, closeReason: "cleared" });
  });
  it("re-caps the rung when the level moves into pro", () => {
    const ep = { ...openEpisode(err, "beginner", 1), rung: 5 };
    expect(rebandEpisode(ep, "pro")).toMatchObject({ band: "pro", rung: 4 });
    expect(rebandEpisode({ ...ep, rung: 2 }, "pro").rung).toBe(2);
  });
});

describe("describeTrigger", () => {
  it("names the trigger with the file's basename", () => {
    expect(describeTrigger(err)).toBe('error "boom" at a.py:3');
    expect(describeTrigger({ kind: "idle", path: "/p/b.rs", line: 7 })).toBe("idle at b.rs:7");
    expect(describeTrigger({ kind: "churn", path: "/p/c.go", region: [21, 40] })).toBe("rewriting c.go:21-40");
    expect(describeTrigger({ kind: "chat" })).toBe("learner question");
    expect(RUNG_NAMES).toEqual(["question", "concept", "pointer", "pseudocode", "reveal"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pi-tutor && npx vitest run test/ladder.test.ts`
Expected: FAIL. Cannot resolve `../extensions/tutor/ladder.js`.

- [ ] **Step 3: Write the implementation**

`pi-tutor/extensions/tutor/ladder.ts`:
```ts
import { basename } from "node:path";
import { startRung, type Band } from "./policy.js";
import type { Judgment, JudgmentValue } from "./judgment.js";

// Hint ladder and stuck episodes (spec §5). Pure: every function returns a new Episode.
export const RUNG_NAMES = ["question", "concept", "pointer", "pseudocode", "reveal"] as const;

export type Trigger =
  | { kind: "error"; path: string; line: number; msg: string }
  | { kind: "idle"; path: string; line: number }
  | { kind: "churn"; path: string; region: [number, number] }
  | { kind: "chat" };

export type CloseReason = "cleared" | "run_passed" | "judged";

export interface Episode {
  id: string;
  trigger: Trigger;
  band: Band;
  rung: number;
  opened: number;
  turns: number;
  concept_tags: string[];
  closed?: number;
  closeReason?: CloseReason;
}

export function rungCap(band: Band): 4 | 5 {
  return band === "pro" ? 4 : 5;
}

export function openEpisode(trigger: Trigger, band: Band, now: number): Episode {
  return { id: `ep-${now}`, trigger, band, rung: startRung(band), opened: now, turns: 0, concept_tags: [] };
}

/** Only `correct` advances, one rung at a time, up to the band's cap. */
export function nextRung(rung: number, judgment: JudgmentValue, band: Band): number {
  return judgment === "correct" ? Math.min(rung + 1, rungCap(band)) : rung;
}

export function applyJudgment(ep: Episode, j: Judgment, now: number): Episode {
  const next: Episode = {
    ...ep,
    rung: nextRung(ep.rung, j.judgment, ep.band),
    turns: ep.turns + 1,
    concept_tags: [...new Set([...ep.concept_tags, ...j.concept_tags])],
  };
  return j.episode_closed ? closeEpisode(next, "judged", now) : next;
}

export function closeEpisode(ep: Episode, reason: CloseReason, now: number): Episode {
  return { ...ep, closed: now, closeReason: reason };
}

/** The slider moved mid-episode: keep the rung but respect the new band's cap. */
export function rebandEpisode(ep: Episode, band: Band): Episode {
  return { ...ep, band, rung: Math.min(ep.rung, rungCap(band)) };
}

export function describeTrigger(t: Trigger): string {
  switch (t.kind) {
    case "error": return `error "${t.msg}" at ${basename(t.path)}:${t.line}`;
    case "idle": return `idle at ${basename(t.path)}:${t.line}`;
    case "churn": return `rewriting ${basename(t.path)}:${t.region[0]}-${t.region[1]}`;
    case "chat": return "learner question";
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd pi-tutor && npx vitest run test/ladder.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit** (includes the already-staged removal of the tracked `pi-tutor/node_modules` symlink)

```bash
git add pi-tutor/extensions/tutor/ladder.ts pi-tutor/test/ladder.test.ts
git commit -m "feat(pi-tutor): hint ladder and episode model; untrack node_modules symlink"
```

---

### Task 2: Stuck detector

**Files:**
- Create: `pi-tutor/extensions/tutor/stuck.ts`
- Test: `pi-tutor/test/stuck.test.ts`

**Interfaces:**
- Consumes: `TutorPayload` from `nvim.ts`; `Trigger` from `ladder.ts` (Task 1).
- Produces:
  ```ts
  export type StuckEvent =
    | { type: "open"; trigger: Trigger }
    | { type: "cleared"; path: string; msg: string }
    | { type: "run_passed" };
  export class StuckDetector {
    constructor(limits: () => { errorMs: number; idleMs: number });
    observe(p: TutorPayload, now: number): StuckEvent[];
    tick(now: number): StuckEvent[];
  }
  ```
  The detector doesn't know whether an episode is open. `index.ts` ignores `open` while one is open (Task 5).

- [ ] **Step 1: Write the failing test**

`pi-tutor/test/stuck.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { StuckDetector } from "../extensions/tutor/stuck.js";
import type { TutorPayload } from "../extensions/tutor/nvim.js";

const diag = (path: string, errors: number, msg = "boom", line = 1): TutorPayload =>
  ({ kind: "diagnostics", buf: 1, path, errors, warnings: 0, ...(errors ? { first: { line, msg } } : {}) });
const idle = (since_ms: number): TutorPayload => ({ kind: "idle", buf: 1, path: "/p/a.py", line: 4, since_ms });
const churn = (l1: number): TutorPayload => ({ kind: "churn", buf: 1, path: "/p/a.py", region: [l1, l1 + 19], edits: 10 });
const det = (errorMs: number, idleMs = 300_000) => new StuckDetector(() => ({ errorMs, idleMs }));
const openMsgs = (evs: ReturnType<StuckDetector["tick"]>) =>
  evs.map((e) => (e.type === "open" && e.trigger.kind === "error" ? e.trigger.msg : e.type));

describe("StuckDetector errors", () => {
  it("opens immediately when the error threshold is 0 (beginner)", () => {
    expect(det(0).observe(diag("/p/a.py", 1), 0)).toEqual([{ type: "open", trigger: { kind: "error", path: "/p/a.py", line: 1, msg: "boom" } }]);
  });
  it("opens only after the same error persists past the threshold", () => {
    const d = det(60_000);
    expect(d.observe(diag("/p/a.py", 1), 0)).toEqual([]);
    expect(d.tick(59_999)).toEqual([]);
    expect(d.observe(diag("/p/a.py", 1, "boom", 2), 30_000)).toEqual([]); // line moved, same message: same error
    expect(d.tick(60_000)).toEqual([{ type: "open", trigger: { kind: "error", path: "/p/a.py", line: 2, msg: "boom" } }]);
  });
  it("fires once per error, even while it persists after an episode closed", () => {
    const d = det(0);
    expect(d.observe(diag("/p/a.py", 1), 0)).toHaveLength(1);
    expect(d.tick(1_000_000)).toEqual([]);
    expect(d.observe(diag("/p/a.py", 1), 2_000_000)).toEqual([]);
  });
  it("a different first error clears the old one and restarts the clock", () => {
    const d = det(60_000);
    d.observe(diag("/p/a.py", 1, "boom"), 0);
    expect(d.observe(diag("/p/a.py", 1, "bang"), 50_000)).toEqual([{ type: "cleared", path: "/p/a.py", msg: "boom" }]);
    expect(d.tick(100_000)).toEqual([]);
    expect(openMsgs(d.tick(110_000))).toEqual(["bang"]);
  });
  it("reports cleared when the file has no errors, and nothing for untracked files", () => {
    const d = det(60_000);
    d.observe(diag("/p/a.py", 1), 0);
    expect(d.observe(diag("/p/a.py", 0), 10)).toEqual([{ type: "cleared", path: "/p/a.py", msg: "boom" }]);
    expect(d.observe(diag("/p/b.py", 0), 20)).toEqual([]);
    expect(d.tick(1_000_000)).toEqual([]);
  });
  it("tracks errors per file", () => {
    const d = det(60_000);
    d.observe(diag("/p/a.py", 1, "a"), 0);
    d.observe(diag("/p/b.py", 1, "b"), 30_000);
    expect(openMsgs(d.tick(60_000))).toEqual(["a"]);
    expect(openMsgs(d.tick(90_000))).toEqual(["b"]);
  });
});

describe("StuckDetector idle and churn", () => {
  it("opens once per idle stretch when idle passes the threshold", () => {
    const d = det(0, 60_000);
    expect(d.observe(idle(30_000), 0)).toEqual([]);
    expect(d.observe(idle(60_000), 0)).toEqual([{ type: "open", trigger: { kind: "idle", path: "/p/a.py", line: 4 } }]);
    expect(d.observe(idle(90_000), 0)).toEqual([]);
    expect(d.observe(idle(30_000), 0)).toEqual([]); // learner typed: a new stretch
    expect(d.observe(idle(60_000), 0)).toHaveLength(1);
  });
  it("opens when the same region churns twice within the idle threshold", () => {
    const d = det(0, 60_000);
    expect(d.observe(churn(1), 0)).toEqual([]);
    expect(d.observe(churn(21), 1_000)).toEqual([]);
    expect(d.observe(churn(1), 50_000)).toEqual([{ type: "open", trigger: { kind: "churn", path: "/p/a.py", region: [1, 20] } }]);
    expect(d.observe(churn(21), 200_000)).toEqual([]); // first churn too long ago: restarts
    expect(d.observe(churn(21), 210_000)).toHaveLength(1);
  });
});

describe("StuckDetector runs", () => {
  it("reports run_passed on exit 0 only", () => {
    const d = det(0);
    expect(d.observe({ kind: "run_output", cmd: ["x"], code: 1, stdout: "", stderr: "" }, 0)).toEqual([]);
    expect(d.observe({ kind: "run_output", cmd: ["x"], code: 0, stdout: "", stderr: "" }, 0)).toEqual([{ type: "run_passed" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pi-tutor && npx vitest run test/stuck.test.ts`
Expected: FAIL. Cannot resolve `../extensions/tutor/stuck.js`.

- [ ] **Step 3: Write the implementation**

`pi-tutor/extensions/tutor/stuck.ts`:
```ts
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
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd pi-tutor && npx vitest run test/stuck.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/stuck.ts pi-tutor/test/stuck.test.ts
git commit -m "feat(pi-tutor): stuck detector for persisting errors, idle and churn"
```

---

### Task 3: Tool guard

**Files:**
- Create: `pi-tutor/extensions/tutor/guard.ts`
- Test: `pi-tutor/test/guard.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const READ_TOOLS: ReadonlySet<string>; // read, grep, find, ls
  export type GuardResult = { block: true; reason: string } | undefined;
  export function resolveToolPath(p: string, cwd: string): string;
  export function realpathLoose(abs: string): string;
  export function guardToolCall(toolName: string, input: Record<string, unknown>, cwd: string): GuardResult;
  ```
- Pi facts this mirrors (verified in Pi 1.1.0). Tool paths go through `resolveToCwd`, which lives in `dist/core/tools/path-utils.js:42` and `dist/utils/paths.js:59-87`. That function replaces Unicode spaces (`/[  -   　]/g`) with a plain space, strips a leading `@`, expands `~` and `~/`, converts `file://` URLs, and then resolves against cwd. `path-utils` isn't in the package `exports`, so we copy the logic instead of importing it. The tool inputs are `read {path}`, `grep {pattern, path?, glob?}`, `find {pattern, path?}` and `ls {path?}`. When `path` is absent, the tool uses cwd.

- [ ] **Step 1: Write the failing test**

`pi-tutor/test/guard.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { guardToolCall, resolveToolPath, realpathLoose } from "../extensions/tutor/guard.js";

let root: string;
beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "pitutor-guard-")));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.py"), "x = 1\n");
  symlinkSync("/etc", join(root, "etc-link"));
  mkdirSync(`${root}-sibling`);
});
const allowed = (tool: string, input: Record<string, unknown>) => expect(guardToolCall(tool, input, root)).toBeUndefined();
const blocked = (tool: string, input: Record<string, unknown>) => expect(guardToolCall(tool, input, root)).toMatchObject({ block: true });

describe("guardToolCall", () => {
  it("allows read/grep/find/ls inside the project root", () => {
    allowed("read", { path: "src/a.py" });
    allowed("read", { path: join(root, "src/a.py") });
    allowed("grep", { pattern: "x" });
    allowed("grep", { pattern: "x", path: "src" });
    allowed("find", { pattern: "*.py" });
    allowed("ls", {});
    allowed("ls", { path: "." });
  });
  it("blocks paths outside the root", () => {
    blocked("read", { path: "/etc/passwd" });
    blocked("read", { path: "../outside.txt" });
    blocked("grep", { pattern: "x", path: "/" });
    blocked("find", { pattern: "*", path: ".." });
    blocked("ls", { path: "~" });
  });
  it("blocks a sibling directory that shares the root's name as a prefix", () => {
    blocked("read", { path: `${root}-sibling/x` });
  });
  it("follows symlinks: a link inside the root to /etc is outside", () => {
    blocked("read", { path: "etc-link/passwd" });
    blocked("ls", { path: "etc-link" });
  });
  it("judges not-yet-existing paths by their nearest existing parent", () => {
    allowed("read", { path: "src/new/deeper.py" });
    blocked("read", { path: "src/../../nope/x.py" });
  });
  it("resolves @, ~ and file:// forms the way Pi does", () => {
    allowed("read", { path: "@src/a.py" });
    allowed("read", { path: pathToFileURL(join(root, "src/a.py")).href });
    blocked("read", { path: "file:///etc/passwd" });
    blocked("read", { path: "~/.ssh/id_ed25519" });
  });
  it("blocks bash, write, edit and unknown tools with a reason", () => {
    for (const t of ["bash", "write", "edit", "powershell", "web_fetch"]) {
      const r = guardToolCall(t, { command: "ls", path: "src/a.py" }, root);
      expect(r?.block).toBe(true);
      expect(r?.reason).toMatch(t === "bash" ? /bash is off/ : /read-only/);
    }
  });
  it("blocks a missing or non-string path where one is required or given", () => {
    blocked("read", {});
    blocked("read", { path: 42 });
    blocked("grep", { pattern: "x", path: 42 });
  });
  it("names the refused path in the reason", () => {
    expect(guardToolCall("read", { path: "/etc/passwd" }, root)?.reason).toContain("/etc/passwd");
  });
});

describe("resolveToolPath / realpathLoose", () => {
  it("normalizes unicode spaces, strips @, expands ~", () => {
    expect(resolveToolPath("@~/x y", "/c")).toBe(join(homedir(), "x y"));
    expect(resolveToolPath("~", "/c")).toBe(homedir());
    expect(resolveToolPath("a/../b", "/c")).toBe("/c/b");
  });
  it("re-appends the missing tail to the real parent", () => {
    expect(realpathLoose(join(root, "etc-link", "nope", "x"))).toBe(join(realpathSync("/etc"), "nope", "x"));
    expect(realpathLoose(join(root, "missing", "y"))).toBe(join(root, "missing", "y"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pi-tutor && npx vitest run test/guard.test.ts`
Expected: FAIL. Cannot resolve `../extensions/tutor/guard.js`.

- [ ] **Step 3: Write the implementation**

`pi-tutor/extensions/tutor/guard.ts`:
```ts
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Tool fence (spec §8): read-only tools, project root only. Defence in depth behind `--tools`.
export const READ_TOOLS: ReadonlySet<string> = new Set(["read", "grep", "find", "ls"]);

export type GuardResult = { block: true; reason: string } | undefined;

const UNICODE_SPACES = /[  -   　]/g;
const BASH_REASON = "bash is off for the tutor: ask the learner to run the command (e.g. :TutorRun) and share the output";

/** Mirror of Pi's resolveToCwd (dist/utils/paths.js normalizePath + resolvePath). */
export function resolveToolPath(p: string, cwd: string): string {
  let s = p.replace(UNICODE_SPACES, " ");
  if (s.startsWith("@")) s = s.slice(1);
  if (s === "~") s = homedir();
  else if (s.startsWith("~/")) s = join(homedir(), s.slice(2));
  else if (s.startsWith("file://")) s = fileURLToPath(s);
  return isAbsolute(s) ? resolve(s) : resolve(cwd, s);
}

/** realpath of the nearest existing ancestor with the missing tail re-appended. */
export function realpathLoose(abs: string): string {
  let head = abs;
  const tail: string[] = [];
  while (!existsSync(head)) {
    const parent = dirname(head);
    if (parent === head) break;
    tail.unshift(basename(head));
    head = parent;
  }
  let real: string;
  try { real = realpathSync(head); } catch { real = head; }
  return tail.length ? join(real, ...tail) : real;
}

export function guardToolCall(toolName: string, input: Record<string, unknown>, cwd: string): GuardResult {
  if (toolName === "bash") return { block: true, reason: BASH_REASON };
  if (!READ_TOOLS.has(toolName)) return { block: true, reason: `the tutor is read-only: ${toolName} is not allowed` };
  const p = input.path;
  if (p === undefined && toolName !== "read") return undefined; // defaults to cwd
  if (typeof p !== "string") return { block: true, reason: `${toolName} needs a string path inside the project` };
  const root = realpathLoose(cwd);
  const prefix = root.endsWith("/") ? root : root + "/";
  const target = realpathLoose(resolveToolPath(p, cwd));
  if (target === root || target.startsWith(prefix)) return undefined;
  return { block: true, reason: `${p} is outside the project root ${root}; the tutor only reads project files` };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd pi-tutor && npx vitest run test/guard.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/guard.ts pi-tutor/test/guard.test.ts
git commit -m "feat(pi-tutor): tool_call guard — read-only tools fenced to the project root"
```

---

### Task 4: Ladder prompt and episode context

**Files:**
- Create: `pi-tutor/prompts/system/ladder.md`
- Modify: `pi-tutor/extensions/tutor/prompts.ts:19-21` (`bandPrompt`)
- Modify: `pi-tutor/extensions/tutor/context.ts` (add `formatEpisodeContext`)
- Test: `pi-tutor/test/prompts.test.ts`, `pi-tutor/test/context.test.ts`

**Interfaces:**
- Consumes: `Episode`, `rungCap`, `RUNG_NAMES`, `describeTrigger`, `openEpisode` (Task 1).
- Produces: `bandPrompt(band)` now returns band + ladder + judgment. Also `export function formatEpisodeContext(ep: Episode): string`.

- [ ] **Step 1: Write the failing tests**

Append to `pi-tutor/test/prompts.test.ts` inside `describe("bandPrompt", …)`:
```ts
  it("puts the hint ladder between the band voice and the turn protocol", () => {
    for (const b of ["beginner", "intermediate", "pro"] as const) {
      const p = bandPrompt(b);
      expect(p).toContain("## Hint ladder");
      expect(p.indexOf(`# Tutor band: ${b}`)).toBeLessThan(p.indexOf("## Hint ladder"));
      expect(p.indexOf("## Hint ladder")).toBeLessThan(p.indexOf("## Turn protocol"));
      expect(p).toContain("[tutor]");
      expect(p).toContain("[episode]");
    }
  });
```

Append to `pi-tutor/test/context.test.ts`:
```ts
import { formatEpisodeContext } from "../extensions/tutor/context.js";
import { openEpisode } from "../extensions/tutor/ladder.js";

describe("formatEpisodeContext", () => {
  it("states the trigger, the rung with its name and cap, turns and concepts", () => {
    const ep = { ...openEpisode({ kind: "error", path: "/p/a.py", line: 3, msg: "boom" }, "pro", 1), turns: 2, concept_tags: ["types", "casts"] };
    expect(formatEpisodeContext(ep).split("\n")).toEqual([
      '[episode] stuck on: error "boom" at a.py:3',
      "hint rung 1/4 (question), 2 turn(s) so far",
      "concepts: types, casts",
    ]);
  });
  it("omits the concepts line when there are none", () => {
    expect(formatEpisodeContext(openEpisode({ kind: "chat" }, "beginner", 1)).split("\n")).toEqual([
      "[episode] stuck on: learner question",
      "hint rung 3/5 (pointer), 0 turn(s) so far",
    ]);
  });
});
```
(Merge the two new imports into the file's existing import block.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pi-tutor && npx vitest run test/prompts.test.ts test/context.test.ts`
Expected: FAIL. `## Hint ladder` is not found, and `formatEpisodeContext` is not exported.

- [ ] **Step 3: Write the prompt file**

`pi-tutor/prompts/system/ladder.md`:
```markdown
## Hint ladder

You hint on a five-rung ladder. The `[episode]` line in the editor context gives the current rung; answer at exactly that rung.

1. question — one question that makes the learner look at the cause ("What type does the compiler think `x` has?").
2. concept — name the idea involved and define it in one sentence.
3. pointer — cite a skill or doc by name and say where in their code to look (`path:line`).
4. pseudocode — the shape of the fix, no real syntax. In the pro band this is words only.
5. reveal — the actual line(s), with a one-sentence why.

Never go above the current rung, even if asked: the rung rises only when the learner reasons correctly, and your judgment decides that. If there is no `[episode]` line, answer at rung 1.

Messages that start with `[tutor]` are automatic signals from the editor (a persisting error, a long pause, rewriting the same lines), not the learner's words. Reply to the learner with one short hint at the current rung about that signal, and judge `none`.
```

- [ ] **Step 4: Wire `bandPrompt` and `formatEpisodeContext`**

In `pi-tutor/extensions/tutor/prompts.ts`, replace `bandPrompt`:
```ts
export function bandPrompt(band: Band): string {
  return `${read(band)}\n\n${read("ladder")}\n\n${read("judgment")}\n`;
}
```

In `pi-tutor/extensions/tutor/context.ts`, add the import and the function:
```ts
import { RUNG_NAMES, describeTrigger, rungCap, type Episode } from "./ladder.js";

/** The episode header the model reads to pick its rung (spec §5). */
export function formatEpisodeContext(ep: Episode): string {
  const out = [
    `[episode] stuck on: ${describeTrigger(ep.trigger)}`,
    `hint rung ${ep.rung}/${rungCap(ep.band)} (${RUNG_NAMES[ep.rung - 1]}), ${ep.turns} turn(s) so far`,
  ];
  if (ep.concept_tags.length) out.push(`concepts: ${ep.concept_tags.join(", ")}`);
  return out.join("\n");
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `cd pi-tutor && npx vitest run test/prompts.test.ts test/context.test.ts && npm run typecheck`
Expected: PASS. The existing `/never write code/i` and `/why each part exists/i` checks still pass.

- [ ] **Step 6: Commit**

```bash
git add pi-tutor/prompts/system/ladder.md pi-tutor/extensions/tutor/prompts.ts pi-tutor/extensions/tutor/context.ts pi-tutor/test/prompts.test.ts pi-tutor/test/context.test.ts
git commit -m "feat(pi-tutor): ladder prompt section and per-turn episode context"
```

---

### Task 5: Wire episodes, detector, nudges and guard into the extension

**Files:**
- Create: `pi-tutor/test/fake-pi.ts` (shared fakes moved out of `smoke.test.ts`)
- Create: `pi-tutor/test/episode.test.ts` (real headless Neovim)
- Modify: `pi-tutor/extensions/tutor/index.ts` (whole file below)
- Modify: `pi-tutor/test/smoke.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4. `thresholds(level)` from `policy.ts`. `NvimLink`, `TutorPayload` from `nvim.ts`.
- Produces:
  - Custom entry `tutor_episode` holding an `Episode`. It is written on open, after each judgment, on close and on reband.
  - Pi handlers `tool_call` (guard) plus the existing ones.
  - Widget line 2 is `stuck: <describeTrigger>` while an episode is open and `episode closed (<reason>)` right after one closes. Otherwise it shows the latest signal text, exactly as M2 did; the live check relies on `error: boom`.

- [ ] **Step 1: Move the fakes into `test/fake-pi.ts`**

`pi-tutor/test/fake-pi.ts`:
```ts
import extension from "../extensions/tutor/index.js";

export type Handler = (...a: unknown[]) => unknown;

export function fakePi() {
  const events: Record<string, Handler> = {};
  const commands: Record<string, { handler: (args: string, ctx: unknown) => Promise<void> }> = {};
  const entries: { type: string; data: unknown }[] = [];
  const sent: { text: string; opts: unknown }[] = [];
  const pi = {
    on: (name: string, h: Handler) => { events[name] = h; return () => {}; },
    registerCommand: (name: string, def: { handler: (args: string, ctx: unknown) => Promise<void> }) => { commands[name] = def; },
    appendEntry: (type: string, data: unknown) => { entries.push({ type, data }); },
    sendUserMessage: (text: string, opts: unknown) => { sent.push({ text, opts }); },
  };
  return { pi, events, commands, entries, sent };
}

export function fakeCtx(branch: unknown[] = [], cwd = "/tmp/proj") {
  const widgets: Record<string, string[] | undefined> = {};
  const statuses: Record<string, string | undefined> = {};
  const notes: string[] = [];
  const busy = { value: false };
  return {
    ctx: {
      hasUI: true, cwd,
      isIdle: () => !busy.value,
      sessionManager: { getBranch: () => branch },
      ui: {
        setWidget: (k: string, c: string[] | undefined) => { widgets[k] = c; },
        setStatus: (k: string, t: string | undefined) => { statuses[k] = t; },
        notify: (m: string) => notes.push(m),
      },
    },
    widgets, statuses, notes, busy,
  };
}

/** Boot the extension. Detached (no $NVIM) unless `nvim` names a socket. */
export async function boot(opts: { branch?: unknown[]; cwd?: string; nvim?: string } = {}) {
  const f = fakePi();
  extension(f.pi as never);
  const c = fakeCtx(opts.branch ?? [], opts.cwd);
  const saved = process.env.NVIM;
  if (opts.nvim) process.env.NVIM = opts.nvim; else delete process.env.NVIM;
  await f.events["session_start"]({ type: "session_start", reason: "startup" }, c.ctx);
  if (saved) process.env.NVIM = saved; else delete process.env.NVIM;
  return { ...f, ...c };
}

export const assistant = (text: string, stopReason = "stop") =>
  ({ role: "assistant", content: [{ type: "text", text }], stopReason });

export const judged = (judgment: string, episode_closed = false, stopReason = "stop") =>
  assistant("hm\n```tutor-judgment\n" + JSON.stringify({ judgment, episode_closed }) + "\n```", stopReason);

export const episodes = (entries: { type: string; data: unknown }[]) =>
  entries.filter((e) => e.type === "tutor_episode").map((e) => e.data as Record<string, unknown>);
```

In `pi-tutor/test/smoke.test.ts`, delete the local `Handler`, `fakePi`, `fakeCtx`, `boot` and `assistant`, and import them:
```ts
import { describe, it, expect } from "vitest";
import { fakePi, boot, assistant, judged, episodes } from "./fake-pi.js";
import extension from "../extensions/tutor/index.js";
```
Change every `await boot([...])` call to `await boot({ branch: [...] })`.

Run: `cd pi-tutor && npx vitest run test/smoke.test.ts`
Expected: PASS. This step is a pure move; the extension is unchanged so far.

- [ ] **Step 2: Write the failing smoke tests**

In `smoke.test.ts`:

(a) Change the first test's handler list to include the new events:
```ts
    expect(Object.keys(events)).toEqual(expect.arrayContaining(["session_start", "session_shutdown", "before_agent_start", "turn_end", "context", "tool_call"]));
```

(b) Replace the M2 test `"before_agent_start sets the band section and sends no editor message when detached"`. M3 makes a learner's chat message open an episode (spec §5), so a detached turn now carries the episode header and still no `[editor]` snapshot:
```ts
  it("before_agent_start sets the band section; detached turns carry the episode but no editor snapshot", async () => {
    const { events, commands, ctx } = await boot();
    const opts = { sections: {} as Record<string, string> };
    const r1 = (await events["before_agent_start"]({ type: "before_agent_start", prompt: "hi", systemPromptOptions: opts }, ctx)) as { message: { customType: string; content: string; display: boolean } };
    expect(opts.sections["tutor"]).toMatch(/^# Tutor band: intermediate\n/);
    expect(opts.sections["tutor"]).toContain("```tutor-judgment");
    expect(r1.message.customType).toBe("tutor_editor");
    expect(r1.message.display).toBe(false);
    expect(r1.message.content).toMatch(/^\[episode\] stuck on: learner question\nhint rung 2\/5/);
    expect(r1.message.content).not.toContain("[editor]");
    await commands["tutor-level"].handler("5", ctx);
    await events["before_agent_start"]({ type: "before_agent_start", prompt: "hi", systemPromptOptions: opts }, ctx);
    expect(opts.sections["tutor"]).toMatch(/^# Tutor band: beginner\n/);
  });
```

(c) Add a new block at the end of the file:
```ts
describe("M3 episodes, ladder and guard", () => {
  const bas = (prompt: string) => ({ type: "before_agent_start", prompt, systemPromptOptions: { sections: {} } });

  it("a chat message opens an episode; correct advances, wrong holds, episode_closed closes", async () => {
    const { events, ctx, entries, widgets } = await boot();
    await events["before_agent_start"](bas("why does this fail?"), ctx);
    expect(episodes(entries).at(-1)).toMatchObject({ trigger: { kind: "chat" }, rung: 2, turns: 0 });
    expect(widgets["tutor"]).toEqual(["tutor  lvl 50 · rung 2", "stuck: learner question"]);
    await events["turn_end"]({ type: "turn_end", message: judged("correct") }, ctx);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 50 · rung 3");
    await events["turn_end"]({ type: "turn_end", message: judged("wrong") }, ctx);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 50 · rung 3");
    await events["turn_end"]({ type: "turn_end", message: judged("correct", true) }, ctx);
    expect(episodes(entries).at(-1)).toMatchObject({ rung: 4, turns: 3, closeReason: "judged" });
    expect(widgets["tutor"]).toEqual(["tutor  lvl 50 · rung 2", "episode closed (judged) · judged correct"]);
  });

  it("[tutor] nudges never open a chat episode, and a second chat message joins the open one", async () => {
    const { events, ctx, entries } = await boot();
    await events["before_agent_start"](bas("[tutor] stuck signal: idle at a.py:1"), ctx);
    expect(episodes(entries)).toHaveLength(0);
    await events["before_agent_start"](bas("first"), ctx);
    await events["before_agent_start"](bas("second"), ctx);
    expect(episodes(entries)).toHaveLength(1);
  });

  it("aborted, errored and truncated replies leave the rung and the widget alone", async () => {
    const { events, ctx, entries, widgets } = await boot();
    await events["before_agent_start"](bas("q"), ctx);
    const n = entries.length;
    for (const stop of ["aborted", "error", "length"]) {
      await events["turn_end"]({ type: "turn_end", message: judged("correct", true, stop) }, ctx);
    }
    expect(entries.length).toBe(n);
    expect(widgets["tutor"]).toEqual(["tutor  lvl 50 · rung 2", "stuck: learner question"]);
  });

  it("restores an open episode on resume and ignores a closed one", async () => {
    const ep = { id: "ep-1", trigger: { kind: "chat" }, band: "intermediate", rung: 4, opened: 1, turns: 3, concept_tags: [] };
    const entry = (data: unknown) => ({ type: "custom", customType: "tutor_episode", data });
    const open = await boot({ branch: [entry(ep)] });
    expect(open.widgets["tutor"]).toEqual(["tutor  lvl 50 · rung 4", "stuck: learner question"]);
    const closed = await boot({ branch: [entry(ep), entry({ ...ep, closed: 5, closeReason: "judged" })] });
    expect(closed.widgets["tutor"]).toEqual(["tutor  lvl 50 · rung 2", "idle"]);
  });

  it("/tutor-level into pro re-caps an open episode's rung and persists it", async () => {
    const { events, commands, ctx, entries, widgets } = await boot();
    await events["before_agent_start"](bas("q"), ctx);
    for (let i = 0; i < 3; i++) await events["turn_end"]({ type: "turn_end", message: judged("correct") }, ctx);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 50 · rung 5");
    await commands["tutor-level"].handler("90", ctx);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 90 · rung 4");
    expect(episodes(entries).at(-1)).toMatchObject({ band: "pro", rung: 4 });
  });

  it("tool_call blocks bash and paths outside ctx.cwd, allows reads inside", async () => {
    const { events, ctx } = await boot();
    const call = (toolName: string, input: unknown) => events["tool_call"]({ type: "tool_call", toolCallId: "1", toolName, input }, ctx);
    expect(await call("read", { path: "/etc/passwd" })).toMatchObject({ block: true });
    expect(await call("bash", { command: "ls" })).toMatchObject({ block: true });
    expect(await call("read", { path: "a.py" })).toBeUndefined();
  });
});
```

- [ ] **Step 3: Write the failing real-Neovim test**

`pi-tutor/test/episode.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NeovimClient } from "neovim";
import { startHeadlessNvim, type Headless } from "./nvim-harness.js";
import { boot, episodes } from "./fake-pi.js";

let h: Headless | undefined;
let nvim: NeovimClient | undefined;
let shutdown: (() => unknown) | undefined;
afterEach(async () => {
  await shutdown?.(); shutdown = undefined;
  nvim?.quit(); nvim = undefined;
  h?.kill(); h = undefined;
});
const until = (f: () => boolean, ms = 5000) => new Promise<void>((res, rej) => {
  const t0 = Date.now();
  const id = setInterval(() => { if (f()) { clearInterval(id); res(); } else if (Date.now() - t0 > ms) { clearInterval(id); rej(new Error("timeout")); } }, 25);
});

/** Boot linked to a fresh headless Neovim at beginner level (error threshold 0) and open a file in the root. */
async function linked(busy = false) {
  h = await startHeadlessNvim();
  const b = await boot({ nvim: h.socket, cwd: h.root });
  shutdown = () => b.events["session_shutdown"]({ type: "session_shutdown" }, b.ctx);
  expect(b.widgets["tutor"]?.[1]).not.toMatch(/detached/);
  await b.commands["tutor-level"].handler("10", b.ctx);
  b.busy.value = busy;
  const { attach } = await import("neovim");
  nvim = attach({ socket: h.socket });
  writeFileSync(join(h.root, "a.py"), "x = \n");
  await nvim.command(`edit ${join(h.root, "a.py")}`);
  return b;
}
const setError = (msg: string) => nvim!.lua(`local ns = vim.api.nvim_create_namespace("t"); vim.diagnostic.set(ns, 0, {{ lnum = 0, col = 0, severity = 1, message = ... }})`, [msg]);

describe("stuck episodes through a real Neovim", () => {
  it("a beginner's new error opens an episode and nudges Pi once; clearing it closes the episode", async () => {
    const b = await linked();
    await setError("boom");
    await until(() => b.sent.length > 0);
    expect(b.sent).toEqual([{ text: '[tutor] stuck signal: error "boom" at a.py:1', opts: { deliverAs: "followUp" } }]);
    expect(b.widgets["tutor"]?.[1]).toBe('stuck: error "boom" at a.py:1');
    await setError("boom"); // same error again: no second episode, no second nudge
    await new Promise((r) => setTimeout(r, 300));
    expect(b.sent).toHaveLength(1);
    await nvim!.lua(`vim.diagnostic.reset(vim.api.nvim_create_namespace("t"), 0)`);
    await until(() => b.widgets["tutor"]?.[1] === "episode closed (cleared)");
    expect(episodes(b.entries).at(-1)).toMatchObject({ trigger: { kind: "error", msg: "boom" }, closeReason: "cleared" });
    expect(b.sent).toHaveLength(1);
  }, 20000);

  it("opens the episode silently while Pi is mid-reply", async () => {
    const b = await linked(true);
    await setError("bang");
    await until(() => b.widgets["tutor"]?.[1] === 'stuck: error "bang" at a.py:1');
    expect(b.sent).toEqual([]);
  }, 20000);
});
```

- [ ] **Step 4: Run the new tests to verify they fail**

Run: `cd pi-tutor && npx vitest run test/smoke.test.ts test/episode.test.ts`
Expected: FAIL. `tool_call` is not registered, there are no `tutor_episode` entries, `r1` is undefined, and `b.sent` stays empty, so `until` times out.

- [ ] **Step 5: Rewrite `index.ts`**

`pi-tutor/extensions/tutor/index.ts`:
```ts
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { NvimLink, type EditorSnapshot, type TutorPayload } from "./nvim.js";
import { renderWidget, renderStatus, type TutorState } from "./ui.js";
import { bandFor, startRung, thresholds, DEFAULT_LEVEL } from "./policy.js";
import { bandPrompt } from "./prompts.js";
import { parseJudgment } from "./judgment.js";
import { formatEditorContext, formatEpisodeContext } from "./context.js";
import { StuckDetector, type StuckEvent } from "./stuck.js";
import { openEpisode, applyJudgment, closeEpisode, rebandEpisode, describeTrigger, type CloseReason, type Episode, type Trigger } from "./ladder.js";
import { guardToolCall } from "./guard.js";

type Ui = ExtensionContext["ui"];

/** Prefix of proactive messages; the ladder prompt tells the model what they are (spec §9). */
const TUTOR_PREFIX = "[tutor]";
/** How often persisting errors are checked against the band's error threshold. */
const TICK_MS = 5000;

/** Last `tutor_level` custom entry on the active branch, if any. */
function restoreLevel(ctx: ExtensionContext): number | undefined {
  let level: number | undefined;
  for (const e of ctx.sessionManager.getBranch()) {
    if (e.type === "custom" && e.customType === "tutor_level") {
      const l = (e.data as { level?: unknown } | undefined)?.level;
      if (typeof l === "number") level = l;
    }
  }
  return level;
}

/** Last `tutor_episode` entry on the active branch, if it is still open. */
function restoreEpisode(ctx: ExtensionContext): Episode | null {
  let ep: Episode | undefined;
  for (const e of ctx.sessionManager.getBranch()) {
    if (e.type === "custom" && e.customType === "tutor_episode") ep = e.data as Episode;
  }
  return ep && typeof ep.rung === "number" && ep.trigger && ep.closed === undefined ? ep : null;
}

export default function (pi: ExtensionAPI): void {
  const state: TutorState = { state: "idle", connected: false };
  let link: NvimLink | null = null;
  let ui: Ui | null = null;
  let session: ExtensionContext | null = null;
  let episode: Episode | null = null;
  /** Latest push-signal text, shown when no episode is open. */
  let signal = "idle";
  let tick: ReturnType<typeof setInterval> | null = null;
  const level = () => state.level ?? DEFAULT_LEVEL;
  const detector = new StuckDetector(() => thresholds(level()));

  function paint() {
    state.rung = episode ? episode.rung : startRung(bandFor(level()));
    state.state = episode ? `stuck: ${describeTrigger(episode.trigger)}` : signal;
    if (!ui) return;
    ui.setWidget("tutor", renderWidget(state));
    ui.setStatus("tutor", renderStatus(state));
  }

  function setLevel(n: number) {
    state.level = n;
    if (episode) {
      episode = rebandEpisode(episode, bandFor(n));
      pi.appendEntry("tutor_episode", episode);
    }
  }

  function openEp(trigger: Trigger, nudge: boolean) {
    if (episode) return;
    episode = openEpisode(trigger, bandFor(level()), Date.now());
    pi.appendEntry("tutor_episode", episode);
    // Spec §4 "Intervenes": one nudge per editor-triggered episode, never on top of a running reply.
    if (nudge && session?.isIdle()) {
      pi.sendUserMessage(`${TUTOR_PREFIX} stuck signal: ${describeTrigger(trigger)}`, { deliverAs: "followUp" });
    }
  }

  function closeEp(reason: CloseReason) {
    if (!episode) return;
    pi.appendEntry("tutor_episode", closeEpisode(episode, reason, Date.now()));
    episode = null;
    signal = `episode closed (${reason})`;
  }

  function onStuck(events: StuckEvent[]) {
    for (const e of events) {
      if (e.type === "open") openEp(e.trigger, true);
      else if (e.type === "run_passed") closeEp("run_passed");
      else if (episode?.trigger.kind === "error" && episode.trigger.path === e.path && episode.trigger.msg === e.msg) closeEp("cleared");
    }
  }

  function onPayload(p: TutorPayload) {
    switch (p.kind) {
      case "diagnostics":
        signal = p.errors > 0 ? `error: ${p.first?.msg ?? ""}` : p.warnings > 0 ? `${p.warnings} warning(s)` : "clean";
        break;
      case "idle": signal = `idle ${Math.round(p.since_ms / 1000)}s`; break;
      case "churn": signal = `churning lines ${p.region[0]}-${p.region[1]}`; break;
      case "run_output": signal = p.code === 0 ? "run passed" : `run failed (exit ${p.code})`; break;
    }
    pi.appendEntry("tutor_signal", p);
    onStuck(detector.observe(p, Date.now()));
    paint();
  }

  pi.on("session_start", async (_event, ctx) => {
    session = ctx;
    ui = ctx.hasUI ? ctx.ui : null;
    state.level = restoreLevel(ctx) ?? DEFAULT_LEVEL;
    episode = restoreEpisode(ctx);
    if (!link) {
      link = await NvimLink.connect({
        root: ctx.cwd,
        onPayload,
        onDisconnect: () => { state.connected = false; link = null; paint(); },
      });
      state.connected = link !== null;
    }
    if (!tick) {
      tick = setInterval(() => {
        const ev = detector.tick(Date.now());
        if (ev.length) { onStuck(ev); paint(); }
      }, TICK_MS);
      tick.unref?.();
    }
    paint();
  });

  pi.on("session_shutdown", async () => {
    if (tick) clearInterval(tick);
    tick = null;
    await link?.close();
    link = null;
    state.connected = false;
  });

  // Spec §4/§5: band prompt section, then the per-turn hidden context (episode + editor snapshot).
  pi.on("before_agent_start", async (event) => {
    const band = bandFor(level());
    event.systemPromptOptions.sections["tutor"] = bandPrompt(band);
    // A learner's chat message opens an episode; our own [tutor] nudges do not.
    if (!episode && !event.prompt.startsWith(TUTOR_PREFIX)) { openEp({ kind: "chat" }, false); paint(); }
    let snap: EditorSnapshot | null = null;
    if (link) {
      try { snap = await link.snapshot(band === "beginner" ? "full" : "window"); } catch { snap = null; }
    }
    if (snap?.filetype) { state.language = snap.filetype; paint(); }
    const parts: string[] = [];
    if (episode) parts.push(formatEpisodeContext(episode));
    if (snap) parts.push(formatEditorContext(snap));
    if (parts.length === 0) return;
    return { message: { customType: "tutor_editor", content: parts.join("\n\n"), display: false, details: { band, path: snap?.path, episode: episode?.id } } };
  });

  // Spec §5: parse the trailing tutor-judgment block and apply it to the open episode.
  pi.on("turn_end", async (event) => {
    const m = event.message;
    if (m.role !== "assistant") return;
    // Aborted, errored, truncated and tool-call turns carry no final judgment.
    if (m.stopReason !== "stop" || m.content.some((c) => c.type === "toolCall")) return;
    const text = m.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
    const j = parseJudgment(text);
    state.last = j ? j.judgment : "missing";
    if (j) {
      pi.appendEntry("tutor_judgment", j);
      if (episode) {
        episode = applyJudgment(episode, j, Date.now());
        pi.appendEntry("tutor_episode", episode);
        if (episode.closed !== undefined) { episode = null; signal = "episode closed (judged)"; }
      }
    }
    paint();
  });

  // Spec §8 tool fence: read-only tools inside the project root. Defence in depth behind `--tools`.
  pi.on("tool_call", (event, ctx) => guardToolCall(event.toolName, event.input as Record<string, unknown>, ctx.cwd));

  // Spec §3.4/§4: every turn carries one hidden tutor_editor message. Keep only
  // the newest so stale snapshots do not pile up in the model's context.
  pi.on("context", (event) => {
    const msgs = event.messages;
    let last = -1;
    msgs.forEach((m, i) => { if (m.role === "custom" && m.customType === "tutor_editor") last = i; });
    if (last < 0) return;
    const pruned = msgs.filter((m, i) => !(m.role === "custom" && m.customType === "tutor_editor" && i !== last));
    return pruned.length === msgs.length ? undefined : { messages: pruned };
  });

  pi.registerCommand("tutor-level", {
    description: "Set the tutor level 0-100 (beginner → pro)",
    handler: async (args, ctx) => {
      const arg = args.trim();
      if (arg === "") {
        ctx.ui.notify(`current level ${level()} (${bandFor(level())}); usage: /tutor-level <0-100>`, "info");
        return;
      }
      const n = /^\d{1,3}$/.test(arg) ? Number(arg) : NaN;
      if (!Number.isInteger(n) || n < 0 || n > 100) {
        ctx.ui.notify("usage: /tutor-level <0-100>", "warning");
        return;
      }
      setLevel(n);
      pi.appendEntry("tutor_level", { level: n });
      paint();
      ctx.ui.notify(`tutor level set to ${n} (${bandFor(n)})`, "info");
    },
  });

  pi.registerCommand("tutor-status", {
    description: "Show the tutor's current state",
    handler: async (_args, ctx) => {
      ctx.ui.notify(renderWidget(state).join(" | "), "info");
    },
  });
}
```

If `npm run typecheck` rejects `m.stopReason`, read `AssistantMessage` in `node_modules/@earendil-works/pi-ai/dist/types.d.ts` and narrow with that type. Don't cast to `any`.

- [ ] **Step 6: Run the whole suite and typecheck**

Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: all tests PASS, including the M2 tests `"turn_end parses the judgment…"` and `"turn_end ignores turns that end in tool calls…"`. The first uses `stopReason: "stop"`; the second returns early on `toolUse`.

- [ ] **Step 7: Commit**

```bash
git add pi-tutor/extensions/tutor/index.ts pi-tutor/test/fake-pi.ts pi-tutor/test/smoke.test.ts pi-tutor/test/episode.test.ts
git commit -m "feat(pi-tutor): stuck episodes drive the ladder; nudges, judgment application, tool_call guard"
```

---

### Task 6: Tutor-mode gate (`PI_TUTOR=1`)

**Files:**
- Modify: `nvim-tutor/lua/tutor/term.lua` (`opts.env` passed to `jobstart`)
- Modify: `nvim-tutor/lua/tutor/init.lua` (`setup` passes `env = { PI_TUTOR = "1" }`)
- Modify: `pi-tutor/extensions/tutor/index.ts` (early return)
- Modify: `pi-tutor/test/fake-pi.ts` (sets `PI_TUTOR=1`)
- Test: `nvim-tutor/tests/term_spec.lua`, `nvim-tutor/tests/init_spec.lua`, `pi-tutor/test/smoke.test.ts`

**Interfaces:**
- Produces: `term.new({ cmd, cwd, width, env? })`. The `env` table is merged into the job's environment by `jobstart`, because `clear_env` defaults to false. The extension is active only when `process.env.PI_TUTOR === "1"` at load time.

- [ ] **Step 1: Write the failing tests**

`nvim-tutor/tests/term_spec.lua`, add inside `describe("tutor.term", …)`:
```lua
  it("passes opts.env to the job", function()
    local t = term.new({ cmd = { "sh", "-c", 'printf "T=%s\\n" "$PI_TUTOR"; cat' }, cwd = vim.fn.getcwd(), width = 0.4, env = { PI_TUTOR = "1" } })
    t:show()
    local ok = vim.wait(2000, function()
      return vim.tbl_contains(vim.api.nvim_buf_get_lines(t:bufnr(), 0, -1, false), "T=1")
    end)
    assert.is_true(ok)
    t:hide()
  end)
```

`nvim-tutor/tests/init_spec.lua`, add an `it` in the existing top-level `describe`. It reuses the file's existing `setup({ pi_cmd = { "cat" }, …, check_version = false … })` call shape:
```lua
  it("starts pi in tutor mode (PI_TUTOR=1)", function()
    require("tutor").setup({ pi_cmd = { "cat" }, cwd = vim.fn.getcwd(), check_version = false })
    assert.equals("1", require("tutor").state.term.opts.env.PI_TUTOR)
  end)
```

`pi-tutor/test/smoke.test.ts`, add to `describe("extension wiring", …)`:
```ts
  it("is inert outside tutor mode: no handlers, no commands without PI_TUTOR=1", () => {
    const saved = process.env.PI_TUTOR; delete process.env.PI_TUTOR;
    try {
      const { pi, events, commands } = fakePi();
      extension(pi as never);
      expect(Object.keys(events)).toEqual([]);
      expect(Object.keys(commands)).toEqual([]);
    } finally { process.env.PI_TUTOR = saved; }
  });
```

`pi-tutor/test/fake-pi.ts`: add as the first statement after the imports:
```ts
// The extension only activates when nvim-tutor started Pi (Task 6); tests are tutor mode.
process.env.PI_TUTOR = "1";
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`
Expected: the two new specs FAIL. `T=1` never appears because `env` isn't passed, and `opts.env` is nil.
Run: `cd pi-tutor && npx vitest run test/smoke.test.ts`
Expected: the inert test FAILS because the handlers are still registered.

- [ ] **Step 3: Implement**

`term.lua`, change the `jobstart` options to include `env`:
```lua
    job = vim.fn.jobstart(self.opts.cmd, {
      term = true,
      cwd = self.opts.cwd,
      env = self.opts.env,
```
and the annotation to `---@param opts {cmd: string[], cwd: string, width: number, env?: table<string,string>}`.

`init.lua` `setup`:
```lua
  -- PI_TUTOR=1 tells pi-tutor this Pi is the tutor; plain `pi` elsewhere stays untouched.
  M.state.term = term.new({ cmd = M.build_cmd(opts.pi_cmd), cwd = opts.cwd, width = opts.width, env = { PI_TUTOR = "1" } })
```

`index.ts`, first statement of the default export:
```ts
export default function (pi: ExtensionAPI): void {
  // pi-tutor is installed globally; only the Pi that nvim-tutor starts is the tutor.
  if (process.env.PI_TUTOR !== "1") return;
```

- [ ] **Step 4: Run both suites**

Run: `cd pi-tutor && npm test && npm run typecheck`, then the plenary command above.
Expected: everything PASSES.

- [ ] **Step 5: Commit**

```bash
git add nvim-tutor/lua/tutor/term.lua nvim-tutor/lua/tutor/init.lua nvim-tutor/tests/term_spec.lua nvim-tutor/tests/init_spec.lua pi-tutor/extensions/tutor/index.ts pi-tutor/test/fake-pi.ts pi-tutor/test/smoke.test.ts
git commit -m "feat: tutor mode only when nvim-tutor starts pi (PI_TUTOR=1)"
```

---

### Task 7: Surface, docs, live acceptance

**Files:**
- Modify: `pi-tutor/PI_SURFACE.md`
- Modify: `README.md` (Status section)
- Modify: `docs/superpowers/specs/2026-10-07-nvim-tutor-design.md` (header rev 5, §5 rulings, §8 tool fence)
- Modify: `.claude/skills/tutor-live/drive.lua`, `.claude/skills/tutor-live/SKILL.md`
- Modify: `pi-tutor/.gitignore`

- [ ] **Step 1: Re-verify the surface** (pi-surface-check skill)

Run:
```bash
cd pi-tutor && T=node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts
grep -n 'on(event: "tool_call"\|interface ToolCallEventResult\|sendUserMessage(content\|isIdle(): boolean\|prompt: string;' $T
grep -n 'export type StopReason' node_modules/@earendil-works/pi-ai/dist/types.d.ts
pi --version; nvim --version | head -1
```
Expected: each grep hits. `pi --version` prints 1.1.0. If not, stop and record the difference.

- [ ] **Step 2: Update `PI_SURFACE.md`**

Under "Pi CLI", replace the `bash` bullet with:
```markdown
- `bash` is excluded from `--tools` and also blocked by the `tool_call` guard (M3 ruling: no
  read-only shell filter). Observed 2026-10-11: with bash allowed the model wrote a file via `echo > x.txt`.
```
Under "Pi extension API", replace the `sendUserMessage (M3+)` line and add:
```markdown
- `pi.sendUserMessage(text, { deliverAs: "followUp" })`: always triggers a turn; `deliverAs` is
  ignored when idle and required while streaming (agent-session.js:1551). Used once per
  editor-triggered episode, text prefixed `[tutor]`.
- `ctx.isIdle()` (types.d.ts:236): nudges are sent only when true. The session_start `ctx` is kept.
- `pi.on("tool_call", (event, ctx) => ToolCallEventResult | undefined)` (types.d.ts:1200);
  `event.toolName`, `event.input` (mutable; we never mutate); result `{ block: true, reason }`.
  Inputs: read `{path}`, grep `{pattern, path?, glob?}`, find `{pattern, path?}`, ls `{path?}`.
  Paths resolve like Pi's `resolveToCwd` (dist/utils/paths.js:59-87: unicode spaces → " ",
  strip "@", expand "~", file:// URLs, relative to cwd); `path-utils` is not exported, so
  `guard.ts` mirrors it. Re-check on every Pi bump.
- `BeforeAgentStartEvent.prompt` (types.d.ts:711): `[tutor]`-prefixed prompts do not open a chat episode.
- `AssistantMessage.stopReason` (`pi-ai` types.d.ts:313): only `"stop"` turns are judged.
```
Change the custom entry line to:
```markdown
- Custom entry types we write: `tutor_signal`, `tutor_level { level }`, `tutor_judgment` (Judgment),
  `tutor_episode` (Episode, written on open / judgment / reband / close; the last open one is restored).
```

- [ ] **Step 3: README status, spec rev 5, gitignore**

`README.md`: after the Milestone 2 paragraph, add:
```markdown
Milestone 3 done (2026-10-12): a persisting error, a long pause, or rewriting the same
lines opens a stuck episode (widget shows `stuck: …`, Pi gets one `[tutor]` nudge); your
chat questions open one too. Hints climb a five-rung ladder (question → concept → pointer
→ pseudocode → reveal) only when the tutor judges your reasoning correct; pro stops at 4.
A `tool_call` guard keeps the tutor to read-only tools inside the project folder.
The tutor only exists in the Pi that `:Tutor` starts (`PI_TUTOR=1`); a plain `pi`
elsewhere is untouched.
```
In `PI_SURFACE.md` "Pi CLI", add:
```markdown
- nvim-tutor starts Pi with `PI_TUTOR=1` (`jobstart` `env`, merged into the inherited env).
  Without it the extension's default export returns before registering anything.
```
Also change the Plans bullet to `(M1 bootstrap, M1b terminal pane, M2 band prompts, M3 stuck/ladder/guard)`.

Spec header: change `**Status:** living document (rev 4, …` to start `**Status:** living document (rev 5, 2026-10-12: M3 stuck rules, chat episodes, one nudge per episode, guard blocks bash; rev 4: …`. In §5, after the rung table's "Rules:" list, add:
```markdown
- Detector rules (M3): an error is its file plus first-error message and fires once; idle
  fires once per idle stretch; churn fires when the same 20-line region churns twice within
  the idle threshold. An editor-triggered episode sends one `[tutor]` nudge, only if Pi is
  idle. Only replies with `stopReason: "stop"` are judged.
```
In §8 "Tool fence", replace the paragraph with:
```markdown
Tool fence: Pi runs with `--tools read,grep,find,ls`, and the `tool_call` guard (M3) blocks
every other tool, including `bash` (no read-only shell filter: the learner runs code with
`:TutorRun`), and any read/grep/find/ls path whose realpath is outside the project root.
```

`pi-tutor/.gitignore`: replace `node_modules/` with `node_modules`, so the symlinked `node_modules` in worktrees is also ignored.

- [ ] **Step 4: Extend the live acceptance**

In `.claude/skills/tutor-live/drive.lua`, after the `DIAG` line (line 19), insert:
```lua
    vim.cmd("TutorLevel 10")
    vim.wait(15000, function() return has("lvl 10") end, 200)
    vim.diagnostic.set(ns, 0, { { lnum = 0, col = 0, severity = 1, message = "bang" } })
    local ep = vim.wait(15000, function() return has("stuck: error") end, 200)
    local nudge = vim.wait(15000, function() return has("[tutor] stuck signal") end, 200)
    out("EPISODE widget=" .. tostring(ep) .. " nudge=" .. tostring(nudge))
```
In `.claude/skills/tutor-live/SKILL.md`, add `EPISODE` to the grep pattern (`^(WIDGET|LEVEL|DIAG|EPISODE|RUN|LINE)`) and add this expected line after `DIAG widget=true`:
```markdown
- `EPISODE widget=true nudge=true` (level 10 = beginner, error threshold 0)
```

- [ ] **Step 5: Run everything**

Run:
```bash
cd pi-tutor && npm test && npm run typecheck && cd ..
cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}" && cd ..
```
Expected: both suites green. The Lua side is unchanged, so this is the regression check.

Then run the live acceptance with `/tutor-live`, or its commands from the repo root. Expected:
`WIDGET present=true detached=false`, `LEVEL lvl40=true`, `DIAG widget=true`, `EPISODE widget=true nudge=true`, `RUN done`, `no stray pi`.

- [ ] **Step 6: Commit**

```bash
git add pi-tutor/PI_SURFACE.md README.md docs/superpowers/specs/2026-10-07-nvim-tutor-design.md .claude/skills/tutor-live/drive.lua .claude/skills/tutor-live/SKILL.md pi-tutor/.gitignore
git commit -m "docs: M3 surface, README status, spec rev 5, live episode check"
```
