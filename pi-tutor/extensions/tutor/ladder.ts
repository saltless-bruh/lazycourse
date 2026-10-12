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
