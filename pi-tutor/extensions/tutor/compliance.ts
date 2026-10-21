import { stripIntake } from "./onboard.js";
import type { Band } from "./policy.js";
import { parseJudgment, type Judgment } from "./judgment.js";
import type { TurnStep } from "./ladder.js";

// Rules the extension enforces or reports (spec 2026-10-13 §2, §7 #2; live findings with nemotron).
export type Issue = "missing-judgment" | "code-above-rung" | "wide-diagram" | "internals" | "no-summary";

/** Spec §2 "Narrow diagrams": what the prompts ask for, and the limit when the pane width is unknown. */
export const DIAGRAM_COLS = 40;
/** pi-tui indents code block lines by `codeBlockIndent` (default two spaces) inside the Markdown width. */
const CODE_INDENT = 2;

/** Widest diagram line that fits, from the Markdown width Pi renders replies at (probe: 70-col terminal → 68). */
export function diagramCols(availableWidth: number | undefined): number {
  return availableWidth === undefined ? DIAGRAM_COLS : Math.max(1, availableWidth - CODE_INDENT);
}
/** Replies longer than this many non-blank prose lines need an **In short** line. */
const SUMMARY_AFTER = 6;
const TUTOR_PREFIX = "[tutor]";

/** Markers that state a reason or an answer even inside a question ("why? because …"). */
const STRONG = /\b(because|since|so that|therefore|i think|i guess|i believe|the (?:fix|problem|issue|bug|error|cause) is)\b/i;
/** Weaker markers: they also turn up in questions and requests ("what should I do?"). */
const WEAK = /\b(maybe|probably|should|must|means|it'?s|that'?s|i'?ll|i would|i'd)\b/i;
/** A message that opens like a question or a request asks for help (final review I1). */
const ASKING = /^(how|what|why|where|which|when|who|can|could|would|will|is|are|do|does|did|should|help|explain|show|give|tell|just|please)\b/i;

/** Whether the learner's message states a reason or an answer the tutor can judge. */
export function hasReasoning(prompt: string): boolean {
  const t = prompt.trim();
  if (!t || t.startsWith(TUTOR_PREFIX)) return false;
  if (STRONG.test(t)) return true;
  if (ASKING.test(t) || t.includes("?")) return false;
  return WEAK.test(t) || t.split(/\s+/).length >= 4;
}

/** Only reasoning can be `correct`; only the learner (not a [tutor] nudge) finishes a workflow step. */
export function guardJudgment(j: Judgment, prompt: string): Judgment {
  const judgment = j.judgment === "correct" && !hasReasoning(prompt) ? "none" : j.judgment;
  const step_done = j.step_done && !prompt.trimStart().startsWith(TUTOR_PREFIX);
  return judgment === j.judgment && step_done === j.step_done ? j : { ...j, judgment, step_done };
}

/**
 * Fences (``` or ~~~, indented up to 3 spaces as inside list items) open at the start of a line and
 * close on a bare fence line; an inline ``` in a sentence is not one, and an unclosed fence (a
 * truncated reply) runs to the end of the text.
 */
const FENCES = /^ {0,3}(`{3,}|~{3,})([^\n`~]*)\r?\n([\s\S]*?)(?:^ {0,3}\1[`~]*[ \t]*$|(?![\s\S]))/gm; // M6b #61: a longer closing fence closes too
const INTERNALS = /(INDEX\.md|SKILL\.md|\.devdocs\.json|tutor-judgment|step_done|\[episode\]|\[workflow\]|\[tutor-check\]|\brung \d)/i;
/**
 * Fences quoting a document (spec/tasks.md, README) are not code and may be wide; their content is
 * still checked, because the model sometimes wraps its whole reply in one (final review I3).
 */
const QUOTES = new Set(["markdown", "md"]);

function codeAllowed(o: { band: Band; step: TurnStep | null; noCode: boolean }, lines: number): boolean {
  if (o.noCode) return false;
  if (o.step === "fix") return true;
  return o.band === "beginner" && lines <= 3;
}

/** `cols`: the learner's real diagram width (diagramCols); prompts still ask for 40, the check allows what fits. */
export function checkReply(text: string, o: { band: Band; step: TurnStep | null; judged: boolean; noCode: boolean; cols?: number }): Issue[] {
  const issues = new Set<Issue>();
  if (!o.judged) issues.add("missing-judgment");
  for (const m of text.matchAll(FENCES)) {
    const tag = m[2].trim().toLowerCase();
    const body = m[3].replace(/\r?\n$/, "").split(/\r?\n/).map((l) => l.replace(/^ {0,3}/, ""));
    if (tag === "tutor-judgment" || m[3].includes('"judgment"')) continue;
    if (QUOTES.has(tag)) {
      for (const i of checkReply(m[3], { ...o, judged: true })) issues.add(i);
      continue;
    }
    if (tag === "" || tag === "text") {
      if (body.some((l) => Array.from(l).length > (o.cols ?? DIAGRAM_COLS))) issues.add("wide-diagram");
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

const FIX: Record<Issue, (cols: number) => string> = {
  "missing-judgment": () => "it did not end with the fenced tutor-judgment block (plain text, not a tool call)",
  "code-above-rung": () => "it showed code the current rung does not allow; point and explain instead",
  "wide-diagram": (cols) => `a diagram line was wider than the learner's pane (${cols} characters); stack it vertically`,
  "internals": () => "it mentioned the tutor's machinery (rungs, INDEX.md, SKILL.md, the judgment block); talk about the code and the concept",
  "no-summary": () => "a long reply had no **In short** line",
};

// Rewrites for the machinery checkReply calls "internals" (golden leaks 2026-10-13: "At rung 1, I'll
// ask…", "(pointer, rung 3)", "line 4597 in INDEX.md"). Prose only: fences hold code, diagrams and
// the judgment block, which turn_end still parses. Only the observed forms are reworded; anything
// else stays and the next turn's [tutor-check] names it (review 4dbf4f4: learner paths, PLC "rung").
const META_LINE = /tutor-judgment|`?step_done`?\s*:\s*(?:true|false)|\[tutor-(?:check|reply)\]/i;
/** Lines the judgment fallbacks read (mid-line or indented fences, bare JSON) and indented code. */
const KEEP_LINE = /^(?: {4,}|\t)|`{3}|~{3}|"judgment"|"step_done"/;
/**
 * The tutor's own files, spelled as the extension writes them: bare, or under a tutor-* skill or
 * .pi folder. Starts only after a space or bracket, so URLs, docs/INDEX.md and "your own SKILL.md"
 * stay; the prefix has no nested ambiguity, so a long token cannot backtrack quadratically.
 */
const DOCS = /(?<![\w./~:-]|\b(?:[Yy]our|[Mm]y|[Oo]ur|[Oo]wn|[Aa]n?|[Tt]his|[Tt]hat|[Tt]heir|[Cc]reate|[Ww]rite|[Ee]dit|[Nn]ew)\s)((?:the|The)\s+)?(`?)(\/?(?:[\w.~-]+\/)*)(?:INDEX\.md|SKILL\.md|\.devdocs\.json)(?::\d+(?:-\d+)?)?\2(?:\s+file\b)?/g;
const RUNG_LEAD = /^(\s*(?:[-*+]\s+)?)(?:(?:at|on|we'?re (?:at|on)|i'?m (?:at|on)) rung \d\b\s*[,:]?|rung \d\s*[,:—–])\s*(.?)/i;
const SENTENCE_START = /^(?:\s*(?:[-*+]|\d+\.)\s+)?(?:\*\*|__)?$|[.!?]\s+$/;

