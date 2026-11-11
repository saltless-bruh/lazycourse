import { stripIntake } from "./onboard.js";
import type { Band } from "./policy.js";
import { parseJudgment, type Judgment } from "./judgment.js";
import type { TurnStep } from "./ladder.js";
import { turnInstruction, TURN_LIMITS, HOLD_TEXT, REWRITE_TEXT, EMPTY_TEXT } from "./turns.js";
import { LANGUAGE_NAMES, termHits, windowOverlap } from "./similarity.js";

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
/**
 * Live check 2026-11-10 (the architect handed over `share = total / people` in backticks): whether a span has the
 * shape of a statement or an expression. Shape alone is no leak (review I3: `O(n * m)`, `key = value` and `for each`
 * have it too): callers ask for the learner's own names in it as well (editedLine).
 */
function inlineCode(span: string): boolean {
  const t = span.trim();
  if (/^(?:return|def|function|fn|local|let|const|var|import|from|if|for|while)\s+\S/.test(t)) return true;
  if (/\w\s*(?:\+=|-=|\*=|\/=|==|!=|<=|>=)\s*[\w("'[]/.test(t)) return true;
  if (/[\w)\]"']\s*[+*%]\s*[\w("'[]/.test(t)) return true;
  if (/[\w)\]"']\s+[-/]\s+[\w("'[]/.test(t)) return true;
  return !t.startsWith("-") && /(?:^|[\s(])[A-Za-z_][\w.\]["']*\s*=\s*[\w("'[-]/.test(t);
}

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

const FIX: Record<Issue | TurnIssue, (cols: number) => string> = {
  "missing-judgment": () => "it did not end with the fenced tutor-judgment block (plain text, not a tool call)",
  "checker": () => "it was read again by a second reader, who found it breaks this turn's instruction; follow it exactly",
  "empty": () => "it had no text for the learner: the answer stayed in your thinking. Write the answer to the learner now",
  "code-above-rung": () => "it showed code the current rung does not allow; point and explain instead",
  "wide-diagram": (cols) => `a diagram line was wider than the learner's pane (${cols} characters); stack it vertically`,
  "internals": () => "it mentioned the tutor's machinery (rungs, INDEX.md, SKILL.md, the judgment block); talk about the code and the concept",
  "no-summary": () => "a long reply had no **In short** line",
  "role-code": () => "it showed code, and this role never writes any: name the construct or point at the place in words",
  "own-code": () => "it showed the learner's own code (their names) before this turn allows the fix; teach on an unrelated example or point at the place",
  "prose-fix": () => "it told the learner the exact change in words before this turn allows the fix; point at the place or ask what they meant instead",
  "too-long": () => "it was longer than this turn allows",
  "no-question": () => "this turn must ask a question, and it asked none",
  "machinery": () => "it talked about the tutor's machinery or about \"the learner\"; talk to them directly about the code",
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
    // Spike run 2 (2026-10-21): "at hint rung 3/5 (pointer)" lost only "rung 3" and became "this stage/5 (pointer)".
    .replace(/\b(at|on) (?:hint )?rung \d(?:\/\d)?(?: \([\w-]+\))?/gi, (_m, p: string) => `${p} this stage`)
    .replace(/\b(at|on) rung \d\b(?![-\d])/gi, (_m, p: string) => `${p} this stage`);
  return l === line ? line : l.replace(/(\S) {2,}(?=\S)/g, "$1 ");
}

/**
 * The reply with the tutor's machinery reworded for the learner; the same string when there is none.
 * It must never cost a judgment: when parseJudgment would read the result differently, the original
 * text is kept and the [tutor-check] path reports the leak instead.
 */
export function scrubInternals(raw: string, o: { intakeJson?: boolean } = {}): string {
  // Spec 2026-10-19 §6: intake notes are for the extension only, however loosely the model fenced them.
  const text = stripIntake(raw, { json: o.intakeJson });
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
export function replyReminder(step: TurnStep | null, recipe = false, role: { noCode?: boolean } = {}): string {
  // Live check 2026-11-10: the architect got the coding tutor's five parts here, read last, and a small model followed
  // them over its role: a coding-tutor reply with the fix in it. A role that never writes code gets its own line.
  if (role.noCode) return "[tutor-reply] Answer in your role, in plain sentences: the parts, how data moves between them, and the trade-offs. No code, not even inline or as pseudocode: name the construct instead. Do not state the fix to their code, in code or in words. Keep diagrams narrow, and end with the ```tutor-judgment block.";
  const hold = recipe
    ? " During the design recipe the learner writes every artifact: do not state the fix, in code or in words."
    : step !== null && step !== "fix" ? " Do not state the fix, in code or in words." : "";
  const turn = step !== null ? ` This turn: ${turnInstruction(step)}` : "";
  // Final review I5: a hint or a question is a few plain sentences; the five parts would fail its length check.
  const shape = step === "hint" || step === "ask"
    ? "Reply in plain sentences, no bold parts,"
    : "Use the bold parts (What's happening, Why, Example, What to try, In short), keep diagrams narrow,";
  return `[tutor-reply] ${shape} and end with the \`\`\`tutor-judgment block.${hold}${turn}`;
}

/** Hidden next-turn note so the model corrects itself (the extension cannot un-write a reply). */
export function formatCheck(issues: (Issue | TurnIssue)[], cols = DIAGRAM_COLS, reason?: string): string {
  // Live check: worded as "your last reply", the model blamed the learner's diagram for its own.
  return [
    "[tutor-check] Your own previous reply (the tutor's, not the learner's) broke these rules. Follow them in this reply, and do not mention this note to the learner:",
    ...issues.map((i) => `- ${i === "checker" && reason ? `it was read again by a second reader: ${reason}; follow this turn's instruction exactly` : FIX[i](cols)}`),
  ].join("\n");
}

// ---- Reply checks for one turn (spec 2026-10-21 §6, §10) ----

/** "checker" (habits Task 19): an optional second model read the reply and said it breaks this turn's rule. */
export type TurnIssue = "own-code" | "too-long" | "no-question" | "machinery" | "prose-fix" | "checker" | "empty" | "role-code";

// Spec 2026-10-26 §5.3: nemotron named the fix in words ("use / instead of *", "true division is needed").
const INSTRUCTION = /\b(use|using|change|replace|switch|should be|instead of|try|needs?|need to|is needed|requires?|must be)\b/i;
const OP_WORDS: Record<string, RegExp> = {
  "/": /\b(true )?divi(de|sion|ding)\b/i, "//": /\b(floor|integer) divi(de|sion)\b|\bfloor\b/i, "*": /\bmultipl(y|ication|ying)\b/i,
  "+": /\badd(ing|ition)?\b/i, "-": /\bsubtract(ing|ion)?\b/i, "%": /\b(remainder|modulo)\b/i,
  "<=": /\bless than or equal\b/i, ">=": /\bgreater than or equal\b/i,
};
const tokensOf = (lines: string[]) => new Set(lines.join("\n").match(/\/\/|<=|>=|==|!=|[-+*/%<>]|\.?[A-Za-z_]\w*(?=\()/g) ?? []);

/** A line that defines or pulls something in: code in any fence, whatever its tag. */
const STATEMENT = /^(?:def|fn|func|function|class)\s+\w+\s*[(:<{]|^import\s+\S|^from\s+\S+\s+import\b|^(?:if|elif|for|while)\b.*:\s*$|^(?:SELECT|CREATE TABLE|INSERT INTO|UPDATE)\b/;
const lettersOnly = (t: string) => t.toLowerCase().replace(/[^a-z]/g, "");
const PLACEHOLDERS = new Set([HOLD_TEXT, REWRITE_TEXT, EMPTY_TEXT].map(lettersOnly));
const OP_SPAN = /^(?:\/\/|<=|>=|==|!=|[-+*/%<>])$/;
const OP_SIGNS: Record<string, string> = { "÷": "/", "×": "*" };
const WORD_OR_NUMBER = /[A-Za-z_]\w*|\d+(?:\.\d+)?/g;
/** Operator names for the swap check: stricter than OP_WORDS ("add an `if`" names no operator; in 68 real replies it was the one false alarm). */
const SWAP_WORDS: [string, RegExp][] = [
  ["//", /\b(?:floor|integer) divi(?:de|sion)\b/gi], ["/", /\bdivi(?:de|des|ded|ding|sion)\b/gi], ["*", /\bmultipl(?:y|ies|ied|ying|ication)\b/gi],
  ["+", /\baddition\b|\bplus\b/gi], ["-", /\bsubtract(?:s|ed|ing|ion)?\b|\bminus\b/gi], ["%", /\bmodulo\b|\bremainder operator\b/gi],
  ["<=", /\bless than or equal\b/gi], [">=", /\bgreater than or equal\b/gi], ["<", /\bless than\b/gi], [">", /\bgreater than\b/gi],
];

/**
 * Live check 2026-11-10: a fix told with no hidden solution to compare against (a chat question, a `<leader>ts` on a
 * pause, the architect). Two shapes, both judged against the learner's own lines only:
 *  - swap: one sentence sets two different operators against each other (in backticks, as ÷ ×, or — with `words` —
 *    by name: "division, not multiplication"; "change the `*` to `/`"), not merely listed side by side, and one of
 *    them is in the learner's code;
 *  - edited line: a backticked expression or statement that is not a quote of their code but shares two or more of
 *    one of their lines' names (`total / people` beside their `share = total * people`).
 * The filter-then-judge shape follows the tutor-leakage literature (rule filter first; a second reader, when one is
 * set with /tutor-checker, still reads what passes).
 */
/**
 * Two operators in one sentence tell a change unless they are only listed ("the addition of the tip and the division
 * among people", "both `*` and `/`"). Live run 2026-11-10: nemotron set them against each other with no "not" at all
 * ("…or if `/` would better reflect splitting", "dividing yields each share; multiplying inflates the total").
 */
// Review 2026-11-11 I4: "or", "while", "would" and "whether" also join plain descriptions ("each of `*` or `/` takes
// two numbers", "this part multiplies, while that part divides"); they no longer count as a contrast by themselves.
const CONTRAST = /\b(?:not|instead|rather|but|should|whereas|versus|vs\.?|better|replac\w*|chang\w*|swap\w*|switch\w*|needs? to|must|wrong)\b|;/i;
const SET_APART = /\b(?:not|instead|rather than|whereas|versus|by contrast|in contrast|on the other hand|typical(?:ly)?|should|correct|appropriate)\b/i;
// Re-measure 2026-11-11: the fix was put inside a question ("what would changing the operator to `>=` do?", "what
// if we swapped the order of the division?"). An operator their code lacks, named as the one to change to or use,
// and the two sides of a division or subtraction said to go the other way round, are the change whatever the mood.
const CHANGE_TO = /\b(?:chang\w*|replac\w*|swap\w*|switch\w*|us(?:e|es|ing)|instead)\b/i;
const OTHER_WAY = /\b(?:swap\w*|revers\w*|reorder\w*|flip\w*|other way (?:a)?round)\b/i;
const ORDERED = ["/", "//", "-", "%"];
const LISTING = /\b(?:and|both|as well as|along with|each|either)\b/i;

/**
 * Review 2026-11-11 I1: a statement written out — a definition, a `return` of an expression or call, an assignment
 * whose right side computes something. With no learner line to compare against (the design comes before the code),
 * this shape is what tells the architect wrote code; `key = value` and `timeout = 30` compute nothing and stay wording.
 */
const COMPUTES = String.raw`(?:[\w)\]]\s*[-+*/%]\s*[\w(]|\w\()`;
const WRITTEN = new RegExp(String.raw`^(?:def|fn|func|function|class)\s+\w+\s*[(:<{]|^return\b.*${COMPUTES}|^[A-Za-z_][\w.\[\]]*\s*[-+*/%]?=(?!=)\s*.*${COMPUTES}`);
const writtenCode = (line: string) => WRITTEN.test(line.trim());
/** Fence tags that hold a drawing, not code (review 2026-11-11 I5: the architect's main tool). */
const DIAGRAM_TAGS = new Set(["", "text", "txt", "plaintext", "plain", "ascii", "diagram", "mermaid"]);
const ARROW = /-->|->|=>|[→▶►]/;

const KEYWORDS = new Set(["def", "return", "if", "elif", "else", "for", "while", "in", "and", "or", "not", "is", "let", "const", "var", "function", "fn", "local", "then", "end", "do"]);
const CODE_TOKEN = /'[^'\n]*'|"[^"\n]*"|\/\/=?|[-+*/%]=|==|!=|<=|>=|[-+*/%<>=]|[A-Za-z_]\w*|\d+(?:\.\d+)?|\S/g;
/**
 * Fresh batch 2026-11-11: `x > best` beside their `if x < best:`, `n -= 1` beside `n += 1`, `n % 2 == 0` beside
 * `== 1` — a stretch of one of their lines with exactly one token changed, however short the names. A value put in
 * for one of their names (`18 > 18`, `range(1, 5)`) is the line worked through, not changed.
 */
function oneTokenEdit(code: string, lines: string[]): boolean {
  const mine = code.trim().match(CODE_TOKEN) ?? [];
  if (mine.length < 3) return false;
  return lines.some((l) => {
    const theirs = l.match(CODE_TOKEN) ?? [];
    for (let at = 0; at + mine.length <= theirs.length; at++) {
      let diff = -1, n = 0;
      for (let i = 0; i < mine.length && n < 2; i++) if (mine[i] !== theirs[at + i]) { diff = i; n++; }
      if (n !== 1) continue;
      // The change is like for like (an operator, a number or a name for another), in a stretch that still carries
      // one of their names: `0 == 1` is a worked value, `range()` a call named, `'HiThere'` someone else's string.
      const kind = (t: string) => (/^[A-Za-z_]/.test(t) ? (KEYWORDS.has(t) ? "keyword" : "name") : /^\d/.test(t) ? "number" : /^['"]/.test(t) ? "string" : /^(?:\/\/=?|[-+*/%]=|==|!=|<=|>=|[-+*/%<>=])$/.test(t) ? "op" : "other");
      const was = kind(theirs[at + diff]);
      if (was !== kind(mine[diff]) || was === "other" || was === "keyword" || was === "string") continue;
      if (!mine.some((t, i) => i !== diff && kind(t) === "name")) continue;
      return true;
    }
    return false;
  });
}

/** Code that is not a quote of the learner's lines but carries two or more names of one of them: their line, changed. */
function editedLine(code: string, lines: string[]): boolean {
  const t = code.trim();
  if (lines.some((l) => l.includes(t))) return false;
  // Re-measure 2026-11-11: "with `age = 18`, the expression is False" names a value; it is their line edited only
  // when they assign that name themselves.
  const bound = /^([A-Za-z_]\w*)\s*=\s*[\w.'"]+$/.exec(t);
  if (bound && !lines.some((l) => new RegExp(`^\\s*${bound[1]}\\s*=(?!=)`).test(l))) return false;
  if (oneTokenEdit(t, lines)) return true;
  if (!inlineCode(t)) return false;
  // Names and numbers count (`age >= 18` beside `age > 18`), with at least one real name among them (`n + 1` is not theirs).
  const mine = new Set(t.match(WORD_OR_NUMBER) ?? []);
  return lines.some((l) => {
    const shared = (l.match(WORD_OR_NUMBER) ?? []).filter((w, i, a) => a.indexOf(w) === i && mine.has(w));
    // Fresh batch 2026-11-11: `while` in an unrelated example is the language's word, not one of their names.
    return shared.length >= 2 && shared.some((w) => /^[A-Za-z_]\w{2,}$/.test(w) && !KEYWORDS.has(w));
  });
}

export function fixInWords(raw: string, o: { sourceLines: string[]; words: boolean; asked?: string }): "swap" | "edited-line" | null {
  const theirs = tokensOf(o.sourceLines);
  // Side note 2026-11-10: operators the learner named in their own message are the topic they asked about
  // ("what is the difference between / and //?"); answering that is teaching, not telling a change.
  const askedOps = new Set<string>();
  if (o.asked) {
    for (const m of o.asked.matchAll(/(?<![\w/<>=!*+%-])(\/\/|<=|>=|==|!=|[-+*/%<>])(?![\w/<>=!*+%-])/g)) askedOps.add(m[1]);
    let rest = o.asked;
    for (const [op, re] of SWAP_WORDS) { if (rest.search(re) >= 0) { askedOps.add(op); rest = rest.replace(re, " "); } }
  }
  const lines = o.sourceLines.map((l) => l.trim()).filter(Boolean);
  const prose = hideJudgment(raw).replace(FENCES, "");
  const opsOf = (sentence: string) => {
    const ops = new Set<string>();
    for (const m of sentence.matchAll(/`([^`\n]+)`/g)) if (OP_SPAN.test(m[1].trim())) ops.add(m[1].trim());
    for (const [sign, op] of Object.entries(OP_SIGNS)) if (sentence.includes(sign)) ops.add(op);
    if (o.words) {
      // In order, each name taken out once found: "floor division" is one operator, not two.
      let rest = sentence.replace(/`[^`\n]*`/g, " ");
      const shown = new Set(ops);
      for (const [op, re] of SWAP_WORDS) { if (rest.search(re) >= 0) { ops.add(op); rest = rest.replace(re, " "); } }
      // Fresh batch 2026-11-11: "`%` asks what is left over after dividing by 2" says what the operator means.
      if (shown.has("%")) for (const op of ["/", "//"]) if (!shown.has(op)) ops.delete(op);
    }
    return ops;
  };
  const told = (ops: Set<string>) => ops.size >= 2 && ![...ops].some((op) => askedOps.has(op)) && [...ops].some((op) => theirs.has(op));
  const sentences = prose.split(/(?<=[.!?])\s+|\n+/);
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i], ops = opsOf(sentence);
    // Review 2026-11-11 I4: three or more operators are a list of them; operators that are all already in the
    // learner's code describe that code ("this part multiplies, while that part divides") unless set against each other.
    const listed = LISTING.test(sentence) || ops.size >= 3 || [...ops].every((op) => theirs.has(op));
    if (told(ops) && (CONTRAST.test(sentence) || !listed)) return "swap";
    const shown = new Set<string>();
    for (const m of sentence.matchAll(/`([^`\n]+)`/g)) if (OP_SPAN.test(m[1].trim())) shown.add(m[1].trim());
    if (theirs.size && CHANGE_TO.test(sentence) && [...shown].some((op) => !theirs.has(op) && !askedOps.has(op))) return "swap";
    if (o.words && OTHER_WAY.test(sentence) && ORDERED.some((op) => ops.has(op) && theirs.has(op) && !askedOps.has(op))) return "swap";
    // Live run 2026-11-10: "…the typical operator is division. Multiplication, by contrast, produces…": one operator
    // each in two neighbouring sentences, told apart in so many words.
    const next = sentences[i + 1];
    if (next !== undefined && ops.size === 1) {
      const pair = new Set([...ops, ...opsOf(next)]);
      if (told(pair) && SET_APART.test(`${sentence} ${next}`)) return "swap";
    }
    for (const m of sentence.matchAll(/`([^`\n]+)`/g)) if (editedLine(m[1], lines)) return "edited-line";
  }
  return null;
}

/**
 * The lines of function `name` (Python by indentation; Rust/Go/JS by braces), or [] when absent.
 * Final review C1: a prose fix is judged against the checked function only, never the whole program.
 */
export function functionLines(lines: string[], name: string): string[] {
  const head = new RegExp(`^(\\s*)(?:def|fn|func|function)\\s+(?:\\([^)]*\\)\\s*)?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[(<[]`);
  const i = lines.findIndex((l) => head.test(l));
  if (i < 0) return [];
  const indent = head.exec(lines[i])![1].length;
  const out = [lines[i]];
  if (lines[i].includes("{")) {
    let depth = 0;
    for (let j = i; j < lines.length; j++) {
      if (j > i) out.push(lines[j]);
      depth += (lines[j].match(/{/g) ?? []).length - (lines[j].match(/}/g) ?? []).length;
      if (depth <= 0 && j >= i && lines[j].includes("}")) break;
    }
    return out;
  }
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j];
    if (l.trim() !== "" && l.length - l.trimStart().length <= indent) break;
    out.push(l);
  }
  while (out.length > 1 && out[out.length - 1].trim() === "") out.pop();
  return out;
}

/** A sentence that instructs the learner and names a token the reference has and their code does not. `words`: also by its plain-word name. */
export function proseFixLeak(raw: string, o: { referenceLines: string[]; sourceLines: string[]; words: boolean }): boolean {
  const theirs = tokensOf(o.sourceLines);
  const fix = [...tokensOf(o.referenceLines)].filter((t) => !theirs.has(t));
  if (!fix.length) return false;
  const sentences = hideJudgment(raw).replace(FENCES, "").split(/(?<=[.!?])\s+|\n+/);
  return sentences.some((s) => INSTRUCTION.test(s) && fix.some((t) =>
    s.includes(`\`${t}\``) || (/^\.?\w/.test(t) ? new RegExp(`\\b${t.replace(".", "")}\\b`).test(s) : new RegExp(`(^|\\s)${t.replace(/[*+/]/g, "\\$&")}(\\s|$)`).test(s)) ||
    (o.words && (OP_WORDS[t]?.test(s) ?? false))));
}

/** Parameter-ish names every example uses; never the learner's own. */
const COMMON = new Set(["self", "this", "cls", "args", "kwargs", "main"]);
const SIGNATURE = /([A-Za-z_][\w.:]*)\s*\(([^)]*)\)/g;
const DEFINITION = /\b(?:def|function|fn|func)\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w.:]*)\s*\(([^)]*)\)/g;

function addSignature(out: Set<string>, name: string, params: string) {
  const add = (n: string) => { if (n.length >= 3 && !COMMON.has(n)) out.add(n); };
  add(name.split(/[.:]/).pop() ?? name);
  for (const p of params.split(",")) {
    // `total: f64`, `height=2`, `*args`, `mut x`, Go's `a, b int` (the name comes first in each part).
    const m = p.replace(/^\s*(?:mut\s+|&|\*+)*/, "").match(/^\s*([A-Za-z_]\w*)/);
    if (m) add(m[1]);
  }
}

/** The learner's own names: task signatures in spec/tasks.md backticks and the definitions in their sources. */
export function ownNames(i: { tasksMd: string | null; sources: string[] }): Set<string> {
  const out = new Set<string>();
  // Re-run finding: a plan that says "using `split()`" names the language's function, not the learner's.
  for (const span of (i.tasksMd ?? "").matchAll(/`([^`\n]+)`/g)) {
    for (const m of span[1].matchAll(SIGNATURE)) if (!LANGUAGE_NAMES.has(m[1])) addSignature(out, m[1], m[2]);
    // Re-run finding: a plan that names a variable (`sentence`, `reversed_words`) names the learner's too.
    const bare = span[1].trim();
    if (/^[A-Za-z_]\w*$/.test(bare) && !LANGUAGE_NAMES.has(bare)) addSignature(out, bare, "");
  }
  // Final review I6: from their files only function names; every parameter (`value`, `items`) flagged examples.
  for (const src of i.sources) for (const m of src.matchAll(DEFINITION)) addSignature(out, m[1], "");
  return out;
}

const DIAGRAM_ONLY = /^[\s^|│┃─━┌┐└┘├┤┬┴┼▶◀►◄→←↑↓<>v+*#=~.:'"-]*$/;
const TOKENS = /[A-Za-z_]\w*|\d+(?:\.\d+)?|[^\sA-Za-z_\d]/g;

/** Code that uses one of the learner's names beyond naming it (`split_amount` or `split_amount()` alone is a pointer). */
function usesOwnName(code: string, names: Set<string>): boolean {
  const tokens = code.match(TOKENS) ?? [];
  if (!tokens.some((t) => names.has(t))) return false;
  const rest = tokens.filter((t) => !names.has(t) && t !== "(" && t !== ")");
  return rest.length > 0 || tokens.filter((t) => names.has(t)).length > 1;
}

/** Spec §6: what code can check about one reply before the learner sees it. `sourceLines`: what the learner already
 *  saw (their files, and the failed run's output); quoting it is not giving the fix. */
/** Fence tags that mark code (not a diagram, a quote or a note) for the structural leak check (spec §5). */
const CODE_TAGS = new Set(["python", "py", "javascript", "js", "typescript", "ts", "lua", "rust", "rs", "go", "golang"]);

export function checkTurn(raw: string, o: { step: TurnStep; names: Set<string>; sourceLines: string[]; referenceLines?: string[]; proseScope?: { referenceLines: string[]; sourceLines: string[] };
  /** The learner's own message this reply answers: what they named themselves is their topic (fixInWords). */
  asked?: string;
  /** Learner-session fixes (spec §5): the hidden solution's code, and the task's (or project's) content words. */
  referenceCode?: string; taskTerms?: Set<string> }): TurnIssue[] {
  const limits = TURN_LIMITS[o.step];
  const issues = new Set<TurnIssue>();
  // Final review I7: the judgment (fenced or bare JSON) is not part of the reply the learner reads.
  const text = hideJudgment(raw);
  // Live run 2026-11-11: after two rewrites nemotron answered with the placeholder it saw in its own history
  // ("**(tutor is rewriting this reply…)**"), and that was shown as the reply. It is no reply.
  if (PLACEHOLDERS.has(lettersOnly(text))) return ["empty"];
  const quoted = new Set(o.sourceLines.map((l) => l.trim()).filter(Boolean));
  // Spec 2026-10-21 §7: a line of the hidden reference solution (8+ characters) is the answer, named or not.
  const answer = new Set((o.referenceLines ?? []).map((l) => l.trim()).filter((l) => l.length >= 8));
  const leaks = (line: string) => {
    // Final review I6: a quote may carry the editor's line number ("  3| …"); a caret line is an annotation.
    const t = line.replace(/^\s*\d+\s*[|:]\s?/, "").trim();
    return t !== "" && !quoted.has(t) && !DIAGRAM_ONLY.test(t) && !/^\^/.test(t) && (usesOwnName(t, o.names) || answer.has(t));
  };
  let quotedProse = "";
  for (const m of text.matchAll(FENCES)) {
    const tag = m[2].trim().toLowerCase();
    if (tag === "tutor-judgment") continue;
    // Final review I1: a ```markdown fence is checked too (style.md asks for quotes in one); its text also counts as prose.
    if (QUOTES.has(tag)) quotedProse += `\n${m[3]}`;
    if (!limits.ownCode && m[3].split(/\r?\n/).some(leaks)) issues.add("own-code");
    // Fresh batch 2026-11-11: their whole function shown again with `n -= 1` for `n += 1` carries none of the checked
    // names on the changed line; one token changed in one of their lines is their code fixed.
    if (!limits.ownCode && CODE_TAGS.has(tag) && m[3].split(/\r?\n/).some((l) => { const t = l.replace(/\s#.*$/, "").trim(); return !quoted.has(t) && oneTokenEdit(t, [...quoted]); })) issues.add("own-code");
    // Spec §5: an example that is the solution renamed, or that uses the task's own words, is the answer too.
    if (!limits.ownCode && CODE_TAGS.has(tag) && ((o.referenceCode && windowOverlap(m[3], o.referenceCode) >= 0.6) || (o.taskTerms && termHits(m[3], o.taskTerms) >= 2))) issues.add("own-code");
  }
  const prose = text.replace(FENCES, "") + quotedProse;
  // An inline span the learner already saw (part of their line, or the run's error text) is a quote (live audit 2026-10-21).
  const seen = [...quoted];
  const spanLeaks = (span: string) => leaks(span) && !seen.some((l) => l.includes(span.trim()));
  if (!limits.ownCode && [...prose.matchAll(/`([^`\n]+)`/g)].some((m) => spanLeaks(m[1]))) issues.add("own-code");
  // Live check 2026-11-10: a role that never writes code (the architect) is held to it: no code fence, and no
  // statement, expression or bare operator in backticks, unless it quotes a line the learner already has.
  // Review I1: any tagged fence that is not a diagram or a quote is code (sql, bash, toml…); an untagged one is a
  // diagram unless a line defines something or is the learner's own line with a change in it. Inline spans are
  // judged below with the same rule as the coding tutor's (fixInWords), so the two never disagree (review I2).
  if (limits.noCode) {
    for (const m of text.matchAll(FENCES)) {
      const tag = m[2].trim().toLowerCase();
      if (tag === "tutor-judgment" || m[3].includes('"judgment"') || QUOTES.has(tag)) continue;
      const body = m[3].split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !DIAGRAM_ONLY.test(l));
      // Review 2026-11-11 I5: a fenced quote of their own lines is a quote, whatever the tag.
      if (body.length && body.every((l) => quoted.has(l))) continue;
      if (!DIAGRAM_TAGS.has(tag)) { issues.add("role-code"); break; }
      // M3: a flow line that passes through their expression ("a --> total * people --> share") is a diagram.
      if (body.some((l) => STATEMENT.test(l) || writtenCode(l) || (!ARROW.test(l) && editedLine(l, seen)))) { issues.add("role-code"); break; }
    }
  }
  const plain = prose.replace(/`[^`\n]*`/g, "x");
  const sentences = plain.split(/[.!?]+(?=\s|$)/).filter((x) => /\w/.test(x)).length;
  if (limits.maxSentences !== null && sentences > limits.maxSentences) issues.add("too-long");
  if (limits.question && !plain.includes("?")) issues.add("no-question");
  if (INTERNALS.test(prose) || /\bthe learner\b/i.test(prose) || /\[attempt \d/i.test(prose) || /this stage\/\d/i.test(prose)) issues.add("machinery");
  // A reply already held for showing the code needs no second reason; prose-fix is for fixes given in words alone.
  // Final review C1: only on a graded try with a checked function, comparing that function's lines on both sides.
  // Review I4: this comparison belongs to the coding tutor's graded check; a design answer is never held by it.
  if (o.step !== "fix" && o.step !== "design" && !issues.has("own-code") && o.proseScope?.referenceLines.length && proseFixLeak(raw, { ...o.proseScope, words: o.step === "teach" || o.step === "hint" })) issues.add("prose-fix");
  // Live check 2026-11-10: with no hidden solution in play (a chat question, a pause, the architect), the fix is
  // still recognisable against the learner's own lines. Why may name the kind of change, so names count only before it.
  if (o.step !== "fix" && !issues.has("own-code") && !issues.has("role-code") && !issues.has("prose-fix")
    && fixInWords(raw, { sourceLines: o.sourceLines, words: o.step === "teach" || o.step === "hint" || o.step === "design", asked: o.asked })) issues.add("prose-fix");
  // Review 2026-11-11 I1: a statement in backticks is code from a role that writes none, even with no learner line
  // to compare it with; a quote of their own line stays a quote.
  if (limits.noCode && !issues.size && [...prose.matchAll(/`([^`\n]+)`/g)].some((m) => writtenCode(m[1]) && !seen.some((l) => l.includes(m[1].trim())))) issues.add("role-code");
  return [...issues];
}

/**
 * Learner-session fixes (spec §4): a reply the model wrapped whole in a ```markdown (or ```md) fence showed as raw
 * text — the bold parts with their asterisks, nested fences. Only a fence around the entire reply is removed; a
 * quoted line inside a reply stays.
 */
const JUDGMENT_TAIL = /\n[ \t]*```tutor-judgment[ \t]*\n[^`]*\n[ \t]*```[ \t]*\s*$/;
/**
 * A fence that opens the reply wraps it only when it never closes, or closes at the very end (before or after the
 * judgment). Review I1: one that closes earlier is a real quote or code block, and the reply after it stays.
 */
function unwrapOuter(text: string, opener: RegExp): string {
  const m = opener.exec(text);
  if (!m) return text;
  const rest = text.slice(m[0].length);
  const j = JUDGMENT_TAIL.exec(rest);
  const core = j ? rest.slice(0, j.index) : rest, tail = j ? rest.slice(j.index) : "";
  if ((core.match(/^[ \t]*```/gm) ?? []).length % 2 === 0) return rest; // never closed
  const close = /\r?\n[ \t]*```[ \t]*\s*$/.exec(core);
  return close ? core.slice(0, close.index) + (tail ? "\n" + tail : "") : text;
}

export function cleanReply(text: string): string {
  const md = unwrapOuter(text, /^\s*```(?:markdown|md)[ \t]*\r?\n/);
  if (md !== text) return md;
  // Re-run finding: a bare fence opened right before the reply's first heading wraps the reply (often never closed).
  return unwrapOuter(text, /^\s*```[ \t]*\r?\n(?=\s*#{1,6} )/);
}

/** C: a weak model's planning before the reply's first heading is folded away; a reply with no heading stays. */
export function foldPreamble(text: string): string {
  const m = /^\*\*[^*\n]+\*\*\s*:/m.exec(text);
  if (!m || m.index === 0) return text;
  const before = text.slice(0, m.index);
  return /`{3}|~{3}/.test(before) ? text : text.slice(m.index);
}

/** D: the judgment block is for the extension only; the screen never shows it (the stored reply keeps it).
 *  Final review C1: only a fence whose OWN body holds "judgment" goes; a diagram fence before it stays. */
export function hideJudgment(md: string): string {
  let out = "", last = 0;
  for (const m of md.matchAll(FENCES)) {
    const tag = m[2].trim().toLowerCase();
    if (tag === "tutor-judgment" || ((tag === "" || tag === "json") && m[3].includes('"judgment"'))) {
      out += md.slice(last, m.index);
      last = m.index + m[0].length;
    }
  }
  out += md.slice(last);
  out = out.replace(/\{[^{}]*"judgment"[^{}]*\}\s*$/, "");
  return out === md ? md : out.trimEnd();
}
