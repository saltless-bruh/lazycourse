// Onboarding as a conversation (spec 2026-10-19 §5, §6): the model talks; this module owns the checklist,
// reads the hidden `tutor-intake` note each reply ends with, and makes every decision (language for a
// newcomer, the level, when to stop talking and ask directly). It holds with a weak model: a missing or
// broken note only counts toward the fallback.
import { LANGUAGES } from "./start.js";
import { EXPERIENCE } from "./interview.js";

export type Field = "experience" | "known" | "target" | "selfScore" | "probe" | "idea" | "path";
export type Stage = "talk" | "check" | "read" | "project" | "choose" | "done";
export interface Fields { experience: string; known: string[]; target: string; selfScore: number; confidence: string; idea: string | null; path: "build" | "learn" }
export interface Onboarding {
  fields: Partial<Fields>;
  /** The language came from `/tutor-start <language>`: a self-score is asked even for a newcomer. */
  named: boolean;
  /** The code chose the target (Python for someone who knows no language, Q1); no self-score then. */
  targetByCode: boolean;
  exchanges: number;
  badNotes: number;
  levelCheck: { task: string; passed: boolean | null } | null;
  level: number | null;
  project: { title: string; summary: string; concepts: string[] } | null;
  shown: string[];
  stage: Stage;
  /** Exchanges held since a self-score below 5 was known: two technical-question turns (Q7). */
  probeTurns: number;
  /** The stage whose model turn was started; its dialog follows when that run ends. */
  presented: Stage | null;
  /** Second /tutor-start for a language with a finished project (Q9): a short check-in. */
  checkIn: { last: string; due: string[] } | null;
}

export const MAX_EXCHANGES = 6;
export const MAX_BAD_NOTES = 2;

export function newOnboarding(language: string | null): Onboarding {
  const named = language !== null;
  return { fields: named ? { target: language } : {}, named, targetByCode: false, exchanges: 0, badNotes: 0, levelCheck: null, level: null, project: null, shown: [], stage: "talk", probeTurns: 0, presented: null, checkIn: null };
}

/** A check-in for a language the learner already worked in: only "what next" is asked (Q9). */
export function checkInOnboarding(language: string, c: { level: number; known: string[]; last: string; due: string[] }): Onboarding {
  return { ...newOnboarding(language), fields: { target: language, known: c.known }, level: c.level, checkIn: { last: c.last, due: c.due } };
}

const lowScore = (o: Onboarding) => o.fields.selfScore !== undefined && o.fields.selfScore < 5 && selfScoreNeeded(o);

