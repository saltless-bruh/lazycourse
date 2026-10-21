import { basename } from "node:path";
import type { Band } from "./policy.js";
import type { Judgment } from "./judgment.js";

// Attempt ladder and stuck episodes (spec 2026-10-21 §5). Pure: every function returns a new Episode.
// Help climbs with failed attempts on one spot, counted by code; the model's judgment never moves it.

export type Trigger =
  | { kind: "error"; path: string; line: number; msg: string }
  | { kind: "idle"; path: string; line: number }
  | { kind: "churn"; path: string; region: [number, number] }
  | { kind: "chat" }
  /** A failing :TutorRun with the end of its output (spec 2026-10-13 §7 #4). */
  | { kind: "run"; cmd: string[]; code: number; trace: string };

/** `superseded`: an editor trigger replaced an open chat, idle or churn episode. */
export type CloseReason = "cleared" | "run_passed" | "judged" | "superseded";

/** What this turn may do (spec §5): teach before any failed attempt, then hint → why → ask → fix. */
export type TurnStep = "teach" | "hint" | "why" | "ask" | "fix";

export interface Episode {
  id: string;
  trigger: Trigger;
  band: Band;
  /** Failed graded tries on `spot` (a crashed run with no error shown in the file; later, a failed check). */
  attempts: number;
  /** What the attempts are on: a run's error line, later a task's check. */
  spot?: string;
  /** The project's source hash at the last counted attempt: an unchanged rerun is not a new attempt. */
  lastHash?: string;
  /** Pro: the learner asked for the fix (/tutor-fix). */
  fixAsked?: boolean;
  /** Well-known concepts reach why/ask/fix one attempt later. */
  delay?: 0 | 1;
  opened: number;
  turns: number;
  concept_tags: string[];
  closed?: number;
  closeReason?: CloseReason;
}

/** The attempt at which each step starts (spec §5, author: beginner pace; slower at intermediate; pro asks for the fix). */
export const STAGES: Record<Band, { hint: number; why: number; ask: number; fix: number | null }> = {
  beginner: { hint: 1, why: 2, ask: 3, fix: 4 },
  intermediate: { hint: 1, why: 3, ask: 5, fix: 6 },
  pro: { hint: 1, why: 2, ask: 3, fix: null },
};

/**
 * Whether a new editor trigger may replace `ep`. Only error episodes hold their
 * place, because only they close from the editor (when the error clears); chat,
 * idle and churn episodes would otherwise swallow every later trigger.
 */
export function yieldsTo(ep: Episode | null): boolean {
  return ep === null || (ep.trigger.kind !== "error" && ep.trigger.kind !== "run");
}

export function openEpisode(trigger: Trigger, band: Band, now: number): Episode {
  return { id: `ep-${now}`, trigger, band, attempts: 0, opened: now, turns: 0, concept_tags: [] };
}

/** This turn's step. During an exam nothing goes past `why` (spec §11a). */
export function stepFor(ep: Episode | null, o: { exam: boolean }): TurnStep {
  if (!ep || ep.attempts <= 0) return "teach";
  const s = STAGES[ep.band], d = ep.delay ?? 0, n = ep.attempts;
  let step: TurnStep = "hint";
  if (n >= s.why + d) step = "why";
  if (n >= s.ask + d) step = "ask";
  if (s.fix !== null && n >= s.fix + d) step = "fix";
  // Pro: one question, then explaining again until the learner asks for the fix.
  if (s.fix === null && n > s.ask + d) step = ep.fixAsked ? "fix" : "why";
  if (o.exam && (step === "ask" || step === "fix")) step = "why";
  return step;
}

/** One failed graded try on `spot`. Unchanged code on the same spot is not a new try; a new spot starts over. */
export function recordAttempt(ep: Episode, a: { spot: string; hash: string }): Episode {
  if (ep.spot !== a.spot) return { ...ep, spot: a.spot, lastHash: a.hash, attempts: 1, fixAsked: undefined };
  if (ep.lastHash === a.hash) return ep;
  return { ...ep, lastHash: a.hash, attempts: ep.attempts + 1 };
}

/** The judgment counts the turn and records concepts; it never moves help (spec §5). */
export function applyJudgment(ep: Episode, j: Judgment, now: number): Episode {
  const next: Episode = { ...ep, turns: ep.turns + 1, concept_tags: [...new Set([...ep.concept_tags, ...j.concept_tags])] };
  // Live check 2026-10-21: a run's episode closes only when a run passes (code decides), never by the model's word.
  return j.episode_closed && ep.trigger.kind !== "run" ? closeEpisode(next, "judged", now) : next;
}

export function closeEpisode(ep: Episode, reason: CloseReason, now: number): Episode {
  return { ...ep, closed: now, closeReason: reason };
}

/** An open episode from a saved session; one saved before attempts existed (it has `rung`) loads at 0. */
export function restoreAttempts(raw: unknown): Episode | null {
  if (typeof raw !== "object" || raw === null) return null;
  const e = raw as Partial<Episode> & { rung?: unknown };
  if (typeof e.id !== "string" || !e.trigger || typeof e.band !== "string" || e.closed !== undefined) return null;
  const { rung: _rung, ...rest } = e;
  return { ...(rest as Episode), attempts: typeof e.attempts === "number" ? e.attempts : 0, turns: e.turns ?? 0, concept_tags: e.concept_tags ?? [] };
}

export function describeTrigger(t: Trigger): string {
  switch (t.kind) {
    case "error": return `error "${t.msg}" at ${basename(t.path)}:${t.line}`;
    case "idle": return `idle at ${basename(t.path)}:${t.line}`;
    case "churn": return `rewriting ${basename(t.path)}:${t.region[0]}-${t.region[1]}`;
    case "chat": return "learner question";
    case "run": {
      // Spec 2026-10-21 §7: a failed check (/tutor-done) names the task and what the code gave.
      if (t.cmd[0] === "/tutor-done") {
        const what = (t.trace.split("\n")[0] ?? "").replace(/^check \S+: /, "");
        return `run failed (check ${t.cmd[1]}): ${what.length > 120 ? `${what.slice(0, 119)}…` : what}`;
      }
      const cmd = t.cmd.join(" ");
      return `run failed (exit ${t.code}): ${cmd.length > 60 ? `${cmd.slice(0, 59)}…` : cmd}`;
    }
  }
}

/** Ease sample for the profile (spec §11a): 1 with no failed attempt, less per attempt up to the fix; superseded is not a sample. */
export function attemptScore(ep: Episode): number | null {
  if (ep.closeReason === "superseded") return null;
  const f = STAGES[ep.band].fix ?? 4;
  return 1 - Math.min(ep.attempts, f) / (f + 1);
}

/** Well-known concepts (ease ≥ 0.7) reach the later steps one attempt later; set at an episode's first judgment. */
export function easeDelay(ep: Episode, tags: string[], easeOf: (tag: string) => number | undefined): Episode {
  if (ep.turns !== 0 || tags.length === 0) return ep;
  if (!tags.every((t) => (easeOf(t) ?? 0) >= 0.7)) return ep;
  return { ...ep, delay: 1 };
}
