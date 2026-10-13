// Parses the judgment the turn protocol asks the model to end every reply with (spec §5).
// Fallbacks for live findings (2026-10-13): models also emit it as a `json`/untagged fence,
// as a bare trailing object, or as a call to a tool that does not exist.
export type JudgmentValue = "correct" | "partial" | "wrong" | "none";

export interface Judgment {
  judgment: JudgmentValue;
  concept_tags: string[];
  task_done_ids: string[];
  episode_closed: boolean;
  /** Design-recipe workflow: the learner finished the current step's artifact (spec 2026-10-13 §4). */
  step_done: boolean;
}

const VALUES: readonly JudgmentValue[] = ["correct", "partial", "wrong", "none"];
// Same fence forms as compliance.checkReply (M6c parity): ``` or ~~~, indented up to 3 spaces,
// closed by a bare fence line of the same kind (or longer).
const TAGGED = /^ {0,3}(`{3,}|~{3,})tutor-judgment[ \t]*\r?\n([\s\S]*?)^ {0,3}\1[`~]*[ \t]*$/gm;
const LOOSE = /^ {0,3}(`{3,}|~{3,})(?:json)?[ \t]*\r?\n([\s\S]*?)^ {0,3}\1[`~]*[ \t]*$/gm;
// Pre-M6c lenient forms, tried after the strict ones (final review I3): a fence opened mid-line or
// closed on the JSON line is still a judgment; for extracting it, leniency costs nothing.
const TAGGED_LENIENT = /(`{3,}|~{3,})tutor-judgment[ \t]*\r?\n([\s\S]*?)\1/g;
const LOOSE_LENIENT = /(`{3,}|~{3,})(?:json)?[ \t]*\r?\n([\s\S]*?)\1/g;
const BARE = /\{[^{}]*"judgment"[^{}]*\}\s*$/;

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function toJudgment(raw: unknown): Judgment | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (!VALUES.includes(o.judgment as JudgmentValue)) return null;
  return {
    judgment: o.judgment as JudgmentValue,
    concept_tags: strings(o.concept_tags),
    task_done_ids: strings(o.task_done_ids),
    episode_closed: o.episode_closed === true,
    step_done: o.step_done === true,
  };
}

function fromJson(body: string): Judgment | null {
  try { return toJudgment(JSON.parse(body.replace(/^ {0,3}/gm, "").trim())); } catch { return null; }
}

function lastOf(text: string, re: RegExp, accept: (body: string) => boolean = () => true): string | null {
  let body: string | null = null;
  for (const m of text.matchAll(re)) if (accept(m[2])) body = m[2];
  return body;
}

export function parseJudgment(text: string): Judgment | null {
  const hasJudgment = (b: string) => b.includes('"judgment"');
  const body = lastOf(text, TAGGED) ?? lastOf(text, TAGGED_LENIENT)
    ?? lastOf(text, LOOSE, hasJudgment) ?? lastOf(text, LOOSE_LENIENT, hasJudgment);
  if (body !== null) return fromJson(body);
  const bare = BARE.exec(text);
  return bare ? fromJson(bare[0]) : null;
}

/** The model sometimes "calls" the judgment block as a tool; Pi answers "not found", we keep the arguments. */
export function isJudgmentTool(name: string): boolean {
  return /^tutor[-_ ]?judgment$/i.test(name);
}