/** The JSON object starting at `open` ("{"), strings aware; -1 when it never closes. */
function objectEnd(t: string, open: number): number {
  let depth = 0;
  for (let i = open; i < t.length; i++) {
    const c = t[i];
    if (c === '"') { for (i++; i < t.length && t[i] !== '"'; i++) if (t[i] === "\\") i++; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  return -1;
}

/**
 * Every intake note in a reply, as the span to hide and its JSON. Live check 2026-10-19: a weak model
 * writes the fence loosely (the tag on the line after the backticks, one backtick, no closing fence), so
 * a note is any line holding only backticks and `tutor-intake` (or the tag alone, right after a line of
 * backticks), followed by a JSON object. The tag inside prose never counts.
 */
export function intakeSpans(text: string): { start: number; end: number; json: string }[] {
  const out: { start: number; end: number; json: string }[] = [];
  for (let i = text.indexOf("tutor-intake"); i >= 0; i = text.indexOf("tutor-intake", i + 1)) {
    const ls = text.lastIndexOf("\n", i - 1) + 1, le = text.indexOf("\n", i) < 0 ? text.length : text.indexOf("\n", i);
    const before = text.slice(ls, i).trim(), after = text.slice(i + "tutor-intake".length, le).trim();
    if (after !== "") continue;
    let start = ls;
    if (before === "") {
      const pls = text.lastIndexOf("\n", ls - 2) + 1;
      if (ls === 0 || !/^[ \t]*[`~]{1,3}[ \t]*$/.test(text.slice(pls, ls - 1))) continue;
      start = pls;
    } else if (!/^[`~]{1,3}$/.test(before)) continue;
    const open = text.slice(le).search(/\S/);
    const brace = open >= 0 && text[le + open] === "{" ? le + open : -1;
    const close = brace >= 0 ? objectEnd(text, brace) : -1;
    let end = close >= 0 ? close : le;
    const fence = /^[ \t]*\n?[ \t]*[`~]{1,3}[ \t]*(\n|$)/.exec(text.slice(end));
    if (fence) end += fence[0].length;
    else if (close < 0) { const f = /\n[ \t]*[`~]{1,3}[ \t]*(\n|$)/.exec(text.slice(end)); end = f ? end + f.index + f[0].length : text.length; }
    else if (text[end] === "\n") end += 1;
    out.push({ start, end, json: close >= 0 ? text.slice(brace, close) : "" });
  }
  return out;
}

/** The reply without its intake notes (the learner never sees them). */
export function stripIntake(text: string): string {
  let out = "", last = 0;
  for (const sp of intakeSpans(text)) { out += text.slice(last, sp.start); last = sp.end; }
  return out + text.slice(last);
}

/** Free text onto the four experience bands; null when it cannot tell. */
function experienceBand(s: string): string | null {
  const t = s.toLowerCase();
  if ((EXPERIENCE as readonly string[]).includes(t)) return t;
  if (/\b(none|never|no experience|not yet|zero)\b/.test(t)) return "none yet";
  if (/\b(months?|weeks?|under a year|less than a year|few days)\b/.test(t)) return "under a year";
  if (/\b(over|more than)\b|\b([4-9]|\d\d) ?years?\b/.test(t)) return "over 3 years";
  if (/\b([1-3]|one|two|three|a) ?(-|to)? ?(\d )?years?\b|1-3/.test(t)) return "1-3 years";
  return null;
}

/** The last `tutor-intake` fence as validated fields; null when there is no fence or its JSON is broken. */
export function parseIntake(text: string): Partial<Fields> | null {
  const notes = intakeSpans(text);
  if (!notes.length) return null;
  let raw: unknown;
  try { raw = JSON.parse(notes[notes.length - 1].json); } catch { return null; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>, out: Partial<Fields> = {};
  if (typeof v.experience === "string") { const b = experienceBand(v.experience); if (b) out.experience = b; }
  if (Array.isArray(v.known)) out.known = v.known.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (typeof v.target === "string" && (LANGUAGES as readonly string[]).includes(v.target.trim().toLowerCase())) out.target = v.target.trim().toLowerCase();
  if (typeof v.selfScore === "number" && Number.isInteger(v.selfScore) && v.selfScore >= 1 && v.selfScore <= 10) out.selfScore = v.selfScore;
  if (typeof v.confidence === "string" && v.confidence.trim()) out.confidence = v.confidence.trim();
  if (v.idea === null || (typeof v.idea === "string" && v.idea.trim())) out.idea = v.idea === null ? null : (v.idea as string).trim();
  if (v.path === "build" || v.path === "learn") out.path = v.path;
  return out;
}

/** One reply: count it, merge what the note learned, and let the code pick Python for a newcomer (Q1). */
export function applyTurn(o: Onboarding, note: Partial<Fields> | null): Onboarding {
  // Live check 2026-10-19: a weak model fills in fields nobody asked about (it copied the example note).
  // The build/learn choice counts only at the choose stage; a self-score only when the code asks for one.
  const learned: Partial<Fields> = { ...(note ?? {}) };
  if (o.stage !== "choose") delete learned.path;
  const next: Onboarding = { ...o, exchanges: o.exchanges + 1, badNotes: o.badNotes + (note === null ? 1 : 0), fields: { ...o.fields, ...learned } };
  // A probe exchange counts only once the model has been told to ask (the score was known before this turn).
  if (lowScore(o)) next.probeTurns = o.probeTurns + 1;
  // Q1: for someone who knows no language, Python is the code's pick even when the model writes it down.
  const none = next.fields.known !== undefined && next.fields.known.length === 0;
  if (!o.named && none && (next.fields.target === undefined || next.fields.target === "python")) {
    next.fields.target = "python";
    next.targetByCode = true;
  } else if (learned.target !== undefined) next.targetByCode = false;
  if (!selfScoreNeeded(next)) delete next.fields.selfScore;
  return next;
}

export function selfScoreNeeded(o: Onboarding): boolean {
  // Q1: whoever chose the language (named it, or picked it over the tutor's Python) rates themselves in it.
  return o.checkIn === null && o.fields.target !== undefined && !o.targetByCode;
}

/** Checklist items still unknown, in the order the tutor asks them; `path` belongs to the choose stage only. */
export function missing(o: Onboarding): Field[] {
  const f = o.fields, out: Field[] = [];
  if (f.experience === undefined && o.checkIn === null) out.push("experience");
  if (f.known === undefined) out.push("known");
  if (f.target === undefined && (f.known === undefined || f.known.length > 0)) out.push("target");
  if (f.selfScore === undefined && selfScoreNeeded(o)) out.push("selfScore");
  if (lowScore(o) && o.probeTurns < 2) out.push("probe");
  if (f.idea === undefined) out.push("idea");
  if (o.stage === "choose" && f.path === undefined) out.push("path");
  return out;
}

export function needsFallback(o: Onboarding): boolean {
  return o.exchanges >= MAX_EXCHANGES || o.badNotes >= MAX_BAD_NOTES;
}

/**
 * The 0–100 level. Experience sets a base (none 5, under a year 25, 1–3 years 45, over 3 years 65); a
 * self-score pulls it halfway toward score × 10; the level task adds 10 when passed and takes 10 when
 * failed. Monotonic in each input, clamped to 0–100.
 */
export function levelFrom(o: Onboarding): number {
  const base = ({ "none yet": 5, "under a year": 25, "1-3 years": 45, "over 3 years": 65 } as Record<string, number>)[o.fields.experience ?? ""] ?? 25;
  let level = o.fields.selfScore === undefined ? base : (base + o.fields.selfScore * 10) / 2;
  if (o.levelCheck?.passed === true) level += 10;
  if (o.levelCheck?.passed === false) level -= 10;
  return Math.max(0, Math.min(100, Math.round(level)));
}

const LABEL: Record<Field, string> = {
  experience: "experience", known: "languages already known", target: "language to learn", selfScore: "self-score 1-10 in that language", probe: "a feel for their level from one or two short questions",
  idea: "an idea to build, or none", path: "build now or learn first",
};

/** The hidden per-turn section: what is known, what is missing, what this stage asks, and the note format. */
export function onboardPrompt(o: Onboarding): string {
  const f = o.fields;
  const known = Object.entries(f).map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(", ") || "(none)" : v === null ? "(no idea yet)" : v}`);
  const miss = missing(o);
  const lines = [
    "[onboarding] You are meeting this learner for the first time. Talk like a tutor at a first meeting: one question at a time, short, friendly; never write code.",
    `known so far:\n${known.length ? known.join("\n") : "- nothing yet"}`,
    miss.length ? `still to find out: ${miss.map((m) => `${m} (${LABEL[m]})`).join("; ")}` : "the checklist is complete.",
  ];
  if (o.checkIn) lines.push(`This is a check-in: the learner already worked in ${f.target}; their last project was "${o.checkIn.last}"${o.checkIn.due.length ? `, and these concepts are due for a quick review: ${o.checkIn.due.join(", ")}` : ""}. Ask how it went and what they want next (something harder, something different, or practice first). Do not repeat the first-meeting questions.`);
  if (o.targetByCode) lines.push("The learner knows no language: recommend Python and say why in two or three plain sentences tied to what they want to build (readable, instant feedback, used everywhere).");
  if (f.selfScore !== undefined && f.selfScore < 5 && selfScoreNeeded(o)) lines.push(`Their self-score is ${f.selfScore}/10: ask one or two short technical questions about ${f.target} to get a feel (frame it as "let me get a feel", never as a test), then move on.`);
  if (o.stage === "check" && o.levelCheck) lines.push(`A small task is open in their editor (${o.levelCheck.task}): its instructions and a file to write in. Tell them it only sets where to start, there is no grade; when they are done they type /tutor-start check.`);
  if (o.stage === "read" && o.level !== null) lines.push(`Tell the learner your read of them in two or three sentences: level ${o.level}/100 and what it is based on; ask whether that sounds right.`);
  if (o.stage === "project" && o.project) lines.push(`Suggest this one project and say why it suits them: "${o.project.title}" — ${o.project.summary}. They can ask for something else.`);
  if (o.stage === "choose") lines.push("Ask whether they want to start building now, or learn the ideas the project needs first (short lessons with small exercises).");
  lines.push([
    "End every reply with a fenced note the learner never sees: a JSON object with only what the learner told you in their own words this turn (an empty {} when they told you nothing new). Never guess and never fill in a field they did not answer.",
    "```tutor-intake",
    "{}",
    "```",
    "Keys you may use when the learner said so: experience (one of: none yet, under a year, 1-3 years, over 3 years), known (list of languages, [] when none), target (the language to learn), selfScore (1-10, only when you asked for it), confidence (their words), idea (what they want to build; null only when they said they have no idea), path (build or learn, only when you asked which).",
  ].join("\n"));
  return lines.join("\n");
}