function scrubLine(line: string): string {
  const l = line
    .replace(DOCS, (m, the: string | undefined, _tick: string, prefix: string, at: number, all: string) => {
      if (prefix && !/(?:^|\/)(?:tutor-[\w-]*|\.pi)\//.test(prefix)) return m; // the learner's own docs/INDEX.md
      return (the?.startsWith("T") || (!the && SENTENCE_START.test(all.slice(0, at))) ? "The" : "the") + " language reference";
    })
    .replace(/\[episode\]\s*/gi, "")
    .replace(/\[workflow\]/gi, "design recipe")
    .replace(/\s*\(rung \d\)/gi, "")
    .replace(/,\s*rung \d(?=\))/gi, "")
    .replace(/\(rung \d,\s*/gi, "(")
    .replace(RUNG_LEAD, (_m, lead: string, next: string) => lead + next.toUpperCase())
    .replace(/\b(at|on) rung \d\b(?![-\d])/gi, (_m, p: string) => `${p} this stage`);
  return l === line ? line : l.replace(/(\S) {2,}(?=\S)/g, "$1 ");
}

/**
 * The reply with the tutor's machinery reworded for the learner; the same string when there is none.
 * It must never cost a judgment: when parseJudgment would read the result differently, the original
 * text is kept and the [tutor-check] path reports the leak instead.
 */
export function scrubInternals(raw: string): string {
  // Spec 2026-10-19 §6: intake notes are for the extension only, however loosely the model fenced them.
  const text = stripIntake(raw);
  const prose = (p: string) => p.split("\n")
    .filter((l) => KEEP_LINE.test(l) || !META_LINE.test(l))
    .map((l) => (KEEP_LINE.test(l) ? l : scrubLine(l))).join("\n");
  let out = "", last = 0;
  for (const m of text.matchAll(FENCES)) {
    out += prose(text.slice(last, m.index));
    if (QUOTES.has(m[2].trim().toLowerCase())) {
      const open = m[0].slice(0, m[0].indexOf("\n") + 1);
      out += open + scrubInternals(m[3]) + m[0].slice(open.length + m[3].length);
    } else out += m[0];
    last = m.index + m[0].length;
  }
  out += prose(text.slice(last));
  if (out === raw || JSON.stringify(parseJudgment(out)) !== JSON.stringify(parseJudgment(raw))) return text;
  return out;
}

/**
 * Last line of every turn's hidden context. Golden round 1 (nemotron): 3 of 5 replies dropped the
 * judgment block that the system prompt asks for; round 2: a hint-level reply stated the fix in words.
 * A reminder next to the learner's message is read last.
 */
export function replyReminder(step: TurnStep | null, recipe = false): string {
  const hold = recipe
    ? " During the design recipe the learner writes every artifact: do not state the fix, in code or in words."
    : step !== null && step !== "fix" ? " Do not state the fix, in code or in words." : "";
  return `[tutor-reply] Use the bold parts (What's happening, Why, Example, What to try, In short), keep diagram lines ≤ 40 characters, and end with the \`\`\`tutor-judgment block.${hold}`;
}

/** Hidden next-turn note so the model corrects itself (the extension cannot un-write a reply). */
export function formatCheck(issues: Issue[], cols = DIAGRAM_COLS): string {
  // Live check: worded as "your last reply", the model blamed the learner's diagram for its own.
  return [
    "[tutor-check] Your own previous reply (the tutor's, not the learner's) broke these rules. Follow them in this reply, and do not mention this note to the learner:",
    ...issues.map((i) => `- ${FIX[i](cols)}`),
  ].join("\n");
}
