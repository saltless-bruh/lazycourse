import type { Band } from "./policy.js";
import type { Judgment } from "./judgment.js";
import { RUNG_NAMES } from "./ladder.js";

// Rules the extension enforces or reports (spec 2026-10-13 §2, §7 #2; live findings with nemotron).
export type Issue = "missing-judgment" | "code-above-rung" | "wide-diagram" | "internals" | "no-summary";

/** Spec §2 "Narrow diagrams": Pi's pane is ~45 columns. */
export const DIAGRAM_COLS = 40;
/** Replies longer than this many non-blank prose lines need an **In short** line. */
const SUMMARY_AFTER = 6;
const TUTOR_PREFIX = "[tutor]";

const REASONING = /\b(because|since|so that|therefore|i think|i guess|i believe|maybe|probably|should|must|means|the (?:fix|problem|issue|bug|error|cause) is|it'?s|that'?s|i'?ll|i would|i'd)\b/i;

/** Whether the learner's message states a reason or an answer the tutor can judge. */
export function hasReasoning(prompt: string): boolean {
  const t = prompt.trim();
  if (!t || t.startsWith(TUTOR_PREFIX)) return false;
  if (REASONING.test(t)) return true;
  return !t.includes("?") && t.split(/\s+/).length >= 4;
}

/** Only reasoning can be `correct`; only the learner (not a [tutor] nudge) finishes a workflow step. */
export function guardJudgment(j: Judgment, prompt: string): Judgment {
  const judgment = j.judgment === "correct" && !hasReasoning(prompt) ? "none" : j.judgment;
  const step_done = j.step_done && !prompt.trimStart().startsWith(TUTOR_PREFIX);
  return judgment === j.judgment && step_done === j.step_done ? j : { ...j, judgment, step_done };
}

/** Fences open and close at the start of a line; an inline ``` inside a sentence is not one. */
const FENCES = /^```([^\n`]*)\r?\n([\s\S]*?)^```/gm;
const INTERNALS = /(INDEX\.md|SKILL\.md|\.devdocs\.json|tutor-judgment|step_done|\[episode\]|\[workflow\]|\[tutor-check\]|\brung \d)/i;
/** Fences quoting a document (spec/tasks.md, README): wrapping prose is harmless and it is not code. */
const QUOTES = new Set(["markdown", "md"]);

function codeAllowed(o: { band: Band; rung: number | null; noCode: boolean }, lines: number): boolean {
  if (o.noCode) return false;
  const rung = o.rung ?? 1;
  if (rung >= 4) return true;
  return o.band === "beginner" && lines <= 3;
}

export function checkReply(text: string, o: { band: Band; rung: number | null; judged: boolean; noCode: boolean }): Issue[] {
  const issues = new Set<Issue>();
  if (!o.judged) issues.add("missing-judgment");
  for (const m of text.matchAll(FENCES)) {
    const tag = m[1].trim().toLowerCase();
    const body = m[2].replace(/\r?\n$/, "").split(/\r?\n/);
    if (tag === "tutor-judgment" || m[2].includes('"judgment"') || QUOTES.has(tag)) continue;
    if (tag === "" || tag === "text") {
      if (body.some((l) => Array.from(l).length > DIAGRAM_COLS)) issues.add("wide-diagram");
      continue;
    }
    if (!codeAllowed(o, body.filter((l) => l.trim()).length)) issues.add("code-above-rung");
  }
  const prose = text.replace(FENCES, "");
  if (INTERNALS.test(prose)) issues.add("internals");
  const proseLines = prose.split(/\r?\n/).filter((l) => l.trim()).length;
  if (proseLines > SUMMARY_AFTER && !/in short/i.test(prose)) issues.add("no-summary");
  return [...issues];
}

const FIX: Record<Issue, string> = {
  "missing-judgment": "it did not end with the fenced tutor-judgment block (plain text, not a tool call)",
  "code-above-rung": "it showed code the current rung does not allow; point and explain instead",
  "wide-diagram": `a diagram line was wider than ${DIAGRAM_COLS} characters; stack it vertically`,
  "internals": "it mentioned the tutor's machinery (rungs, INDEX.md, SKILL.md, the judgment block); talk about the code and the concept",
  "no-summary": "a long reply had no **In short** line",
};

/**
 * Last line of every turn's hidden context. Golden round 1 (nemotron): 3 of 5 replies dropped the
 * judgment block that the system prompt asks for; round 2: a rung 2 reply stated the fix in words.
 * A reminder next to the learner's message is read last.
 */
export function replyReminder(rung: number | null): string {
  const hold = rung !== null && rung < 5 ? ` At rung ${rung} (${RUNG_NAMES[rung - 1]}): do not state the fix, in code or in words.` : "";
  return `[tutor-reply] Use the bold parts (What's happening, Why, Example, What to try, In short), keep diagram lines ≤ 40 characters, and end with the \`\`\`tutor-judgment block.${hold}`;
}

/** Hidden next-turn note so the model corrects itself (the extension cannot un-write a reply). */
export function formatCheck(issues: Issue[]): string {
  return ["[tutor-check] your last reply broke these rules; follow them in this one:", ...issues.map((i) => `- ${FIX[i]}`)].join("\n");
}
